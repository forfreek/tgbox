# 全局自动生成与配额口径纠正（2026-11-23）

用户明确取消50条生成限制，要求全局自动处理，禁止修改其配额。当前工作树C:/Users/123/tgbox-ai-summary-global / codex/ai-summary-global，基于main 26def0b。观察窗口沿用11-25晚，不扩大为自动批准发布。

## 配额纠正及不可改规则

维护此前确曾在第二批开始时将daily_neurons从8000改为10100，为批次补预留空间；这是不应自行调整用户限制的行为。现将“批次/全局授权不等于配额授权”写入AGENTS.md，以后不提高、恢复或覆盖用户限额。用户提到10000→100100，目前维护记录只证实8000→10100，不能把未核实的数字当事实，也不能据此猜测恢复值。

95×100=9500来自ai_summary_attempts.neurons的内部固定reservation累计，不是Workers AI真实神经元消耗。模型适配器当前返回decoded.output，未把供应商usage逐任务落库，无法仅凭此表给出95次任务的真实Neurons。此前将9500简称为神经元用量不准确，应称累计预留台账；UI原已有“预留预算不是实际账单”的说明，本次不改计费或扣额算法。

本轮只读快照为enabled/auto_scan=1、Gemma/v8/params-v3、daily_calls=200、daily_neurons=800、reservation=100、max_attempts=1。800是当前实际读回值，不擅自改成用户提到的10000或其他值。部署前后完整配置需逐字段比对；本节点不执行设置表UPDATE，也不为全局任务补额度。

## 全局范围实现

`apps/ai-summary/src/scope.ts`提供显式AI_SUMMARY_SCOPE=all，返回无ID过滤的生成范围；selected沿用最多50条解析，空/非法/未知模式仍关闭。默认selected，生产按本次明确授权部署all。旧名单变量在all模式不生效，生产清空；不再以50条限制扫描、outbox派发、消费或observe消息。

`index.ts`三个入口统一使用该范围；`tasks.ts:consumeSummaryObservation`允许显式全局。复用原newest/rolling游标、来源及指纹校验、锁定/人工编辑防覆盖、队列并发、日配额及失败机制；没有为完成全站任务增大批次、并发、上限或改模型/提示词。

全局是所有符合条件的收录资源均有机会进入分批扫描，不是立即同时推理全部资源。newest负责后续新增，rolling每轮读取最多2条；existing runs持久游标续跑，受原配额调度。资料不足仍自动跳过，已锁定不覆盖，未经批准不进入公开投影。静态网站原消费/展示规则不在本次更改，生成范围不再限50不等于代批准全站显示。

## 验证与部署

Worker89/89测试通过：新增显式all/selected/非法模式、真实入口全局发现名单外资源且配置不变、全局观察/消费仍受预算阻止且不加额度；既有50条、并发配额及UTC恢复测试继续通过。Worker类型检查及dry-run随交付复核，不新增真实模型样本。

修改文件：Worker的scope/index/tasks/wrangler及生成类型；scope测试和tasks测试；AGENTS及本专题索引、计划、状态、记忆。本轮不改数据库结构、配额值、原Telegram资料或人工稿。生产开关、配置对比及首轮全局游标结果待部署后追加；独立PR/CI核验后执行已获授权的全局部署。

回退仅将Worker的AI_SUMMARY_SCOPE改回selected并设原ID列表，或按用户授权暂停enabled。不得为回退覆盖用户当前配额，不删除任务历史或人工编辑。
