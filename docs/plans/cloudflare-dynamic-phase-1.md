# Phase 1 数据读取层实施记录

当前状态为实施中。第一批交付公开详情和最新收录查询，后续继续完成成员数排序、标签查询、首页聚合、排行与缓存协议。

## 已实现的读取边界

- `getPublicEntry()` 按规范化 username 查询，使用唯一索引，强制 approved，单条详情通过左连接读取统计，标签按 entry_id 定向读取。
- `listPublicLatest()` 使用 listed_at 降序、username 升序的稳定游标，每次最多返回 60 条，额外读取 1 条判定下一页。
- DTO 明确列出公开字段。时间字段使用数据库毫秒值，头像使用版本值，Phase 2 负责转换成现有公开页面契约。
- 列表支持 kind/categoryId。标签和成员数排序需专门验证索引策略后实现。
- 数据来自权威表，现有审核、状态、翻译和统计更新直接进入查询结果，读取层无需双写。

## 索引与迁移

新增 `0022_public_latest.sql`，包含三个 approved 部分索引。

| 查询 | 索引 | 依据 |
|---|---|---|
| 全站最新 | entries_public_latest | listed_at DESC、username 覆盖排序 |
| 类型最新 | entries_public_kind_latest | kind 等值后复用稳定排序 |
| 分类最新 | entries_public_category_latest | category_id 等值后复用稳定排序 |

测试使用本地 D1 的 `EXPLAIN QUERY PLAN` 验证对应索引与无临时排序。每个 approved 条目最多增加
三个索引记录，新增/删除及排序键更新产生相应写放大。生产规模的 rows-read/rows-written 和包体/CPU
数据仍需隔离环境测量，生产迁移需单独确认。

该迁移只建立索引，SQLite 在创建时处理现有行，无业务字段回填。本批不需要新建 KV 或修改 Worker binding。
索引失效时应用可回退到上一版本。需要移除索引时按以下顺序在已授权环境执行。

```sql
DROP INDEX IF EXISTS entries_public_category_latest;
DROP INDEX IF EXISTS entries_public_kind_latest;
DROP INDEX IF EXISTS entries_public_latest;
```

## 缓存协议设计边界

下列协议需要在 Phase 1 后续批次验证，并在 Phase 2 首次切换前验收。

| 结果 | 缓存键维度 | 失效依赖 |
|---|---|---|
| 详情 | schema version、locale、username | 状态、文案、翻译、标签、统计、隐藏规则、R2 内容、推广 |
| 列表 | schema version、locale、kind、分类/标签、sort、page/cursor | 条目新增/状态/排序值、分类标签、推广 |
| 首页/排行 | schema version、locale、榜单类型 | 状态、统计、历史投影、推广、时间窗口 |
| Sitemap/公开 JSON | schema version、分片、locale、数据版本 | 公开状态、URL、更新时间、分类标签 |

候选读取流程为 D1 权威版本/状态校验、版本化缓存命中或定向回源、回填前版本复核。版本更新须与 D1
变更原子提交。R2 内容变更还需解决跨存储写入顺序和失败恢复。缓存键必须覆盖所有依赖，尤其是翻译、
帖子隐藏与推广自然过期。该协议仍为待验证，当前代码只提供权威读取。

验收分别记录命中与未命中的 D1 请求数、rows-read、CPU、延迟、缓存回填量和写放大。
每次权威版本校验仍消耗 D1 请求。跨地区缓存删除的传播行为须通过测试，TTL 只承担容量与新鲜度管理。

## 基础测试与源码审查

- 本地 DB 共 16 个测试文件、78 个测试通过，全仓 9 个 typecheck 任务通过，Astro 303 文件无诊断。
- 查询计划测试捕获读取层实际发出的 SQL 和绑定参数，在本地 D1 执行 EXPLAIN。
- 新增详情的隐藏、恢复、删除及公开字段检查。
- 新增 61 条同时间条目的稳定分页、类型过滤和非法分页参数检查。
- 新增部分索引与排序查询计划检查。
- 已审查公共 DTO、approved 门禁、游标边界与现有写入链路。最新查询游标并非冻结快照，并发修改排序键
  可改变跨请求结果，后续数字页码兼容和缓存版本设计仍需验收。
- 本批查询没有调用现有 Web/Bot/Admin 入口，Phase 2 接入前继续验证端到端兼容性。

## 待完成任务

- [ ] 成员数与推广优先的稳定分页、标签查询和现有数字页码映射。
- [ ] 首页统计、分类标签计数、公告、友链和推广有界读取。
- [ ] R2 历史与增长排行的投影设计及写入同步。
- [ ] 原子版本/失效协议及全部状态变化入口覆盖。
- [ ] 分批幂等回填工具及隔离数据规模成本测试。
- [ ] Phase 1 全阶段验收与项目记忆更新。
