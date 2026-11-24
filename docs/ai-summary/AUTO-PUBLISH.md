# AI 摘要自动发布

## 生产验收（2026-11-24）

上线记录[PR #78](https://github.com/forfreek/tgbox/pull/78)仅包含文档及最小元数据；证据不变量、165个本地文档链接及diff核验通过，不重新部署或推理。

代码PR #77已合并，main e650b0a。PR最终文档提交CI45406000340通过；main CI45406013274首次因既有快照“input reader fails”测试5682ms超过5秒失败，同代码重跑通过，未放宽测试或跳过断言。网站构建部署45406013006成功。

Worker版本98f55d88-3ad6-4a64-98e4-6e03832e1dd3，读回scope=all、生成名单空、自动发布=1；五分钟定时器已实际创建并完成auto_publish游标。Admin版本40463897-7675-4006-bdbf-cefee4cf7540，明文变量逐项及6个secret名称集合保持。Web版本c5de3ce4-5ddc-4e53-a443-0337c8416c67，GitHub自动发布变量=1，旧展示开关与名单不改；新构建按全局公开投影消费。

settings全字段前后一致，131条人工批准记录版本/状态保持。当前每日100调用/6000固定预留/100单次/1尝试，今日60次、固定预留6000，未追加模型调用或提高额度。当前没有可自动发布的未审v8成功稿，唯一未审旧v7稿受版本保护不发布，所以新机器结果的真实生产正向发布仍待次日配额恢复后观察；不伪造样本、不代审来完成验收。

原50条名单外确定性两条（频道1938、机器人1937）共六页三语摘要与公开投影一致，Pagefind忽略属性存在。五页读到完整正文；1938简中请求正文传输超时，但已收到HTTP200、完整head和摘要，其canonical/hreflang/description与部署前一致。基线采集跨越部署，不将其称为六页完整前后对照。受认证后台未做生产人工点击验收，后台动作由本地runtime测试覆盖。读回及限制见[最小元数据证据](evidence/auto-publish-activation-2026-11-24.json)。

恢复工作树仍为tgbox-ai-summary-auto-publish，当前记录分支codex/ai-summary-auto-publish-records；不据此宣称两天观察或长期内容质量完成。

## 当前授权与边界（2026-11-24）

用户明确取消逐条人工审核：模型输出通过既有结构、长度、引用和来源校验后自动进入网站发布构建。保留人工编辑、人工批准、人工撤回及锁定，不代改文字、不重跑模型、不修改配额、提示词或模型。

本节点工作树 `C:/Users/123/tgbox-ai-summary-auto-publish`，分支 `codex/ai-summary-auto-publish`，base 为 main `d807168`。历史文档中的“只允许人工审批/固定50条展示”不再作为本节点的新机器结果规则，历史证据仍保留。

## 实现及数据流

1. `apps/ai-summary/src/tasks.ts`：成功完成并持久化 revision 后，独立调用发布路径。发布异常仅记录条目 ID，不把成功任务改为失败、不触发再次推理。
2. `apps/ai-summary/src/publish.ts`：重新校验既有 revision；重新读取 D1/R2 来源及指纹。`sweepSummaryPublication` 使用既有 `ai_summary_runs` 的 `auto_publish` 游标，每五分钟最多十条成功机器稿，补齐历史草稿及遗漏发布；不占模型调用配额，暂停生成扫描也能补发布，模块 enabled=0 时停止。
3. `packages/db/src/ai-summary-publish.ts`：D1 batch 原子写公开投影、dirty 标记和无正文审计。事务内检查当前 generation/edit_version、来源 guard/fingerprint、当前模型/提示词/参数及 enabled；任何人工 review 或 locked 都阻止自动改写。重复发布不反复标 dirty。
4. 静态构建开启 `AI_SUMMARY_AUTO_PUBLISH=1` 时，`scripts/build-site.ts` 仍只额外导出公开 `ai_summary_public`；快照消费全体公开投影，不再截取原50条名单。每条仍复算当前来源指纹，错误、过期、不足均回退原摘要。无构建内推理，无私有 AI 表导出。
5. `apps/admin/src/server/ai-summary.ts` 与 DB/UI：区分自动发布和人工批准；机器稿可直接撤回，撤回会建立人工保护记录；抽检只写审计，不锁定或推进生成版本。配额等待不进入失败筛选，也不出现技术重试按钮。

## 公开投影契约与繁体

无需数据库迁移。既有 `contract_version` 整数字段新增协议值2：v1保持人工保存的 zh/hant/en；v2保存机器 zh/en，hant 列暂存同一 zh，仅快照在构建阶段用现有 `@tgbox/hant` 生成繁体。未知版本拒绝消费；自动开关关闭时拒绝v2，仍按原名单读取v1。

繁体复用当前 cn→tw 字形转换，无台湾词汇替换；测试不能把“软件”转换结果预设为“軟體”。字典只进入 Node 快照构建，禁止引入 Worker。最终快照仅保留三语文本，不含指纹、审核人和任务信息。

## 上线与延迟

部署 Worker 时保留 `AI_SUMMARY_SCOPE=all` 和空生成名单，新增 `AI_SUMMARY_AUTO_PUBLISH=1`；GitHub 同名变量设1，已有 `AI_SUMMARY_DISPLAY=1` 保持。Admin 部署须完整保留线上 plain_text 变量和 secret 名称集合，特别是 Access 配置。

本次完成后触发一次正常网站构建。后续通过已有 dirty 检查的六小时构建和每日强制构建发布；“自动”指不再等待人审，并非每条完成就立刻执行一次全站部署。现有 URL、canonical、hreflang、Pagefind 和 SEO description 逻辑保持。

2026-11-24 只读核验：settings 当前为每日调用100、每日固定预留6000、单次100、重试上限1，enabled/auto_scan=1，Gemma/v8/params-v3。此前200/800及150/200均是旧快照，不可恢复。131条人工批准的v1投影必须保留；当时未审核成功稿只有一条，统计会继续变化。部署前后重新逐字段比对，不能将 reservation 台账称为实际消耗。

## 验证与回退

交付[PR #77](https://github.com/forfreek/tgbox/pull/77)，代码 `cbaf510` 的 [Linux CI 45405487594](https://github.com/forfreek/tgbox/actions/runs/45405487594) 全仓检查、测试和脚本检查通过。补充本地Web摘要10项及可选导出2项通过、Admin生产构建通过。该CI核验代码，不等同生产开关或页面已生效。

本地 Worker 101项通过，快照专项16项通过，Worker/快照/Admin类型检查通过，Worker dry-run通过。覆盖重复投递/发布、历史补发布不推理、零日预算仍可发布已有稿、锁定/人工批准/撤回保护、来源D1/R2变化拒绝、全局超过50条、繁体转换与人工繁体保留、关闭时回退。全仓 Windows biome 受既有CRLF影响失败，不批量格式化无关文件；以Linux CI核验全仓门禁。PR、CI、部署及生产验收待追加。

快速回退：Worker自动发布开关设0停止新增投影；GitHub自动发布开关设0并重新构建恢复旧名单/v1行为。要全部回到原摘要，另将展示开关 `AI_SUMMARY_DISPLAY=0` 后构建。保留全部原Telegram资料、AI revision和人工稿；无需删除数据或回滚迁移。已部署静态HTML必须重新构建才能改变。

事务依据：[Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)。平台行为按本项目已安装 Wrangler 4.132.0 与兼容日期验证，不升级工具链。
