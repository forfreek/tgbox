# 六B：批准摘要的数据接入

2026-11-23，Asia/Shanghai。工作树C:/Users/123/tgbox-ai-summary-data，codex/ai-summary-data，基于六A的2ceeb34。当前只接入数据，不修改详情模板或繁体处理；Gemma/v7/v3不变，无真实推理或生产操作。

## 公开投影与事务

[schema](../../packages/db/src/schema.ts)新增ai_summary_public，只有entry_id、zh、hant、en、fingerprint、contract_version六列，不含actor、原始证据、提示词、任务日志、历史稿。生成迁移[0025](../../packages/db/migrations/0025_tough_black_crow.sql)及Drizzle snapshot/journal；只在自动化测试的本地D1/SQLite中应用，没有运行生产迁移，也不自动发布已有历史人工稿。

[changeSummaryReview](../../packages/db/src/ai-summary-admin.ts)在原审批D1 batch事务内写入投影；编辑或撤回时删除。投影的正文、指纹或契约版本确有变化才写dirty_since，重复批准及抽检不重复标脏，也不重复更新相同公开行。投影失败会回滚批准状态和来源版本。CAS失败不能更新投影或标脏。保留原私有人工稿及审计快照，不覆盖Telegram资料。

这里接入既有dirty标记，由已有调度后续处理，没有新增GitHub dispatch调用；当前分支未合并，因此没有改变生产dirty状态。锁定不等于来源永远有效，构建仍按当前公开资料复核。

## 导出与快照

[build-site.ts](../../scripts/build-site.ts)不把任何私有AI表加入主SNAPSHOT_TABLES。只有显式白名单启用时，另行导出ai_summary_public；[optionalSummaryExport](../../scripts/lib/summary-export.ts)清除旧临时文件，失败/缺表丢弃部分文件并降级，正常主表导出失败仍按既有流程报错。

可选SQL经`--summary-db`传给[snapshot CLI](../../packages/snapshot/src/cli.ts)，在独立内存SQLite中读取，不拼接到主SQL；解析失败只关闭AI消费。独立DB不要求私有审核/任务表，也不要求再次导出entries；孤立投影ID在主库找不到批准资源时跳过。默认本地SQLite快照可从主文件读取同一公开表。

构建参数AI_SUMMARY_ENTRY_IDS为逗号分隔的正整数ID，最多20项；不存在、空白、非法值或`*`均关闭，不隐式解释为全站。它控制快照消费，独立于后台推理enabled和auto_scan；六C还需接正文展示与发布流程参数。本节点不修改生产Actions变量，也不扩大灰度。

[readPublicSummaries](../../packages/snapshot/src/ai-summary.ts)逐ID校验三语非空与长度、契约版本和来源指纹。来源使用与worker相同的summaryEntryQuery、AiSummarySourceInput、prepareAiSummary及aiSummaryFingerprint；重建原简介、标题、类别标签和当前过滤后的帖子证据，不对详情预览另造简化哈希。统计人数/浏览量不影响；简介、可见帖子、类别、隐藏规则等影响有效证据时会失效。原始来源读取/解析错误不能当作“没有帖子”而继续展示。

只对白名单频道缓存本次构建已读取的帖子Promise，不再读一次R2；人数历史和未选资源不新增缓存。复核后释放该缓存。指纹、审核/任务信息不进入SiteData，只有校验通过的`aiSummary: {zh,hant,en}`；未启用或坏行逐条为null。EntryView字段为可选，兼容旧快照。构建没有导入model adapter，没有AI binding或推理调用。

## 本地验证及边界

- Worker81/81（新增投影生命周期/标脏幂等、事务失败回滚）；使用本地D1/R2和mock模型，不是真实模型调用。
- 新增快照测试14项：默认关闭/白名单、只发布文本、统计不失效、资料变化/隐藏/blocklist失效、缺表/坏行/错误版本、读取/解析失败、独立SQL损坏/孤立ID，以及主库完全没有私有AI表仍能读取公开投影。
- 可选导出1项Node测试通过，验证失败清除部分文件、不会消费旧文件及成功读取；脚本tsc通过。
- 全仓10项typecheck通过（Web311文件0错误/警告/提示）；Worker dry-run打包通过1056.35KiB / gzip182.94KiB，没有部署。
- 首次新测试漏填hidden_posts.created_at，修正测试夹具后通过。Windows默认并行快照运行中，既有支付方式测试触发5000ms超时；保留失败，不改原测试。串行、显式15000ms本地IO预算复跑全套50项通过，之后新增独立SQL测试定向14项通过；最终默认设置全套52项由Linux CI核验。不能把串行复跑冒称默认本地测试通过。

可选AI错误不阻断正常快照，但常规媒体/主数据库原有错误处理未改，主构建故障不会被掩盖。R2输入在整个读取期间也可能变化，本节点验证的是本次构建读取的来源；无法保证生成文件发布时外部Telegram绝无变化。已部署静态HTML的撤回仍需重建发布。

六C尚未实施：正文显示、人工繁中保护、三语HTML/metadata、URL/canonical/hreflang和Pagefind前后核验。这里仅传递数据，不宣称页面已显示AI，也不宣称SEO已改善。缺表、null及空白名单继续支持旧展示。回退本分支或清空白名单停止消费，不删除人工稿；代码回退不会自动撤销已设置的dirty标记或已部署文件。
