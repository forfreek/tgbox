# AI 资源摘要模块项目记忆

生产观察记录PR #73仅docs（含按需JSON证据），运行时代码及线上部署来自#72；文档合并不应触发新增推理或网站部署。后续从OBSERVE50读取结果汇总，再按entries.id定位证据。实际离线检查覆盖50条记录、48输出、18页及本节点文档链接；其他流程仍沿用#72的代码测试结果，不为文档重复真实模型测试。

七D生产验收完成（2026-11-23）：主分支CI/部署成功，18页对照证明名单内已批准显示、未批准/不足/名单外回退、原事实及SEO链接不变，详见OBSERVE50及按需证据。HTTP探针要数独立p[data-ai-summary]，不能把繁体data-ai-summary-preserve算成第二段。后台Access仍阻止匿名访问，未绕过；本地同版交互与远端版本/认证核验须分别陈述。

2026-11-23 七D实际运行入口[OBSERVE50](OBSERVE50.md)：50条范围首批36ok/13skip/1failed，40次新增调用，保留3份人工投影，未批准新稿。模型结构校验不等于编辑质量认可。人工编辑会推进sourceGeneration以挡在途任务，统计历史job/revision不能强制job.generation=source.generation，否则会漏掉3条锁定批准稿。观察scheduled日志的eventType为scheduled而非cron。实际Web验收待追加。

七D主分支集成PR #72已明确核验base=main，#71仅为旧堆叠base交付。恢复先查#72和ROLLOUT50，不能只看#71已合并就认定main含灰度代码。

七D上线：Admin部署先将远端7个plain_text变量覆盖到ignored生成配置，再--keep-vars，部署后逐值及secret名称集合比对，不能只依赖keep-vars保住同名配置值。摘要Worker部署显式--var传固定50条。开启采用真实summaryCommand/config CAS，保留管理员已调配额。#71误保留旧堆叠base，主分支集成须另立PR并核验目标分支；不把合并状态等同main已包含代码。

七D CI两次证实完整CLI冷启动在并行Worker负载下超过5秒，给该单项execFileSync增加15秒硬截止及20秒测试时限，而非放宽全局或跳过断言。快照测试失败须区分超时与数据断言错误。

七D#71复核：白名单解析、帖子预载及公开投影逐ID读取必须统一SUMMARY_ROLLOUT_LIMIT，不能只改解析器；新增50份带新鲜指纹的投影消费回归，防止第21–50条被静默截断。

2026-11-23 七D入口[ROLLOUT50](ROLLOUT50.md)：扫描、outbox派发及消费三层共用固定50条名单，空/非法名单关闭，生产不能直接开启旧全站扫描路径。共用解析器packages/shared/src/ai-summary-rollout.ts；首次observe队列消息复用真实source loader和幂等任务。保留人工审核/锁定及当前管理员配额，构建不推理。审核复用现有Dialog，反馈留在弹层。实际验证及易变版本见专题，不将格式通过等同人工批准。

2026-11-23 七C交付完成：草稿[PR #70](https://github.com/forfreek/tgbox/pull/70)依赖#69，提交054c4f5b75e9759781f0b1408844c92918c69b16的[Linux CI45146761495](https://github.com/forfreek/tgbox/actions/runs/45146761495)全仓检查/测试及脚本检查通过（2m18s）。Worker81项、离线证据验证、12份文档310个本地链接及diff通过。后续仅补文档记录，不追加推理或生产变更；保持不合并、不部署、不启用展示。3条草稿需编辑，七D等待继续指示。以下核验中记录保留历史。

七C交付入口（2026-11-23）：草稿[PR #70](https://github.com/forfreek/tgbox/pull/70)，base=#69，独立tgbox-ai-summary-live-pilot。证据在evaluation/production-pilot-2026-11-23.json，完整审阅见LIVE-PILOT。Worker81项、离线证据与12份文档310个本地链接通过；记录管理员并行审批，不能归为维护进程自动批准。

运行维护和小批任务优先使用已有API/CLI，不把用户本地浏览器或已有登录会话作为必需依赖；仅必要UI验收才使用浏览器并说明用途。2026-11-23用户明确要求其他方式后，七C以Cloudflare账号授权的D1/Queues API跑通现有函数及真实线上消费者，没有绕过后台认证。

2026-11-23 七C见[LIVE-PILOT](LIVE-PILOT.md)，独立tgbox-ai-summary-live-pilot、依赖#69。用户明确可改用其他方式，采用Cloudflare管理API适配现有source/admin/outbox函数，actor=system，真实已部署Worker消费；没有cookie提取、Access绕过或新资源，不将维护接口执行称后台UI验收。12条固定样本、10次调用，7ok/3insufficient/2预检skip、技术失败0，完成即关闭生成，auto_scan从未启用。

本批7稿中4可用（其中2增量低），1978/1979遗漏否定/收益边界、1985中文直译需改。schema通过不等于全部可发布，保持Gemma/v7/v3，不追加推理美化统计。并行管理员审批1997/1982/1979被保留，批准投影不等于静态展示；两个GitHub变量仍缺省。后续不能沿用“公开摘要0”，须带快照时点重读。实际usage未结算回D1，1000是预留不是账单；Hant本地复用OpenCC，无额外推理。

2026-11-23 七B交付完成：草稿[PR #69](https://github.com/forfreek/tgbox/pull/69)依赖#68，提交6c57d7755b176c97642dbf5b2d69b5c3dff4a99c的[Linux CI45118458822](https://github.com/forfreek/tgbox/actions/runs/45118458822)全部通过（1m45s）。最终main部署/CI成功，12份文档304个本地链接及diff通过；后续仅补文档，不新增生产操作。生成、扫描及展示继续关闭，首次真实cron日志未捕获，七C前须先核验；七C/七D等待继续指示。以下核验中保留历史边界。

七B交付入口（2026-11-23）：草稿[PR #69](https://github.com/forfreek/tgbox/pull/69)，base=#68，独立tgbox-ai-summary-release。12份相关文档304个本地链接及diff通过，原入口/七A入口路由同步。仅生产应用代码已按授权合并，#68和#69文档PR未合并。

2026-11-23 七B生产部署见[RELEASE-DISABLED](RELEASE-DISABLED.md)，独立tgbox-ai-summary-release、依赖#68。用户在确认不全局改摘要、生成/扫描/展示关闭后ok，已合并#61–67、迁移0022–25、创建指定Worker与两队列、更新既有Admin。最终main6551bd9的CI与Web部署均成功，任务/尝试/公开摘要均0，默认关闭，下一七C等待指示。

Admin远端plain_text与源码默认值有漂移，尤其认证为空默认；部署前把远端值覆盖到忽略的生成配置再keep-vars，部署后核对全部值及secret名称未变。不要以keep-vars单独保证同名默认不会覆盖，不能把部署成功当认证成功。只读未登录访问仍进入原Access登录，未绕过认证。CLI重登录一次网络失败、迁移7500先核验无写入再重试成功，CLI tail超时不能冒称cron有执行记录，均留证据。

2026-11-23 七A交付完成：草稿 [PR #68](https://github.com/forfreek/tgbox/pull/68)，base=#67，提交1d67f3a31d5affd110b3267e77081108120bb454的 [Linux CI 45116119118](https://github.com/forfreek/tgbox/actions/runs/45116119118) 全部通过（2m30s，全仓check/test及脚本类型/测试）。12份文档294个本地链接及diff通过。后续仅补本交付记录，不改代码/配置；保持不合并、不生产迁移/资源创建/部署/推理。七B具体范围待用户确认。以下核验中为历史记录。

七A交付入口（2026-11-23）：草稿 [PR #68](https://github.com/forfreek/tgbox/pull/68)，base=#67；工作树tgbox-ai-summary-rollout / codex/ai-summary-rollout-plan。原工作树及六C工作树补充索引、状态、记忆恢复路由；12份文档294个本地链接通过。本次只提交文档，保留其他工作树的既有修改。

2026-11-23 七A生产准备见[ROLLOUT-PREP](ROLLOUT-PREP.md)，独立tgbox-ai-summary-rollout、依赖#67。main合并会自动部署Web但不迁移D1、不发布Admin或新Worker；先迁移0022–25再部署使用表的服务。现场只读核验生产最新0021、无AI表/新Worker/两队列、无AI变量，D1两次SELECT均写0行。八表内存迁移/外键/默认关闭验证与2项现有工作流测试通过，非生产演练。

enabled、auto_scan、快照ID白名单、静态DISPLAY是四个层次；白名单不限制后台推理。neurons为固定reservation账本而非实际消费结算，UTC跨日恢复配额。停止生成不撤销静态页，关闭展示需确保最后部署关闭版，防止不取消在途部署的concurrency发布旧启用产物。DLQ可能由部署自动创建，同样需要具体资源授权。#67文档CI首次5秒快照CLI超时已保留，原配置复跑成功。

2026-11-23 六C交付完成：草稿 [PR #67](https://github.com/forfreek/tgbox/pull/67) 依赖#66，代码f1ad243d8a74a2181695d1a8186910ea93032d63的 [Linux CI 45114637565](https://github.com/forfreek/tgbox/actions/runs/45114637565) 全部通过（2m14s，含Web449项、全仓check/test及脚本类型/测试）。十一份文档267个本地链接及diff通过。后续仅补文档记录，代码不变；保持草稿不合并，未生产启用。下一节点七须明确生产授权。以下核验中记录保留当时边界。

六C交付入口（2026-11-23）：草稿 [PR #67](https://github.com/forfreek/tgbox/pull/67)，base=codex/ai-summary-data；独立tgbox-ai-summary-pages。原入口和六B入口均补索引/状态/记忆路由，保留各分支原交付边界。十一份相关文档267个本地链接通过，源码差异无空白错误。

2026-11-23 六C实现见 [STATIC-PAGES](STATIC-PAGES.md)，tgbox-ai-summary-pages，base六B。AI_SUMMARY_DISPLAY严格1才渲染六B已校验三语DTO，工作流只传变量默认空，原事实段/简介/metadata不替换，新增AI段Pagefind忽略。Astro插值只作文本，hant仅跳过带AI+preserve双标记的纯文本p；不保护整页/script、无占位符碰撞。EntryView坏AI字段catch(null)，不掩盖其他资源错误。关闭→开启→复用开启缓存关闭重建的HTML已回到原样；正文、品牌、URL及人工混排不被OpenCC重写。

Pagefind实际token index/fragment字节一致，完整HTML剔除AI段后逐页相同，浏览器搜索/filters也相同、AI测试词0命中；filter/entry辅助打包可能顺序不同，不能误称全目录哈希一致。首次并行缓存EPERM与5秒旧链接超时保留，独立缓存配置+本地串行15秒预算448项通过，后加回退重建测试定向8项通过；默认449项留Linux CI。无新模型调用或生产操作，下一阶段七的迁移/资源/灰度需明确授权，当前不合并。

六B最终代码3dccaff的Linux CI 45110073662全仓检查、测试及脚本检查通过（2m20s，默认快照52项通过），此前9eeb192的CI45109800262也通过。Windows本地5秒旧支付测试超时保留，不能将放宽到15秒串行复测冒称默认本地通过。十三文档278链接验证通过，后续仅补记录，六C仍未实施。

六B可选导出隔离还包括finally清理错误：不能在catch降级后又因清理失败抛出而终止主构建。两项Node回归覆盖部分文件和不可用路径，旧部分文件不复用。

六B交付草稿PR #66、base=#65，代码9eeb192；恢复入口STATIC-DATA，本节点无新推理或生产操作。节点后续只补验收记录，六C另建独立工作树/PR，不能把数据DTO存在当作页面已展示。

2026-11-23 六B实现见 [STATIC-DATA](STATIC-DATA.md)，工作树tgbox-ai-summary-data、base六A。公开ai_summary_public只有六列，无actor/私有稿；审批投影与dirty在同一D1事务，编辑/撤回删除，重复批准/抽检不重复标脏。可选SQL必须独立SQLite读取，禁止拼入主SQL，否则部分/损坏可选导出会拖垮正常构建。白名单AI_SUMMARY_ENTRY_IDS默认空/非法关闭，最多20，未接正文。来源哈希复用worker规范化与完整可见证据，不哈希预览；只缓存选中频道本次R2帖子读取并在复核后释放，坏行逐条null，DTO不传指纹与审计。六C需保护人工繁中、核对HTML/metadata/Pagefind，尚未实现。

六A草稿PR #65依赖#64，仅记录公开投影/缺表降级/繁中保护契约，五文档106本地链接与diff检查通过。后续实现另建六B分支/PR，不在本设计节点混入运行时代码。

2026-11-23 步骤六A关键边界见 [STATIC-CONTRACT](STATIC-CONTRACT.md)：scripts/build-site.ts是公开表导出白名单，禁止将含actor/待审历史的审核任务表整表加入；拟独立批准内容投影，编辑/撤回事务删除且标dirty。新表缺失须在可选导出阶段降级，不能只靠snapshot.hasTable，因为强制wrangler导出先失败。当前hant.ts整体转换HTML/JSON，人工繁中需独立保护并校验；构建复核同一规范化来源指纹，不用只哈希简介或截断预览。此为未实现契约，六B/六C另PR，静态回退需重建发布，不承诺即时关闭。

步骤五代码05de52c的Linux CI 45034415096全部通过，后续只补交付记录。下一节点静态快照与dirty/build失效接入，不把后台批准等同已发布或无需重验来源。

步骤五交付草稿PR #64，base=codex/ai-summary-models（#63），本节点代码在独立tgbox-ai-summary-admin。浏览器正常流程与伪造跨站Origin的HTTP重放已验证，后者403；测试需携带原server-function协议头，裸JSON请求500属于框架协议不匹配，不能当CSRF结果。生产与公开展示未执行。

步骤五复核发现后台框架未配置全局CSRF，新增POST接口不能只依赖既有认证：本节点独立要求Origin与请求origin精确一致，拒绝跨站/无Origin/null及异协议端口，8项回归后Admin111/111。未扩展修改旧接口。

2026-11-22 步骤五独立工作树tgbox-ai-summary-admin，恢复见 [ADMIN](ADMIN.md)。共享ai-summary-config保存已确认Gemma/v7/v3；prompt实际文本与冻结请求不变。消费在领取/预留前白名单校验，adapter每次收job版本，不能只验闭包。新增ai_summary_reviews保存人工三语及批准状态，edit_version/observation_token CAS与锁定阻止在途模型覆盖；人工动作事务性审计含成功稿快照。旧revisions.review_status不是人工批准来源，步骤六应读新表并复核来源。

发现原tick启用后会自动rolling历史扫描，新增auto_scan=false独立开关：仅启用消费不启动全站回填。预检只读、不建任务；批量最多20条，同指纹/版本复用；普通重试只技术失败，insufficient不扣费重跑、旧尝试不退款。批准前重读D1/R2，D1最终事务再校验；R2不能参与该事务，静态消费仍要复核。繁体复用OpenCC在浏览器按需转换，不在Worker里运行字典。

本节点79项Worker（含11项后台本地D1/R2回归）、111项Admin、74项DB通过；全仓typecheck、Admin build及Worker dry-run通过。桌面/手机UI用虚构本地条目走通核心流程；Browser插件缺失用Playwright/Edge，默认headless shell缺失改用本机Edge，未安装浏览器。Windows全仓check受既有CRLF阻断，不能报通过，后续以定向格式和Linux CI核验。没有新模型试跑、生产迁移或部署；队列adapter虽接线但默认仍disabled，approve不触发构建/公开。下一步静态消费、dirty/build与回退另节点。

2026-11-22 用户确认暂时保持当前版本：Gemma 4 26B A4B + prompt-v7 / params-v3。后续以该组合实现后台审核控制，除非出现具体缺陷或用户调整要求，不继续为文风追加试跑。本次只确认下一步计划，不启动后台、生产迁移或部署。

2026-11-22 最新 [V7-REVIEW](V7-REVIEW.md)：prompt-v7通过“用途先提取、重要禁令优先、身份/效果省略或归因”及三类异题示例修复v6真实问题。复用16条来源/14次调用，全部development，不冒称独立holdout。十四条结构/状态及本批逐句源文核对通过，10段OpenCC未见关键信息变化，68项回归/类型/dry-run通过。保持Gemma、不搜索、不扩大来源；步骤四以受审草稿为界完成，可进后台，不能宣称自动公开、母语编辑、整页或SEO效果验收。完整请求/plan及响应在editorial-v7证据；自动report的qualityAccepted仍为false，编辑结论由本审查另记，非自动评分器。以下v6未过结论为当时快照。

v7代码b9a709f的Linux CI 45029643269全部通过（1m36s），后续仅补交付记录。下一节点按独立后台PR交付，继续保持生产推理停用；不能因步骤四小批通过省略版本守卫、人工审核和静态回退。

2026-11-22 真实简介增值审查见 [PAGE-VALUE](PAGE-VALUE.md) 和page-value机器证据：每类两条，共六次Gemma v6调用；全过结构校验仍有科技频道误弃答、Bot Talk重要机器人禁令遗漏、来源自称官方升级为直接陈述。后者有源，不是无源幻觉，但需归因或省略。现有首段和独立简介并存，中文压缩不必然为整页新增；此快照部分已有机翻丢主旨，AI英文有局部改善，不能外推全部。只读D1、未读R2，不能当完整source loader或最终HTML验收。本版本共16条来源，继续小批、不换更小型号、不搜索；下一步定向修三类问题，不进入后台或自动公开。

2026-11-22 用户最新明确“不要用更小的了”，停止小模型路线，保持Gemma。当前prompt-v6 / params-v3，将各类型完整输入—输出示例真正放入system，示例和当前user资料隔离，不从话题推断成员活动，不借示例补事实或数字。FEWSHOT.md和fewshot-pilot证据是恢复入口，Gemma8/8符合固定批次预期；小模型此前8次有注入/平台误判/动作主体错误，未加入enum/支持名单，停止进一步调用。66项回归和类型/dry-run通过，不把边界合格当成介绍感或页面增值已验收。

v6代码4f9e5fd的Linux CI 45027588408全部通过，后续仅补文档。用户停止小型号的决定已同步原目录恢复入口；未迁移、合并或部署。

2026-11-22 用户允许必要时尝试更大参数模型。已核对官方目录，并用研究草案同四条资料试Llama70B和gpt-oss-120B各四次；不同提供商参数分别记录，不声称严格消融。均未明显摆脱固定开头，GPT还对G1虚构成员分享代码等活动。结构校验全部通过仍不能证明事实正确；LARGER-MODELS记录原样输出，不因参数大就替换默认，GPT未加入生产白名单。未联网搜索或部署，示例实际入请求的优化仍待验证。

2026-11-22 用户明确不做联网搜索，不再推进该功能，旧WEB-ENRICHMENT仅留历史。上一步研究草案用四条既有输入实际调用Gemma后均出现“这里”开头和同义扩句，未达到介绍感要求，不替换v5。COMPARISON.md及research-comparison机器证据保留原样输出，不能用人工撰写示例替代模型验证。本轮无搜索、部署或代码修改。

2026-11-22 用户询问Workers Paid联网搜索。已核对官方Web Search API及env.AI.websearch，要求Gateway额度或BYOK，Paid订阅不自动覆盖；平台能力不能当作本账户已配置。当前Wrangler4.132.0低于新binding文档4.141.0要求，现有证据只认profile/post，需新web证据、身份关联及版本/指纹设计。WEB-ENRICHMENT.md为提案，尚未实施；只因缺事实触发，不能为凑字或修文风而搜索，同名/旧资料/隐藏转载与冲突必须筛查，失败回退。

2026-11-22 用户认为v5仍单调，要求搜索案例并完整列提示词。最新 PROMPT-RESEARCH.md 使用发布者自述、机器人目录和官方社区说明提炼“具体内容+自然连接+明确边界”，明确标AI描述的目录作为反例。草案只借写法、不借事实，不凭文风断言人工作者；不冒充亲测，也不把功能对应的目的扩成收益承诺。当前仅文档方案，代码仍v5，未调用模型；草案单用途20–50字尚未实施。

2026-11-22 最新表达改进见 [STYLE](STYLE.md)：prompt-v5 / params-v3，中文编辑口吻、按事实丰富程度设60–100字或15–40字目标，短资料例外；硬限整段简中120字/英文90词。不能为字数添加事实、效果、受众或重复语句。14条来源跨v3/v4/v5共30次调用，保留频道限定丢失与动作主体错误两次失败；最终v5修正，仍不把自然度改善当成整页增值验收。v2证据固定，不用旧hash重放新提示词。

本步 Worker 65/65、类型检查、dry-run、冻结子集CLI复现、变更文件格式、七份文档80个链接及差异空白检查通过；模型调用已结束，不为测试追加推理。STYLE和公开style-pilot证据是v5恢复入口，旧PILOT是v2；整页去重和内容增值门槛继续开放，未合并或部署。

v5 代码 eee663b 的 Linux CI 45023045895 全部通过，后续仅补交付文档。保留本批表现与一般质量的区别：字数目标不是全部达标，安全短写可以低于目标；硬上限有自动检查，语义与整页价值仍需审阅。

2026-11-22 最新质量纠偏见 [QUALITY](QUALITY.md)：10/10 只代表结构、状态和源文核对，不能概括为内容质量已通过。八条摘要五条主要复述简介，另三条分别体现帖子归纳、跨语言转述和注入清洗；既有原简介/翻译展示会削弱整页增值。Gemma 技术候选保留，内容增强目标未验收，先补编辑目标及前后对照，不自动进入步骤五；不恢复 120 条门槛。本次无新推理、版本修改或部署。

记录日期为 2026-11-22。本文件保存恢复工作所需的结论和入口，详细方案按链接读取。

## 用户目标及约束

为频道、群组、机器人生成有事实依据的独立资源摘要，兼顾约 2,000 条历史回填及新增自动处理。使用 Workers AI、D1、Queues 和现有 R2，排除 Durable Objects 与 VPS。异步生成，独立表保存，原始 Telegram 资料保留。支持资料不足跳过、失败重试、人工编辑锁定、三语言、灰度与回退。构建只消费已生成内容。现有 URL、canonical、hreflang、搜索索引策略和业务流程保持兼容。

2026-11-22 用户确认使用付费 Workers，只需 10–20 条样本确认模型与提示词，取代之前 120 条正式评分门槛，不再反复询问已授权的小批推理。本步选 12 条，尝试 18 次，步骤四选择已完成。当前工作树 C:/Users/123/tgbox-ai-summary-models、codex/ai-summary-models，基于步骤三 #62 的 33cd2d3，继续更新草稿 #63。保留堆叠 PR，不合并、迁移或部署；步骤五等待继续指示。

## 可复用结论

- 审查基线为远端 main 固定提交 cb0d6a658d1dc57c45ef3e6092d9f15c66386b7b。本地 HEAD 为 6fa6b00，已有用户修改。迁移最新编号当时为 0021。生产部署及数据未实查。
- 现有 AI 提供分类建议和原简介翻译。详情首段由 entrySummary 模板生成。频道帖子已有 R2 存储，群组和机器人没有可供摘要使用的聊天或功能实测记录。见 [AUDIT](AUDIT.md)。
- 建议独立 Worker 在 approved 条目落库后发现任务，用持久 D1 发件箱和 Queues 消费覆盖审核、直接录入和种子 SQL。新功能不占用 Bot 刷新和支付维护的现有调用预算。见 [DESIGN](DESIGN.md)。
- 内容指纹依据规范化的实质资料和可见证据，排除人数、浏览量、头像、推广及普通刷新时间。任务版本、租约令牌、编辑版本和来源代次共同防止过期回写。R2/D1 跨存储一致性通过构建复核补足。
- 逐句输出简中、英文及证据引用，繁体复用构建阶段 OpenCC。原简介及现有译文继续独立保存。模型和自动校验无法自行证明事实蕴含，先人工审阅样本。
- 静态构建复核批准内容，坏行和缺表按条目或可选模块回退。摘要发布采用独立修订号，现有 dirty_since 仅用于通知调度，避免构建期间新增发布被旧脏标记清理吞掉。
- 初始建议、表名、提示词、配额、模型、阈值及文件清单均为待确认设计。模型与价格属于 2026-11-22 查询快照，执行时重新验证。见 [DELIVERY](DELIVERY.md)。

## 证据与恢复规则

最新真实小批先读 [PILOT](PILOT.md)。默认模型已选 @cf/google/gemma-4-26b-a4b-it，支持名单仅此一个；summary-prompt-v2、summary-params-v3，json_schema、关闭思考、temperature=0、max_completion_tokens=1024。Gemma 结构化协议经真实调用确认，不能沿用早期 JSON Mode 目录未列名就判不支持的推测。GLM 旧版出现围栏和平台简介误判为用途，未进入可用名单；Llama 本轮未调用。

最终 10 条真实调用全部通过结构与逐句源文核对，8 条摘要、2 条 insufficient；其余 2 条预检跳过。既有 OpenCC 的 8 句繁体文本已比对，页面 HTML/metadata 和独立人工发布仍未验收。18 次尝试中 2 次最初连接器超时送达未知，不重试、不按零费用；16 个已知响应约 92.878 Neurons，token 标价估算约 $0.001063，不是账单。修订前失败和修订后结果分开保存，公开机器证据在 apps/ai-summary/evaluation/live-pilot-2026-11-22.json。

原 37 条资料只是离线回归库，真实试跑只取其中 12 条，不自动增加样本。CLI --selection 固定最多 20 条并校验 ID、源库版本和模型，最终计划哈希见 PILOT；模型接口返回的结构合法并不证明事实正确，GLM 反例已固化。报告始终不自动批准质量，公开发布仍经后台控制。回归已通过 63 项，仅回放已有真实证据，不增加推理。

本轮 Worker 类型检查、dry-run 打包、带 selection 的 CLI 复算、八文件 Biome、七份文档 74 链接和差异空白检查通过。公开证据未含账户/数据库标识或凭据，完整 envelope 仅在忽略的 .data；原目录及步骤三路由同步最新结果，不提交其他工作树已有业务修改。PR 和 CI 证据以 STATE 为准。

代码 b144449 的 CI 45004530315 首次为既有 snapshot 测试 5000ms 超时；本地该文件 28/28 通过，同代码 attempt 2 全仓 CI 通过。未改快照代码或放宽超时，不把本次成功当作已修复并发偶发问题。真实试跑与最终证据已归档，后续仅更新交付记录；步骤五等待继续。

本步只把选型写入代码常量和版本，不启用 D1、不接队列。步骤五将 adapter 接线与后台配置一起完成，必须补齐 SummaryModel 的任务 prompt/params 版本传递，并在领取前与调用时校验，避免旧闭包按新任务版本写结果。原先把接线放在步骤四的准备提案已调整，当前没有自动调用入口。

以下步骤 4A 代码准备及更早段落为历史记录，“真实比较未完成/120 条待验收”等已被上述最新授权和结果替代，恢复以 STATE/PILOT 为准。

步骤四准备的实际实现见 [MODELS](MODELS.md)。三类提示词沿用 shared 双语逐句引用契约；频道帖子须限定可见样本，群组不能推测聊天活跃度，机器人必须限定为公开说明。来源内指令是不可信数据，JSON 分离不能保证语义防注入。结构、数字及引用检查不等于事实蕴含，输出仍须人工审阅。

实验模型协议分别处理 Gemma/GLM 的 choices 与 Llama 的 response。JSON Mode 支持列表与 Gemma/GLM 模型页存在差异，后两者先只请求 JSON 文本，真实探测后再改参数版本。模型白名单是实验候选，不能当作已验证的生产模型。版本守卫拒绝未实现 prompt/params；无内部重试、输出修补或模型降级。60 秒 binding abort 仍可能计费。

37 条样本中六条历史、31 条构造，development 25、holdout 12；预检后 21 条可推理，三模型首轮共 63 请求。计划指纹覆盖样本、版本和完整请求，replay 拒绝过期、重复及预检排除项。缺失响应计入分母，未知费用不记零，状态匹配不等于事实评分，报告永远不自动批准质量。120 条正式分层集、真实费用、三语转换和语义防护仍待后续验收。Worker 尚未调用此 adapter，settings 保持 disabled。

本步本地 Worker 测试 60/60（新增 29），全仓 10 项类型检查、七文件 Biome、dry-run 打包和 CLI plan/replay/禁止覆盖通过。只使用模拟响应，不能将其理解为三个模型已达到质量门槛。实际 PR 和 CI 状态恢复先查 STATE。

步骤 4A 草稿 [PR #63](https://github.com/forfreek/tgbox/pull/63) 依赖 #62、#61，不合并。代码提交 3c8952f 的 Linux CI 45002055713 完整通过，后续仅补文档记录。原目录及步骤三目录已加本地恢复路由，不把步骤四进度当作父 PR 的实施状态。真实模型比较及正式质量门槛仍待验收。

以下步骤三及更早段落为历史快照，以当前 STATE 为恢复入口。

步骤三实际实现见 [TASKS](TASKS.md)。六张新表默认停用生成，attempts 账本按 UTC 日聚合预算，未知模型结果和硬删除均不退款。来源观察 CAS 与当前 D1 资料及配置比对，任务领取和预算在同一 batch。队列消息加 dispatchedAt，发件箱五分钟补发；扫描和模型租约 20 分钟，有界重试。独立 newest 和 rolling 游标覆盖新增与历史，回填固定 ID 上界。候选一律 pending，真实模型适配器留在步骤四，当前 Worker 不调用 Workers AI。公开表、审批和静态消费在后续节点接入，R2/D1 跨存储窗口仍需发布时复核。

本地新运行时测试及 Linux CI 实际状态见 STATE，DB 既有测试 74/74、全仓类型检查和 dry-run 打包通过。追加回归覆盖回填批次处理中暂停，保存已处理游标时保持 paused，避免检查点把暂停覆盖为 active/completed。每次 PR 或追加修改继续同步项目记忆和状态。

当前运行时回归 31/31 通过。49002fc 的 Linux CI 44999638271 全部通过；扫描暂停保护提交 14d139e 的 CI 44999905516 也完整通过。其后仅更新文档，步骤三已完成，步骤四等待继续指示，PR #62 待审合并。行动前重查 PR 最新状态。

步骤三独立交付 [PR #62](https://github.com/forfreek/tgbox/pull/62)，堆叠在 PR #61 分支上，按 #61、#62 顺序审阅合并，合并前重查状态及 base。新 Worker 类型由 Wrangler 生成，仅规范化五处尾随空白。下一步为步骤四，等待继续指示。

2026-11-22 用户明确将 PR 同步项目记忆作为全项目总规则，已写入根 AGENTS.md。每次提交 PR 或追加修改同步 MEMORY、STATE，涉及步骤或范围时更新 PLAN，新增专题或恢复入口变化时更新 INDEX。独立工作树交付后补原入口指向，保留分支历史边界。该规则适用于所有专题。

步骤二在 C:/Users/123/tgbox-ai-summary、codex/ai-summary-contracts 实施，固定 main 基线 cb0d6a6。共享包新增 ai-summary.ts 及测试、六条历史最小字段 fixture，API 通过 shared 根导出。先按 STATE 查实际验收及 PR，再按 [CONTRACTS](CONTRACTS.md) 查接口。预检只负责机械规则，冲突输入使用可信审核标记，历史 R-C1 的语义跳过仍需后续模型/人工判定。哈希用注入的原生 SHA-256 回调兼容 DB 类型环境。步骤三须按决策区分空输入错误与缓存跳过，防止技术失败被同指纹跳过吞掉。

步骤二独立交付 [PR #61](https://github.com/forfreek/tgbox/pull/61)，共享测试 198/198、其中新契约 46/46，全仓类型检查通过。Windows 全仓 Biome 有已有 CRLF 诊断，本次文件检查通过，Linux CI 结果见 STATE。行动前重查 PR 状态。

Linux CI 44996364788 对 e47892a 完整通过，文档记录提交 80a58b9 的 CI 44996586655 也完整通过，包含全仓检查、测试和脚本检查。步骤二已完成，步骤三等待继续指示，PR 尚待审合并。当前记忆校正仅更新文档，代码测试证据沿用上述提交。

步骤一历史交付为 [SOURCE-RULES](SOURCE-RULES.md) 与 [SOURCE-SAMPLES](SOURCE-SAMPLES.md)，25 个固定案例中 6 个历史真实来源、19 个构造，步骤二已将其纳入契约测试。每步交付后等待继续指示。资料不足正常跳过，技术失败有限重试，来源冲突进入人工复核；预检跳过不推理，同一指纹和规则不重复生成。缺失来源和读取失败分开，有充分其他来源时可以继续评估。候选审核状态与任务状态分离，自动语义判断及真实模型效果留待步骤四。

源码永久基线为 [GitHub 固定提交](https://github.com/forfreek/tgbox/tree/cb0d6a658d1dc57c45ef3e6092d9f15c66386b7b)。详细源码路径见 AUDIT，平台官方链接见 DELIVERY。既有主线 docs/content-review/AI-DIFFERENTIATION.md 和 DESCRIPTION-CHAIN-AUDIT.md 属于早期专题，必要时用 git show 固定提交读取，不能将其他工作树的状态搬到本目录。

总入口为 [docs/INDEX](../INDEX.md)，恢复时先读 [STATE](STATE.md)，再查具体问题对应文件。禁止为了恢复上下文一次性读取全部文档和源码。
