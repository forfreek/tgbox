# 四榜 D1 投影与查询

本节点承接 PR #38，独立分支为 `codex/cloudflare-rank-projection`。沿用 P1-5 的每条目一行投影、
索引 Top 50、历史基准 seek 和有界维护方案，完成数据层实现。Phase 1 保持5/8，总计划12/55。

## 实现与文件

- [x] `packages/db/src/schema.ts`、`migrations/0028_public_rankings.sql` 创建投影与触发器。
- [x] `packages/db/src/public-rankings.ts` 提供开关、分页补齐、单条准备、待办选择和四榜读取。
- [x] `packages/shared/src/rankings.ts` 提取既有增长公式，Web 与 D1 准备共用 JavaScript 计算。
- [x] DB 实际查询及迁移升级测试，既有 Web 排行契约回归。
- [ ] 既有 Cron 的预算/公平性接入、缓存 adapter、完整回填运维命令及预发布验收。
- [ ] SSR、公开 JSON 和 Bot 日报接入。

前置依赖为0026历史镜像、0027写入意图协议，以及 enabled/ready 的公开目录投影。
本节点提供数据访问 API。公开 HTTP 路由的切换仍由后续阶段验收。

## 查询和索引

`public_rankings` 每个 approved 条目最多一行，保存成员数、周/月增长及百分比、排序键、listedAt、
activityTier、dirty、evaluatedAt 和 validUntil。标题与 kind 在查询时从 entries 实时关联，最终检查 approved。

| 索引 | 顺序及条件 | 依据 |
|---|---|---|
| public_rank_week | week_growth DESC、week_pct_order DESC、username_key，dirty=0且正增长 | 周榜 Top 50 |
| public_rank_month | month_growth DESC、month_pct_order DESC、username_key，dirty=0且正增长 | 月榜 Top 50 |
| public_rank_newest | listed_at DESC、username_key，dirty=0 | 新收录榜携带周增长 |
| public_rank_active | activity_tier DESC、member_order DESC、username_key，dirty=0且活跃等级大于0 | 活跃榜携带周增长 |
| public_rank_dirty | entry_id，dirty=1 | 每次最多100个待准备条目 |
| public_rank_due | valid_until、entry_id，dirty=0 | 每次最多100个已到期条目及最近时间边界 |

增长/活跃榜沿用原型排序逻辑。百分比空值的排序值为0，成员数空值的排序值为-1，以固定排序列保存在行内。
这些列也避免当前迁移生成器对带逗号表达式索引的序列化问题。新增两个维护索引通过真实 SQL 的 EXPLAIN 验证。
最新榜需要相同的 username 并列排序和周增长，独立索引的读写成本已纳入样本，生产收益仍待测量。

username 使用 Telegram ASCII 字符主序和大小写次序组成排序键，覆盖数字、下划线和旧混合大小写数据。
测试与原 `localeCompare()` 对照。来源不符合 Telegram 字符集时准备报错，保留未完成状态待核对。
增长计算共用原 JavaScript 公式，保留6/27天窗口、一位小数、零/缺失基准及负增长语义。
负零按原公开 JSON 序列化口径比较，推广不参与排序。

## 源变化和准备协议

`public_rankings_enabled` 默认为缺失。`beginPublicRankings()` 要求公开投影 ready，并校验/初始化空表元数据。
元数据缺失且表非空时要求审计，禁止以错误计数开启读取。

源触发器跟踪 entries 的公开状态、身份、listedAt，以及 entry_stats 的成员数/活跃等级和历史镜像/意图变化。
准备阶段沿用现有快照的有效分类关联，分类孤儿和分类删除会阻止旧行发布，保留待修复状态。
数据变化把对应行标记 dirty，下架/删除在源事务内移除投影。身份修复和主键移动同时失效受影响条目。
关闭开关后继续失效已存在的行及清理下架行，重新开启后按主键补齐缺失条目。

- `seedPublicRankings()` 按源 entry ID seek，每次最多100个 ID，返回游标，由运维调用方持久化。重复补齐保留已有准备结果。
- `listPublicRankingWork()` 定向选择 dirty 或已到期行，每次最多100项。
- `preparePublicRanking()` 单条关联当前源和镜像，用主键进行周/月基准及下一点的四次 seek。
- 有成员数但镜像缺失、处理中或存在写入意图时返回 needs_history。已记录的 invalid 历史按原空历史回退。
- 成员数未知时共用原空增长快速路径，跳过历史依赖及时间到期任务。成员数更新会在源事务内重新失效。
- 计算结果通过同条 SQL 检查源 revision、身份、mirror generation、开关及写入意图后提交。
- 同一条目的旧评估时间不能覆盖新评估，已完成且尚有效的重复请求跳过写入。

批次接口用于后台与运维流程。SSR 请求只能查询已准备结果，禁止循环补齐或遍历全目录。
开关恢复后运维补齐应从0重新遍历，新增和恢复公开的条目由源触发器加入待办。

## 完整性、时间与版本

`public_rank_count` 由投影增删触发器维护，读取与 ready 目录的 `public_counts(all)` 对照。
任一条目缺失、dirty、计算所需的历史未完成或已到期时，整体返回 needs_preparation，避免把缺少候选的 Top 50 发布出去。
计数和元数据的一致性仍需完整回填审计，人工直接破坏派生表不属于可验证发布流程。

每条目的 validUntil 是下一个历史点进入6/27天窗口的最早时间。所有条目在共同读取时刻均有效时，
各条目增长值都等价于该时刻计算，generatedAt 使用最终读取时刻。
`public_rank_evaluated_max` 防止时钟倒退时使用未来计算值，最近到期时间由索引取一行。

`public_rank_revision` 独立记录准备、失效和投影增删，避免纯排行维护使其他页面的内容缓存整体失效。
读取前后检查内容 revision、排行 revision 和开关，在最后一次 D1 I/O 后再检查时钟及截止时间。
四榜同时读取最多7次 SQL，返回现有 `RankingsData` 及独立的 contentRevision、rankingRevision、validUntil 元数据。

后续缓存键必须包含协议版本、内容/排行版本和语言，缓存寿命不超过 validUntil。
缓存命中也需 D1 权威版本与状态门禁，KV 故障降级和实际命中成本由缓存接入节点验收。

## 基础测试与性能证据

- [x] 空目录、默认关闭、未补齐、缺少历史和部分准备的整体门禁。
- [x] 四榜与原口径的空成员、零基准、负增长、并列、大小写、数字/下划线及推广排序对照。
- [x] 更新成员、下架/恢复、改名、删除、主键/历史身份修复与关闭后重新启用。
- [x] 分类孤儿、分类删除及未知成员数的无历史快速路径。
- [x] 采样点在截止时间前后1ms、自然到期准备、重复准备幂等及时钟倒退。
- [x] 写入意图阻塞、计算后源变更拒绝提交、排行独立版本竞争拒绝旧响应。
- [x] 最后一次 D1 I/O 后越过时间边界时拒绝响应。
- [x] 1000候选的实际四榜 SQL、排序索引、dirty/due索引及无全量 COUNT 扫描。
- [x] 0028逐语句迁移期间继续源写入，开关关闭后失效和计数维护。

本地新增排行15/15、DB全量137/137、Core178/178、Web排行14/14、Node脚本23/23通过。最终 CI 随 PR 更新。
全仓类型检查9/9、Astro303文件无诊断，scripts类型检查通过；变更文件Biome和lint/diff check通过。
新增内部状态键后，种子回归按 `dirty_since` 显式查找，避免依赖 site_state 第一行的隐含顺序。

| 指标 | 1000条固定样本 |
|---|---:|
| 四榜各 Top 50 业务 rows-read | 各100 |
| 完整四榜请求 SQL | 7 |
| 含版本/计数/时间门禁的总 rows-read | 427 |
| 单条准备的固定样本 rows-written | 8 |
| 全表聚合/临时排序 | 0 |

上述为本地 workerd 测量。6个索引和源触发器的写放大、缓存命中、CPU、真实目录规模、准备速度及持续更新下的可用性为 **待验证**。
后台准备尚未接入时，时间到期或源变化可能持续返回 needs_preparation，生产切换须先完成调度与恢复验收。

## 部署和回滚

本节点生成0028并在本地 SQLite/workerd验证，生产操作为0。沿用现有 D1，无新增 Worker/Binding/Cron配置。
获该次预发布授权后，先完整应用0028再部署代码，维持开关关闭，完成分页补齐、历史镜像和单条准备，
对照四榜与旧 JSON，验证调度和缓存后再按单独授权安排生产操作。

回滚在获授权环境关闭 public_rankings_enabled，再回退至#38已验证代码。保留表、索引和触发器，
开关关闭期间持续失效已存在的行。恢复后从0重新补齐并执行完整审计，核对计数和时间边界后再读取。
元数据损坏或分类孤儿应保持门禁，通过受控审计修复，禁止用任意 ready 标记跳过准备。

下一节点按用户授权接入既有 Cron 预算/公平性及缓存读取，补齐运维回填与发布演练后继续 Phase 1 验收。
