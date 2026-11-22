# 步骤三数据与异步任务

2026-11-22 交付。当前工作树 C:/Users/123/tgbox-ai-summary-jobs，分支 codex/ai-summary-jobs。依赖步骤二 PR #61，基线为该分支 de44705，交付采用堆叠 PR。恢复先读本工作树 INDEX、STATE，再按问题读取本文件。

## 本地迁移与数据

新增 packages/db/migrations/0022_ai_summary_jobs.sql，配套 schema.ts、Drizzle snapshot 和 journal。实际迁移在本地 Workers 测试中执行，生产尚未应用。六张表为 ai_summary_settings、ai_summary_sources、ai_summary_jobs、ai_summary_attempts、ai_summary_revisions、ai_summary_runs。设置默认 disabled，模型默认 disabled，日调用上限 100、预留 Neurons 上限 10,000、每次预留 100、最多三次尝试。

attempts 是原子预算预留账本，getSummaryUsage 按 UTC 日聚合调用数和预留量，替代设计中的独立 daily_usage 汇总表，避免重复状态。未知调用结果不退款。硬删除条目会级联删除摘要来源、任务和修订，但保留预算账本。账本通过任务 ID 关联，刻意不加级联外键，防止删除后释放当日额度。计量为保守预留，实际 Neurons 计费校准在步骤四完成。

公开摘要表和展示配置在后台批准及静态接入节点实施。本步修订只存 pending 候选，未修改原始 Telegram 字段、现有译文、公开导出白名单和网页展示。

## 来源发现与游标

apps/ai-summary/src/sources.ts 读取 D1 的 approved 资源及现有 R2 posts 对象，不重新抓 Telegram。复用 shared 的输入规范化和帖子过滤。缺失对象为 unavailable，R2 读取异常及格式错误为可重试原因，简介超限也记来源解析问题。R2 对象上限 2 MB，帖子最多 200 条，之后按步骤二抽样。

当前轮巡每条频道读取一次 R2 对象，尚未实现 HEAD/正文缓存。先用保守的小批次验证正确性，生产容量评估时按实际轮巡量测量读取成本。本步不对缓存和时效作额外承诺。

来源观察令牌在外部 I/O 前读取，提交以旧令牌 CAS。提交还在同一 D1 事务核对当前内容和模型配置。来源代次按输入指纹或预检决策变化递增，模型与提示词/参数变体分别去重。资料恢复为同一旧内容时仍使用新来源代次，过期租约不能复活。相同当前来源重复扫描不重复推理，完整成功结果跨代缓存可后续按实际需要评估。

newest 游标初次建立在当前最大 ID，之后以单独优先级发现新增。rolling 从旧资源开始有界轮巡，覆盖历史、更新及恢复上架。每个游标每次最多两条，派发最多两条。回填 run 由 createSummaryRun 显式建立，固定启动时的 ID 上界，按主键分页。run 可通过持久 status 暂停恢复，20 分钟租约到期后接管，旧持有者不能推进新游标。run completed 表示本次 ID 范围扫描结束，生成结果仍以 jobs 状态为准。

单条异常记录 entryId 日志后继续，后续 rolling 会重新检查。语法合法但不能构造输入的记录不会被自动编写摘要，诊断及人工处理在后台节点细化。日常滚动检测延迟由条目量和每批大小决定，新增独立游标避免被完整历史扫描拖住。

## 发件箱、队列及消费者

packages/db/src/ai-summary.ts 提供任务和租约操作。jobs 同时作持久发件箱，先将待派发任务标为 queued 并保存派发时间，再发送消息。消息采用 v、jobId、entryId、generation、inputHash，并增加 dispatchedAt，以拦截较旧派发的重投或 DLQ。发送失败或消息在 broker 到期时，五分钟派发租约后从 D1 补发。

状态包括 pending、queued、running、retry_wait、succeeded、skipped、blocked、superseded、failed。blocked 保存来源待审问题，候选审核状态另存 revisions.review_status。领取模型任务与预算预留在一个 D1 batch 事务中完成，日限、预留预算、当前模型策略、来源代次、锁定、编辑版本及尝试次数共同限制领取。重复投递只有一个消费者取得尝试令牌。

源读取失败按派发身份有界记尝试，不消费模型配额。模型失败使用指数退避及抖动，单次最多三次尝试；租约超时记录未知结果，保留预算，有限重试。达到上限标 failed。手工重新发起失败任务和其审计界面在步骤五实现，不能直接把 attempts 清零，否则会破坏预算记录的尝试序号唯一性。

推理前后重新观察来源。结果提交再次在 D1 事务内核对现时资料、可见性、模型策略、租约、来源代次和编辑版本。锁定、撤下或新资料使旧结果作废。暂停期间完成的结果不提交，原任务可在恢复后有限重试。R2 与 D1 仍存在跨存储时间窗口，后续批准及静态构建必须复核实际证据，不能只相信本步候选状态。

Worker 的 queue 对每条消息单独 ack/retry。坏格式消息记录有限日志后确认，基础设施失败重投，耗尽进入 tgbox-ai-summary-dlq，再以派发身份标 failed。D1 发件箱仍是恢复依据。[Cloudflare 重试语义](https://developers.cloudflare.com/queues/configuration/batching-retries/)

## 运行与授权边界

apps/ai-summary/wrangler.jsonc 配置现有 DB、MEDIA、AI 绑定，以及拟议主队列与 DLQ，队列并发设为 1，batch 为 2。新 Worker 无公开业务接口，fetch 返回 404。scheduled 和 queue 均 await 工作。通过 Wrangler 技能执行本地类型生成和 dry-run 打包，未创建远端资源。[D1 批处理原子性](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

真实模型适配器属于步骤四。本步默认 queue 不传模型回调，任务延后且不预留推理费用，运行时测试注入模拟模型验证完整候选生成路径。未执行生产 migration、远端资源创建或部署。

## 验收入口

test/tasks.test.ts 在真实本地 D1 迁移与 R2 环境中覆盖去重、并发调用及预算限制、发件箱丢失恢复、派发身份、来源错误与空资料区别、租约恢复、资料变更、暂停锁定、配置竞态、旧结果拦截、回填游标和 handler 单条隔离。测试及 CI 的实际结果见 STATE。下一步为步骤四，等待继续指示。
