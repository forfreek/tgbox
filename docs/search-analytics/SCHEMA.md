# 独立统计 Schema 与迁移

阶段四新增0003_publication_snapshot.sql：search_job_runs追加published（0/1，默认0）及ranking_json（JSON数组，默认[]）。发布时与权威指针同D1 batch保存内部keyword/identities/score快照，不进入公开KV；失败任务可区分是否已成功发布后清理失败。表数量仍为12；核心DB不迁移。旧命名列写入兼容新增默认列，回滚应用不执行降级SQL。

迁移目录 packages/search-analytics/migrations，从 0000 开始，不能使用核心 DB 的迁移目录或 drizzle journal。测试配置仅绑定本地 ANALYTICS_DB；生产 resource ID 需创建审批后填写。

## 表与索引

| 表 | 唯一键/索引 | 用途与留存 |
| --- | --- | --- |
| search_daily_stats | day,keyword,source,locale；keyword/day | 安全词日维度计数，90天 |
| search_daily_identities | day,keyword,identity,source,locale；keyword/day | 有限身份事实与最后eligible状态，8天 |
| search_identity_days | day,identity,source,locale | 日独立身份判定，含all汇总scope，8天 |
| search_daily_totals | day,source,locale | 90天日计数与身份日统计，不保存身份 |
| search_event_receipts | kind,event_key；expires_at | HMAC事件键/payload摘要/attempt fence；无逐次词正文；事件最多8天，挑战按token有效期 |
| search_rate_limits | scope,subject,window；expires_at | 全局/身份/IP-HMAC/签发限额原子计数，随窗口清理 |
| search_keyword_rules | pattern,match_mode | blacklist/hidden/pending/approved；不存管理员任意正则 |
| search_settings | singleton id=1 | 单调配置version、受校验JSON，关闭态默认值 |
| search_control | singleton id=1 | 审核revision、权威KV指针、fenced job lease、关闭态控制 |
| search_job_runs | run_id；started_at | 任务状态/安全原因码/计费meta，无敏感内容，90天 |
| search_admin_audit | id；created_at | 统计DB内管理审计，actor为服务端派生匿名管理员标识，安全JSON，90天 |
| search_security_daily | day,reason | 有界固定原因采样计数，标记sampled，90天 |

## 事务协议

receipt 幂等键 = HMAC(identity,eventId)，payload digest覆盖规范化keyword/trigger/reportedResult/locale/source，防同ID改payload。每次服务端尝试生成独立attempt。
首条 INSERT receipt 使用 SELECT + NOT EXISTS + 配额/规则/配置版本门禁。随后同一 D1 batch 内所有变更均以 receipt 的 attempt 匹配为前提。重复请求未获得自己的attempt，无权增量；不可用 changes() 串联并误认为可跨语句保持。
预算预检和增量在同一D1事务中；日聚合、身份、identity-days/totals、receipt同成功同失败。最终结果按receipt状态判定。需用Workers真实D1集成测试并发、batch中途错误与重复payload拒绝。

## 索引理由

day为首键支持窗口/清理范围，keyword/day仅用于分页关键词详情和跨日排行候选。不得索引所有计数字段；频繁UPDATE否则增加写放大。用EXPLAIN QUERY PLAN及D1 meta验证实际访问模式。身份表不会宣称覆盖90天唯一用户。
清理按主键或expires索引分页，每批有限行；优先清理receipt/限额/身份再清理旧日聚合。禁止在search请求全表清理。

## 发布协议

control包含rules_revision、publication_generation/key/rules_revision/config_version以及lease_token/until/fence。不可变KV先写，D1最后发布CAS。读主库版本gate，无效时空榜，不从旧缓存恢复已禁词。singleton控制结构与运营配置分离，便于频繁租约操作不修改JSON。

阶段二新增0001_rule_revision.sql，为规则INSERT/UPDATE/DELETE自动递增search_control.rules_revision。接受事务按当前配置和审核版本领取receipt，所有效果按本次attempt门禁；session/Turnstile/抽样预留也校验当前配置版本。

阶段二0002_daily_contribution_guard.sql新增partial UNIQUE(day,keyword,identity) WHERE eligible=1，在数据库层保证跨source/locale的全球日贡献唯一。维度事实PK仍保留非贡献分析行，两者约束目标不同，不是重复索引。迁移在关闭态、本地先执行；不触碰核心迁移。
