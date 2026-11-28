# 搜索分析约束与节点索引

先读本文件及 STATE.md，只读取当前阶段文件。根 AGENTS.md 的项目总约束始终适用。

## 长期约束

- packages/search-analytics 是规范化、身份派生、统计口径、配置、限流、幂等、聚合及审核的唯一实现；入口只适配认证与服务调用。依赖不得反向指向 apps，无循环依赖。
- ANALYTICS_DB 与核心 DB 完全隔离，迁移不得进入 packages/db/migrations。D1 是唯一可信来源，PUBLIC_CACHE 仅缓存可重建榜单，不承载计数、锁或预算。
- 不引入 Durable Objects、Queues、额外 Worker、VPS 或第三方付费服务。保留未来替换事件写入接口的边界，不预建基础设施。
- 所有新增开关默认关闭。统计失败不影响搜索；不得设置站点 dirty、触发构建或降低 Telegram 缓存。
- 关键词、标识与限流只存安全规范化词及 HMAC；不记录原始 IP、Telegram ID、凭证或完整指纹。异常日志只输出固定原因码。
- 可信来源由入口认证决定，不信任客户端 source、identity 或 result。Mini App/Bot 共用 Telegram HMAC 域；匿名会话不宣称精确真人。
- 严格预算、幂等、身份贡献及任务租约使用 D1 原子操作。事务失败不得部分累计。
- 用户于 2026-11-28 确认：公开缓存返回前允许统计 D1 主库审核版本校验，故障返回空榜；有资格的客户端手动搜索追加核心 FTS 验证，统计异步隔离。
- previous、推荐、客户端内存及 HTTP 缓存均不得绕过审核版本。全球 KV 传播不是严格撤回机制。
- 中文归并优先复用 OpenCC，但不能把 build-only 的 @tgbox/hant 导入 Worker；须验证运行时资源成本。
- 每阶段独立可验收 PR，更新 MEMORY/STATE/PLAN。运行时保持向后兼容，生产资源、迁移、WAF、部署与合并均待单独确认。

## 阶段入口

| 阶段 | 必读要求 | 验收入口 |
| --- | --- | --- |
| 一：基线、架构、迁移 | stages/01-foundation.md | PLAN.md、SCHEMA.md |
| 二：共享统计与安全 | stages/02-service.md | API.md、CONFIG.md |
| 三：三入口采集 | stages/03-collection.md | API.md |
| 四：榜单与公开展示 | stages/04-publication.md | ARCHITECTURE.md、ADR.md |
| 五：Admin | stages/05-admin.md | API.md、METRICS.md |
| 六：完整验收与发布准备 | stages/06-verification.md | RUNBOOK.md、DEPLOYMENT.md、DEBT.md |

当前未完成事项以 STATE.md 为准，不因文件存在认定功能已交付。
