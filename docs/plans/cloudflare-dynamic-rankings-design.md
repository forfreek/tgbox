# P1-5 排行投影与 R2 历史设计验证

本节点通过 [PR #25](https://github.com/forfreek/tgbox/pull/25) 交付，依赖 PR #23。

后续历史镜像实现见 `docs/plans/cloudflare-dynamic-history-mirror.md`，已通过有界归一化保留乱序数组的
`findLast` 语义，交付0026和独立失败恢复接口。下文为原设计基线，四榜实际投影及刷新调度继续验收。

本节点完成排行查询边界、候选投影、R2 迁移与失败恢复设计，以及本地 D1 SQL 原型验证。
生产表结构、同步代码和页面接入继续在后续实现节点验收。原型表仅由
`packages/db/src/public-rankings-design.test.ts` 在隔离测试数据库中创建。

## 1. 源码基线与公开契约

| 来源 | 已确认行为 |
|---|---|
| `apps/web/src/lib/rankings.ts` | 四种排行，每榜最多 50 条，推广不改变排序 |
| `memberGrowth()` | 基准为历史数组中最后一个时间早于或等于截止时间的点 |
| 周/月增长 | 截止时间分别为评估时间减 6 天、27 天 |
| 增长榜 | 只包含正增长，依次按增长量、增长百分比、username 排序 |
| 百分比 | 基准大于 0 时按现有 JavaScript 公式保留一位小数，否则返回 null；排序将 null 当作 0 |
| 新收录榜 | listedAt 降序、username；携带周增长信息 |
| 活跃榜 | activityTier 大于 0，按等级、成员数、username 排序；携带周增长信息 |
| `packages/core/src/refresh.ts` | 成员数在 D1，历史在 `history/<username>.json`；当前每周追加一个点 |
| `packages/snapshot/src/build-site-data.ts` | 读取 R2 历史后进入静态快照，构建期从完整目录计算排行 |
| `packages/shared/src/rankings.ts` | `/data/rankings.json` 的 `RankingsData`、`RankItem` 字段契约 |
| `apps/bot/src/digest.ts` | 日报读取同一 JSON，从 newest 取最近 24 小时最多 10 条，从 weeklyGrowth 取最多 5 条 |

四个榜单的类型范围与现有代码一致。活跃度通常由频道刷新写入，查询条件保留 activityTier 大于 0。
缺少成员数或足够旧的基准点时增长字段为 null，不进入增长榜。

## 2. 候选数据流与查询边界

优先验证每条目一行排行投影与定向历史索引。R2 历史镜像的最终写入顺序仍为待验证。

```text
entries / entry_stats ──同事务同步──> 每条目排行投影
                                            ↑
R2 history ──可续跑校验/镜像──> D1 历史点 ──基准点计算
                                            ↑
                                 既有 Cron 的有界到期任务

排行请求 ──版本与时间边界检查──> 排序索引取 Top 50
                                      └──JOIN entries 校验 approved
```

- 历史点候选键为 `(entry_id, sampled_at)`，按 entry_id 和截止时间反向 seek 后取 1 条。
- 排行投影保存成员数、周/月基准引用、增长量与百分比、listedAt、activityTier、username、
  公开状态副本、计算时间、源版本和下一次基准到期时间。
- 最终公开状态以 entries 为准。状态副本用于索引选择性，同步必须在同一 D1 事务内完成。
- 查询始终 JOIN entries 并校验 approved，避免陈旧投影返回已删除、隐藏或下架条目。
- 索引扫描成本依赖状态副本及时同步。陈旧状态可能增加被过滤的候选数量，单独 LIMIT 50 不能保证扫描量。
  实现验收需覆盖批量下架和回填中的状态一致性，读取指标也要覆盖这些场景。
- 请求按排序索引取 50 条；增长基准计算和 R2 请求放在有界写入/维护流程中。
- 直接按成员数先取少量条目再计算增长无法保证全站增长榜正确，小规模高增长条目可能被漏掉。

现有 `public_listing` 针对 scope 与一个排序值设计。增长榜还需要百分比作为第二排序值，
直接把增长数据复制到所有分类/标签 scope 会增加写入量。候选排行投影按条目保存一份，
具体字段和索引以完整数据规模验证后确定。

## 3. 索引原型与成本证据

测试中的 `rank_design_*` 表和索引是候选 SQL 结构。

| 榜单 | 候选排序键 | 部分索引条件 |
|---|---|---|
| weeklyGrowth | week_growth DESC、coalesce(week_pct, 0) DESC、username | is_public = 1 且 week_growth > 0 |
| monthlyGrowth | month_growth DESC、coalesce(month_pct, 0) DESC、username | is_public = 1 且 month_growth > 0 |
| newest | listed_at DESC、username | is_public = 1 |
| active | activity_tier DESC、coalesce(members, -1) DESC、username | is_public = 1 且 activity_tier > 0 |

本地 workerd/D1 的 1000 条固定样本中，四种业务 SELECT 均返回 50 条、读取 100 行，
实际 `EXPLAIN QUERY PLAN` 均命中对应排序索引并通过无临时排序断言。
同时改变一个投影行的成员数、周/月增长量和百分比，原型实测 rows-written 为 4。
这些指标只覆盖排行业务 SELECT 与投影 UPDATE，权威源写入、版本检查、历史镜像、任务调度和缓存操作另行计量。

四个索引的存储与写放大随公开条目数增长。是否复用现有最新索引、是否保留独立最新榜索引，
以及真实流量的读写收益均为待验证。原型证明有界读取路径可行，生产 migration 的索引清单仍需性能评审。

现有百分比计算使用 JavaScript 浮点取整。后续实现优先复用 `memberGrowth()` 的计算定义，
将计算结果写入投影，SQL 负责比较与索引读取。SQL round 与 JavaScript Math.round 的边界等价性尚待验证。
username 在 SQLite 默认排序与 JavaScript localeCompare 中的并列顺序也需覆盖数字和下划线对照测试。

## 4. 时间经过与缓存一致性

原型覆盖了一个时间点在截止时间之后 1ms 时不符合条件，1ms 后进入周增长基准的场景。
成员数没有发生变化，基准仍会随时间移动。

- 每次镜像新历史点或计算基准后，推导下一次周/月窗口变化时间。
- 维护任务使用 next_due_at/entry_id 的有界 seek，候选索引、队列更新和重试仍需实现验证。
- 复用 Bot 既有 Cron。当前代码按 45/50 子请求预算为支付、广播、刷新和维护分配额度，
  排行维护需要接入同一预算核算、游标和公平性测试。批大小按实测配置。
- 评估时间、投影代次和 generatedAt 的发布协议需要保证同一响应的窗口语义可解释。
  候选包括固定评估时间的版本化投影，或标注计算时间并约束维护延迟的增量投影。
  两者的切换原子性、额外写入量与允许延迟仍为待验证，当前保持既有排行发布流程。
- 缓存键纳入数据版本、排行评估代次、榜单类型和语言维度，缓存寿命受下一次已知时间边界约束。
- 下架与删除继续走 D1 公开状态门禁，时间相关刷新不能替代撤回校验。

## 5. R2 历史镜像、回填与恢复

历史迁移继续复用现有 D1、R2、Bot/Admin Worker 和 Cron。以下内容均需在实现节点验证。

### 初次回填

1. 按 entry_id seek 分批读取条目与当前 username，记录源版本和 R2 对象标识。
2. 每条目读取一个现有历史文件，按现有 `MemberPoint.array()` 校验。整文件校验失败时记录结果，
   与现有快照的空历史回退保持可对照，不能静默用部分有效点改变结果。
3. 按现有 Date.parse 语义处理时间。非有限时间记录异常；有效时间点顺序和重复时间需校验。
   时间顺序正常时，相同时间的重复点按源数组最后出现值处理，可保留现有 findLast 语义。
   无序历史使用索引最大时间会改变现有结果，处置方式为待验证。
4. 在 D1 batch 内按稳定键幂等写入历史点、基准、投影、源版本和进度，再提交版本更新。
5. 提交时检查条目仍存在、username/源版本匹配，避免回填覆盖并发修改。
6. 断点续跑使用已提交进度，失败条目有独立重试记录。对象过大时需要专门分块或预处理路径，
   单对象内存、解析 CPU 与点数上限必须先测量。

### 新历史与部分失败

| 情况 | 后续实现要求 |
|---|---|
| R2 写入成功，D1 镜像失败 | 保留或重建待镜像状态，重试读取现有对象并补齐 D1 |
| D1 成功，R2 兼容写入失败 | 若采用 D1-first，则需要持久化兼容写入任务与幂等重试，验证旧静态构建仍可使用 |
| R2 与 D1 版本不一致 | 比较对象标识、源版本与条目状态，条件提交或重新读取 |
| 条目改名 | 验证 entry_id 连续性与 `history/<username>.json` 旧行为的兼容策略 |
| 删除后 entry_id 被复用 | 同事务清理旧历史/投影，任务同时校验 username 与源版本 |
| 重复 Cron、并发刷新 | 稳定幂等键、条件更新与事务内进度提交 |

现有 `appendHistory()` 在最后一个点不足一周时提前返回。如果在 R2 成功后才执行 D1 镜像，
镜像失败后的重试不能直接沿用此提前返回路径，否则可能长期漏同步。这是实现前必须覆盖的失败恢复用例。

保留全部历史或只保留近期点加窗口前锚点的成本尚待测量。历史删除、旧 R2 键清理和
历史来源切换另行验收，当前设计没有授权这些生产操作。

## 6. SEO、公开 JSON 与 Bot 兼容

- `/rank/`、`/en/rank/`、`/zh-hant/rank/` 和 `/data/rankings.json` 保持现有路径。
- 保持 `RankingsData` 字段和每榜 50 条上限，generatedAt 对应已验证的评估/发布协议。
- weeklyGrowth、newest 和 active 的 growth/growthPct 使用周基准，monthlyGrowth 使用月基准。
- 标题、语言和 SEO 输出继续使用现有页面逻辑，数据投影不处理 URL 或语言路径。
- Bot 日报继续遵守 24 小时、10 个新条目和 5 个增长条目的口径。
- 页面、公开 JSON 和日报应共享相同排行读取与公开状态门禁，避免三套计算口径分叉。

## 7. 验证记录与后续验收

本节点通过代码测试验证候选索引和查询边界，源码审查覆盖增长计算、历史刷新、快照与日报消费者。

| 检查 | 结果 |
|---|---|
| D1 原型测试 | 4 项，覆盖基准 seek、四榜 Top 50、状态门禁与自然时间边界 |
| 既有 Web 排行单元测试 | 13/13 通过，包含增长口径、百分比、排序、推广与 JSON 契约 |
| DB 全量测试与类型检查 | 18 个测试文件、90/90 通过；全仓 typecheck 9/9 通过 |
| 原型性能 | 1000 个候选，四榜各读取 100 行，投影单行更新写 4 行 |

复现命令如下。

```powershell
pnpm --filter @tgbox/db exec vitest run src/public-rankings-design.test.ts --reporter=verbose --disableConsoleIntercept
pnpm --filter @tgbox/web exec vitest run src/lib/rankings.test.ts
pnpm --filter @tgbox/db test
pnpm turbo run typecheck
```

后续实现节点需要提交实际 migration、源表同步、时间到期调度、完整数据对照与故障注入测试，
并补齐读取/写入总成本、R2 字节量、Worker CPU、缓存收益和生产等价规模验证。
P1-3、P1-6、P1-7、P1-8 继续按各自任务验收，本节点只完成 P1-5 的设计与原型验证。

## 8. 资源与回滚

本节点交付测试文件和设计记录，部署资源需求为 0。
本地原型表由测试环境管理。回滚撤回本节点测试与文档提交即可。
未来投影上线采用独立开关和逐项授权的迁移、回填及应用部署，旧排行链路保留到替代链路验收通过。
