# 提示词、模型与离线评测

最新版本为 summary-prompt-v5 / summary-params-v3，分档字数、自然表达与合计硬上限见 [STYLE](STYLE.md)。以下模型选型及 v2 复现保留为历史记录，当前不能再用旧计划哈希重建 v2 请求。

2026-11-22 用户确认 Workers 付费账户，要求只用 10–20 条样本确认模型和提示词。步骤四已完成小批选择，实际结果和失败证据先读 [PILOT](PILOT.md)，本文件只保留接口与复现说明。旧 120 条正式评分和 63 次首轮调用提案已被用户最新要求替代，不是后续门槛。

## 当前实现

| 文件 | 用途 |
| --- | --- |
| apps/ai-summary/src/prompts.ts | 三类型提示词 summary-prompt-v2，参数版本 summary-params-v3 |
| apps/ai-summary/src/models.ts | Gemma 默认选择、受支持白名单、实验候选、请求构造和严格解码 |
| apps/ai-summary/src/evaluation.ts | 固定样本、最多 20 条选择清单、计划指纹及离线复算 |
| apps/ai-summary/evaluate.ts | plan / replay，可用 --selection 固定子集；不读凭据、不调用网络或 D1 |
| apps/ai-summary/evaluation/corpus-v1.json | 37 条历史/构造本地回归库，不代表全部执行真实推理 |
| apps/ai-summary/evaluation/pilot-v2.json | 本轮 12 条来源选择，最终默认模型 |
| apps/ai-summary/evaluation/live-pilot-2026-11-22.json | 真实失败、最终响应、用量、源文核对和繁体预览 |

DEFAULT_SUMMARY_MODEL 和 SUPPORTED_SUMMARY_MODELS 仅指定 Gemma 4 26B A4B。Gemma 使用 temperature=0、max_completion_tokens=1024、enable_thinking=false 和 response_format=json_schema；本次 10 条真实输出确认该模式可用。GLM 保持普通 JSON 文本实验协议，Llama 的旧 response / JSON Mode 适配保留但本轮未运行，二者都未进入受支持名单。

src/index.ts 继续不传模型函数，Worker 不调用此 adapter，D1 默认配置仍 disabled。后台节点再统一接通模型选择、版本、预算和队列；接线前必须给 SummaryModel 调用契约携带任务的 promptVersion/paramsVersion，领取前检查白名单，调用时重新校验版本，不能以旧工厂闭包执行新版本任务。数据库占位 v1 不是已实现的提示词版本。

## 提示词和校验

所有来源字段均视为不可信数据，只使用 evidence 的文本证明事实，名称、分类、标签不能补出功能。profile 与 post 明确区分，平台宣传语不能推断频道用途。频道仅帖子支持时限定为可见样本；群组只描述公开主题，不声称活跃和答疑效果；机器人必须限定为公开说明，不能把未实测功能当成测试结论。

最多两句简中与英文，共享逐句证据；资料不足、来源矛盾或不能可靠理解时返回 insufficient。繁体复用现有 @tgbox/hant，不额外推理。本轮实际转换的八句文本见 PILOT 和机器证据，HTML/metadata 接入仍留到静态节点。

适配器保留单次调用、60 秒 binding abort、精确版本守卫。没有内部重试、换模型降级、围栏剥离或 JSON 修补。聊天截断、多个 completion、工具调用、无效引用和数字约束均拒绝。超时不代表未计费。Llama 现有 response 协议无法依赖 finish_reason，仍按完整 JSON 与 shared 契约校验。

结构校验不能证明事实蕴含，真实 GLM 错误用途回答通过了结构校验，已作为回归证据保留。JSON 分离和 schema 也不能保证完全抵御提示注入。本步选定配置用于后续受控草稿生成，未自动批准任何公开内容。

## 离线复算

原 37 条库包含 6 条历史、31 条构造；历史快照实际 generatedAt 为 2026-11-14T17:41:28.739Z，不代表当前生产。试跑选择了其中 12 条，2 条历史、10 条构造；10 条模型输入和 2 条预检跳过。修订后模型结果没有覆盖修订前失败，最终精确版本及计划哈希见 PILOT。

在 apps/ai-summary 先建立 .data/replay 目录，运行：

```text
node evaluate.ts plan evaluation/corpus-v1.json .data/replay/plan.json --selection evaluation/pilot-v2.json
node evaluate.ts replay evaluation/corpus-v1.json .data/replay/report.json results.json --selection evaluation/pilot-v2.json
```

results.json 使用公开机器证据中的 final.results 对象，包含 planHash、provenance=live 和原始响应内容投影。若不加 selection，命令仅生成整个回归库的离线计划，不会执行推理。输出文件已存在时拒绝覆盖。

计划指纹覆盖样本、人工预期、模型、版本及完整请求，旧版本响应不能混入。case ID 或模型重复、子集超出 20 条、未知 ID、源库版本不匹配均拒绝。缺失结果计入计划分母，按模型及 development/holdout 分开统计，有效数同时反映协议、schema 和引用检查，不等于事实正确率。

成本只按可用 usage 估算，未知请求不记为零。costComplete 仅代表该报告范围的 usage 是否齐全，不是账单完整性；本轮整体因两次送达未知为 false。报告始终 qualityAccepted=false，源码核对和后续人工批准单独记录，不能改标 mock 为 live 充当验证。

## 回退与参考

撤回本节点或不接通 adapter 即可保持原有逻辑。当前不修改迁移、部署、原始资料、URL、静态导出及 D1 默认配置。按已有 workflow，合并到 main 仍可能触发 Web 构建部署，本轮未合并。

官方来源为 [Gemma 思考模式](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)、[Gemma 模型](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)、[GLM 模型](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)、[Llama 模型](https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/)、[JSON Mode](https://developers.cloudflare.com/workers-ai/features/json-mode/)。本步不再根据 JSON Mode 列表缺少 Gemma 而否认已经实测的结构化协议。
