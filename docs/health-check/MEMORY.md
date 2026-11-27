# 决策与证据入口

2026-11-27，Asia/Shanghai。

- 公开网页占位及预览重定向是弱信号；已有资源记未知，新收录身份校验单独处理，防止把未知当成自动通过。
- 头像优先刷新此前调用applyActiveSnapshot及recordLivenessResult，扩大旧误判规则触发机会。阶段一增加avatarOnly写入范围，并禁止该通道进入存活记录路径，包含成功恢复也不能在头像任务发生。
- 代码：packages/telegram/src/{liveness,snapshot}.ts、packages/core/src/refresh.ts。测试对应Telegram测试与apps/bot/test/refresh/refresh.test.ts。
- 全项目以一个健康检查专题管理两类资源，共享证据/重试/人工保护；机器人功能验证单独，不以没回复、没月活或没头像判断失效。
- 旧type_changed自动隐藏和混合计数仍存在，阶段一不是最终策略。必须通过后续契约迁移与清理闭环，不能长期维护两套判断。完整任务拆分及门禁见PLAN。
- 生产12条系统隐藏为此前11-27排查快照；本节点不恢复任何生产条目，历史处理需重新获取证据与明确授权。
- 阶段一本地验证：Telegram91项、core159项、bot刷新32项及三包类型检查通过，bot全套另按STATE核验。测试特意保留旧type_changed策略的通知覆盖，不能误读为最终健康策略；阶段二必须替换该旧路径。
- 阶段一最终本地bot全套15文件172项通过；Telegram91、core159项及三包类型检查通过。独立草稿PR #84 https://github.com/forfreek/tgbox/pull/84 ，Linux全仓CI按最新检查核验，生产未部署。

- 阶段二先交付2A契约（CONTRACT.md），再2B实现。所有当前web结果均无修改发布status权限；旧系统隐藏不因一次正常网页自动恢复。Bot功能结果与公开身份分离，来源profile/preview不被称为独立验证。
- 旧liveness消费方不仅Cron与后台列表，还包括review/dashboard/add、Bot三语、seed及DTO差异展示。必须整体切换及清理，不能只换recordLivenessResult留下旧误导标签。证据采用固定容量环且不进入静态导出，幂等/CAS/identity binding和预算是实现验收要求，不是本节点已实现能力。
- #84全仓CI 45942342071于本节点核验通过。2A文档无运行时代码变更，以源码映射审阅、迁移/验收依赖核对及git diff --check验证；生产能力仍未改变。
