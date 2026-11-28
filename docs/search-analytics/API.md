# API 契约 v1

## 事件

POST /api/search-event；仅 application/json；正文实际流式读取最多 1024 bytes，不仅检查 Content-Length。
字段：version=1、eventId（UUID）、keyword（2–64 Unicode codepoints，规范化后重验）、trigger、reportedResult、locale（zh/zh-hant/en）。禁止额外 identity/source 权限字段。
网站来源由签名 Cookie 认定；Mini App 使用受限 X-Telegram-Init-Data 请求头并验签/时效，不能 body 指定身份或冒充 bot。Bot 只调用内部 typed writer。

快速结果点击与 1500ms 到期共享同一 eventId 和 pending state，点击只促使同一候选提前提交；无自动无限重试。零结果是 reportedResult，不是 trigger。

## 会话和验证

POST /api/search-session 签发 HttpOnly、Secure、SameSite=Lax、Path=/ 的 host-only Cookie；来源需精确 allowlist。签发本身经边缘和 D1 IP-HMAC/全局独立预算。
POST /api/search-verify 校验 Siteverify；Turnstile token 放长度受限专用头，JSON 仍 <=1KB。验证预期 hostname/action/cdata，token HMAC receipt 原子防并发重放。成功签发短期可信状态，不能提升硬限额。仅匿名网站可疑时触发。

## 公开榜单

GET /api/trending；不接受聚合参数，不触发 D1 排名查询。仅查询 D1 singleton 审核/配置版本和权威 KV key，读取已生成 KV payload 并严格验证。DB 不可用、版本不符、KV 缺失/异常时安全空榜。推荐与 previous 同样验证；不得带会话信息。HTTP 不允许跳过权威检查的陈旧缓存，客户端仅在再次验证后复用。

响应包括 version/type/generatedAt/window/items[{keyword,rank}]；无身份/IP、审核内部信息和完整统计。

## Admin

复用 createServerFn、adminMiddleware 和现有 POST Origin 校验模式。GET 分页筛选最多 100 条，日期最多 90 天，查询排序白名单；POST 配置/rule/refresh 必须认证+CSRF+统计 DB 审计。不由浏览器直接持有 Cloudflare token。每条写操作有 revision CAS，隐藏/黑名单使公开版本立即失配并触发后台刷新。

## 阶段二库边界（历史）

createD1SearchWriter实现D1 writer；writeSearch返回统计库成功meta和usageComplete。认证必须由AuthenticatedSearch工厂创建，body不能恢复可信对象。HTTP路由未接入。会话结果仅由服务器适配为安全Cookie；cdata用challengeContext计算，禁止原样输出会话对象/Secrets。挑战不提升硬额，配置变更时拒绝升级。

## 阶段三已实现 HTTP

网站 `/api/search-event` 与 Mini App `/api/app/search-event` 为独立POST路由，body字段相同，服务端固定source。`/api/search-session` 和 `/api/search-verify` 仅空JSON；验证token在专用头。具体实现、Cookie、allowlist、限流和状态见COLLECTION.md。

事件成功200 `{status: accepted|duplicate, debounceMs}`；格式400、身份401、Origin/挑战/过滤403、方法405、幂等冲突409、限流429、关闭或依赖异常503。挑战403含安全siteKey/action/context；不对外发布身份或用量明细。所有响应no-store。首次事件无Cookie时可以合并签发；客户端不自动重试普通失败，只在成功Siteverify后重试同一事件一次。

公开 `/api/trending`、Admin接口仍为阶段四/五契约，本阶段未实现。

## 阶段四已实现公开榜单

GET /api/trending不接受排名参数、不触发聚合。正常响应version=1、type=trending|recommended、generatedAt、window、items；无可用权威榜时返回200且type=unavailable、items=[]。所有响应no-store，不返回身份/分数/审核和配置版本，不设置Cookie。入口原生限流和IP-HMAC保护读取；缺能力或受限时安全空榜。存在健康榜单时两次新的first-primary校验与一次不可变KV读取，规则/配置/指针变化均拒绝旧结果。旧previous或静态推荐不能恢复已撤回词。后台人工刷新尚待阶段五认证接口接入，共享refreshSearchPublication已支持manual。

## 阶段五已实现Admin v1

路径 /search-analytics，TanStack server fn $searchAnalytics（GET）和$searchAnalyticsCommand（POST）。统一AdminSearchQuery/AdminSearchCommand位于packages/search-analytics/src/admin-contracts.ts；浏览器只导入纯配置/契约子路径。两函数均走adminMiddleware，响应no-store；POST额外验证精确Origin和方法，不接受缺失、null或端口不同的Origin。前端校验不能替代服务端schema。

GET view=overview|keywords|zero|publication|rules|security|settings|jobs；from/to为真实ISO日期，仅最近90天且不能未来；page 0–999，size 1–100；source/locale枚举、sort=searches|zero_results|keyword、ruleStatus枚举。search为空或符合共享2–64字符安全规范的词，归并后使用绑定参数和instr。动态排序/SQL表仅固定白名单，不拼接用户文本。分页总数与列表同batch读取；排名最多80词一段，避免100 SQL绑定参数上限。

POST action=settings含expectedVersion/value；action=rule含id/expectedRevision（新建均0）、pattern/match(exact|contains)/status(blacklist|hidden|pending|approved)/enabled；action=refresh含expectedVersion。配置/规则业务修改和search_admin_audit同事务，CAS冲突0业务更新/0审计；审计故障回滚修改和审核触发器。审计身份由现有SETTINGS_KEY+独立search-admin-audit域HMAC派生，不保存原始邮箱/TG身份，不写核心库审计。

规则/设置成功返回saved/refresh=scheduled|disabled；后台重建不保证送达，严格D1版本失配先确保旧榜不能公开。手动刷新等待同一聚合函数，返回completed|busy|failed，不把已入后台等同于完成。GET日志用于确认published/status/reason。部署SEARCH_JOBS_ENABLED=0或缺KV拒绝显式刷新，数据库jobs=false只关闭每日任务，手动刷新仍可用。无需新增统计迁移。

任务视图附操作审计分页：只返回id/action/target/created_at，不输出actor哈希或完整payload。两个列表共用页号，各计总数，分页以较长列表决定上限。
