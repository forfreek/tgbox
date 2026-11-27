# 阶段二契约：资源健康证据与发布决策

日期：2026-11-27，Asia/Shanghai。状态：2A设计交付，尚无schema/runtime/UI变更；阶段二整体未完成。依赖阶段一PR #84，实施及验收入口见PLAN。

## 1. 不变量与决策边界

1. 公开账号可识别、网页预览可用、机器人功能已验证、网站是否展示是四个不同问题。
2. 当前web抓取来源的自动隐藏/自动恢复充分证据清单为空。所有网络错误、占位、解析变化、类型差异只产生证据/复核任务，不能修改entries.status。新增充分证据来源必须单独审查政策和测试。
3. 不自动恢复此前系统隐藏；阶段三逐项复核。人工隐藏、移除及人工确认的身份/类型不被采集任务覆盖。
4. 新收录仅在身份/资源类型被正向识别时进入既有审核流程，unknown不可自动批准。现有人工审核权限不变。新收录失败文案改为“未能确认该资源”，网页信息不能生成确定封禁提示。
5. 头像通道保持阶段一写入范围，不生成健康证据、异常计数、恢复、隐藏或失效通知；regular/人工检查复用唯一策略入口。
6. 机器人网页Start Bot仅支持身份识别；没有头像/月活/简介不证明停服。功能检查必须显式人工操作并记录范围，既不自动发/start，也不引入用户账号/session或额外外部服务。

## 2. 规范化观察契约

每次采集由服务器生成：observationId、entryId（新收录可空）、targetUsername、expectedKind、source、startedAt、completedAt、parserVersion、policyVersion、outcome、reason。计时和来源不能信任客户端输入。

- source：tme_profile / tme_preview / manual_function_check / manual_identity_review。profile和preview来自同一Telegram网页服务，不宣称为两个独立来源。
- outcome：recognized / uncertain / identity_changed；人工功能结果另用responded / no_response / reported_issue，不与账号身份结论混合。
- reason枚举：profile_recognized、view_placeholder、contact_placeholder、profile_redirect、preview_unavailable、rate_limited、transport_error、http_error、parse_error、kind_mismatch、manual_observation。
- 附加精简证据：HTTP status、pageShape、detectedKind、规范化重定向的host/path、retryAfterMs；人工操作另有actor、action、scope、备注。
- 不保存完整HTML、token、cookie、私信正文或重定向查询参数；记录格式有版本，字符串和备注必须限制长度。将来需要原始样本只按明确需求保存脱敏fixture。
- bot功能备注必须说明实际操作（例如含start参数与否）、预期和实际结果、验证时间；仅“未回复”不能判账号不存在或确定停服。不得伪造用户报告/人工验证。

## 3. 状态与转换

entry_health为唯一当前健康事实：publicState=unverified / accessible / uncertain / identity_review；lastObservedAt、lastConfirmedAccessibleAt、lastReason、lastObservationId、revision、bindingUsername、bindingKind。缺行按unverified读取，绝不从旧active推导新accessible。

功能验证独立字段：functionState=unverified / responded / no_response / reported_issue、functionObservedAt、functionObservationId。非bot不展示功能验证入口。身份未绑定、已变化或仅有旧验证时不能显示当前“功能正常”。

| 观察 | publicState | lastConfirmedAccessibleAt | 发布动作 |
| --- | --- | --- | --- |
| 正向识别且kind与已确认类型一致 | accessible | 更新到该次观察时间 | 无 |
| 正常主页，预览不可用 | accessible，附预览原因 | 保留本次正向主页时间 | 无 |
| 超时/非200/429/占位/重定向/结构不识别 | uncertain | 保留历史成功时间 | 无 |
| 正向识别出不同类型 | identity_review | 保留历史成功时间 | 无 |
| 人工功能测试/用户反馈 | 不修改publicState | 不修改 | 无 |
| 管理员明确调整发布状态 | 不伪造健康证据 | 不修改 | 由既有权限/审计执行 |

uncertain展示为“本次未能确认”，同时展示历史成功时间；不能把历史成功当作当前新确认，也不能把unknown显示为失效。时间较旧由DTO计算age展示，不能靠定时改状态伪造新观察。

每次正向识别结束当前异常事件；不同原因不共用fail_count。不自动变更kind；identity_review需要人工确认目标身份后重置binding/功能验证。

## 4. 幂等、并发与持久化

- 新表entry_health：entry_id主键/FK、上述当前状态、revision、绑定及证据序号；新表entry_health_evidence：每条目固定16个循环槽，唯一(entry_id,slot)，observation_id唯一，slot由已接受的单调序号计算，形成有界证据环。最近16次是诊断样本，不称为完整历史。人工决定继续进入既有审计表，不依赖证据环保留。
- 只接受bindingUsername/bindingKind仍与实时entries一致的观察。绑定不匹配丢弃，不允许旧用户名观察更新新身份。未持久化Telegram稳定ID前，不声称已证明用户名没有被转让，禁止据用户名自动恢复旧条目。
- 用startedAt确定先后，避免慢请求后来完成覆盖较新观察。小于或等于当前同来源观察时间的结果不覆盖当前状态；重复observationId不写第二次。profile/preview作为同次检查一起归约，不能让preview覆盖profile。
- 接受当前状态与写入证据环必须在D1事务/条件批次内完成，revision CAS失败不得只写半边或发通知；保留最新有效观测，不静默以旧值重试覆盖。失败重试使用同一observationId。
- 人工功能检查与网页检查使用独立观察时间/修订保护，各自不能覆盖另一维。身份binding变化时原功能记录仅作历史，不冒充新身份验证。
- 只保存状态变化、原因变化或同原因至少间隔一小时的诊断样本；重复正常检查可更新最近成功时间，但证据环不每次轮询都写。具体SQL与row-read/write实测为2B交付门槛。
- 证据环不进行全表历史删除，避免无界日志/维护任务；按entry_id批量读当前状态，索引需覆盖state筛选、entry_id及observation_id去重。未读过的条目不预建假成功数据。

## 5. 来源故障与预算

- 429遵守Retry-After并保留延期位置，恢复前不紧密重试；超时/解析故障返回uncertain，不计资源失败次数。
- 来源健康按profile/preview分别记录，不把同批低于2条失败当作来源正常。来源异常只能降低证据可信度、退避采集，不能扩大隐藏权限。
- 2B需要实现并测试有上限的来源退避：429至少等待服务器要求的时间，连续传输/结构故障指数退避，恢复后有限探测；正常解析样本才结束对应来源退避。计数只服务来源调度，不参与资源隐藏。
- 使用现有site_state/既有Cron维护，不能自行加Cron、AI调用、批大小或用户预算。保存/读取来源状态都计入请求预算，单次guard不足时延期而非跳过证据保护。
- 复用已有批次返回的采集结果，不为“第二次验证”重复抓同一个网页。健康表/证据表不进入静态站导出allowlist，不把人工备注发布到网站或Pagefind。

## 6. 入口迁移清单（2026-11-27源码核验）

| 入口 | 当前依赖 | 2B要求 |
| --- | --- | --- |
| packages/telegram/src/liveness.ts、snapshot.ts | 单一liveness及knownKind | 输出规范化观察；解析无发布权限 |
| packages/core/src/refresh.ts | pending/recordLivenessResult、失败批次门禁、隐藏通知 | regular唯一策略写入；移除旧自动隐藏/恢复和批次隐藏门禁；avatar通道继续隔离 |
| packages/core/src/entries.ts | refreshEntryNow、手动新增 | 手动检查走同策略；新收录验证和发布审核分离，重命名banned错误提示 |
| packages/core/src/submissions.ts、review.ts、add.ts | 预览、提交、批准后再次抓取 | 复用观察契约，不能未知自动通过或用预览伪造功能验证；批准动作保持可审计 |
| packages/db/src/access.ts | recordLivenessResult、HIDE_AFTER、混合计数 | 切换新事务入口后停写旧逻辑；不能新旧双写判断并行 |
| packages/db/src/admin.ts、admin-review.ts | liveness过滤/统计/仪表板 | 一次批量关联health；缺行显示未检查，统一DTO；保留分页边界与读量测试 |
| apps/admin/src/functions/entries.ts | 返回旧状态、刷新前后审计 | 输出健康DTO、最近证据与功能验证；健康不可通过通用编辑接口伪造 |
| apps/admin/src/features/entries、review、dashboard、add | 正常/不存在/已封禁标签、筛选、编辑差异 | 使用同一标签映射；清除确定封禁措辞；区分账号可识别与功能未验证 |
| apps/bot/src/bot/submit.ts、i18n三语 | notFound/banned提示与连续失败展示 | 未能确认/待核验提示；三语同义，不把异常次数称连续失败 |
| packages/shared/src/domain.ts | Liveness枚举 | 新共享观察/DTO契约；旧枚举仅短期兼容，删除计划明确 |
| scripts/seed/seed.ts、snapshot构建/测试fixture | 导入校验/只按status导出 | seed不把未检查当健康；网站仍由发布status筛选，不让新健康表直接隐藏页面；旧fixture兼容有退出条件 |

通用编辑中的liveness当前用于DTO/差异展示，是否有可写接口需2B逐项以服务端白名单核验，不能只凭前端字段名认定可写或安全。

## 7. 迁移与回滚顺序

1. 本2A只交付契约与映射，不创建表、不改生产、不声称已有证据可回放。
2. 2B先新增schema/migration与本地迁移测试。只建立空健康状态，不从旧fail_count推算连续失效，也不把历史active回填为实时成功。
3. 2B本地集成全部入口：同一策略、后台标签、三语通知和机器人人工验证记录。先停止旧自动发布决策再接新策略；不允许旧Worker写旧隐藏、新Admin展示新健康的混合版本上线。
4. 阶段四发布窗口须先应用兼容迁移，再发布安全的bot/Admin所有旧写入方并核验旧路径停用；需短暂兼容时UI明确标旧记录未复核。缺迁移时应显式阻断健康写入且保持不隐藏，不能静默退回旧隐藏逻辑。
5. 阶段三基于新证据另行恢复误隐藏；禁止2B顺带批量恢复。
6. 阶段四删除entries.liveness/fail_count/first_fail_at/last_fail_at及旧通知、旧枚举/过滤参数、旧DTO/测试；删除前rg核对所有消费者为零，并核验SQLite删列的索引/触发器和snapshot导出兼容。
7. 回滚使用支持新schema的安全上一版或已核验的阶段一基线补齐安全发布策略，不能部署会再次自动隐藏的旧包。数据库采用先保留再清理，不在事故回滚时丢弃证据。清理迁移完成才可关闭专题。

## 8. 2B验证矩阵与完成门槛

- 解析：频道/群组/机器人正常、无月活/无头像bot、占位、非200、429、超时、重定向、结构变化、类型变化。
- 策略：所有web弱信号不改status；正向可访问不自动恢复历史隐藏；不覆盖人工隐藏/移除/类型；新提交未知不通过；功能响应不推导账号永远正常。
- 事务：重复ID、同来源同时间、迟到请求、binding变化、CAS冲突、中途失败、并发人工操作、不同维度时间隔离。
- 有界性：固定证据环、唯一去重、按页批量读、来源退避和恢复、预算耗尽保留进度；至少用与生产规模相当的数据测rows-read/write与每tick子请求，不以LIMIT替代扫描量证据。
- UI/三语：未检查、当前不确定/历史成功、类型待复核、功能未验证/有时效的操作结果，以及旧记录标签；浏览器验收不能替代代码测试。
- 迁移：旧数据库升级、缺行默认未检查、完整入口切换、兼容窗口和清理/安全回滚演练。
- 交付：2B独立堆叠PR、相关包测试/源码审查/CI；阶段二完成须同时通过模型、策略、后台呈现和迁移验收，2A文档合并不能算阶段二完成。

## 9. 阶段三与发布依赖补充

阶段三可在2B上线前完成只读清单和修复脚本的本地演练；正式生产修复须先有明确授权、完成2B兼容迁移及安全采集版本部署，再核验新证据。阶段四承担整体发布顺序、观察和最终清理验收，可以覆盖上述分批发布过程，不能将文档章节顺序解释为先修生产数据再建表。不得为赶阶段顺序绕过迁移或人工保护。
