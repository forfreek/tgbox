# 阶段四：每日榜单、缓存与清理实施报告

日期：2026-11-28（Asia/Shanghai）。独立工作树 `C:/Users/123/tgbox-search-analytics-publication`，分支 `codex/search-analytics-publication`，基于阶段三 `76ca142` / PR #92。远端 main 开工重新核验仍为 `d150e0d20041eb3a1c5d1315672bf0cb54c17e8f`；未重新读取生产部署版本，未将未合并开发分支当作线上功能。

## 修改与数据流

| 文件 | 函数/职责 | 数据来源与输出 |
| --- | --- | --- |
| packages/search-analytics/src/publication.ts | refreshSearchPublication | 统计D1的eligible身份事实 → 跨日去重、规则排除、权重、Top6 → 不可变KV → D1权威指针 |
| 同上 | readPublishedSearches / authority / PublishedSearches | 每次读取新的first-primary会话；KV前后校验权威状态；只返回当前审核和配置版本的有效payload |
| packages/search-analytics/migrations/0003_publication_snapshot.sql | 向后兼容扩展任务表 | published标志及ranking_json；分数和窗口身份数只存D1，与指针同一batch原子更新，供后台读取 |
| apps/admin/src/worker.ts | fetch / scheduled | 保留原TanStack fetch；新增独立5 16 * * *入口，ctx.waitUntil调用共享服务；不改Bot任务 |
| apps/web/src/pages/api/trending.ts | trendingResponse / GET | 原生限流、IP-HMAC → 统计D1/KV gate → 安全公开字段；不执行排名SQL |
| apps/web/src/components/search/SearchDialog.tsx | 弹窗打开effect | 低优先级异步GET；关闭取消请求并清空内存词表；热搜/推荐来源分别标记 |
| apps/web/src/layouts/BaseLayout.astro | 构建开关 | PUBLIC_SEARCH_PUBLICATION_ENABLED默认关闭；保持原canonical/hreflang/详情链接/索引URL |

依赖方向仍为apps→search-analytics；共享模块不导入核心DB。冷启动推荐通过注入回调读取核心已批准资源，按成员数降序、ID稳定排序取至多30候选，再由共享规范化/规则过滤；不使用随机词或把推荐混进真实榜单。正常已有真实榜单时不查询推荐资源。

## 排名口径

最近7个完整北京时间自然日，排除今天；同词同身份先MAX(eligible day)，再按最近一天1.0、第2～3天0.6、第4～7天0.3。不同来源/语言不重复累计。SQL只使用writer已验证且eligible的记录，零结果、推荐/热搜/预填不能凭客户端声明取得排名资格。

至少5个窗口独立身份；黑名单、hidden、pending均排除，approved不能绕过隐私/自动内容过滤或门槛。排序为得分、身份数降序、规范化词BINARY升序；得分保留6位小数以稳定展示与同分口径。输出实际数量，最多6项，不补推荐。展示使用安全规范化词，全球三语言共榜。

## 发布、撤回与失败

租约120秒，递增fence和随机token；CAS检查token/fence/有效期/审核revision/配置version。旧任务不能释放新锁或覆盖新指针，超时running任务在新一轮标为superseded。Cron和manual使用同一函数；关闭cron不阻止人工刷新。

KV键为 `search:trending:v1:global:<fence>:<uuid>` 或recommended对应前缀，TTL8天。版本写入后读回校验，再用D1 batch原子提交指针与私有分数快照。没有可被旧任务覆盖的可变global/previous别名；以权威指针选择版本。KV读回失败保留旧指针，未引用版本自动过期。

公开读在KV前后各新建first-primary会话。最终检查是返回结果的线性化点；规则/配置变更、指针切换、KV缺失/异常/旧格式、D1故障均为空榜。不能用副本旧读、previous、静态推荐、HTTP或浏览器缓存绕过。已经渲染到用户屏幕的词无法远端擦除。

所有公开响应no-store，只有version/type/generatedAt/window/items，去除审核版本、分数、身份数及其他内部信息；无会话响应或跨域授权。服务器原生限流使用独立trending-ip HMAC域，缺Secret/限流器或限流失败时不读D1/KV。正常每次打开弹窗只发一次请求，不随输入重复取榜。API故障时空榜是用户确认的严格撤回边界，不恢复未经当前审核的静态词。

参考：[D1会话](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[KV一致性](https://developers.cloudflare.com/kv/concepts/how-kv-works/)。KV可能延迟超过60秒，发布版本尚未在某边缘可见时允许暂时空榜，不假称全球立即同步。

## 清理与资源边界

每日聚合/安全样本按包含今天的90个日期保留，身份事实按包含今天的8个日期保留；receipt/限流按expires_at，任务/操作审计按保留天数清理。每轮各表最多cleanupBatch行（默认100，安全范围10～500），同一个D1 batch内校验并续租、执行带版本/租约guard的固定表清理，避免逐表大量往返和并发配置变更误删。

最多900轮、90秒；预留D1调用给发布和任务日志。依据[付费D1限制](https://developers.cloudflare.com/d1/platform/limits/)的每次Worker调用1000次D1 API请求，batch按一次API调用计算。这是单次任务执行保护，不降低用户每日统计配额。清理积压会记失败，已成功发布的有效指针不撤销；下一轮/人工重复刷新继续排空。物理删除可能因故障延迟，不能宣称TTL精确到秒。

公开接口正常为2次singleton主库校验＋1次KV读＋1次原生限流；被边缘拒绝不触达D1/KV。每次正常发布1次KV写和1次读回，无别名写放大。聚合扫描最近窗口身份事实，默认1万接受事件/日约7万事件事实量级，实际读量随索引、维度、规则数量和重复身份变化；不能把此估算当固定账单。

本地D1夹具实测（26个身份事实行，含今天5行不参与排名，3个候选）：任务内成功SQL meta为124读/9写，见publication.test.ts.snap；不含最终任务日志/释放锁batch、公开API、注入的核心推荐查询或失败查询，不能当完整供应商消耗。高并发/最大数据量、CPU及真实边缘传播仍须阶段六验证。高日预算应结合cleanupBatch、运行时长和积压指标实测容量。

## 实际验证

- 共享统计包69项通过，含13项发布/撤回/事务回滚测试及人工批准不能绕过自动规则的采集测试；发布测试覆盖跨日去重、排除今天、最低门槛/同分/规则、人工与cron开关、冷启动、并发锁、超时恢复、旧任务抢锁、缓存失败、最终主库版本检查、多批清理、8天边界、发布后清理失败、关闭展示仍清理及分数快照原子保存。
- Web双D1集成8项通过，含公开字段/no-store/审核失效、原生边缘拒绝不访问D1/KV；Admin115项通过，含原fetch委派和关闭态scheduled无I/O。
- 全仓类型11/11和Lint通过；仅既有3条Lint警告和Safari兼容keyCode hint。最终补充修改的检查以STATE/CI记录为准。
- Playwright本机Edge：新增榜单/冷启动/旧版本3项通过，原搜索/三语言/移动端/排行14项回归通过。Browser plugin not available，按技能使用仓库Playwright；未安装新浏览器。截图和最终复核见STATE。
- Admin生产构建成功，生成配置保留cron且导出scheduled；显式配置Wrangler4.132.0 dry-run成功，总包4988.26KiB/gzip1427.85KiB（整个Admin，非本功能增量）。没有借dry-run创建资源或部署。

## 部署兼容性、风险和回滚

新变量SEARCH_JOBS_ENABLED、SEARCH_PUBLICATION_ENABLED和构建PUBLIC_SEARCH_PUBLICATION_ENABLED默认关闭，D1设置的jobs/publication进一步限制；公开展示关闭不阻止启用的清理任务。保留统计采集独立开关。缺绑定安全停用，无虚构资源ID；目前仅新增本地配置和迁移文件。

新统计迁移0003必须仅应用到ANALYTICS_DB，再启用功能；核心tgbox迁移无变化。审批后Web绑定统计D1/KV和既有原生限流/identitySecret；Admin绑定统计D1/KV。先关闭态部署、检查既有Admin认证/fetch和SEO，再人工生成、核验榜单，最后启用每日任务及显示。当前没有生产迁移、资源/WAF/Secret修改、部署、合并。

回滚先关闭对应部署开关，前端下次打开安全空榜；回滚Worker代码不降级或删除统计表/资源。新增列有默认值，旧版命名列写入向前兼容。撤回词不通过回滚旧KV重新发布。

生产前P1：实际账户绑定/权限/限流/Turnstile、核心2字符LIKE验证负载、窗口聚合与高预算清理容量、真实Admin认证/cron端到端及发布撤回验证。故障期间可关闭publication、保留jobs继续清理；关闭jobs后须人工刷新或恢复任务排空积压。阶段五管理后台与阶段六独立技术债审查尚未交付。

## Modern Web Guidance

应用deprioritize-background-fetches："Add the `priority: 'low'` option to the `fetch()` initialization object." 使用低优先级、AbortController和no-store异步请求；不支持priority的浏览器忽略该提示，不阻塞搜索。

最终安全复核补强：writer要求review=0才可累计榜单贡献；publisher先读取最多“规则硬上限500＋榜单数量”的候选，再执行共享安全过滤并取Top6，兼容旧的已批准但被自动规则标记的事实。安全候选前缀超容量且不能确定完整榜时任务失败，不发布被错误截断的榜单。新增回归验证6个高分不安全词不会挤掉后面的合法Top6。

最终本地补充：Web全量450项通过（Windows CLI单项超时上限15秒、串行执行，未更改仓库默认超时），另8项真实双D1集成通过。Admin115项含启用scheduled委派共享任务及推荐查询参数的适配测试；该适配测试mock共享任务，真实D1语义由统计包覆盖，不宣称真实Cloudflare Cron已验收。Web显式配置dry-run总包1222.39KiB/gzip331.74KiB；Admin最终候选为4988.26KiB/gzip1427.85KiB，均非增量或CPU实测。
