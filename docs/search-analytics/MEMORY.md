# 可复用决策与证据

2026-11-28：新专题以最新确认生产 main d150e0d 建立独立 worktree，原工作区用户改动保留。生产版本证据见 STATE.md，易变信息行动前重核。

- 新统计D1迁移完全独立；KV只存派生榜，不是计数/锁。无DO/Queues/新Worker。
- 两项用户明确确认：D1审核版本gate优先于公开接口只读KV；客户端候选追加核心FTS复核。ADR-002/003是依据。
- 现有Mini App验签可复用纯函数，不能调用会引入核心业务DB依赖的authenticateApp作为统计强依赖。
- Admin认证和POST Origin检查分层，不能只加菜单就宣称权限完成。
- 经典KV不可CAS，D1租约不足以保证固定KV键的过期写者安全；采用不可变generation键+D1发布指针fence。
- Turnstile Siteverify token最大2048字符，正文1KB限制需使用受限独立头；官方重复检测存在传播窗口，还需本系统原子receipt。
- 独立身份8天与榜单7完整日匹配，30/90天不能冒称唯一用户。
- 实际测试及未验证项只在运行后写入STATE/阶段记录。

阶段一真实迁移测试发现SQLite CHECK遇到NULL可放行，已增加显式IS NOT NULL并通过回归。计费写入不能沿用简单UPSERT估算，后续必须测receipt/限额/维度累计的总meta。
