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

2026-11-27 PR #87 CI45949801379：Hant同步、lint/typecheck及其余9个包测试通过，Web Mini App测试4项因DB mock缺readHealthSources失败。已补齐mock并发现/修正Mini App preview直接采集漏接共享退避；新增真实采集函数下preview+submit冷却期零网络/零收录回归，API63项通过。Mini App未确认文案改为本次未确认，seed离线CLI仍仅作正向导入校验，不写新健康或发布决策。

## 阶段三只读复核决策（2026-11-27）

- 恢复tgbox-health-history的STATE/HISTORY.md；依赖#87（9f41632，CI45950431638已核验通过）。生产新健康表/0027尚未上线，不把代码已交付当成线上已生效。
- 当前15候选=12系统隐藏+3上线异常；5当前channel可识别、1原bot现channel、9占位。正向主页不能证明原主体连续性，四个bot功能未验证；不自动恢复。二次快照15条逐字段相同，生产查询meta均0写入。
- 直连超时为本机未沿代理的采集故障；首轮立即退避，不将延后项称检查失败。等待到期沿系统既有代理继续，上一报告sources传入并保留Retry-After，不修改代理或D1控制。
- scripts/health-history.ts只读工具和8项回归验证绑定/人工保护/限量/指纹/规范JSON摘要/退避/类型差异/逐条证据复算；报告与SQL入口见HISTORY。未创建未授权的恢复执行器，修复事务/审计/dirty/并发演练仍为后续门禁。

2026-11-27 阶段三只读复核草稿PR #88 https://github.com/forfreek/tgbox/pull/88 ，base=codex/health-check-integration（#87），代码aa574b7。最新恢复 C:/Users/123/tgbox-health-history/docs/health-check/STATE.md、HISTORY.md。15条候选中5当前公开身份可识别、1类型异常、9无法确认；未迁移/部署/恢复，旧工作树历史边界保留。

2026-11-27 PR #88首轮CI45953535909在未改动snapshot的build-site-data.test.ts第362行触发5000ms超时，格式/类型检查通过。该文件随后本地单worker完整复跑28项通过（53.63s）；没有改业务代码或放宽测试超时。Node新增专项8项+迁移1项、scripts类型与变更Biome通过；最终提交CI重新核验。

## 生产发布保护（2026-11-27）

- 依据本轮明确生产授权合并#84–#88，先0027再Bot/Admin/Web一致发布；不从旧liveness回填。来源main与交付tree核对相同，版本与CI见RELEASE.md。
- keep-vars不会保护配置中同名变量的旧值，Admin上线前须将线上plain_text完整写入忽略的build配置再keep-vars；本次保留既有Access与不同R2 URL，三服务bindings读回一致。AI配额以发布前真实100 calls/6000 reservation预算/100单次/1 attempt为准，enabled/auto_scan均0，全部保持。
- 后台匿名302是既有Cloudflare Access保护，随跳转的200是登录页，不能称后台界面或middleware验收；生产人工记录未执行。头像真实tick14子请求且不写health，常规证据验收后追加。

2026-11-27 发布验收补充：17:50 missing_avatar真实tick成功（14子请求、健康0写入），17:55 regular真实tick成功（41<=45子请求，3条新健康/证据，3条预算延期，nextId=131、avatarNextId=1935、无隐藏/恢复、无异常）。D1新证据为health-v1/tme-profile-v2/HTTP200；最终AI/settings及12条历史状态保持。main CI45976512365和最终Web部署45976512454均成功。完整目录巡检和生产人工验证/历史修复/旧字段清理仍未完成，不能标专题关闭。
