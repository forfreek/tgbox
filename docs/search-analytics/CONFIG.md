# 统一配置

阶段四：SEARCH_JOBS_ENABLED（Admin）、SEARCH_PUBLICATION_ENABLED（Web）、PUBLIC_SEARCH_PUBLICATION_ENABLED（Web构建）默认0；D1 jobs/publication进一步限制。publication=false仍允许启用的jobs清理；jobs=false仍可人工刷新。公开GET复用SEARCH_RATE_LIMITER和SEARCH_IDENTITY_SECRET，以独立trending-ip HMAC键保护读量。分数统一6位小数。固定安全上限集中HARD_LIMITS：publicationBytes8192、publicationRuntimeMs90000、cleanupBatches900、recommendationCandidates30；不能通过后台绕开。每批清理仍用统一cleanupBatch。

部署级开关优先关闭，后台设置只能在部署允许范围内调整。配置 version 单调递增；运行时同一接受事务读取版本，避免跨 await 复用旧设置。

| 参数 | 默认 | 安全范围/约束 |
| --- | --- | --- |
| 全局/website/miniapp/bot 采集 | 关闭 | 独立开关 |
| 真实榜单/Turnstile/每日任务 | 关闭 | 独立开关 |
| 统计防抖 | 1500ms | 500–5000；不改搜索200ms |
| IP 每分钟 | 60 | 10–300；边缘近似+D1门禁 |
| 匿名会话每小时/每天 | 30/100 | 1–100 / 1–300，日>=小时 |
| Telegram 每天 | 100 | 1–300，Mini App/Bot合计 |
| 全站有效事件每天 | 10000 | 1–100000；付费容量、防刷与误操作保护，不自动改变线上值 |
| 关键词长度 | 2–64 | 服务端固定硬上限64 |
| 最低排名身份 | 5 | 5–1000，人工批准不绕过 |
| 榜单数量 | 6 | 1–6 |
| 窗口 | 7完整日 | 1–7，身份留存>=窗口+1 |
| 日聚合保留 | 90天 | 7–90且>=窗口+1 |
| 身份/receipt保留 | 8天 | 窗口+1–8 |
| 权重 | 1.0/0.6/0.3 | 0–1，单调不增，最近日>0 |
| 规则模式 | exact/contains | 禁止管理员上传任意正则 |
| 会话有效期 | 24h | 有限过期，可信状态<=1h |
| 任务租约 | 有限秒数 | heartbeat+CAS fencing，超时恢复 |

会话签发预算、安全采样预算、清理批量、分页上限、头长度及 Siteverify timeout 同样集中管理并验证，不散落入口。具体常量与 Zod schema 是最终实现依据，文档须同步。

## 付费版及阶段二安全策略

2026-11-28用户确认付费版，不以免费额度刻意降低合理阈值。默认值保留原业务参数；全局事件和会话签发日预算可配置至100000，验证日预算默认500、可配置至100000。个人/IP限流为防刷，Turnstile不提升这些硬限额。

新增集中参数：challengeAfterSearches=15（1–30），challengeAfterSessionIssues=2（1–5），anomalyIdentitiesPerMinute=20（10–1000），verificationsPerIdentityMinute=3（1–5），verificationsPerIpMinute=5（1–10），securitySamplesPerDay=100（0–100）。安全采样比率固定1%，明确标注截断样本。完整运行时范围以config.ts为准。

按包含今天的自然日留存口径，aggregateRetentionDays必须>=windowDays+1，与身份留存一致；默认90天不变。7完整日窗口的最小聚合留存是8天，防后台配置丢掉窗口最早一天。

## Admin编辑与优先级（阶段五）

功能设置表单覆盖SearchSettings全部字段。只保存操作员本次提交值，服务端重验安全上下限及留存/权重关系，配置CAS递增version；不自动提高生产额度。读取新请求立即加载D1配置，部署开关和能力缺失优先关闭。增加配置版本会使旧公开榜单失配，需要重建。框架缓存no-store、React Query不自动轮询，窗口切换不自动刷新。新查询使用当前保留期裁切；保留期降低后不可恢复。

Admin的HMAC审计复用现有SETTINGS_KEY（至少32字符），用途域与其他密钥用途隔离；无需分享Web/Bot身份密钥给Admin。轮换此key会使后续审计身份不可与旧哈希直接比较，不更改搜索身份。新HARD_LIMITS.rankingPage=80仅是SQL参数安全边界，后台业务分页仍允许100。
