# P1-6 首页运营查询成本与推广续页

本节点承接 #28，验证 `public-operations.ts` 的真实 SQL 和现有索引，补齐首页统计、分类标签、公开设置与推广读取的本地成本证据。P1-6 全项继续待验收，Phase 1 保持5/8，总计划12/55。

## 查询与测量

`packages/db/src/public-operations.test.ts` 捕获实际查询与参数，在隔离本地D1重放 EXPLAIN QUERY PLAN 和 SELECT，统计 rows_read/rows_written。每条SQL检查无全表SCAN、无临时排序，所有读取的rows_written为0。
分类和标签各1000行；计数和设置另加入1000个无关键；推广分别验证120个同结束时间的有效条目，以及100/1000个未来或已下架候选。

| 读取 | 完整函数SQL数 | 实测rows-read | 主要查询计划 |
|---|---:|---:|---|
| 分类首60条 | 2 | 68 | categories主键范围，public_counts scope索引 |
| 分类afterId=900 | 2 | 67 | 同上，id seek |
| 标签首60条/afterId=900 | 2 | 67 | tags主键范围，public_counts scope索引 |
| 分类/标签afterId=1000空页 | 2 | 7 | 主键范围结束 |
| 首页4键统计 | 2 | 12 | site_state key及public_counts scope唯一索引 |
| 公开site设置 | 1 | 1 | settings key唯一索引 |
| 推广首60条，候选120 | 1 | 122 | promotions_public_end，entries username索引 |
| 推广第二60条 | 最多2 | 121 | ends_at等值/id范围，再seek后续ends_at |

taxonomy和统计指标包含函数自身的前置权威版本查询。推广和设置函数自身没有额外版本查询，页面组合须包在已验收的版本协议中，协议成本另加。这里没有计入缓存网络、CPU、响应字节数或R2成本，生产规模仍需等价环境验证。

## 推广续页修正

原单SQL使用 ends_at>now 与 (ends_at,id)>cursor 的组合。相同endsAt的120个有效条目中，第2页实际读取180行，计划只显示ends_at范围，已翻过的ID仍被读取。
改为先查询 ends_at=cursor.endsAt 且 id>cursor.id，并校验该endsAt仍有效；剩余额度再查询 ends_at>max(now,cursor.endsAt)。后续范围只保留一个下界，避免优化器选中较小的now导致重复读取。

- 输出保留items/next形状、endsAt/id顺序、默认60与最大100条、未来/过期及权威公开状态过滤。
- 最多读取limit+1个有效结果来判定续页。首请求1SQL，续页1或2SQL，函数总结果内存受limit+1约束。
- 复用现有promotions_public_end，索引与数据库结构变更为0。120条同时间样本续页从180降至121行，代价是尾部可增加一次定向查询。
- mixed结束时间、同时间、NULL条目banner、未来、隐藏、过期、旧cursor与每页7条对照既有SQL契约，检查顺序、去重及结束状态。
- 多SQL组合响应由调用方版本协议在发布前复核。该函数尚未接入生产SSR，Phase 2接入需覆盖并发推广变更和重试响应。

## 已确认的剩余成本问题

100个未来/已隐藏推广候选返回0条时读取150行，1000个候选读取1500行。索引命中与LIMIT60无法保证候选过滤的扫描量有界。
本节点保留完整结果语义，过滤候选问题继续列为P1-6/P1-7的接入前验收项。后续已新增 `scanPublicPromotions()` 有界准备接口，单次最多100候选，详见 `cloudflare-dynamic-promotion-scan.md`；准备与缓存编排仍待接入。

- [ ] 验证复用public_promotion_state或现有维护流程生成有界有效推广候选的方案，明确banner、未来开始和下架的同步协议。
- [ ] 给出准备状态、过期/下架与恢复路径，确保公开页面按时撤回内容。
- [ ] 测量候选同步的写放大、定时任务与Workers Paid预算，再决定是否需要新增索引或投影。
- [ ] 补齐批量状态更新、多标签、推广和R2恢复入口的读写预算，完成P1-6整体验收。

候选方案均待验证，现有有序索引仍承担本节点读取。推广候选规模与稀疏分布须纳入Phase 1整阶段验收。

## 测试、部署与回滚

- [x] 新增SQL计划/成本与分页契约基础测试，包含空页和深页。
- [x] 源码审查覆盖查询范围、cursor与now交叉边界、两段合并上限和已审核过滤。
- [x] 本地DB 108/108，其中新增运营查询5/5，全仓typecheck9/9、Astro303文件零诊断，Biome及diff check通过。独立PR CI以对应checks为准。
- [x] 更新总计划、Phase1与成本证据索引。P1-6保持未勾选。

应用回滚可revert本节点提交，恢复原单SQL推广续页读取。数据库结构回退步骤为0。
生产资源操作为0，部署与数据库迁移需后续专项授权。原有代码部署和收录入口继续由各自实现节点回归。
