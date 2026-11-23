# 步骤六A：静态接入前的契约审查

2026-11-23，Asia/Shanghai。本文件是接入前设计决策，以下新增表、字段和开关均为待实现方案，不代表源码已具备。工作树tgbox-ai-summary-static、分支codex/ai-summary-static，基于步骤五6f653ae。保持Gemma/v7/v3，不增加推理。

## 实际入口与发现

- [scripts/build-site.ts](../../scripts/build-site.ts) 的SNAPSHOT_TABLES为公开表白名单，远端通过wrangler导出，再交[snapshot CLI](../../packages/snapshot/src/cli.ts)。审核表含操作人、待审稿与撤回稿；不能为了读已批准文本而把reviews/revisions/jobs/sources整个加入公开导出。
- [build-site-data.ts](../../packages/snapshot/src/build-site-data.ts) 从SQLite/SQL快照和D1分类标签、隐藏帖子及site配置生成SiteData，loadMedia读取R2帖子和人数历史，visiblePosts再过滤隐藏内容。[EntryView](../../packages/shared/src/site-data.ts)尚无AI摘要字段。
- [DetailPage](../../apps/web/src/views/DetailPage.astro)用entrySummary生成事实首段，并由detailSeo生成metadata；公开原简介另行显示。当前事实首段参与Pagefind，人数等数据区域使用data-pagefind-ignore。
- [hant.ts](../../apps/web/src/lib/hant.ts)整体转换繁体HTML和JSON，仅外部URL有保护。简单传入人工繁中并不能保证其原字节保留；不能认为后台已显示三语就完成静态三语接入。
- [markDirty](../../packages/db/src/access.ts)负责dirty_since，[构建工作流](../../.github/workflows/build-deploy.yml)按main代码变更、内容dispatch和定时触发构建部署。本节点不能借验证调用该生产流程。

## 拟实施的公开投影

新增仅供构建读取的ai_summary_public（暂定名）：entry_id、zh、hant、en、fingerprint和契约版本。只保存最后一份已批准三语文本及校验标识；不保存actor、提示词、任务日志、原始证据正文、历史稿或审计内容。该表与审核表分离，避免公开导出依赖后台私有结构。

批准成功时在同一D1 batch事务更新投影；编辑、撤回时删除对应投影。审批快照继续留在私有审核/审计记录中。抽检标记不改已发布文本。投影确有变化才标记dirty_since，使用现有构建调度，不因一次轮询反复dispatch。

来源变化不等于旧投影仍有效：构建须重建与worker一致的规范化输入，使用同一prepareAiSummary/aiSummaryFingerprint和schema/policy版本计算指纹，不另造一个只哈希简介的规则。输入包括资源类型、名称、分类标签、原简介和当前可见帖子；统计浏览量不影响指纹。当前指纹与投影不符则单条回退，包括人工锁定但来源已变化的稿。

频道需保留R2读取状态，不能将解析错误当“确实没有帖子”，也不能只用详情截断后的预览数组计算指纹。采用当前来源契约的帖子边界/清洗/抽样；隐藏帖子和blocklist改变后必须失效。群组、机器人不额外读取不存在的聊天或功能测试资料。

## 开关、缺表和错误隔离

展示由构建参数显式开启，默认关闭，并支持固定entry_id白名单；具体参数名在六B实现时确定并记录。未开启时不增加可见AI内容，白名单为空不得意外解释为全站。开关不得复用enabled（控制推理）或auto_scan（控制扫描）。

公开投影应独立可选导出。不能直接把新表写入现有强制白名单，否则旧数据库缺表会在wrangler导出阶段失败，snapshot里的hasTable回退根本不会执行。需单独尝试导出公开投影或先探测表，缺表只关闭本次AI消费；常规业务表继续沿用原有失败策略，不掩盖主数据库或构建故障。

每条投影校验三语非空、长度、契约版本和当前来源指纹，损坏、过期、不在白名单、不可读取均回退，不让坏行进入SiteData.parse导致整站失败。构建不导入adapter、不接AI binding、不请求推理。输出SiteData只含通过校验的三语结果，不带指纹之外的任务/审核私有数据。

静态站关闭展示或撤回需要重新构建并发布才能改变已经生成的HTML；这不是即时运行时关闭开关。后续灰度必须记录实际回退耗时，不能承诺点击后台后已部署页面立刻消失。

## 页面、繁体和搜索契约

新增用途介绍不应删除原事实首段或原简介。建议将通过审核的用途介绍放在事实段前，事实段继续承担分类、语言、人数等说明，重复的简介改写由人工拒绝发布。保持现有URL、canonical、hreflang、robots、sitemap、搜索配置和原事实metadata；本节点不以改写metadata代替正文验收。

Pagefind原有可索引事实段与简介保留，新增AI段使用明确的忽略标记，避免此节点同时改变站内搜索来源。需用开关前后索引输出验证，而不只对照HTML属性。

人工繁中必须有独立测试：采用限定于AI文本节点的保护/替换机制，在统一OpenCC转换后恢复已转义的人工繁中。不能保护整页或整个script而误保留简中，不能把人工文本当HTML插入。简中/英文/繁中使用相同批准版本，单语损坏时整个AI段回退，避免三语错版。真实实现仍需覆盖引号、换行、HTML字符、品牌和URL字节。

## 分步实施及验收

六A（本轮）：记录上述真实入口、公开投影与安全降级方案，独立草稿PR，零运行时代码和生产操作。六B：实现公开投影及审批事务/dirty标记、可选导出、指纹复核和快照契约，以本地SQLite/D1/R2证明缺表、坏行、隐藏帖子、锁定过期、撤回及默认关闭行为。六C：接入正文、人工繁中保护及完整构建，核对三语HTML、metadata、URL/hreflang和Pagefind前后契约，演练关闭重建回退。

六B和六C依赖六A，分别独立PR，保持未合并；完成六C后才可称步骤六完成。灰度和约2000条回填仍为步骤七、八，不在本轮启动。

本轮只做源码对照与文档检查，不重跑模型、运行应用测试或构建，不把文档检查当实现验收。方案撤回只需关闭本草稿PR；当前业务和公开页面均无变化。
