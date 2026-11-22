# 步骤四提示词与模型验证

2026-11-22。本次交付为步骤 4A 本地代码准备，步骤四整体尚未验收。真实推理未执行，未选择默认模型，未接通生产队列。恢复先读 [STATE](STATE.md)，任务基础见 [TASKS](TASKS.md)。

## 实际文件与边界

| 文件 | 用途 |
| --- | --- |
| apps/ai-summary/src/prompts.ts | 三种资源专用系统提示词，summary-prompt-v1 / summary-params-v1 |
| apps/ai-summary/src/models.ts | 三个候选的请求构造、响应解码与实验性 Workers AI binding 适配器 |
| apps/ai-summary/src/evaluation.ts | 固定样本校验、请求计划、SHA-256 计划指纹、离线结果复算 |
| apps/ai-summary/evaluate.ts | 仅本地文件输入输出的 plan / replay 命令，无网络、凭据读取或 D1 写入 |
| apps/ai-summary/evaluation/corpus-v1.json | 37 条可机读样本，来源、分组、预期及人工审阅说明 |
| apps/ai-summary/test/models.test.ts | 模拟协议和评测边界测试 |

`src/index.ts` 仅更新注释，继续不传模型函数，Worker 不执行推理。适配器只能显式调用，版本不匹配在调用 binding 前拒绝。后续接线必须把领取任务使用的实际配置版本传入工厂，并保持现有任务的配置/租约/来源保护；不能把数据库占位版本 v1 当作已实现的提示词版本。

本次不修改迁移、数据库默认配置、后台、Web、静态导出、URL 或部署工作流。合并进 main 仍可能由既有 workflow 触发 Web 自动部署，独立 PR 不等于立即合并。当前按用户讨论结果保留依赖 PR，合并前再次核对部署范围及远端构建输入。

## 提示词与防护

系统规则和用户 JSON 分开传递，所有资料字段包括标题、分类、标签均作为不可信数据。事实只能来自 evidence，名称及分类不能填补用途。提示词要求忽略来源内的角色标记、改规则和充值推荐指令，禁止执行工具或外部检索。

频道只概括实际资料；仅帖子支持时必须说明是可见公开内容的样本。群组只描述 profile 明示主题，不能声称活跃或答疑速度。机器人以“公开说明称”限定功能，不能把未实测能力当成验证结论。三类型均禁止无证据的收费、权限、安全、效果与更新频率。

输出沿用 shared 的 ok / insufficient 联合 schema，最多两条，每条简中、英文和共同引用。繁体继续留给步骤六现有 OpenCC，不额外推理。证据不足、宣传套话、无法可靠理解的语言和冲突允许 insufficient。结构校验不能证明语义真实性、双语等价或简繁准确，人工复核仍是发布门槛。

提示注入的语义隔离无法仅靠 JSON 编码保证。本次没有宣称自动识别冲突或完全抵御注入。可信 reviewIssue 继续在预检阻止推理；未标记冲突的模型弃答和最终待审处理仍需真实评测及后续审核节点验证。

## 候选协议与官方证据

2026-11-22 查阅模型页面及本项目 Wrangler 生成的 Ai 类型。当前均为实验候选，尚非经过质量验收的后台可选模型。

| 候选 | 本地构造参数 | 解码协议 | 每百万输入 / 输出 token 美元 |
| --- | --- | --- | --- |
| @cf/google/gemma-4-26b-a4b-it | messages, temperature=0, stream=false, max_completion_tokens=1024 | 单个 choices，finish_reason=stop，message.content 为 JSON 文本 | 0.10 / 0.30 |
| @cf/zai-org/glm-4.7-flash | 同上 | 同上 | 0.0605 / 0.40 |
| @cf/meta/llama-3.3-70b-instruct-fp8-fast | messages, temperature=0, stream=false, max_tokens=1024, response_format=json_schema | response 对象或完整 JSON 文本 | 0.293 / 2.253 |

Gemma/GLM 模型页列出 response_format，但 JSON Mode 页面支持清单没有列出这两个型号，因此先使用普通 JSON 文本模式，真实探测后才能调整协议和 paramsVersion。Llama 的 provider schema 仅给简单形状约束，仍由 shared 执行精确联合、引用、数字、脚本和长度校验。

调用以 binding 的 signal 设置 60 秒超时，每次只调用一次。超时不代表供应商未计费。无适配器内部重试、JSON 修补、Markdown fence 剥离或模型降级。截断聊天结果、多个 completion、工具调用、额外输出字段及无效引用全部拒绝。Llama 的现有 response 协议未提供可依赖的 finish_reason，本地只校验完整 JSON 和内容契约。

官方来源为 [Gemma](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)、[GLM](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)、[Llama](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)、[JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)。价格是日期快照，不是账户实付结果。

## 样本与复现

本次 37 条中 6 条是原固定提交的历史资料，快照实际 generatedAt 为 2026-11-14T17:41:28.739Z；31 条明确标记为构造。原 25 条为 development，新增 12 条为 holdout，每类四条，含日/俄/阿语、角色注入、宣传空话和未标记矛盾。它们是人工编写的压力样本，不能推算全站效果，也未达到正式分层 120 条、每类 40 的验收样本规模。

37 条经过预检后 21 条可推理，三个候选共 63 个首轮请求，其余跳过、待审和读源失败不进模型。R-telegramtips 机械预检 eligible，人工目标 insufficient，刻意用于暴露语义缺口。G6 短简介的状态匹配仅供提示，允许人工结合有效信息判断合理弃答。

从 apps/ai-summary 运行，先自行创建 `.data/evaluation` 目录：

```text
node evaluate.ts plan evaluation/corpus-v1.json .data/evaluation/plan.json
node evaluate.ts replay evaluation/corpus-v1.json .data/evaluation/report.json .data/evaluation/results.json
```

命令只读本地资料并创建输出文件，已有文件拒绝覆盖。计划指纹覆盖原始样本、人工预期、模型集合、版本、过滤后证据和完整请求。变更后必须重新生成计划，禁止把旧响应混入新计划。`.data/` 已在 gitignore 中，计划含审阅源资料，实际模型请求只含过滤后的 input；不要把生产资料或原始模型响应公开提交。

结果文件形式如下。response 是对应 binding 的原始响应，不是 shared 输出；使用 REST 采样时先保留原始外层证据，再将成功响应的 result 字段放在这里。

```json
{
  "planHash": "与计划相同的64位小写十六进制",
  "provenance": "live",
  "rows": [
    { "caseId": "B1", "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast", "elapsedMs": 100, "response": { "response": "完整JSON文本" } }
  ]
}
```

provenance 是采样者声明，不是系统对真实调用的证明。mock 必须标为 mock，不能改标 live 充当验证。每个 case/model 只允许一个首轮结果；失败可用错误响应占位并保留外部请求证据。重试另存采样记录，不能用重试成功覆盖首轮失败。

复算报告分模型、development/holdout 记录首轮有效率、状态匹配数，记录完成数、缺失项及 p50/p95 延迟。有效率同时包含 envelope、JSON、schema 和引用检查，不是单纯 JSON 解析率，更不是事实正确率。缺失结果仍计入计划分母；没有请求时显示 null。已知 usage 的价格估算单列，缺失或无效响应的费用不按零计算，costComplete=false；计费以账户记录为准。工具始终返回 qualityAccepted=false，必须人工审阅。

## 步骤四剩余验收与费用

1. 在明确允许真实推理的范围内，先各做一个协议探测，再串行运行冻结的首轮请求，总数最多 63，探测复用其中样本，不额外重复。错误不自动重试。记录调用证据、用量及可计费的推理 token，无法核实的用量标未知。
2. 按每条、每句核查来源蕴含、双语一致、无隐藏资料泄漏、无注入指令执行；对每个结果记录 reviewer、planHash、caseId、model、结论和修改理由。繁体在现有转换链路接入后补实测，当前不能记为已通过三语验收。
3. 建立约 120 条分层代表性资料集，每类 40，补长简介、真实混排及品牌样本。来源必须固定并标注时间；调试集调整后更新版本，保留未用于调参的评分集。mock/构造样本不能冒充当前真实资料。
4. 按 DELIVERY 的首轮有效率 ≥98%、有效资料至少 80% 带来可核验信息增量、拟发布样本严重事实错误和隐藏泄漏为零审阅。小样本通过只能说明协议可用，不能免除正式评分；某模型未达标则保留现有摘要。
5. 结合真实 token/延迟/错误与现有账户分类翻译用量选择默认模型和日配额，然后单独完成队列接线及版本/预算联测。当前不更改默认 disabled，不自动启动历史回填。

63 次试跑若平均输入 1,500、输出 1,024 token，三模型合计约 $0.078，未扣免费额度。输入长度与隐藏推理用量可能改变费用，该数不是硬上限；可提议 $0.50 审批预算并逐次核对保守预留，缺少可确认余量时停止。现有 D1 reservation 仍是估算，未据实测配置，不作为本次外部试跑账本。正式 120 条比较和账户免费额度另行核算。

尚未执行真实推理、付费请求、生产迁移、资源创建或部署。回退本步仅需不接通实验适配器或撤回此 PR；已有模板和 Worker 默认暂停逻辑不变。
