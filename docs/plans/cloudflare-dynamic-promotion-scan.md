# P1-6 推广候选有界扫描

本节点承接 #29，新增数据访问层准备接口 `scanPublicPromotions()`，复用 promotions、entries、site_state 与既有索引。P1-6整项继续待验收，Phase1保持5/8，总任务12/55。

## 源码依据与选择

`public_promotion_state` 按entry_id维护最高推广等级，原始promotions还包括entryUsername为null的banner以及未来开始的记录。
本节点先从原始推广表进行有界seek，保留各推广记录，避免为banner引入新的状态表与同步迁移。
原 `listPublicPromotions()` 的items/next语义继续兼容，全部既有测试继续执行；新接口供后续准备流程使用。

## 新接口契约

- 输入now为固定评估毫秒时间，batchSize默认100且只允许1到100。
- after含endsAt、id、revision、evaluatedAt，绑定同一数据版本与评估时间。跨版本报changed/restart，修改评估时间需从头开始。
- 返回items、scanned、next、revision、evaluatedAt、validUntil。items仅含该批次生效且关联条目approved的推广，banner保留；内部status不进入返回DTO。
- next来自最后一个原始候选，空items也可能有next。scanned等于候选数，最多100。满批时返回next，最后恰好满批可多一次空批来确认结束。
- validUntil是已处理候选的最早未来startsAt或endsAt，空批使用安全整数时间上界。完成聚合后取所有批次的最小值，不能把单批validUntil当作全局完整列表的有效期。
- 每次调用前后读取权威版本，投影未启用或未ready时报错。已下架、编辑、删除或其他依赖变化导致版本变化时放弃该代准备结果并重启。

## SQL与成本边界

候选子查询先按现有promotions_public_end索引取最多batchSize行，再LEFT JOIN entries的username索引。生效时间和公开状态在该有限结果内筛选。
由于LIMIT位于JOIN之前，未来/下架候选不会让单次SQL继续寻找足够的有效结果。
相同endsAt用等值/id范围seek，后续endsAt只读取剩余候选额度，最多2条候选SQL，加上2条版本查询合计最多4SQL。
子查询结果扫描和外层排序最多处理该批次候选数，计划中对candidates的扫描/排序与原始推广表全量读取的范围不同。

1000个未来/隐藏候选和最后1个有效banner的本地样本，逐批读取总共1001个候选，每批最多100个，完整函数单次最多212 rows-read。
所有实际SQL重放检查无promotions/entries全表SCAN，使用现有promotions_public_end，rows_written为0。测试预算上限450 rows-read，包含本地执行器和空范围探测余量。
原兼容接口在相同过滤分布下仍可能一次读取1500行，保留其回归作为成本对照。新接口将准备工作分批，完整准备总工作量仍随未过期推广候选数量增长。
每批返回最多100份banner内容，字节数、JSON解析CPU、异常大字段和Workers Paid预算仍需等价部署环境测量。

## 准备、缓存与撤回的后续接入

- [ ] 在P1-7/Phase2接入既有Worker的有界准备调度与可续跑存储，按代保存cursor、已收集的有限输出、评估时间及最小validUntil。
- [ ] 明确所需页面/推广类型的输出上限与完整性条件，限制累积状态大小，避免准备流程把全部候选DTO保存进缓存。
- [ ] 每次调度限制批次数与SQL额度，禁止在单个SSR请求中while扫描到结束。单批空items不能直接判为没有推广。
- [ ] 发布前确认同一revision、完整性条件与自然时间有效期，过期或版本变化时重新准备。使用既有D1权威校验及版本缓存协议保护公开状态。
- [ ] 设计准备中HTTP状态与重试，验证跨地区缓存故障、下架/恢复/删除、未来开始及评估耗时超出validUntil。
- [ ] 据真实规模和写放大评估是否需要进一步候选投影或时间窗口索引。

有界准备与D1固定键状态、有限输出和缓存读取已有后续实现，见 `cloudflare-dynamic-promotion-preparation.md`；Worker/Cron调度、adapter与HTTP接入继续单独验收。本节点新增读取函数与测试，网站、Bot、Admin、Mini App当前入口尚未切换到新函数。

## 验收与回滚

- [x] 1000个无效候选分批成本、空批继续推进、有效banner尾部出现及候选去重。
- [x] 1/7/100批大小与既有有效列表契约对照，固定评估时间的startsAt/endsAt边界。
- [x] 下架/恢复、失效游标、ready门禁、非法批大小与取数后并发下架拒绝发布。
- [x] 源码审查覆盖LIMIT位置、两段seek、状态字段排除、版本前后校验和时间区间含义。
- [x] DB112/112，运营读取与扫描9/9，全仓typecheck9/9、Astro303文件零诊断，Biome/diff check通过。独立PR CI以对应checks为准。

回滚可revert本节点提交，恢复此前可调用的数据访问接口集合。该节点数据库结构、索引、Worker配置、Cron及生产资源变更为0。
后续部署需按对应接入节点确认资源与生产操作授权。
