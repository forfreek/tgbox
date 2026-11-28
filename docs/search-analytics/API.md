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
