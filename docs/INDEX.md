# 项目资料索引

第二批已完成及两天自动化观察见[BATCH2](ai-summary/BATCH2.md)：38成功/11跳过/1失败，新增44调用；最新预算800/日，保持设置只开本批50条扫描。先读STATE，元数据证据按ID读取，不将19:03预算快照当最新设置。

最新新增第二批50条自主生成见[BATCH2](ai-summary/BATCH2.md)，先读[STATE](ai-summary/STATE.md)，工作树tgbox-ai-summary-batch2。#74已合并，Worker/Admin及配置已同步v8；新50条已入队，程序自主处理，不人工编辑或代批准。旧稿及展示名单保持，结果待核验，证据按需读取。

提示词边界候选草稿PR #74，代码入口tgbox-ai-summary-prompt-v8/apps/ai-summary/src/prompts.ts，恢复先读本工作树STATE及PROMPT-V8。生产保持v7，未部署候选或重新回填50条。

最新提示词边界增补见[PROMPT-V8](ai-summary/PROMPT-V8.md)，先读[STATE](ai-summary/STATE.md)。工作树tgbox-ai-summary-prompt-v8；加入整体介绍/不列单篇片名边界并修正示例，#1940定向实测改善，C6仍有归纳限制。当前仅候选，生产v7/50条灰度保持。

上线记录PR #73（仅docs），后续从[OBSERVE50](ai-summary/OBSERVE50.md)恢复观察与抽检；代码#72已上线，保持固定50条，不自动批准新稿。

七D已完成50条上线及18页三语验收，最新见[OBSERVE50](ai-summary/OBSERVE50.md)，先读本工作树[STATE](ai-summary/STATE.md)。代码#72、Web部署45154564101成功；36草稿/13跳过/1失败，保留3份人工批准，当前观察记录工作树tgbox-ai-summary-observe50。机器证据仅按需定位读取，不自动扩围。

2026-11-23 七D最新上线观察入口[STATE](ai-summary/STATE.md)、[OBSERVE50](ai-summary/OBSERVE50.md)，工作树tgbox-ai-summary-observe50。50条首批36草稿/13跳过/1失败，新增40调用；保留3条人工批准，未自动批准新稿。Web最终验收待追加，按需读取机器证据。

七D主分支集成PR #72，base已核验main；#71仅合入旧堆叠base。部署及50条任务正在执行，最新结果查本工作树[STATE](ai-summary/STATE.md)与[ROLLOUT50](ai-summary/ROLLOUT50.md)。

2026-11-23 最新七D固定50条灰度及审核弹层见[ROLLOUT50](ai-summary/ROLLOUT50.md)，先读[STATE](ai-summary/STATE.md)。工作树tgbox-ai-summary-rollout50，依赖#70；本地已验证，PR及生产上线待执行。保留人工审核，禁止全站扩散。

2026-11-23 七C固定12条真实生成与审阅见[LIVE-PILOT](ai-summary/LIVE-PILOT.md)，恢复先读[STATE](ai-summary/STATE.md)。工作树tgbox-ai-summary-live-pilot，依赖#69；10次调用，7草稿/3弃答/2预检跳过，3草稿需编辑，生成已关闭，页面未启用。保留并行管理员审批，不自动代为批准或展示。

2026-11-23 最新七B已按授权生产部署但保持AI关闭，先读[STATE](ai-summary/STATE.md)，实际版本、迁移、零任务核验及限制见[RELEASE-DISABLED](ai-summary/RELEASE-DISABLED.md)。工作树tgbox-ai-summary-release，交付依赖七A#68；七C真实生成、七D展示均未执行。

2026-11-23 最新AI摘要进入七A生产准备审查，先读 [STATE](ai-summary/STATE.md)，具体证据、合并部署影响及分节点执行清单见 [ROLLOUT-PREP](ai-summary/ROLLOUT-PREP.md)。工作树tgbox-ai-summary-rollout，依赖六C#67。七A只读核验和本地检查，尚未合并、迁移、创建资源、部署或线上灰度。

最新六C页面接入见 [STATIC-PAGES](ai-summary/STATIC-PAGES.md)，独立tgbox-ai-summary-pages，base为六B。默认关闭、人工繁中保护、开关前后HTML及实际搜索契约已本地验证；尚未生产启用。恢复先读本工作树STATE。

最新六B数据实现见 [STATIC-DATA](ai-summary/STATIC-DATA.md)，独立tgbox-ai-summary-data，基于六A。公开投影/审批失效、可选隔离导出、快照指纹复核已实现；六C页面尚未接入。恢复先读该工作树STATE。

步骤六目前为接入前契约审查，见 [STATIC-CONTRACT](ai-summary/STATIC-CONTRACT.md)。独立tgbox-ai-summary-static，公开投影、可选导出和人工繁中保护尚未实现；步骤六不能标完成。恢复先读本工作树STATE。

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
