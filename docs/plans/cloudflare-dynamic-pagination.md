# P1-3 推广排序与数字页码读取

交付 PR 为 #26，承接 #25。源码审查覆盖排序、触发器升级、并发、下架过滤、查询边界和版本校验，CI 结果以该 PR checks 为准。

本节点提供类型、分类、标签的 60 条分页数据访问接口，供 Phase 2 接入现有 Astro 路由。
代码复用 PR #23 的数据层，分支承接 PR #25 的计划记录，按独立节点 PR 交付。

## 兼容口径

| 范围 | 优先级与排序 |
|---|---|
| 分类 | 手动/付费 pin、category_pin、普通条目三组，组内按成员数或 listedAt 降序 |
| 类型/全站 | pin 优先，其余按所选基础顺序 |
| 标签 | 保留 TagPage.astro 的成员数排序，推广标识随条目返回 |
| highlight | 保留展示标识，排序使用普通组 |
| 并列项 | 使用小写用户名的下划线映射键，与 localeCompare 的数字/下划线代表性用例对照 |
| 缺少成员数 | 保留既有 -1 口径 |

手动 pin 覆盖付费较低等级，多个付费等级取最高有效等级。有效区间为 starts_at <= now 且 ends_at > now。
现有 categoryListingBase()、pageHref() 继续供路由使用，成员数与最新路径通过数据层参数表达。

## 读取与准备接口

readPublicPage(db, query) 接收 scope、sort、page、服务端 now 和可选 expectedOrderRevision。

| status | 含义与接入要求 |
|---|---|
| ready | 当前版本的 items、total、totalPages、revision、orderRevision、validUntil |
| not_found | 页码越界，或空分类/标签，供现有本地化 404 使用 |
| needs_preparation | 推广时间状态或深页锚点待准备，推进有界准备后重试 |
| changed | 预期排序版本发生变化，应重新开始分页 |

直接数字 URL 读取当前数据。跨请求持续翻页可传入 expectedOrderRevision 检测变化。
单响应前后检查权威版本，变更时要求重试。不同版本的任意请求不构成冻结快照。
Phase 2 负责识别准备/版本变化状态，使用现有 Worker 按需工作或 Cron 推进准备，
并测试就绪前的可重试响应。真实不存在的页码对应 404。HTTP 编排、SEO 和路由接入继续归 Phase 2 验收。

### 索引键与页锚点

- 从 (scope,promotion_order,order,username_key) 索引获取最多 60 个 entry_id，
  再定向加载 DTO，强制 entries.status=approved 并按键顺序组装。
- 一次读取最多相对锚点跳过 600 个索引键，深页使用 public_page_anchors。
- preparePublicPage() 每次最多推进两次、每次十页，每次 seek 的 OFFSET 最多 599。
  锚点保存目标页之前的最后一个键，同一主键幂等提交，可多次续跑。
- 2000 条样本第 33 页通过两次准备就绪，第一次推进至第 21 页。
- scope 独立维护 order_revision。排序、成员数和状态变化使对应锚点失效，
  文本修改及其他分类排序变化可复用本分类锚点，DTO 从权威表读取。
- prunePublicPageAnchors() 按 created_at 索引，每批最多清理 100 个超过保留时间的锚点。

每个 scope 增加两份页码排序索引。锚点容量随访问页码和版本增长，
后续编排应加入分批清理与写放大测量。

## 推广自然过期与预算

public_promotion_state 保存每条目的付费等级、有效区间、源版本和计算标识。
推广变更标记待计算，读取通过区间索引识别开始、过期或时间倒退，重算可先于维护删除执行。

refreshPublicPromotions() 每批最多尝试 20 个条目，返回 attempted、processed、statements、ready。
满批最多 165 条逻辑 SQL，调用方需按既有任务预算选择较小批量，实际 Cron 接入继续归 P1-7 验收。
按 username 索引读取推广及前后边界，代价还与该条目的推广记录数有关。
CAS 校验源版本与旧区间，用唯一计算标识保护事务内的排序键、等级和内容版本更新。
validUntil 限制后续缓存寿命，缓存命中继续遵循 D1 权威版本协议。

## Migration 与回填

0025_public_numbered_pages.sql 增加推广状态、锚点、scope 排序版本和所需索引。
迁移暂停派生同步并移除待扩展的 positional INSERT/SELECT 触发器，安装后恢复原启用状态。
来源 entries、entry_stats、entry_tags 写入可继续执行，扩展投影需从 cursor 0 分批重建，完成前 ready 关闭。
分批重建会重置推广有效区间与计算结果，并推进内容版本。批次通过 enabled、ready 和 cursor 门禁，避免旧版本缓存复用。

新增 Node 升级测试逐语句执行 migration，每条语句后写条目、统计、标题和标签。
本地 D1 测试通过 Cloudflare migration reader 实际拆分、应用 SQL，覆盖触发器内 CASE 的拆分兼容性。
索引使用持久化 username_key，以兼容当前 Drizzle 索引生成器。
生产 migration、回填和部署按既有授权约束执行，远端白名单导出兼容性继续由 P1-8 验收。

## 基础测试与审查

| 检查 | 已验证内容 |
|---|---|
| 推广规则 | 手动 pin、等级叠加、分类/标签差异、latest、降级、开始/过期 |
| 页边界 | 60 条、null、数字/下划线并列、非法页码、空分类/标签、跨页版本变化 |
| 权威状态 | 新增、统计修改、隐藏/恢复、删除、文本与其他 scope 修改 |
| 并发 | 重复准备幂等，取键后下架使响应失败重试 |
| 迁移 | 逐语句插入来源数据与重建门禁 |
| 本地测试 | DB 99/99，页码 9/9，原分类排序 8/8，迁移 1/1，typecheck 9/9 |
| Snapshot | 并行首轮 3 项超过 5 秒，串行重跑 27/27 通过 |

1000 条样本第 17 页返回 40 条。成员数/最新两种顺序的取键 SQL 均命中对应索引，无临时排序，
各读取 42 行。重放完整读取的 9 条 SQL，各合计 259 行，包含状态、计数、推广区间、锚点、
取键、DTO 和最终版本检查，分为一个批处理及四次定向查询。
缓存适配与请求内复用继续在 Phase 2/Phase 6 测量。
早期 4 行稀疏标签指标仅覆盖一个业务 SELECT，与这里完整数字页读取的统计范围不同。
冷准备、推广重算、写入及跨地区缓存费用分别计量，生产成本仍需等价规模验证。

## 回滚

应用可回退到上一已验证的数据读取实现，数据库保留增量结构。原有详情、基础列表和来源写入继续回归验证。
暂停派生同步时按运维授权设置 public_projection_enabled=0，权威状态不可确认时使用明确错误响应。
重新启用前进行受控重建与审计。结构回退需先恢复兼容触发器和 view 的独立 migration，
避免删除仍被来源触发器引用的表。

### 复现命令

```powershell
pnpm --filter @tgbox/db test
pnpm --filter @tgbox/db exec vitest run src/public-pages.test.ts --reporter=verbose --disableConsoleIntercept
pnpm --filter @tgbox/web exec vitest run src/lib/kind-listing.test.ts
node --test scripts/public-page-migration.test.ts
pnpm turbo run typecheck
```
