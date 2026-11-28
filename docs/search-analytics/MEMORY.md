# 可复用决策与证据

## 2026-11-28：阶段四

- 恢复tgbox-search-analytics-publication；先读STATE/PUBLICATION。基于阶段三76ca142，不将阶段四当生产。
- immutable KV key+fresh first-primary前后校验；不能复用bookmark会话冒充第二次主库读取。no-store和打开时清空客户端旧词是严格撤回边界，不回退静态词。
- D1指针与job ranking_json/published同batch；0003仅统计库列，后台可读原发布分数而非按新数据伪称历史榜单分数。
- jobs与publication独立；关闭公开榜仍可定时清理，关闭cron仍可人工调用同服务。新版Admin worker委派原TanStack fetch，独立daily scheduled，不动Bot任务。
- 清理每轮为续租+9表guarded DELETE的D1 batch；Paid D1每次调用1000 API限制，最多900轮为收尾留余量，另有90秒保护。批大小默认100可调10–500；积压失败须监控/人工排空，不宣称严格TTL。
- 本地26行身份夹具124读/9写为任务内成功SQL，不包括最终日志/释放锁、公开读取、核心推荐或失败SQL。public正常2主库singleton+1KV；边缘拒绝0D1/0KV。
- 回归及生产前P1门槛见PUBLICATION和DEBT；最终CI以STATE为准。

## 前期历史记录

## 2026-11-28：阶段三采集

- 草稿PR #92依赖#91，实现提交377f65e；CI状态查STATE。下一节点方案为PUBLICATION-PLAN.md，文档不是已实现功能。
- 实现377f65e的Linux CI 46118001213全量通过，关闭态可独立验收；未合并或部署。后续仅交付文档，不把文档提交CI等同于重新运行浏览器测试。

- 恢复工作树tgbox-search-analytics-collection，先读STATE和COLLECTION。固定网站/Mini路由鉴权，Bot只由可信webhook进入。无资源时关闭态兼容，不能补虚构资源ID自动provision。
- collector为浏览器纯模块，contracts仅类型导入；共享client-policy统一防抖/长度。compositionend即便输入值不变也用revision触发成功查询；Autocomplete item-press不当手输处理，避免选中标题覆盖待报查询。
- 网站event内限额签发Cookie，避免快速导航依赖先完成会话往返。Cookie Max-Age取签名exp；保持坏Cookie拒绝而非换身份。统计请求不进入公共缓存。
- 首事件1500ms，后续从统计响应接收debounceMs；无配置预读。keepalive只能尽力发送，不能宣传完整日志；静态构建开关及部署/D1开关三重限制。
- Mini App/Bot使用相同Telegram HMAC域；inlineQuery.id经独立HMAC域转换确定UUID防webhook重放。Bot复用已查结果、waitUntil，cache_time300保持。
- 类型11/11、共享55、Bot181、Web双D1 6、Edge专项5和既有浏览器14通过。Web449/450通过，一项Windows5秒遍历超时单独15秒重跑通过。证据和未验证范围见COLLECTION/STATE。
- 不把FTS结果验证3秒应用超时描述为查询取消；两字符LIKE无命中可能扫全表，生产启用前容量压测P1。用户付费口径不自动提高或降低实际配置。

## 阶段一/二历史记录

2026-11-28：新专题以最新确认生产 main d150e0d 建立独立 worktree，原工作区用户改动保留。生产版本证据见 STATE.md，易变信息行动前重核。

- 新统计D1迁移完全独立；KV只存派生榜，不是计数/锁。无DO/Queues/新Worker。
- 两项用户明确确认：D1审核版本gate优先于公开接口只读KV；客户端候选追加核心FTS复核。ADR-002/003是依据。
- 现有Mini App验签可复用纯函数，不能调用会引入核心业务DB依赖的authenticateApp作为统计强依赖。
- Admin认证和POST Origin检查分层，不能只加菜单就宣称权限完成。
- 经典KV不可CAS，D1租约不足以保证固定KV键的过期写者安全；采用不可变generation键+D1发布指针fence。
- Turnstile Siteverify token最大2048字符，正文1KB限制需使用受限独立头；官方重复检测存在传播窗口，还需本系统原子receipt。
- 独立身份8天与榜单7完整日匹配，30/90天不能冒称唯一用户。
- 实际测试及未验证项只在运行后写入STATE/阶段记录。

阶段一真实迁移测试发现SQLite CHECK遇到NULL可放行，已增加显式IS NOT NULL并通过回归。计费写入不能沿用简单UPSERT估算，后续必须测receipt/限额/维度累计的总meta。

阶段一PR #90：未发布提交推送受GitHub邮箱隐私保护拒绝，已仅对此新提交使用账号noreply重建作者信息后成功推送。基线snapshot用例5秒超时，独立放宽时限后通过；不通过修改无关业务修测试。

阶段一Linux CI 46097134175通过，Windows本地基线snapshot/Web测试存在5秒超时，不能将平台耗时差异当成功能失败；保留失败记录，以Linux及专项复核共同判断。

状态页顶部已纠正为阶段一PR交付，避免追加历史与顶部当前状态冲突。阶段二入口见STATE。

2026-11-28 阶段二：共享规范化/隐私/HMAC/会话、Telegram纯验签、D1原子receipt/配额/贡献与Turnstile防重放完成。51项统计测试、96项Telegram通过；类型/Lint/生成一致性通过。成功meta快照保存Bot首次58读19写、Web68读22写、重试/触限4读0写、签发11读6写、500规则2054读。用户付费确认后保留默认10000并允许后台至100000，不为免费额度降额。未接入口，不宣称KV/Cron/Admin完成。

阶段二最终补充：复核3秒截止测试通过（共51项），reserve在同一事务校验配置版本，Siteverify返回后再验版本。显式本地test配置dry-run成功，探针944.50KiB/gzip169.75KiB；自动配置发现曾失败，后续打包明确--config，未上传。

阶段二草稿PR #91（base=codex/search-analytics-stage1，依赖#90），代码62edf40；本地51项和打包通过，Linux CI需按head核验。上游许可文本仅清理末尾多余空行，保留许可内容。

阶段二最终约束加固：0002 partial UNIQUE保证跨维度全球日贡献，51项测试通过。实际成功写入基线由索引增加1行：Bot19、网站22、同身份重复11；回归snapshot按实测更新，重试与触限仍0写。上一代码d5f5ee5的Linux CI 46101482836通过，新增约束后的head需重新核验。

阶段二最终源码398462b的Linux CI 46102332989通过。交付保持独立共享包、独立统计迁移、单向依赖、默认关闭；不把后续入口/榜单/Admin验收套用到此阶段。

2026-11-28阶段四收尾：自动标记词即使人工approved也不能取得eligible贡献（writer p.review=0）；发布先过滤再Top6，候选上限rules+rankingSize，超限无法确定完整安全榜则失败。聚合留存需windowDays+1覆盖完整日窗口和今天，默认90天不变。共享69、Web集成8、榜单浏览器3及既有14通过；最终CI查STATE。
