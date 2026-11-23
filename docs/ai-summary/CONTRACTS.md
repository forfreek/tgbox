# 步骤二输入与证据契约

2026-11-22 交付，代码位于 packages/shared/src/ai-summary.ts，从 @tgbox/shared 导出。工作树为 C:/Users/123/tgbox-ai-summary，分支 codex/ai-summary-contracts，基线 cb0d6a658d1dc57c45ef3e6092d9f15c66386b7b。原目录用户修改保留。恢复先读 [STATE](STATE.md)。

## 调用边界

AiSummarySourceInput 是服务端内部输入，profile 和 posts 分别显式提供 ok、unavailable 或 error。ok 的空文本或空数组表示已成功读取但无内容，unavailable 表示没有收集或对象不存在，error 携带有限错误原因。现有 EntrySnapshot 的 null/unknown 不足以自动推断全部错误原因，后续读源适配器必须保留实际读取错误，不能把 unknown 擅自当空资料。

调用方负责确认 approved、未锁定、条目身份和来源版本。reviewIssue 仅接收可信审核环节提供的 source_conflict 或 ambiguous_scope，不能接受公开请求或模型直接写入。审核记录绑定当前来源指纹和来源代次的持久约束在步骤三实施。

prepareAiSummary 验证输入并输出 input 与 decision。空资料和已识别的纯联系方式/广告噪声确定性跳过，足够的其他来源不被一个可选来源失败阻断。无法取得任何可用证据且有有效读源错误时返回 retry_wait。reviewIssue 显式分流 needs_review。

eligible 表示通过机械预检、允许尝试模型，不证明资料充分或事实正确。profile_supported/posts_supported 是证据来源原因。R-C1 的宽泛平台说明会通过机械预检，最终期望仍为 skipped，需后续模型或人工语义审阅。矛盾案例使用人工标注的 reviewIssue 验证分流，不声称自动识别矛盾。

## 规范化与抽样

先按现有 shouldHidePost 对原帖全文应用关键词屏蔽，再过滤隐藏 ID 及整条目隐藏。群组、机器人输入即使包含帖子也不会用于生成。帖子按规范化 UTC 日期降序、ID 降序抽样，对清理后的文本去重，最多四条。单条上限 500 Unicode 码点，简介上限 1,600 码点。原始输入另有字符数、帖子数和数组大小上限，超限校验失败，由后续任务层隔离处理。

文本使用 NFC、空白规范化，移除控制字符、URL 和 @联系方式。只有去掉符号后整段都由已列出的噪声词组成时才跳过，避免在实质句子里删除“联系”等词而改变意思。此处理不会识别所有广告和注入。模型数据始终不可信，B6 的指令文本保留为来源数据供后续防注入测试。

模型 payload 只包含版本、类型、标题、用户名、分类标签与证据。分类标签是理解语境，空证据不会因标题分类而变得 eligible。PostView 的浏览量和缩略图字段由来源 schema 去除。

## 指纹与输出

aiSummaryFingerprint 对确定性模型 payload 的 JSON 做 SHA-256，调用方注入原生 digest 回调，例如 bytes => crypto.subtle.digest("SHA-256", bytes)。返回 sha256 前缀和 64 位十六进制串，检查摘要长度。注入方式兼容未声明全局 crypto 的 DB 类型环境，也可在 Node 和 Worker 使用。

指纹忽略来源健康、人工审核标记、views、媒体缩略图和重复/顺序不同的 tags。选择的可见正文、证据 ID/日期、类型、身份、标题及分类标签变化会改变指纹。模型、提示词及参数版本在步骤三组合生成键。技术错误和跳过可以有相同的空证据指纹，任务层必须按 decision 处理，不能用 skipped 缓存吞掉 error；可用证据恢复时重新评估。

AiSummaryOutput 严格校验 ok 的一至两条双语句子及至少一个证据引用，或 insufficient 的空句子数组。validateAiSummaryOutput 追加引用白名单、去重、目标文字脚本、HTML/联系方式及阿拉伯数字证据检查。数字只允许出现在所引用证据中。格式校验不保证实际语种、中文数字、实体准确或事实蕴含，必须经过后续语义审阅。模型返回 insufficient 已消耗的费用照计。

## 验证范围

packages/shared/src/ai-summary.test.ts 将 25 个固定来源案例转成契约检查，另验证隐藏、屏蔽先于截断、顺序稳定、去重限额、Unicode、源失败隔离、未知字段、指纹和输出约束。六条历史原文以最小字段提取到 fixtures/ai-summary-sources.json，保留原提交、路径和快照时间。没有增加数据库或业务调用点，队列与模型调用在后续步骤接入。
