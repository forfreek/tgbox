# 搜索分析架构

## 依赖与入口

Web / Mini App / Bot / Admin → @tgbox/search-analytics → ANALYTICS_DB / PUBLIC_CACHE / 注入的 FTS 复核。
不依赖核心 DB 的统计查询；FTS 回调仅查询核心 DB，失败只放弃相应上榜验证。浏览器模块不导入服务端凭证、数据库或 OpenCC 全字典。

## 数据流

网站：签名匿名 Cookie → 统计事件 → 输入/Origin/边缘限流 → 会话验证 → 规范化隐私过滤 → 严格配额/幂等/身份贡献事务。
Mini App：同一服务但用已验签 initData 用户派生 tg HMAC；无效身份不降级为可信 Mini App。
Bot：已验证 webhook → 成功 inline 查询 → 共享 writer 后台调用，不经过公开 API，不用 Turnstile。
所有入口来源由服务器固定；trigger 与 reportedResult 分字段。

## 原子性

同一 batch/事务内完成 receipt、严格预算、日身份记录、日聚合。拒绝事务必须整体撤销；不得把 batch 多条语句的前一条 changes() 误当作长期事务标记。榜单每天同一 identity+term 至多一个贡献；7 天跨入口通过统一 identity 再去重。
全局预算只消耗有效接受事件；会话签发和安全采样另设封顶，防无效请求占用接受事件预算或无限扩表。

## 时间与任务

北京时间统计日使用显式 UTC+8 算法，不依赖宿主 timezone。5 16 * * * 为 UTC 16:05，即北京时间次日 00:05。新独立 Cron 不占 Bot 五分钟/小时任务预算。手动刷新同一服务，D1 租约+fence 防并发、可恢复。

## 故障和关闭

部署级 kill switch 优先于后台设置；缺失 binding/secret 一律关闭对应能力。DB/KV/Turnstile 出错均不阻止正常搜索。审核无法确认时空榜；推荐数据同样受审核版本控制，不直接恢复可能包含已隐藏词的静态旧列表。
详见 RUNBOOK.md。
