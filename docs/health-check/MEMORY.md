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
- 2A独立草稿PR #85 https://github.com/forfreek/tgbox/pull/85 ，依赖#84；2A只交付契约，2B代码/迁移/UI均未实施。恢复先读本工作树STATE及CONTRACT。

- 2B1落地DATA.md：两张私有健康表及0027增量migration，不把旧active回填为验证成功；SQL条件UPSERT+D1 batch保证状态与环形证据事务一致，按2 SQL保守预算计账；来源控制复用site_state CAS，不加Cron。
- 本地规模2093资源、100条页实际读300行，需报告测量而非把LIMIT当有界证据。身份变化保持人工复核、独立功能验证清除，确认带revision与时间栅栏，不伪造成功网页。无稳定Telegram ID仍不能证明同名主体未更换，不自动恢复历史隐藏。
- 2B1没有修改任何运行入口/UI；下一2B2必须统一鉴权/审计/DTO/三语与tick预算并停用旧路径，阶段二未完成。生产迁移/部署/恢复未执行。
- 2B1本地shared205/db96项、专项22项及Node旧库迁移1项通过，scripts类型与全仓10个typecheck任务通过（Astro314文件0诊断）。本地全仓check受既有CRLF格式诊断阻断，变更11个TS文件Biome通过，不将Linux CI或生产验收推定为通过。
- 2B1独立草稿PR #86 https://github.com/forfreek/tgbox/pull/86 ，依赖#85/#84；代码14635f0。恢复至本工作树STATE/DATA，后续2B2使用已验证API接入可信服务端，不能仅部署此基础库就声称误隐藏修复生效。

## 2B2接入决策与证据（2026-11-27）

- 恢复入口tgbox-health-integration，INTEGRATION.md记录策略/预算/验证。来源退避跨Cron与交互共享；头像不写健康；所有生产recordLivenessResult调用清零，旧定义仅留至阶段四删列清理。
- 手动功能记录使用服务端actor/时间/UUID和revision；健康、证据、审计同事务，重放或冲突无审计，审计失败回滚。身份确认只允许待复核，清为未检查，不恢复发布。
- D1 batch结果使用列名映射：同时选择entry_stats和entry_health全表会重复entry_id，造成后续列错位。Admin健康选择采用唯一health_*别名，回归同时断言成员、健康、缺行、binding及筛选。
- 正常网页不能解除identity_review；完整资料更新取数据库实际接受的publicState，阻止迟到/复核中元数据替换。Bot三语展示功能实际操作/范围/时间；不把可识别身份当成可用性。
- 验证全量与专项数字见STATE，源码入口见INTEGRATION；本地模拟浏览器已验证保存/冲突/未认证401和隐藏状态不变。生产观察、历史误隐藏处理和旧字段最终清理仍未完成。

2026-11-27 2B2运行/后台已交付草稿PR #87 https://github.com/forfreek/tgbox/pull/87 ，base=codex/health-check-data（#86），代码ece8088。恢复 C:/Users/123/tgbox-health-integration/docs/health-check/STATE.md、INTEGRATION.md。#86 CI45944985860通过；#87 CI按最新检查核验。生产未迁移/部署，未恢复历史条目；本工作树此前节点边界保留。

2026-11-27 PR #87 CI45949457611：lint/typecheck通过，测试发现繁体生成词典不同步（简体源格式化后未重生成，且localeCompare受宿主ICU默认排序影响）。已修正为固定码点顺序、规范生成换行，按最终简体源重新生成；同步测试只忽略checkout换行，新增禁止宿主localeCompare及CRLF/LF等价回归。Hant本地6项与类型检查通过；最新完整CI待核验。
