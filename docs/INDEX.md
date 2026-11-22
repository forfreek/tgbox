# 项目资料索引

当前AI摘要恢复先读 [STATE](ai-summary/STATE.md)，步骤五后台与版本/配额保护见 [ADMIN](ai-summary/ADMIN.md)。工作树tgbox-ai-summary-admin、base为步骤四模型分支；后台节点不合并部署，下一步静态接入。以下步骤四记录保留历史。

当前恢复先读 [STATE](ai-summary/STATE.md)，最新为 [V7-REVIEW](ai-summary/V7-REVIEW.md)：Gemma v7在既有16条来源中完成三项定向修复，14次调用符合本批预期，步骤四按受审草稿范围完成。下一节点为后台人工控制，仍不自动发布、合并或部署。以下v6及更早说明为历史。

最新提示词v6、实际输入—输出示例和边界回归见 [FEWSHOT](ai-summary/FEWSHOT.md)。按用户最新要求停止小模型评估，保持Gemma；以下v5及型号比较为历史。

更大参数候选Llama70B、gpt-oss-120B的八次真实对照见 [LARGER-MODELS](ai-summary/LARGER-MODELS.md)：本批仍有套话，GPT还补写无依据群组活动，暂不更换默认模型。

联网搜索已由用户取消。上一步研究草案与v5的四条真实输出对照见 [COMPARISON](ai-summary/COMPARISON.md)，新草案尚未达到介绍感目标，不替换v5。

Workers AI联网补充资料的能力、计费前置条件及接入缺口见 [WEB-ENRICHMENT](ai-summary/WEB-ENRICHMENT.md)，目前仅可行性建议，未实施。

最新“像人介绍资源”的案例研究与完整提示词草案见 [PROMPT-RESEARCH](ai-summary/PROMPT-RESEARCH.md)。草案未替换v5，未新增推理。

AI 摘要最新提示词 v5、字数目标及真实前后对照见 [STYLE](ai-summary/STYLE.md)，旧 PILOT/QUALITY 保留各自版本边界。

AI 摘要实际生成质量与页面增值评估见 [QUALITY](ai-summary/QUALITY.md)：结构与源文核对通过不等于内容增强目标通过。

AI 资源摘要模块恢复先读 [STATE](ai-summary/STATE.md)，步骤四已选模型、真实小批结果及提示词版本见 [PILOT](ai-summary/PILOT.md)，接口与离线复算见 [MODELS](ai-summary/MODELS.md)，步骤三数据与异步任务见 [TASKS](ai-summary/TASKS.md)，步骤二契约见 [CONTRACTS](ai-summary/CONTRACTS.md)。按问题读取指定专题，禁止一次性读取全部文档与源码。

头像 URL 协议相对地址导致的 Invalid URL 错误与修复见 [刷新状态](refresh-progress/STATE.md#2026-11-21-头像-url-兼容修复) 和 [补充计划](refresh-progress/PLAN.md#头像-url-兼容补充节点)。

网站标题与关键词优化先读 [当前状态](seo-titles/STATE.md)，实施节点、动态摘要与提醒见 [计划](seo-titles/PLAN.md)，数据链路与可复用决策见 [项目记忆](seo-titles/MEMORY.md)。

收录头像补齐、Cron 跳段证据与持久刷新进度修复见 [当前状态](refresh-progress/STATE.md)、[实施与验收](refresh-progress/PLAN.md)、[决策记录](refresh-progress/MEMORY.md)。生产头像补齐已完成，调度修复是否上线须按 STATE 核验。

构建读取 R2 与 Bot Fight 隔离见 [方案与验收](build-media/PLAN.md)、[当前状态](build-media/STATE.md)、[决策记录](build-media/MEMORY.md)。

构建数据增长、全量读取与静态文件数量风险见 [容量与扩展性待办](build-media/SCALING.md)。该问题尚未解决，恢复评估时先读此文及 STATE；不要把 R2 读取修复视为已完成增量构建或动态化。

AdSense 验证脚本接入与检查见 [交付记录](adsense/DELIVERY.md)。

Google 标签接入见 [交付记录](google-tag/DELIVERY.md)。

按当前任务读取单个专题，较长文件先定位章节，再读取所需行段。

| 任务 | 入口 | 何时读取 |
| --- | --- | --- |
| 中文语言包教程 | [交付记录](content-review/CHINESE-LANGUAGE-GUIDE.md) | 查看文章路径、SEO、指南介绍与验证 |
| 后台 Crypto Pay 回调地址 | [状态记录](content-review/STATE.md) | 查看 2026-11-16 线上变量修正及凭据核对 |
| AI 差异化简介链路 | [差异化核查](content-review/AI-DIFFERENTIATION.md) | 查看实际输入、模型任务、保存展示缺口与修正后的主线 |
| 第 2 步简介链路核查 | [核查交付](content-review/DESCRIPTION-CHAIN-AUDIT.md) | 查看最新样本、复现问题、代码位置及下一步验收要求 |
| 剩余两篇指南改写 | [改写记录](content-review/REMAINING-GUIDES.md) | 查看技能版本、来源、内容修改与上游复测 |
| 详细收录要求指南 | [收录指南记录](content-review/LISTING-GUIDE.md) | 查看禁止收录范围、入口和验证 |
| 公共文案与身份交付 | [交付记录](content-review/COPY-DELIVERY.md) | 查看本节点修改、上游清查和验证 |
| 当前文案优先顺序与上游残留 | [文案计划](content-review/COPY-PLAN.md) | 本轮执行入口，按最新用户指示改写 |
| 搜索数据参考 | [搜索分析](content-review/SEARCH-NEXT.md) | 用于样本选择与效果复核，当前顺序以文案计划为准 |
| 第一篇中英指南样板 | [样板记录](content-review/GUIDE-SAMPLE.md) | 查看已改内容、来源与验证 |
| 简介链路、30 条样本与模型验证 | [AI 核验](content-review/AI-AUDIT.md) | 决定简介和模型改动范围 |
| 内容差异度核验证据 | [核验报告](content-review/VERIFICATION.md) | 判断是否需要改写或调整生成链路之前 |
| 内容优化与 AI 简介审查 | [计划](content-review/PLAN.md) | 内容调整、指南、简介和审核准备 |
| 当前决策与恢复点 | [状态记录](content-review/STATE.md) | 恢复本任务、确认授权和已核实信息 |

动态化相关资料目前位于其他独立分支。涉及该工作时先核对分支及其现有索引，再读取目标文件。

## SEO 第一阶段

先查 [实施进度](seo-phase1/STATE.md)，按需查 [计划与回滚](seo-phase1/PLAN.md)、[约束](seo-phase1/CONSTRAINTS.md)、[项目记忆](seo-phase1/MEMORY.md)。范围为 AI 群组分类与排行榜的三语言页面。

恢复排行榜工作时先查 STATE 中的“排行榜节点记录”，需要算法与回滚细节时再读取 PLAN 的节点二与实际交付映射。

第一阶段上线结果与生产验证边界见 [发布验收记录](seo-phase1/STATE.md#排行榜发布验收)。

已上线六页的 Google 收录与搜索表现复核见 [搜索复核](seo-phase1/SEARCH-REVIEW.md)，包含数据窗口、时区、私有报告和下一次复核入口。
