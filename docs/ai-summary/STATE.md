# AI 资源摘要模块状态

2026-11-23 七D授权固定50条自动生成及小范围展示，并修复页底审核交互。当前C:/Users/123/tgbox-ai-summary-rollout50 / codex/ai-summary-rollout50，依赖#70；入口[ROLLOUT50](ROLLOUT50.md)。本地实现与验证完成，PR/CI及生产部署开启待执行。保留人工审核，不自动批准，不扩大全站；以下旧12条记录不覆盖最新授权。

2026-11-23 七C交付完成：草稿[PR #70](https://github.com/forfreek/tgbox/pull/70)依赖#69，提交054c4f5b75e9759781f0b1408844c92918c69b16的[Linux CI45146761495](https://github.com/forfreek/tgbox/actions/runs/45146761495)全仓检查/测试及脚本检查通过（2m18s）。Worker81项、离线证据验证、12份文档310个本地链接及diff通过。后续仅补文档记录，不追加推理或生产变更；保持不合并、不部署、不启用展示。3条草稿需编辑，七D等待继续指示。以下核验中记录保留历史。

七C草稿[PR #70](https://github.com/forfreek/tgbox/pull/70)已建立，base=codex/ai-summary-release（#69），提交054c4f5，仅证据JSON及5份文档；Worker81/81、离线证据验证、12份文档310本地链接和diff通过，Linux CI核验中。没有运行时代码/配置改动或新增部署，不为CI重复真实推理。

2026-11-23 七C已执行固定12条，见[LIVE-PILOT](LIVE-PILOT.md)。工作树C:/Users/123/tgbox-ai-summary-live-pilot / codex/ai-summary-live-pilot，基于七B6dbdc88，base=codex/ai-summary-release（#69）。真实cron成功记录已补齐；按用户要求改用Cloudflare API传输并复用现有任务函数，未再操作本地浏览器，不绕过Access或新建资源。

10次真实调用，每任务1次，7份ok/3份insufficient，另2条预检跳过，技术失败0。生成已重新关闭、auto_scan=0、scan_runs=0，AI构建变量未设置。编辑审查4份可用（2份增量低）/3份需改，不判定内容全通过；不改v7模型/参数。并行交互管理员已编辑批准1997/1982/1979，3条投影快照保留，维护进程没有批准，不能误报公开投影为0或网站已显示。证据离线复算通过，交付PR/CI核验中，七D等待指示。

2026-11-23 七B交付完成：草稿[PR #69](https://github.com/forfreek/tgbox/pull/69)依赖#68，提交6c57d7755b176c97642dbf5b2d69b5c3dff4a99c的[Linux CI45118458822](https://github.com/forfreek/tgbox/actions/runs/45118458822)全部通过（1m45s）。最终main部署/CI成功，12份文档304个本地链接及diff通过；后续仅补文档，不新增生产操作。生成、扫描及展示继续关闭，首次真实cron日志未捕获，七C前须先核验；七C/七D等待继续指示。以下核验中保留历史边界。

七B记录草稿[PR #69](https://github.com/forfreek/tgbox/pull/69)已建立，base=codex/ai-summary-rollout-plan（#68），提交6c57d77；仅5份文档，12份相关文档304本地链接及diff通过，文档PR CI核验中。生产应用代码与main一致，生成/扫描/展示保持关闭，不因文档交付追加生产操作。

2026-11-23 用户确认七B具体范围并在明确“生产部署、不开全局摘要”后回复ok，已执行：#61–#67合并，main6551bd9；D1迁移0022–25、两队列及摘要Worker、既有Admin更新完成。见[RELEASE-DISABLED](RELEASE-DISABLED.md)。enabled=0/auto_scan=0/model=disabled，任务/尝试/公开摘要均0；AI构建变量未设置。无真实推理、全站回填或AI展示。

当前C:/Users/123/tgbox-ai-summary-release / codex/ai-summary-release，基于七A1e02419、交付base=codex/ai-summary-rollout-plan（#68）。最终main CI45117657530及网站部署45117657499成功，三语6页只读浏览器复核通过、Admin变量/认证保留；首次真实cron执行日志尚待补核验。独立交付PR及文档核验中。七C/七D等待后续指示。

2026-11-23 七A交付完成：草稿 [PR #68](https://github.com/forfreek/tgbox/pull/68)，base=#67，提交1d67f3a31d5affd110b3267e77081108120bb454的 [Linux CI 45116119118](https://github.com/forfreek/tgbox/actions/runs/45116119118) 全部通过（2m30s，全仓check/test及脚本类型/测试）。12份文档294个本地链接及diff通过。后续仅补本交付记录，不改代码/配置；保持不合并、不生产迁移/资源创建/部署/推理。七B具体范围待用户确认。以下核验中为历史记录。

七A草稿 [PR #68](https://github.com/forfreek/tgbox/pull/68) 已建立，base=codex/ai-summary-pages（#67），提交1d67f3a；本PR仅5份文档。12份交付/恢复文档294个本地链接和diff检查通过，Linux CI核验中。七B具体资源及迁移/合并/部署范围见ROLLOUT-PREP末节，等待确认后才执行。

2026-11-23 七A生产准备审查完成，见[ROLLOUT-PREP](ROLLOUT-PREP.md)。工作树C:/Users/123/tgbox-ai-summary-rollout / codex/ai-summary-rollout-plan，基于6073368、依赖#67，独立PR交付核验中。生产只读确认最新迁移0021、无AI表/新Worker/两队列，GitHub无AI变量；schema及migration两次SELECT均rows_written=0。没有合并、生产写入、部署或推理。

本地25份SQL内存应用通过，8张AI表及外键/默认关闭检查通过；现有verify-only工作流2项测试通过，merge-tree(main,6073368)无冲突。#67文档提交的CI45114915818首次快照CLI5秒超时，原配置复跑全部通过，失败记录保留，未调整默认超时。下一节点七B的具体迁移/资源/部署须确认，七C生成及七D展示另按范围执行。

2026-11-23 六C交付完成：草稿 [PR #67](https://github.com/forfreek/tgbox/pull/67) 依赖#66，代码f1ad243d8a74a2181695d1a8186910ea93032d63的 [Linux CI 45114637565](https://github.com/forfreek/tgbox/actions/runs/45114637565) 全部通过（2m14s，含Web449项、全仓check/test及脚本类型/测试）。十一份文档267个本地链接及diff通过。后续仅补文档记录，代码不变；保持草稿不合并，未生产启用。下一节点七须明确生产授权。以下核验中记录保留当时边界。

记录日期为 2026-11-23，时区为 Asia/Shanghai。

## 当前状态与授权

六C草稿 [PR #67](https://github.com/forfreek/tgbox/pull/67) 已建立，base=codex/ai-summary-data（#66），当前工作树tgbox-ai-summary-pages / codex/ai-summary-pages。代码f1ad243，Linux CI核验中；十一份交付与恢复文档267个本地链接及diff检查通过。保留草稿，不合并部署。

2026-11-23 用户明确开始六C，独立C:/Users/123/tgbox-ai-summary-pages / codex/ai-summary-pages，基于六B687854d、base=codex/ai-summary-data。代码及本地页面契约已实现，见 [STATIC-PAGES](STATIC-PAGES.md)：展示开关默认关闭，三语完整有效才显示；人工繁中仅保护AI纯文本p，原事实/简介及metadata保留，新增段不入Pagefind。无新模型推理、迁移、生产构建或部署，灰度未执行。

本地全套Web448项在串行/15000ms预算下通过，后增关闭重建用例定向8项通过；新类型检查全仓10项通过（Web314文件0错误/警告/提示）。Windows首次并行构建/测试有Astro缓存EPERM及旧链接检查超时，保留失败，仓库默认超时未改。默认449项等待Linux CI核验。浏览器三语、特殊字符、桌面/手机、搜索结果与筛选项已验证；不声称所有Pagefind辅助打包文件字节一致。

六B交付完成：最终代码3dccaff7376c9e953cc88a6e26869e177041c245的[Linux CI 45110073662](https://github.com/forfreek/tgbox/actions/runs/45110073662)全部通过（2m20s，全仓检查、测试、脚本类型/测试，含默认52项快照）。十三份文档278个本地链接及diff通过；草稿PR #66不合并。之后仅补文档记录，不改变代码或新增推理。

导出边界补充：可选输出路径不可用时，finally清理也不能反向阻断主构建；已加入清理失败兜底，Node导出测试当前2项通过。快照52项默认设置由本节点最终Linux CI核验。

六B草稿 [PR #66](https://github.com/forfreek/tgbox/pull/66)已创建，base=codex/ai-summary-static（#65），本工作树tgbox-ai-summary-data / codex/ai-summary-data。代码9eeb192，Linux CI核验中；下一节点六C页面/繁中/搜索回归，本轮不继续跨节点实施。

2026-11-23 用户明确“开始”实施六B，独立C:/Users/123/tgbox-ai-summary-data / codex/ai-summary-data，基于六A2ceeb34、base=codex/ai-summary-static。公开投影、审批/撤回事务与dirty标记、可选独立SQL导出、快照白名单及来源指纹复核已实现，见 [STATIC-DATA](STATIC-DATA.md)。仅数据节点，六C页面/繁中/搜索契约未实施；无生产迁移、资源操作、部署或模型调用。

本地Worker81项、快照新增定向14项、可选导出1项通过；全仓10项typecheck和脚本类型通过，Worker dry-run通过。Windows默认快照的既有支付测试出现5秒超时，串行15000ms预算全套50项通过，后增两项隔离SQL测试也通过；最终默认全套52项待Linux CI核验。具体限制/证据见STATIC-DATA，不把文档或打包当作最终页面验收。

六A已提交草稿 [PR #65](https://github.com/forfreek/tgbox/pull/65)，base=codex/ai-summary-admin（#64）。五份文档106个本地链接及diff检查通过；本次仅文档，不运行应用测试、不把CI视作六B/六C实现验收。下一项为六B独立数据接入节点，步骤六整体仍未完成。

2026-11-23 开始步骤六，独立C:/Users/123/tgbox-ai-summary-static / codex/ai-summary-static，基于步骤五6f653ae。接入前发现审核私有表不能直接进入公开导出，以及整体OpenCC会影响人工繁中，先完成六A契约审查，见 [STATIC-CONTRACT](STATIC-CONTRACT.md)。本轮仅文档，无运行时代码、迁移、模型调用、构建或部署；六B数据接入和六C页面验收未实施，不将步骤六标完成。

步骤五交付完成：代码05de52cfdebd1d07739e19a685cb51a6d6a5c0a5的[Linux CI 45034415096](https://github.com/forfreek/tgbox/actions/runs/45034415096)全仓检查/测试及脚本检查通过；本地变更文件Biome、diff检查及十一份文档236个本地链接通过。草稿PR #64保持未合并，后续仅补本交付记录，不改变代码或新增推理。

本节点草稿 [PR #64](https://github.com/forfreek/tgbox/pull/64) 已创建，base=codex/ai-summary-models，当前工作树/分支为tgbox-ai-summary-admin / codex/ai-summary-admin，依赖顺序#61 → #62 → #63 → #64。追加同源校验后的UI核心流程重新通过；携带正常server-function协议头、伪造跨站Origin的重放请求返回403，未改变稿件。Linux代码CI已通过。

2026-11-22 用户“好的，看是”按上下文“好的，开始”推进步骤五。已在独立工作树C:/Users/123/tgbox-ai-summary-admin、codex/ai-summary-admin实现后台控制，基于2a121b7，堆叠草稿PR #64，base=codex/ai-summary-models。详细实现、迁移、验证及限制见 [ADMIN](ADMIN.md)。模型/提示词保持Gemma v7/params-v3，本节点无新增真实推理。

已实现认证后台、配置CAS及配额、最多20条预检/异步生成、技术失败重试、三语编辑并锁定、批准撤回及抽检。人工稿独立存储，成功人工动作含审计快照；来源和编辑版本保护在途任务。新增auto_scan默认false，将队列消费与全站扫描分开，避免提前回填。领取前限制受支持组合、每次调用显式传递并核对job版本，queue已接adapter；D1默认仍disabled，未做生产迁移、创建资源或部署。

实际验证：Worker79/79、Admin111/111、DB74/74；全仓10项typecheck（Web311文件0错误/警告/提示）、Admin build和Worker dry-run通过。新迁移仅本地与测试应用。Playwright/Edge用虚构本地条目走通保存配置、预检、三语预览、编辑锁定、批准、抽检、撤回，桌面/390px手机无应用错误或横向溢出。Windows全仓check遇既有696项CRLF格式错误，未改无关源码；定向变更文件和Linux代码CI已通过，不将其冒称全仓本地check通过。

以下模型工作树和早期授权为历史边界，不能覆盖本节点最新位置与实施记录。

交付复核补充：框架全局CSRF中间件未配置，已对本次新增POST操作独立实施严格Origin同源校验，并新增8项回归，Admin当前111/111；原有接口不变。Worker及DB测试数不变。

2026-11-22 用户确认“可以了，暂时保持这个版本”：暂定Gemma 4 26B A4B、prompt-v7 / params-v3，不继续调提示词或追加模型试跑。用户本轮询问下一步计划，不等同授权立即实现步骤五；当前仅维护决策与计划文档。

2026-11-22 最新交付见 [V7-REVIEW](V7-REVIEW.md)：Gemma + prompt-v7 / params-v3，复用16条来源（全为调优回归，不称独立holdout），14次真实调用、2条预检跳过。混合简介误弃答、重要机器人禁令、官方身份声明三项在本批修复；10条生成、4条insufficient。没有新增来源、搜索、D1/R2查询或更换模型。步骤四按受审草稿范围完成，可进入步骤五；自动公开、最终HTML及SEO效果未验收。

本轮Worker68/68、类型检查、dry-run通过（1036.56KiB / gzip176.92KiB，未部署）；新增冻结计划回归验证当前请求与证据一致、旧v6结果不能混用，并核对三项修复及原有注入/主体边界。十段通过现有OpenCC转换，本批未见用途/否定/品牌/数字变化，非最终页面验收。详细证据和用量见V7-REVIEW。此前文档提交e5cda2e的CI 45028836942已核实通过；本轮CI随提交核验。

本轮交付前复算当前plan/report与冻结证据完全一致、十段繁体一致，三个变更代码/JSON文件Biome、十一份文档144个本地链接及diff空白检查通过。原目录恢复入口已更新，用户业务修改保留；本轮只提交独立模型工作树的代码、证据及文档。

v7代码提交b9a709f776233594b1724db73abc921c212abc8a的[Linux CI 45029643269](https://github.com/forfreek/tgbox/actions/runs/45029643269)全部通过（1m36s，含全仓lint/typecheck、测试、脚本类型与测试）。后续仅补本文档与记忆验收记录，代码和模型调用不再变更。

以下v6与更早记录保留当时结论，不能覆盖上述v7最新交付。

2026-11-22 最新完成 [PAGE-VALUE](PAGE-VALUE.md) 六条真实简介审查：三条生成、三条弃答，编辑判断一条可用草稿、两条需改、两条可接受弃答、一条误弃答。生产D1仅SELECT，rows_written=0；只以简介为模型证据，未读R2或刷新Telegram。Gemma v6新增六次真实调用，加上原十条来源共16条；没有更换模型、搜索、修改运行时代码或发布。步骤四编辑验收仍未通过，下一项仅修混合简介误弃答、重要限制取舍和身份归因，不进入步骤五。

本次交付验证：当前请求与六条保存请求逐项一致、SHA-256一致，六条响应经当前解码器离线复算通过；Worker66/66回归通过（只用已存/模拟响应，不新增推理），新JSON的Biome检查、十份文档130个本地链接及diff空白检查通过。未改运行时代码，不重复dry-run或声称完成最终HTML、生产source loader和本批繁体展示验收。

2026-11-22 最新指示“不要用更小的了”：保持Gemma，不切换或继续试小型号。提示词已改v6，实际system内附本类型示例和弃答例，约束成员活动、动作主体、示例事实泄漏和来源注入。最新证据FEWSHOT.md：10条来源、Gemma8次均符合本批预期；本轮此前结束的20B8次失败仅留审计，不加入支持名单。Worker66/66、类型检查和dry-run通过。未联网搜索、合并或部署，内容与整页价值验收继续开放。

v6代码提交4f9e5fd87e46f9262121bc954d6c6b6fee53b705的[Linux CI 45027588408](https://github.com/forfreek/tgbox/actions/runs/45027588408)全仓检查、测试与脚本检查通过（2m13s）。之后只补本文档验收记录，代码和模型调用不再变更。

2026-11-22 按用户“效果不行就换大参数模型”指示，已用原四条输入各试Llama70B、gpt-oss-120B，八次真实调用，无搜索。Llama仍重复“这里”，GPT群组结果补写成员活动，不支持本批直接替换默认。详见LARGER-MODELS.md及机器证据。默认仍Gemma，未改代码、适配器白名单、生产配置或部署。

2026-11-22 用户取消联网搜索，WEB-ENRICHMENT仅保留历史提案，不实施。按用户要求用原有四条输入实测上一步研究草案，四次调用、无搜索，结果原样见COMPARISON.md。新结果均以“这里”开头，改进不足，不替换v5，不把人工示例当模型结果；内容验收仍开放。

2026-11-22 联网补充资料可行性见WEB-ENRICHMENT.md：确认平台有Web Search API，需Gateway额度或供应商密钥；本项目4.132.0工具链及profile/post证据契约需适配。建议仅缺事实时异步触发，文风问题不搜索；当前未查询账户余额、充值、调用付费搜索或改代码，属于设计建议。

2026-11-22 最新用户要求搜索案例并列出更自然的提示词，已整理 PROMPT-RESEARCH.md。仅完成案例研究和公共/三类型提示词草案，没有改代码、调用模型或宣称新效果。运行代码仍为v5；本次草案的单用途字数建议20–50字尚未实施，与v5的15–40字分开记录。

2026-11-22 最新提示词优化见 [STYLE](STYLE.md)。模型不变，prompt-v5 / params-v3；资料丰富时简中60–100字、单用途15–40字，短资料允许例外，总长硬限120字/英文90词。移除固定审核式开头，保留来源与动作主体约束。14条来源跨三次修订共30次真实调用，最终10条结构和状态通过；语气改善，字数目标并非全部达标，整页价值验收仍开放。未合并、部署或进入后台。

2026-11-22 用户指出尚缺生成质量评价，已补 [QUALITY](QUALITY.md)。更正此前“步骤四已完成”概括：技术选型已确认，内容增强目标尚未验收。八条生成中五条主要复述简介，需先补编辑目标与整页去重对照；不进入后台或批量替换。本次只审阅已保存输出，不新增推理、不改变提示词。

步骤一至三已交付。2026-11-22 用户确认 Workers 付费账户，要求用 10–20 条样本确认模型与提示词，本轮据此完成步骤四的小批真实比较，取消先前 120 条正式评分和 63 次调用门槛。继续保留堆叠 PR，不合并、不部署。真实推理已按本次授权执行，生产迁移和资源创建未执行。

早期审查采用远端 main 的固定提交 cb0d6a658d1dc57c45ef3e6092d9f15c66386b7b。当时原目录 C:/Users/123/tgbox 的分支为 cursor/about-drop-awesome-list，HEAD 为 6fa6b0092837d0d6ca28ef5e8471b2b19df4f87e，含用户未提交改动。步骤二另从 main 建独立工作树。文档中的主线行为不能直接当作原目录 HEAD 或生产部署行为。

## 按需读取

先读本文件，再按问题选择一个文件。禁止一次性读取本目录全部文件或为恢复上下文全量读取源码。长文件先定位标题，再读取对应段落。

| 问题 | 文件 |
| --- | --- |
| 审查结论、可复用边界、证据基线 | [MEMORY](MEMORY.md) |
| 投稿、审核、抓取、翻译、D1、R2、静态构建真实链路 | [AUDIT](AUDIT.md) |
| Worker、迁移、队列、幂等、回填及输入输出 | [DESIGN](DESIGN.md) |
| 多语言、后台、模型测试、成本及回滚 | [DELIVERY](DELIVERY.md) |
| 拟涉及文件、实施顺序及验收 | [PLAN](PLAN.md) |
| 资料不足、来源冲突及逐步实施 | [PLAN 判定与分步计划](PLAN.md#来源信息不足的判定草案) |
| 步骤一判定规则与原因 | [SOURCE-RULES](SOURCE-RULES.md) |
| 真实资料与构造边界样本 | [SOURCE-SAMPLES](SOURCE-SAMPLES.md) |
| 步骤二 API、指纹与预检边界 | [CONTRACTS](CONTRACTS.md) |
| 步骤三迁移、队列、预算及回填 | [TASKS](TASKS.md) |
| 步骤四提示词、候选协议与离线评测 | [MODELS](MODELS.md) |
| 已选模型、真实小批证据与版本 | [PILOT](PILOT.md) |

## 下一步

当前工作树C:/Users/123/tgbox-ai-summary-live-pilot，分支codex/ai-summary-live-pilot，base=#69。七C固定小批运行/编辑审阅完成，生成已关闭，独立交付核验中。七D前重新核对并修订候选人工稿、明确白名单及发布回退范围；未全量回填或启用网站AI展示。

本节点继续更新草稿 [PR #63](https://github.com/forfreek/tgbox/pull/63)，base=codex/ai-summary-jobs，依赖顺序 #61 → #62 → #63。本轮仅执行小批真实推理，不合并父 PR，不迁移或部署。

本次风格优化本地验收：Worker 65/65 测试、Worker 类型检查、dry-run 打包、六个代码/fixture 文件格式检查、七份文档80个本地链接和diff空白检查通过。新版本冻结计划哈希与公开证据一致；旧版本响应仍可校验，但不能用新计划重放旧版本。Linux CI 随交付核验。以下真实模型确认属于 v2 历史快照。

prompt-v5 代码提交 eee663b8dc68b85e716828997e0129d1462a5797 的 [Linux CI 45023045895](https://github.com/forfreek/tgbox/actions/runs/45023045895) 全部通过（2m15s，含全仓检查、测试和脚本检查）。后续只补本条交付记录，代码不再变更，真实推理已结束。

## 步骤四真实模型确认

- 选定 @cf/google/gemma-4-26b-a4b-it、summary-prompt-v2、summary-params-v3；结构化 json_schema、关闭思考模式、temperature=0、max_completion_tokens=1024。GLM 不进入受支持白名单，Llama 本轮未调用。
- 12 条来源案例中 10 条进入最终模型、2 条预检跳过。最终 10/10 通过结构与源文核对，8 条摘要、2 条正确 insufficient；既有 OpenCC 转换八句中未见意思或品牌变化。没有详情 HTML/metadata 验收，也没有独立人工发布批准。
- 共尝试 18 次调用（旧版 8、最终版 10）。旧版首两次连接器超时，送达及计费未知、不重试；之后使用 /ai/run 的 model/input 协议。旧版围栏和 GLM 用途误判保留，未用最终结果覆盖。
- 16 个已知响应报告约 92.878 Neurons，按 token 标价估算约 $0.001063，两个未知请求不记零，非完整账单。最终调用 p50=1,159ms、p95=2,886ms。
- 小批取代大样本提案，37 条库只用于离线回归；不继续扩大真实调用。本地运行时回归 63/63 通过，Worker 类型检查通过，dry-run 打包通过（未部署），带 --selection 的计划/真实结果离线复算通过，最终计划哈希与冻结证据一致。八个变更代码/fixture 文件 Biome、七份文档 74 个本地链接、证据标识检查及 diff --check 通过，Linux CI 随交付核验。
- 具体证据、复现和边界见 PILOT。模型默认选择仅写入源码常量和文档，D1 默认仍 disabled，队列未接 adapter。后台节点须先补齐任务版本传递及领取前配置白名单，不能只校验旧工厂闭包。

以下“代码准备验收”属于真实试跑前历史记录，其中未授权、120 条和步骤四未完成等表述已被本轮用户要求与上方当前结果替代。

本节点最终代码 b144449a669542ad052e309dda0831531aaa8055 的 [Linux CI 45004530315](https://github.com/forfreek/tgbox/actions/runs/45004530315) 首次在既有 snapshot 的旧表兼容测试触发 5000ms 超时。未修改该测试或业务代码，定向复测 build-site-data.test.ts 28/28 通过；同一代码重跑 CI 后全仓 check、test 和脚本检查全部通过（attempt 2，2m6s）。未复现超时，仍保留首次失败记录。后续仅更新本次交付文档与 PR 描述，不新增模型调用。

## 步骤四代码准备验收

三类提示词、三候选实验适配器、37 条来源标记样本及离线 plan/replay 工具已实现。adapter 未接入 queue handler。默认模型和数据库配置不变，当前不会因本节点开始模型调用。

- 新增模型与评测测试覆盖数据/指令分离、请求协议、拒绝无效/截断/工具调用、引用、版本守卫、单次调用及离线报告。测试仅使用模拟响应，不能作为模型质量证据。
- 首轮计划实际生成 63 个请求；37 条中 21 条 eligible，其余预检跳过/待审/读源失败，无网络调用。
- 正式 120 条分层资料尚未建立，没有真实输出、实际费用或默认模型选择，三语和提示注入的语义效果未验收。MODELS 记录余项及建议的有限试跑。
- pnpm --filter @tgbox/ai-summary test 最终通过 60 项（原有 31、新增 29），仅模拟响应，本地 D1/R2 运行时测试。
- pnpm typecheck 全部 10 个任务通过，Web 311 文件零错误、警告和提示。
- pnpm --filter @tgbox/ai-summary build 执行 wrangler deploy --dry-run，1036.56 KiB / gzip 176.92 KiB 打包通过，未部署；未接通的模型模块不进入 Worker 的运行路径。
- 七个变更代码/fixture 文件 Biome 检查通过；离线 CLI plan/replay 及 EEXIST 禁止覆盖验证通过，mock 报告保存在忽略的 .data 目录。计划 SHA-256 为 a65b834f7b8f3a1e1a429981dee3aa92f826b9818cfdac031537672a1000a790。
- 源码审查核对三种协议、请求版本、超时传递、零内部重试和指标分母；确认未修改业务调用点、数据迁移或生产配置。六份交付文档 70 个本地链接通过，原目录及步骤三工作树的最新恢复入口已补充并验证，未提交其用户业务改动或把本地路由追加到父 PR。

Linux CI [45002055713](https://github.com/forfreek/tgbox/actions/runs/45002055713) 对代码提交 3c8952fa720b58112cee3896e26c2db443a927db 完整通过（2m10s），含全仓 check、test、脚本类型和测试。后续仅更新本次文档验收和 PR 描述，代码保持该已验收版本。步骤四仍等待真实比较，不因 CI 通过而视为模型质量通过。

以下步骤三及更早记录为历史交付证据，其工作树与授权不能套用本节点。

## 步骤三本地验收

交付 [PR #62](https://github.com/forfreek/tgbox/pull/62)，base 为 codex/ai-summary-contracts，依赖 PR #61。先合并 #61，再核对并将 #62 基线切至 main 后按序合并。当前尚未合并，CI 核验结果在下方更新。

- pnpm --filter @tgbox/ai-summary test 复测通过 31 项，包含回填处理中暂停时保持 paused 的回归。
- pnpm --filter @tgbox/db test 通过，15 文件、74 项既有 DB 测试，包含新迁移。
- pnpm typecheck 通过，10 个任务，Web 311 文件零错误、零警告；新 Worker 类型检查单独复测通过。
- pnpm --filter @tgbox/ai-summary build 为 wrangler deploy --dry-run，打包通过，未部署。
- Drizzle 再生成检查显示 No schema changes，迁移与 schema/snapshot 一致。
- 本步代码审查发现并修正暂停后任务无法恢复、旧配置观察者可能作废新任务、删除后预算被级联释放三个边界，均有回归测试。
- 新改动文件的 Biome、专题链接及差异空白检查通过。Windows 全仓 pnpm check 记录 680 项格式诊断，输出受大量既有 CRLF 影响，Linux 完整检查随 PR 验证。
- Wrangler 生成的类型文件含五处尾随空白，已仅规范化空白后复核 diff --check，绑定与类型内容保持生成结果。
- 真实模型、生产迁移、队列及 Worker 创建、远端运行状态未验证。新应用测试 remoteBindings=false，未调用 AI binding。

Linux CI [44999638271](https://github.com/forfreek/tgbox/actions/runs/44999638271) 对 49002fc 完整通过。追加回填暂停保护后，[44999905516](https://github.com/forfreek/tgbox/actions/runs/44999905516) 对 14d139e3c93eec91a38f30b5a84cd6d94484fa1a 再次完整通过，包含全仓检查、测试和脚本检查。此后仅补充文档验收记录，代码保持该已验收版本。

以下步骤一、二记录为历史证据，不能当作本步 PR 状态。

本步再次核对远端 main，仍为 cb0d6a6。历史快照内时间为 2026-11-14T17:41:28.739Z，不能视作当前线上事实。步骤一仅变更项目文档，未调用模型或生产抓取，尚未提交或创建 PR。

本步用 Node 本地脚本检查 25 个案例数量、三类型各五种基本边界覆盖、六个历史来源身份及五份相关文档链接，全部通过。该检查验证样本编制完整性，判定器实现、自动事实判断及模型效果均未测试。

## 步骤二本地验收

2026-11-22 文档追加，将 PR 项目记忆同步要求提升到根 AGENTS.md 全项目规则，并同步原目录总规则和专题记忆。该次仅改文档，执行差异空白与恢复链接检查，业务验证沿用以下记录。

Linux CI 已在提交 e47892a7b7c71eec96c218d12494bff3ee4aaa7d 全部通过，运行 [44996364788](https://github.com/forfreek/tgbox/actions/runs/44996364788)，包含全仓 pnpm check、pnpm test、脚本类型和测试。其后仅补文档记录，代码保持该已验收版本。步骤二交付完成，PR 待审合并，步骤三等待继续指示。

交付 PR 为 [#61](https://github.com/forfreek/tgbox/pull/61)，状态以 GitHub 为准。该 PR 也归档前两步仍仅保存在原目录的专题文档，保留 main 总索引其他入口。尚未合并。首次推送被 GitHub 邮箱隐私保护拒绝，改用仓库主线已有的 GitHub noreply 身份重新生成未发布提交后推送成功。

- pnpm --filter @tgbox/shared test 通过，共 8 文件、198 测试。
- pnpm --filter @tgbox/shared exec vitest run src/ai-summary.test.ts 通过，新增契约测试 46 项。
- pnpm typecheck 通过，9 个实际执行任务，Web 311 文件零错误和警告。
- 对本次四个代码/fixture 文件的 Biome 检查通过，专题本地链接检查及 git diff --cached --check 通过。
- pnpm check 在 Windows 全仓格式检查阶段报告 678 项错误，输出包含已有文件的 CRLF 换行诊断，未进入类型检查；类型检查已单独执行通过。Linux CI 全仓检查通过。
- 源码自查覆盖输入上限、可见性顺序、Unicode 截断、抽样稳定、输出引用与数字约束、DB/Node 类型兼容及六条历史原文。发现的跨包 crypto 类型错误已通过注入 digest 并复制 ArrayBuffer 修正，全仓复测通过。

## 早期审查验证边界

上轮读取并核对有关源码、迁移结构、Cloudflare 配置和两份 GitHub Actions 工作流，跨仓检索资源与帖子写入点，并查阅 Cloudflare 官方文档。审查并未逐行覆盖所有外围功能，因此不能标记为全仓逐行审计完成。

没有验证生产 Worker 版本、D1 当前条数、账户剩余额度或真实模型输出。用户给出的约 2,000 条用于容量估算。没有运行迁移、付费推理、部署或业务代码测试。本次归档新增六份专题文件，更新总索引，七份 Markdown 的本地链接检查全部通过。另按用户授权在 Codex 记忆扩展目录保存恢复指引。归档位于本地工作树，尚未提交或创建 PR。
