# 搜索分析发布与回滚操作单（仅准备，未执行）

2026-11-28。开发完成不等于批准生产操作。以下创建、迁移、Secret、绑定、WAF和deploy命令全部须单独明确确认。无任何命令在本轮对生产执行。先确认最终main/生产版本/未提交改动，按#90→#91→#92→#93→#94→阶段六PR依赖顺序审阅集成；不能把旧实验分支或本地测试配置当生产。

## 资源与最小绑定

| 资源/能力 | Web | Bot | Admin/Cron |
| --- | --- | --- | --- |
| 既有tgbox/DB | 保留，仅可信结果验证 | 原搜索保留 | 原后台及批准资源推荐保留 |
| 新tgbox-analytics/ANALYTICS_DB | 采集与审核版本读取 | 采集 | 管理、聚合、清理、任务审计 |
| 新tgbox-cache/PUBLIC_CACHE | 只读榜单 | 不绑定 | 聚合发布/管理读取 |
| 原生SEARCH_RATE_LIMITER | 统计/签发/验证与独立榜单读取key域 | 无需 | 无需 |
| Turnstile widget | 网站可疑会话按需，hostname覆盖正式站域名 | 无需 | 管理界面不新增挑战 |

Cloudflare D1/KV binding不支持将同一D1按SQL权限拆成只写/只读角色；代码边界、固定路由、认证、独立数据库和部署token权限落实最小权限。部署token仅授予目标账户/Zone和必要的Workers/D1/KV权限，不写入浏览器。绑定片段见bindings.example.jsonc，不得用append片段覆盖已有数组。需要新数据库、KV、本站widget和原生绑定；不创建新Worker/Queues/DO/VPS，不覆盖旧资源。

## 创建与迁移（待确认）

从已审阅的最终工作树执行，固定仓库安装的Wrangler版本；命令中的ID只能用实际创建输出。先查重，资源已存在则核对归属和用途，不自动覆盖/重建。

~~~powershell
# 从仓库根运行，仅在资源创建获批后：
pnpm --dir apps/admin exec wrangler d1 create tgbox-analytics
pnpm --dir apps/admin exec wrangler kv namespace create tgbox-cache
~~~

Turnstile在账户控制台或经审核API创建：名称TGSearch search analytics、mode managed、domains=tgsearch.app/www.tgsearch.app。拿到sitekey和secret后分别存公开变量/Worker Secret，不把secret贴入文档或命令参数。namespace_id为账户内核验未复用的正整数；没有单独KV计数器或平台严格全局锁。

统计迁移必须使用Admin新ANALYTICS_DB条目（ID不同于核心426a1d23-bde7-42fc-a5ab-e76b3b408df5，目录../../packages/search-analytics/migrations）：

~~~powershell
# 先人工核对配置解析后的binding/name/id/迁移目录；下列命令不得改用DB或tgbox：
pnpm --dir apps/admin exec wrangler d1 migrations list ANALYTICS_DB --remote --config wrangler.jsonc
pnpm --dir apps/admin exec wrangler d1 migrations apply ANALYTICS_DB --remote --config wrangler.jsonc
~~~

仅0000–0003，阶段六无新增迁移。packages/search-analytics/wrangler.jsonc是local测试配置（database_id=local/remote=false），禁止拿来做生产迁移。旧实验统计库若有高预算+小批配置，先SELECT读取settings/version，用minimumCleanupBatch计算最低值；经授权CAS调整cleanupBatch，不改变任何预算；否则新服务会fail-closed且Admin设置页不能打开。不能为通过校验静默抬高配额。

## Secrets和开关

| 名称 | Worker | 用途 |
| --- | --- | --- |
| SEARCH_IDENTITY_SECRET | Web、Bot相同 | HMAC身份和Telegram跨入口去重，至少32字符随机密钥 |
| SEARCH_SESSION_SECRET | Web | 匿名签名会话，独立随机密钥，至少32字符 |
| SEARCH_TURNSTILE_SECRET | Web | Siteverify；公开SEARCH_TURNSTILE_SITE_KEY对应同一widget |
| BOT_TOKEN | Web/Bot既有 | Mini App验签与Bot业务，沿用，不输出/替换 |
| WEBHOOK_SECRET | Bot既有 | 可信webhook，沿用，不修改注册 |
| SETTINGS_KEY | Admin既有 | 原凭证用途保留，搜索管理员审计用独立HMAC域，至少32字符 |

~~~powershell
# 只在Secrets配置获批后交互输入，不将值写到命令参数或日志：
pnpm --dir apps/web exec wrangler secret put SEARCH_IDENTITY_SECRET
pnpm --dir apps/bot exec wrangler secret put SEARCH_IDENTITY_SECRET
pnpm --dir apps/web exec wrangler secret put SEARCH_SESSION_SECRET
pnpm --dir apps/web exec wrangler secret put SEARCH_TURNSTILE_SECRET
~~~

服务器变量：Web SEARCH_ANALYTICS_ENABLED/SEARCH_WEBSITE_ENABLED/SEARCH_MINIAPP_ENABLED/SEARCH_TURNSTILE_ENABLED/SEARCH_PUBLICATION_ENABLED；Bot SEARCH_ANALYTICS_ENABLED/SEARCH_BOT_ENABLED；Admin SEARCH_JOBS_ENABLED。默认均0。SEARCH_ALLOWED_ORIGINS仅正式同源列表。构建变量PUBLIC_SEARCH_ANALYTICS_ENABLED、PUBLIC_SEARCH_PUBLICATION_ENABLED默认关闭；编译关闭后不显示任何未审核静态词。D1设置enabled/三个入口/publication/turnstile/jobs再限制运行时，不得越过部署开关。

## 发布与验收顺序

1. 审批清单和成本，创建资源并保存真实ID，保留核心绑定。统计库迁移0000–0003，生成真实wrangler types，不用类型断言掩盖错绑定。
2. 所有功能关闭时构建、dry-run并核对生成配置；按顺序部署Admin、Bot、Web关闭态。Admin身份鉴权/CSRF、Bot webhook/inline、Web静态和详情先回归。部署必须用各自实际构建生成配置；不能deploy本地smoke config或绑定假ID。
3. 网站Turnstile用真实正式hostname/action=search_analytics/cdata，校验成功、失败、过期/重放；原生限流在多地区仅近似，D1严格预算不被挑战绕过。WAF如调整只覆盖/api/search-event、/api/app/search-event、/api/search-session、/api/search-verify及必要榜单读取；不拦Pagefind索引、详情和普通静态资源。先核对已有规则，不自动替换整组ruleset。
4. 打开D1和部署级采集（按入口逐个开启），构建变量仅相应开启。小流量比对成功/重复/无结果、HMAC跨Telegram入口去重、索引命中、FTS核心D1耗时/队列、匿名会话及采样写量。不提高用户预算。
5. Admin人工刷新并保持请求连接，验证推荐标记/实际热词数、审核后旧榜不可读、缓存缺失/版本变化安全空榜；验证Cron实际北京时间00:05及清理边界。合成授权测试词不得冒充真实热搜，验收结束按审核规则撤回。
6. 开启真实展示/每日任务前，实测该账户地区的D1 SQL耗时、Worker CPU、KV传播和权限；本地墙钟不能替代。对7日大规模/500规则、2字符LIKE最坏漏命中、到期清理吞吐设置观测和报警。通过后才进入正常启用；不启用全账户spending kill switch或无关WAF。

## 安全关闭与回滚矩阵

| 场景 | 操作与限制 |
| --- | --- |
| 仅停采集 | D1 enabled=false或单入口false；部署级采集0是更强kill switch。Pagefind/Bot搜索不受影响。 |
| 停公开展示 | D1 publication=false立即使公开读取空榜；Web SEARCH_PUBLICATION_ENABLED=0进一步阻断，当前前端编译关闭同样空榜，不读取静态词。 |
| 停定时任务 | D1 jobs=false仅停Cron，手动可清理；Admin SEARCH_JOBS_ENABLED=0同时阻断任务适配器。停任务期间没有物理TTL保证，需恢复或人工drain。 |
| 代码回滚 | 只选包含阶段六静态回退修复且兼容当前配置schema的已验收版本。不得回滚到#94及以前的静态推荐前端；也不得把支持cleanupBatch2000的配置交给仅允许500的旧版。 |
| 数据与缓存 | 不降级迁移、不删除库/KV、不恢复旧KV指针/previous榜单。新代码可重建缓存，审核优先。 |
| 无可用安全旧版本 | 保持当前受审核前端，关闭新增功能，修复后向前发布；不能为了回退而恢复未审核推荐。 |

Worker版本与静态前端是两个回滚维度，必须同时核对。回滚命令只对已建立的安全版本允许清单执行，例如在各Worker目录wrangler rollback <SAFE_VERSION_ID>；该ID在首次安全关闭态部署验收后才能填写，现在不存在可凭空声称安全的生产版本。已在浏览器显示/已下载的旧内容无法远程擦除；后续新读取严格校验，不能承诺清除用户屏幕。

## 生产前必须补齐的证据

真实binding/Secrets存在且不泄露、真实Access或Telegram管理员认证/拒绝、实际Siteverify及原生/WAF限流、实际Cron调度/清理、实际地区CPU/SQL/队列、KV传播与隐藏撤回、生产SEO/Pagefind静态资产。当前无统计资源、禁止部署，故这些是待授权上线验收门槛，不能写成已通过。开发/本地验收报告与本操作单供最终确认。
