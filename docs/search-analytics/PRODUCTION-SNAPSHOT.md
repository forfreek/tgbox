# 生产只读核验快照

2026-11-28本轮通过Cloudflare连接器GET查询资源、绑定和deployment；另仅对核心D1执行两条SELECT（2244及76读行、0写行），没有生产迁移或配置变更。版本易变，上线前重新核验。

| 项目 | 本轮观察 |
| --- | --- |
| 远端main | d150e0d20041eb3a1c5d1315672bf0cb54c17e8f |
| tgbox-web | 7c5bd744-383c-4ded-b363-8587ae63cded，100%，deployment记录2026-11-28 08:18:39 UTC |
| tgbox-bot | ac61a4c4-1676-4b05-a2a1-9c443d075808，100% |
| tgbox-admin | 8923c4ef-3a91-40c6-b5a5-393b45544619，100% |
| 核心tgbox | 41表，约14.8MB，2244资源/2225 approved；无search_%统计表 |
| 独立统计D1/KV | 未见tgbox-analytics/tgbox-cache；没有自动创建或复用其他同名近似资源 |
| 三个Worker | 未见ANALYTICS_DB/PUBLIC_CACHE/SEARCH_RATE_LIMITER/SEARCH_*统计Secrets绑定 |
| 本站Turnstile | 当前可见widget列表没有tgsearch.app及子域绑定 |
| tgsearch.app Zone | Free Website，与用户确认的Workers付费计划不是同一计费维度，不据此降低Workers业务预算 |
| 可见Zone rulesets | managed sanitize/firewall/ddos和既有custom firewall；未见http_ratelimit ruleset，不由此推断不可申请或不可使用原生Worker限流 |

Workers版本ID不是Git commit。Web本轮版本已不同于阶段一历史记录，可能由既有构建发布产生；未读取完整生产源码或声称版本与Git哈希一一对应。开发仍基于已确认main并叠加本专题未合并阶段，不能把阶段PR当已上线。未读取Secret值、用户搜索词、完整IP或Telegram凭证，报告不复制其他项目资源清单。

补充只读核验：Turnstile实际分页total_count=3/total_pages=1，全部可见widgets均不含本站域名。schedules端点确认Web/Admin当前空，Bot仍为*/5 * * * *及0 * * * *；既有custom firewall只有一条disabled skip规则，不等于已验证所有managed/Bot Fight行为。新任务将放Admin，不改Bot现有调度。
