# 排行历史镜像与失败恢复

本节点承接 PR #35，分支为 `codex/cloudflare-history-mirror`，对应 P1-6/P1-7/P1-8 的历史子任务。
交付数据层、独立恢复入口与本地迁移验证。Phase 1 保持 5/8，总计划保持 12/55。

## 范围与兼容口径

现有 `apps/web/src/lib/rankings.ts` 使用源数组的 `findLast`，按最后一个不晚于窗口截止时间的元素
计算增长。窗口保持 6 天和 27 天，百分比、四榜 Top 50、URL 与 `RankingsData` 契约沿用原设计。
`packages/core/src/refresh.ts` 的 R2 写入及不足一周提前返回规则继续由现有入口执行。

新增 `normalizeHistory()` 从右向左保留时间严格递减的有效点，再反转为递增序列。
若右侧已有更早或同时间的点，左侧点在任何截止时间均无法成为原 `findLast` 的结果，可以省去。
该等价转换支持乱序、重复日期和无效日期，`ordinal` 对应源数组位置。R2 原文件保留，详情历史继续使用原文件。

整文件继续使用 `MemberPoint.array()` 校验。缺失文件等价于空历史，结构错误记录 `invalid`，
保持旧快照空历史回退口径。日期解析失败的点记录数量，比较结果与原算法一致。
单对象设 1 MiB、4096 点处理上限，超限记录 `oversized` 并阻止回填游标跳过。
超限处理路径及生产规模上限为 **待验证**，必须在完整排行发布前解决，禁止截断原历史。

## 文件与数据结构

| 文件或模块 | 作用 |
|---|---|
| `packages/core/src/history-normalization.ts` | 有界校验和等价基准点转换 |
| `packages/core/src/history-mirror.ts` | R2 复核、单步镜像、按 entry ID 续跑回填 |
| `packages/db/src/history-mirror.ts` | 条件提交、分批清理/写入、发布/失效和公开基准读取 |
| `packages/db/src/schema.ts`、`migrations/0026_public_history_mirror.sql` | 元数据表、基准表和生命周期触发器 |
| `packages/core/test/history-mirror.test.ts` | 故障恢复、并发、语义及有界成本测试 |
| `apps/web/src/lib/rankings.test.ts` | 与现有 `memberGrowth()` 直接等价对照 |
| `scripts/history-mirror-migration.test.ts` | 旧库升级及迁移语句之间源写入兼容测试 |

`history_mirrors` 每条目一行，保存条目身份、R2 version/ETag、generation、phase、cursor、点数和异常计数。
`history_baselines` 使用 `(entry_id,sampled_at)` 主键，支持截止时间反向 seek，新增二级索引数量为 0。
使用 `history-v1:` 标识归一化版本，算法改变时需升级标识并受控重建。
这些表属于派生数据，收录公开状态继续由 D1 `entries` 决定。

## 状态、重试与并发

1. `mirrorHistoryStep()` 读取公开 revision，再读取一个目标条目和 R2 历史文件。
2. `head` 复核 version/ETag。D1 创建新 generation 时检查源 revision、条目身份和前一代 CAS。
3. `clean` 每次最多删除 100 个旧点。`write` 每次最多写 100 点并在同一 batch 提交 cursor。
4. `verify` 仅在全部点提交后标记 `ready`，通过本次 commit token 保证一次版本递增。
5. `ready`/`invalid` 提交后再检查 R2。变化或复核失败则标记本代 `stale`，原子递增最新 revision。
6. 重试重新读取已持久化对象，逐步推进，相同已完成对象保持幂等。

每次只推进一个有界阶段，调用方不得在 SSR 请求中循环至完成。
部分批次、超限、失效和无效文件无法公开返回旧基准值。公开读取同条 SQL 检查 approved 和当前身份。
删除、username/listed_at 变化在源事务内清理旧镜像，删除后复用相同 ID 仍需新的源 revision。
插入较小 ID 或身份变更会回退历史回填游标，避免遗漏旧游标之前的新身份。

`backfillHistoryMirrorStep()` 使用 `public_history_backfill_cursor`，每次 PK seek 一个条目并推进一个阶段。
只有 `ready`、已记录的 `invalid` 回退或条目已删除可以推进游标，推进时复核旧游标、generation 和身份。
同条提交还检查游标与目标之间没有新插入的更小 ID，防止选中目标之后的并发插入被跳过。
临时失败保留进度，超限等待处理，单目标可用 `mirrorHistoryStep()` 独立重试。
R2 与 D1 跨存储一致性仍需刷新失效协议和定期恢复任务共同完成。

## 查询与资源成本

| 项目 | 本地证据或预算 |
|---|---|
| 基准 SQL | `entry_id=? AND sampled_at<=? ORDER BY sampled_at DESC LIMIT 1` |
| 查询计划 | `sqlite_autoindex_history_baselines_1`，无全历史扫描 |
| 4096 点下的基准 seek | 业务 SELECT 读取 1 行、写入 0 行，未含身份 JOIN 和版本门禁 |
| 4096 点归一化 | 本地 workerd 单次约 6 ms，云端 CPU/内存待验证 |
| 阶段操作 | 固定数量元数据/源状态查询，每次最多 100 点删除或插入 |
| R2 请求 | 每次 1 次 get、1 次前置 head，ready/invalid 再加 1 次 head |
| 最大对象重建 | 从空表约 44 次调用，替换 4096 旧点约 84 次调用，每次重新读取/校验源文件 |

主键带来额外索引写入，D1 计费写入量高于逻辑点数。删除/改名清理最多处理该条目 4096 个派生点。
生产启用前测量完整 SQL 的 rows-read/rows-written、R2 下载总量、重试率和 Worker CPU。
全局 revision 校验会因无关写入产生保守重试，持续写入下的完成时间为 **待验证**。

## 测试与源码审查

- [x] 固定随机种子对照 50 组乱序/重复/无效日期历史，覆盖 36 个截止日期及前后 1 ms。
- [x] 对照既有 Web 增长函数的周/月窗口和边界。
- [x] 注入 R2 已成功、D1 插入失败，确认不足一周的历史仍可独立恢复。
- [x] 并发相同批次、事务失败、延迟 R2 替换、源删除/ID 复用和改名保护。
- [x] 目标选取后插入较小 ID，游标拒绝跨越新条目并在下一次调用处理。
- [x] 失效读取 revision 后、提交之前注入版本变化，验证递增最新版本和重复失效幂等。
- [x] 缺失、错误 JSON/结构、字节/点数超限、跨调用句柄续跑及回填阻塞。
- [x] 4096 点有界写入、索引计划、下架后读取拒绝。
- [x] 逐语句执行 migration 期间继续源新增、修改、删除，验证触发器依赖顺序和游标回退。
- [x] 审查 R2 原始历史、旧构建/快照白名单、`appendHistory()` 和公开状态兼容边界。

最终测试和 CI 结果随本节点 PR 更新。Windows 全仓测试遇到既有繁体生成文件 CRLF 与
`localeCompare` 默认排序差异，Linux CI 承担全仓复核。

| 检查 | 2026-11-13 本地记录 |
|---|---|
| 历史镜像回归 | 9/9 通过 |
| Core 完整回归 | 加入最后一个并发插入用例前 165/165，通过后单独复核新增用例 |
| DB 完整回归 | 122/122 通过 |
| Web 排行 | 14/14 通过 |
| Node 运维/迁移脚本 | 21/21 通过，scripts 类型检查通过 |
| 全仓类型检查 | 9/9 通过，Astro 303 文件无诊断；最后并发用例后 Core 类型检查通过 |
| Lint/源码审查 | lint 通过，保留既有 unused suppression 警告；审查修复失效版本竞态和回填低 ID 插入竞态 |
| Windows snapshot | 首轮 26/27，一项既有 5 秒超时，单独重跑及 Linux CI 继续复核 |

## 部署、验收与回滚

- [x] 生成 migration 0026，在本地隔离 SQLite/workerd 应用和测试。
- [ ] 经逐项人工授权，在隔离预发布 D1 应用 migration，验证真实 R2 对象及 Paid 成本。
- [ ] 接入既有刷新失效/恢复调度及预算统计，验证写成后失败、重启和持续并发写入。
- [ ] 实现四榜投影、自然时间到期调度、完整历史回填审计及新旧榜单对照。
- [ ] 接入 SSR、公开 JSON、Bot 日报和版本缓存后完成发布门禁。

本节点资源需求沿用现有 D1/R2。生产 migration、远端回填、Binding/Cron 变更和部署逐项人工确认。
线上业务入口尚未调用新增镜像接口，实际刷新与排行集成继续验收。

回滚应用代码到父分支已验证提交，保留新增派生表及原 R2 文件。
已迁移环境保留 0026 的迁移记录与表，避免旧代码删除/改名时触发器引用缺表。
后续恢复从源重新验证对象代次及完整性，禁止删除原始历史或发布未验证的缓存榜单。

## 进度与下一步

当前完成历史镜像数据层及本地故障恢复验证，独立 PR 审查与 CI 结果随 PR 更新。
实际刷新调度、排行投影、预发布费用及完整回填审计继续跟踪。
下一节点按用户授权推进，保留基础代码测试、源码审查、独立 PR 和项目记忆门禁。
