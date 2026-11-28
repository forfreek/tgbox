# 阶段三实施报告：三入口搜索采集

核验日期：2026-11-28，Asia/Shanghai。工作树 `C:/Users/123/tgbox-search-analytics-collection`，分支 `codex/search-analytics-collection`，基于阶段二 `9d4a5d2`。远端 main 本阶段重新读取为 `d150e0d20041eb3a1c5d1315672bf0cb54c17e8f`。生产部署版本沿用阶段一证据，本阶段没有重新验证生产 Worker 版本，不把开发分支当生产功能。

## 实施范围和数据流

| 入口/文件 | 函数与行为 | 数据流与隔离 |
| --- | --- | --- |
| packages/search-analytics/src/client.ts | createSearchCollector：当前 generation、输入法状态、成功回调、独立防抖和单次发送 | 纯浏览器模块；contracts 仅 type import，不带 Zod、OpenCC 和服务端凭证 |
| apps/web/src/lib/use-search-analytics.ts | useSearchAnalytics：keepalive 发送、按需挑战、同 eventId 单次重试 | 不等待统计展示结果；无关键词持久化/无限重试 |
| apps/web/src/components/search/SearchDialog.tsx | SearchDialog：手动、推荐来源；IME Enter 保护；点击/键盘选结果提前发送 | 保留 Pagefind 的 200ms、防过期回调、索引与详情链接；静态资源词明确标为推荐搜索 |
| apps/web/src/components/app/browse.tsx | BrowseScreen：复用 collector，结果打开触发 select | 共享 transport；仅附带原有签名 launch proof，不发送客户端身份 |
| apps/web/src/lib/search-analytics-api.ts | searchAnalyticsApi：固定入口、严格 HTTP、原生边缘限流、Cookie/initData、共享 writer | 单独统计 D1；手动且报告有结果的排名候选才异步读取核心 FTS/LIKE；故障不授排名资格 |
| packages/search-analytics/src/bot.ts | collectBotSearch：可信 webhook 用户、HMAC inline-query event UUID | 复用成功执行的现有查询结果；与 Mini App 使用同一 Telegram 身份域；重复 webhook 同 receipt |
| apps/bot/src/bot/inline-search.ts | inlineSearch：答复后 app.background 调用服务 | 生产 ctx.waitUntil 续命；保留 cache_time=300，统计异常不改变答复，不额外查询核心库 |

网站刷新/URL 自动预填只打开现有搜索，不生成有效统计；失败、未完成、被取消和过期搜索不提交。零结果独立于 trigger。推荐/热搜点击可以记录分析，但不贡献排名。自动预填契约保留，浏览器首次导航不主动上报。

快速点击在成功结果的候选上提前 flush，与防抖共用 eventId。网络中断、浏览器终止、尚未返回的搜索或 Telegram 自有 inline 缓存直接响应仍可能漏采，不宣称逐次完整行为日志。

## API 和安全边界

- `POST /api/search-event`：网站事件；缺少 Cookie 时在同一个请求内限额签发并写统计，减少快速导航前的额外往返。已有非法 Cookie 不自动换新身份。
- `POST /api/app/search-event`：Mini App 专用路由，必须验证 `X-Telegram-Init-Data` 的签名、时效和身份；不能降级为网站会话。
- `POST /api/search-session`：仅空 JSON，独立限额签发；当前客户端采用 event 内签发，不主动预热会话。
- `POST /api/search-verify`：仅空 JSON，`X-Turnstile-Token` 上限2048字符；调用共享 Siteverify、receipt、上下文和硬限额逻辑。
- 所有响应 `Cache-Control: no-store`，没有 CORS 授权；请求 Origin 必须同时等于请求 URL origin 且在部署 allowlist 中。仅 POST JSON，实际流读取不超过1KB。
- Cookie 为 `__Host-tgsearch_search`，Secure/HttpOnly/SameSite=Lax/Path=/，无 Domain；Max-Age 与签名过期时间一致。仅适用于 HTTPS（localhost 开发除外），不提供不安全 Cookie 模式。
- 必须配置原生 `SEARCH_RATE_LIMITER`；缺失/故障停采。共同 IP-HMAC key 只用于上述新接口，不限制 Pagefind、静态索引或详情页。原生限流是按边缘位置近似，D1 仍执行全局严格预算/身份限额。
- Bot 唯一入口仍是现有 `/webhook` 的 Telegram secret-header 校验，公开 API 不接受 bot/source/identity 字段。
- 安全统计接入固定原因码1%抽样和每日100样本上限；原生边缘拒绝不访问统计 D1。拒绝流量仍消耗 Worker 请求，抽样达到预算后仍可能发生只读检查，不代表无限攻击零成本。
- 第一次浏览器事件使用1500ms；成功解析服务器响应的 `debounceMs` 后，后续候选应用当前安全范围配置，不增加配置预读请求。硬安全上下限在共享 client-policy/config 中维护。
- 新 Turnstile 脚本只在服务器要求挑战后加载。失败/过期不影响搜索；完成验证最多重试同一事件一次，过期候选不能重试。

## 功能开关与兼容性

构建 `PUBLIC_SEARCH_ANALYTICS_ENABLED=1` 才允许浏览器发统计请求，默认关闭。服务端还有 `SEARCH_ANALYTICS_ENABLED`、`SEARCH_WEBSITE_ENABLED`、`SEARCH_MINIAPP_ENABLED`、`SEARCH_BOT_ENABLED` 和 `SEARCH_TURNSTILE_ENABLED`，默认均为0；D1 后台配置是进一步限制，不能越过部署 kill switch。

缺绑定/Secret/边缘限流时停采。现有 Web/Bot 可关闭态部署，无统计资源依赖；本阶段不加虚构资源 ID、不实际创建绑定。核心迁移不变，无新生产迁移；阶段一/二统计迁移仍待授权。没有 KV/Cron/Admin/真实榜单发布，阶段四/五继续实现。

新增依赖仅两个 app 的 workspace analytics 和 Web 测试使用的既有 catalog Workers 测试池，无供应商版本升级。E2E 改为 Node 执行 Astro 已安装 CLI，修复 Windows 无法直接执行无扩展 shell launcher；可通过 `TGBOX_E2E_BROWSER_CHANNEL` 复用已安装浏览器。

## 实际测试与限制

实现提交377f65e的Linux全仓CI [46118001213](https://github.com/forfreek/tgbox/actions/runs/46118001213)全部通过；草稿PR #92依赖#91，未合并。Git差异54文件、1556新增/44删除（实现提交范围；后续文档提交另计）。

- 共享包55/55：原子写、并发、幂等、跨入口、限额、安全过滤、Turnstile 防重放，以及浏览器状态机的过期/IME/快速点击/预填/零结果/关闭态。
- Web 真实双 D1 集成6/6：Cookie/重试、Mini App/Bot 同身份贡献去重、客户端结果伪造、来源伪造、FTS 故障、统计故障、Origin/body/边缘拒绝。
- Bot 全量181/181：包含真实 webhook 路径的统计重试幂等及故障隔离，原有 inline cache=300 断言保留。
- 原 Web450项：449通过，1项全站内部链接遍历超过 Windows 默认5秒；单独以15秒上限重跑该项通过，未修改项目测试超时掩盖失败。
- 全仓类型11/11通过；Astro0错误，Safari IME所需 keyCode229兼容分支产生一个 deprecation hint。全仓 Lint通过，3条既有警告。
- Playwright/本机 Edge 采集专项5/5：桌面 IME+快速导航、移动零结果+503、预填刷新+推荐来源、Mini App proof、按需挑战+同事件重试。Browser plugin 不可用，按测试技能回退仓库 Playwright；未下载额外浏览器。
- 已人工查看桌面/移动截图。Edge 跨文档导航可能出现既有 ViewTransition opt-in disabled 异常；测试单独过滤该固定导航异常，搜索阶段仍断言无 pageerror，不修改无关动画模块。
- 原有浏览器回归14/14通过（关闭采集构建，三语言排行/详情/导航/弹窗）；CI及打包验证结果在 STATE 补充。真实 Telegram 客户端、生产 Siteverify/WAF/CPU、生产负载和最终整体安全验收仍待阶段六及部署授权。
- 最终夹具构建及显式配置Wrangler dry-run通过：Web总包1215.90KiB/gzip331.00KiB，Bot总包1771.49KiB/gzip363.57KiB。均为整个Worker，不是本功能增量，也不等于冷启动CPU。

## 资源消耗和风险

一次候选通常额外一个 Web Worker POST，无 KV 访问；每个实际完成且符合采集条件的搜索一条聚合事件，不写逐次原始日志。会话 Cookie 往返可能在快速退出时丢失；keepalive 只尽力发送，不能保证交付。

统计库成本沿用实测：网站新身份68读/22写、签发额外11读/6写、Bot新身份58读/19写、已知事件重试4读/0写。1万首次网站事件且每个都新签发约79万读/28万写/日，不含规则增加、安全抽样、核心验证和未来清理。实际规则500条时读成本显著增加，见 RESOURCE-USAGE。

核心验证最多一次/符合条件且未被已知限额拒绝的候选；Bot没有额外核心查询。三字符及以上走现有 trigram FTS；两字符走 LIKE，LIMIT 1 不能限制未命中扫描。最坏约 `候选数 × FTS表行数` 的读量（另有 join 成本），独立统计库不能隔离这部分核心负载。生产启用前必须实测并确定容量警戒，不能把3秒应用等待上限描述为数据库查询取消。未取得生产负载证据前保持关闭。

按用户付费版口径保留合理业务默认值及后台安全范围，不为免费额度缩减。未修改线上配额。D1/KV创建、生产迁移、绑定、Secrets、WAF、部署、合并均未执行。

## 下一步

阶段四：7完整北京时间自然日聚合、跨日身份去重、D1租约/fence、审核版本 gate、KV版本发布、公开榜单和推荐降级、分批清理。随后阶段五管理后台、阶段六安全/资源专项验收；目前不能对外称完整系统已上线。

## Modern Web Guidance

采用ime-safe-enter-submit："Pairing `event.isComposing` with `event.keyCode === 229` reliably catches Safari's out-of-order confirming `Enter` keydown." 配合composition生命周期和捕获阶段Enter保护；未为移除兼容性hint而删除Safari保护。
