# P1-7 推广准备状态与缓存发布

本节点承接 #30，连接有界扫描、D1可续跑进度与既有版本缓存协议。P1-7整体写入覆盖继续待验收，Phase1保持5/8，总任务12/55。

## 入口与输出

- `preparePublicPromotions(db, { kind, limit }, { now, batchSize })` 每次只调用一次有界扫描，默认最多100候选。返回pending、ready或contended及本次scanned。
- kind复用ProductKind，limit为1到100，输出是按endsAt/id排列的该类型前limit条有效推广。hasMore表示有效推广超过请求上限，准备过程始终只保存前limit条。
- 扫描仍推进到该代未过期候选末尾，汇总所有候选的最小validUntil，保证未收集记录的未来开始也能使快照到期。恰好满批可多一个空批确认结束。
- `readPreparedPublicPromotions(db, cache, query, { now, maxAgeMs })` 读取完整且有效的已准备结果，缓存读取失败或解码错误回到D1准备行；未就绪时报错，由后续HTTP层映射准备状态。
- 读取入口不会调用扫描或自动循环准备。cache为null也可读取已完成D1结果，D1无法确认权威状态时沿用明确错误。

该输出为服务端数据契约，公开页面/JSON继续通过原有shared schema适配。按产品类型请求前N条的范围需在Phase2按现有组件确认，本节点原有网站/Bot/Admin/Mini App入口接入变更为0。

## 持久化、并发与有效期

复用现有site_state，固定键 `public_promotion_preparation:<kind>:<limit>`。5种ProductKind、100种limit最多500个槽位，内容版本或时间变化覆盖同一槽位，避免按代累积旧行。
行内保存格式版本、query、revision、evaluatedAt、validUntil、有限items、next及hasMore。字段解码复用ProductKind/BannerContent校验，损坏进度通过权威扫描重建。
状态以完整旧JSON字符串为比较条件进行CAS，首次插入也检查并发冲突，慢批次无法覆盖新进度。SQL同时要求enabled/ready为1且内容revision仍匹配。

推进前后校验权威版本，并在返回前检查当前时钟仍位于评估时间与最小validUntil区间内。内容变化、自然过期或时钟回退使旧代作废。
CAS后遇到自然过期可留下已到期行，读取层拒绝该行，下一次准备从当前时间重新开始。并发输家返回contended，下一次重新加载持久进度。

完整准备总成本仍与未过期候选数量有关，单个源变更使用全局revision会保守重启准备。真实规模下的完成延迟与高频写入重启成本继续测量，Phase6再根据证据优化失效粒度。

## 缓存与撤回

复用readPublicCached及PublicJsonCache接口，缓存维度含协议、内容revision、prepared-promotions-v1、kind和limit。
只将next为null、时间有效的结果放入缓存，TTL同时受maxAgeMs和完整代validUntil限制。缓存命中仍进行前后D1权威版本检查，所有权威状态变化通过版本键隔离旧值。
缓存故障可读D1完整准备行，缓存和进度缺失时返回准备错误。KV或Cache adapter及实际Worker Binding继续由后续接入节点实现。
下架/恢复/删除使旧代不可复用，重启准备后重新筛选条目公开状态，撤回不依赖缓存TTL。

## 资源与预算

每次推进最多8条逻辑SQL，其中一次条件写入。包括启动版本、进度读取、有界扫描的2到4SQL、CAS及末尾版本校验；已完成且有效时3条SQL且scanned为0。
空源首轮实测7条SQL。测试中的CAS首次/冲突写入rows_written至多2行，实际多候选回填总写入成本另计。
缓存命中2条版本SQL，冷读取或故障回D1完整准备行共4条SQL。这里的读取不含promotions源表查询。
输出最多100个经过字段校验的推广对象。固定槽位总数有上限，序列化字节数、JSON CPU、缓存网络和生产数据分布继续在Workers等价环境测量。
复用现有表和索引，数据库migration、新索引、Worker配置及Cron变更为0。

## 测试与后续验收

- [x] 跨调用/重建Db句柄续跑、空有效批次后推进、有限输出、hasMore及全代最小validUntil。
- [x] 完整空结果、损坏进度、缓存解码错误和读写故障回D1。
- [x] 缓存后的下架、恢复与删除，自然开始/结束、时钟回退和准备耗时超出窗口。
- [x] 并发写入屏障验证CAS只有一方推进，源版本在CAS前变化时阻止旧代写入。
- [x] 实测准备/命中/冷读取SQL数量与CAS写预算，完整读取路径不扫描推广源表。
- [x] DB119/119，其中准备状态与缓存7/7，全仓typecheck9/9、Astro303文件零诊断，Biome/diff check通过；独立PR CI以对应checks为准。
- [ ] 接入既有Worker/Cron预算与公平调度，确定每次执行的批数、失败恢复及超期策略。
- [ ] 接入Cache/KV adapter、Worker Binding与多地区故障测试，生产配置及部署按专项授权确认。
- [ ] 完成P1-7其余新增/审核/编辑/分类标签/翻译/隐藏/R2入口同步与Phase2 HTTP/页面兼容。

源码审查覆盖派生状态解码、CAS原子性、缓存发布时序、权威校验、时间边界与输出上限。需要准备/版本变化/过期错误的HTTP映射仍由Phase2验收。
回滚可revert本节点提交，恢复此前读取入口集合。新增准备行可保留，后续恢复按format与revision校验；清理时只定向处理对应准备键。
生产资源操作为0，部署和资源调整继续遵守专项授权要求。
