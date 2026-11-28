# 搜索分析生产发布记录

2026-11-28，用户已明确授权合并部署，以及创建D1/KV/Turnstile、Secrets/绑定、新统计库迁移和验收后逐项启用。不修改WAF、不提高预算、不修改核心库schema。

## 已准备和执行

- 独立D1 tgbox-analytics：0678cbaa-102b-4440-adba-ab5e10628744，APAC/SIN主库，无读副本；核心tgbox/426a1d23保持。
- KV tgbox-cache：6fa85752b8364d6fbbede7f024b1f162；仅Web和Admin绑定。
- 本站managed Turnstile：0x4AAAAAAGXCWRlrEMzWFhQ5，正式两个hostname，no_clearance。
- 新HMAC/session/widget Secrets在连接器内生成/传递并写入，未打印值，Web/Bot使用相同身份Secret。现有凭证保留。
- 检查账户24个Worker的原生限流绑定后选未使用namespace 2026112801，60/min；不是KV严格计数。
- 真实绑定生成wrangler types；后台Access域/AUD和R2公共URL按部署前读回保留，避免空白source覆盖既有配置。
- 本机Wrangler OAuth已过期；使用连接器管理资源，迁移/部署通过已有仓库CI的CF凭证，增加仅main可手动触发的runtime-deploy.yml（analytics-migrations/admin/bot）。没有新增API token。
- 集成历史堆叠期间临时暂停自动Web工作流，避免中间版本多次部署；集成完成后恢复。现有dirty标记不更改。

## 待执行

合并#90–#95及配置PR、迁移0000–0003、关闭态部署Admin/Bot/Web，检查认证/原业务后按开关启用；记录实际版本、测试和限制。默认10000有效事件预算及其他原默认参数保持。真实Telegram账号/浏览器挑战不能用伪造身份替代；测试词不得冒充公开热搜。
