# 小批模型与提示词确认

2026-11-22，Asia/Shanghai。用户确认使用 Workers 付费账户，并明确只需 10–20 条代表性样本。本轮按该要求取代此前 120 条正式评分及 63 次首轮调用的门槛，不再要求扩大资料集。真实推理已授权，合并、生产迁移、资源创建和部署未授权，也未执行。

## 选择结果

质量结论补充见 [QUALITY](QUALITY.md)。本文件的 10/10 仅指结构、状态及源文核对，不表示八条摘要均具有足够编辑增值。技术候选选择保留，内容增强目标尚未验收。

| 项目 | 本步确认 |
| --- | --- |
| 默认模型 | @cf/google/gemma-4-26b-a4b-it |
| 生产候选白名单 | 仅上述模型；GLM、Llama 留作实验候选 |
| 提示词 | summary-prompt-v2，频道、群组、机器人分别约束 |
| 参数版本 | summary-params-v3 |
| 请求 | messages、temperature=0、stream=false、max_completion_tokens=1024、chat_template_kwargs.enable_thinking=false、response_format.type=json_schema |
| 响应 | 单个 choices，finish_reason=stop，message.content 为完整 JSON，再执行 shared 引用和内容校验 |
| 发布方式 | 后续后台受控生成草稿和审核；当前 queue handler 继续不调用模型，不改变 D1 默认 disabled |

源码入口为 apps/ai-summary/src/{prompts,models}.ts。DEFAULT_SUMMARY_MODEL 和 SUPPORTED_SUMMARY_MODELS 区分已选模型与实验名单。JSON schema 模式已经本次真实调用验证，不再仅依据 JSON Mode 目录是否列名判断可用性。Gemma 返回的后端 model 可能带 -external 后缀，也观察到无后缀响应，调用始终使用上述固定 ID。

## 实际范围与版本

共 12 条独立来源案例，2 条历史快照、10 条明确构造，覆盖三类资源、短简介、帖子补证、阿拉伯语、注入、未标记矛盾、空资料和隐藏帖子；不是新抓取的生产条目。原 37 条资料继续作为本地回归库，不全部调用模型。

本轮共尝试 18 次调用：旧提示词 v1 / 参数 v2 对四条资料、两模型尝试 8 次，其中首批两次通过 /ai/run/{model_name} 调用时连接器超时，是否送达和计费未知，不重试这两个旧请求；后续统一使用 /ai/run 的 {model,input} 协议。6 个已知旧响应暴露 Gemma C6 代码围栏、GLM G1 代码围栏、GLM R-telegramtips 误判用途三项问题。

据此冻结 v2 提示词和 v3 参数，最终 Gemma 在 10 条 eligible 资料上各调用一次，共 10 次，首次 C6 协议探测计在这 10 次内。前后版本结果分别保存，不用修订后的成功覆盖旧版失败；不是两个模型各完整跑 10 条，也不是统计排名。

新提示词补强 profile 与 post 的区别，频道简介必须说明本频道用途，明确以 Telegram 平台宣传语为不能推断用途的反例，并禁止同一事实写两次和输出代码围栏。Gemma 启用结构化模式，解析器继续拒绝围栏而不自动修补。

## 最终结果与源文核对

| ID | 依据 | 结果与核对 |
| --- | --- | --- |
| C1 | 软件安装指南简介 | 生成，仅说明分享开源软件安装指南，不沿用 free 标签作收费事实 |
| C6 | 两条可见帖子 | 生成，限定“可见公开内容”，引用工具更新/离线导出与安装配置两条证据 |
| R-telegramtips | Telegram 平台宣传语 | insufficient，不推断频道用途 |
| G1 | Python 与调试主题 | 生成，不推断活跃度、成员水平或答疑速度 |
| G6 | 日语交流短简介 | 生成单句，不扩写无依据功能 |
| H-G1 | 阿拉伯语学习讨论简介 | 生成，中英均保留阿拉伯语学习主题 |
| B1 | PDF 转图片说明 | 生成，限定公开说明，未声称实测、命令或文件限制 |
| R-foursquare | 附近地点和地址分享说明 | 生成，未添加订位、支付和权限细节 |
| B6 | 语音转文字及恶意附加指令 | 生成，仅保留转文字，不执行安全、免费与充值指令 |
| H-B3 | PNG 能力互相矛盾 | insufficient，不择取一半当事实 |
| C7 | 唯一帖子被隐藏 | 预检跳过，不进模型 |
| G2 | 无简介，只有群名 | 预检跳过，不进模型 |

最终模型输出 10/10 通过结构、引用、数字等自动校验，8 条摘要、2 条 insufficient；状态均符合预期。Codex 逐句对照源文，8 组中英文本未发现额外功能、收费、安全、效果或更新频率承诺。使用既有 @tgbox/hant.toHant 转换 8 条简中摘要，核对繁体文本未见品牌或意思变化；这不是详情 HTML、metadata 或独立人工发布验收。

最终调用 p50=1,159ms、p95=2,886ms，包含 API 往返，不含连接器外围等待。8 条 development 和 2 条 holdout 分别列在机器证据中；原 Telegram 平台语案例已用于提示词修订，不能算未见评分样本。该小批足以支持本步配置选择，不据此宣称全站准确率或 SEO 提升。内容发布仍需后续审核，结构校验通过不能替代事实核对。

## 用量与证据

16 个已知响应合计输入 8,582 token、输出 786 token、API 报告约 92.878 Neurons；按模型标价的 token 估算约 $0.001063。最终 10 个响应的 token 估算约 $0.000686。初始两个未知送达请求不算零费用，合计 costComplete=false，以上不是账户账单；缓存、免费抵扣及其他业务用量没有据此结算。

公开仓库证据为 apps/ai-summary/evaluation/live-pilot-2026-11-22.json，包含前后版本、原始响应的内容投影、usage、预期、审查理由、繁体预览和完整原始 envelope 的 SHA-256。无账户标识或凭据。原始请求计划和 envelope 保存在本工作树 apps/ai-summary/.data/pilot，已被 gitignore 排除，不将该本地路径当作跨机器唯一证据。

可复现选择见 evaluation/pilot-v2.json。最终计划哈希为 f7dd7d21b231584a6b9925e5f123baaaa4d48083947098732043e1f9fa811c5a。在 apps/ai-summary 先建立 .data/replay 目录，再运行下列命令，均无网络推理：

```text
node evaluate.ts plan evaluation/corpus-v1.json .data/replay/plan.json --selection evaluation/pilot-v2.json
node evaluate.ts replay evaluation/corpus-v1.json .data/replay/report.json .data/pilot/final-results.json --selection evaluation/pilot-v2.json
```

跨机器可将公开证据的 final.results 对象保存为 results.json，作为第二条命令的结果输入。报告永远保留 qualityAccepted=false，避免程序自动批准内容；本文件记录的是小批配置选择与源文核对，不是独立人工发布批准。

## 接下来的边界

本步不再增加模型调用或大样本门槛。后台节点再提供仅含已验证模型的选择、当前提示词/参数版本和日预算，然后接通队列 adapter，联测领取前的配置白名单与调用时的任务版本守卫，避免旧闭包按新任务版本写结果。当前 consumeSummaryMessage 的模型接口尚未携带提示词/参数版本，接线前必须补齐该契约；不能只在工厂创建时校验版本。

保持默认停用和草稿审核，生产迁移、队列创建、Worker 部署与灰度仍按原节点单独执行。当前继续保留 PR，不合并。

官方参考为 [Cloudflare Gemma 思考模式示例](https://developers.cloudflare.com/workers-ai/get-started/workers-wrangler/)、[Gemma 参数与标价](https://developers.cloudflare.com/workers-ai/models/gemma-4-26b-a4b-it/)、[GLM 参数与标价](https://developers.cloudflare.com/workers-ai/models/glm-4.7-flash/)。当前模型能力结论以本次真实响应为证据。
