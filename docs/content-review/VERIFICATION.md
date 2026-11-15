# 内容差异度核验

## 2026-11-15 审核状态

用户报告 2026-11-10 提交 AdSense，目前显示“正在准备”。后台未直接查看。Google 官方说明审核通常几天，部分情况 2–4 周。当前没有拒审结论或官方原因，内容问题只能按风险证据评估。

来源 https://support.google.com/adsense/answer/12170222

## 技能依据

本轮完整读取以下入口，使用与本任务有关章节，按内容来源、独有信息、模板变量、准确性和人工增值检查。技能中的通用字数和评分建议未作为 Google 审核规则。

- coreyhaines31/marketingskills，programmatic-seo v2.1.3。查询 main commit 为 1f837447b20bb6f0e72d87b80ece1c221c362c7d。重点章节 Core Principles、Data Requirements、Template Design、Quality Checks。
- AgriciDaniel/claude-seo，seo-content v2.6.1。查询 main commit 为 2e40a5fa6220fc846fcc56d666831fd1315bedc7。重点章节 Who/How/Why、AI Content Assessment、Content Structure。
- 技能入口通过 main 获取，commit 在同轮另行查询，尚未逐文件验证两次请求之间的 commit 一致性。

## 线上对照

对 tgsearch.app 与 tgbox.cc 的 8 组同路径页面直接发起 HTTP 请求，均返回 200。抽取 HTML main 正文，去除标签与 script/style，解码 HTML 实体、移除空白、统一品牌名，保留人数、日期等数值。对唯一连续五字符片段计算本站片段在上游出现的占比。

| 页面 | 本站五字符片段在上游出现的占比 |
| --- | --- |
| 首页 | 21.5% |
| 关于 | 62.9% |
| 找频道指南 | 96.8% |
| 频道群组机器人区别指南 | 94.9% |
| 频道增长指南 | 96.6% |
| Telegram News 详情 | 91.7% |
| Durov 详情 | 79.2% |
| BotFather 详情 | 68.9% |

原始正文见 `evidence/2026-11-15-page-text.json`，方法与双向 Jaccard 指标见 `evidence/2026-11-15-verified-comparison.json`。

限制包括样本只覆盖中文 8 组页面、正文包含公共 UI 及公开 Telegram 消息、简单 HTML 文本提取可能残留部分非阅读内容。数值变化和新增目录条目会降低首页指标。该指标用于定位内容重合，Google 未公布对应审核阈值。首页较低的文本重合不能直接证明新增编辑价值，详情中的共同公共消息也不能单独证明政策违规。

## 源码对照

对上游 d297cdb 和当前工作目录指南 Markdown 去除 frontmatter、统一品牌、按非空正文行做完全相等匹配。

- 找频道指南，中英各 44/48 行沿用，占 91.7%。
- 区别指南，中英各 46/49 行沿用，占 93.9%。
- 增长指南，中英各 48/53 行沿用，占 90.6%。
- SEO 逻辑、Seo 组件、详情页模板与该上游版本相同。模板复用的影响需要与最终内容和新增功能共同判断。

## 简介链路证据

- 主分支收录与刷新从 Telegram profile.description 取得简介。
- `packages/core/src/suggest.ts` 的 Workers AI 输出分类 slug。
- `apps/bot/src/maintenance.ts` 的 Workers AI 翻译已有简介，生成对应语言文本。
- `apps/web/src/lib/seo.ts` 的 entrySummary 拼接条目名称、类型、人数、日期等字段。
- 开放 PR #19 的 `packages/telegram/src/awesome-import.ts` 中 mergeDescription 合并 Telegram 简介与列表说明，包含关系时保留较长文本，否则换行拼接。clef-omni 用于分类和质量判定。核查 PR head 为 2cca5c851e3953714aa9f6416c0b8865e2cf0af9。
- `packages/core/src/refresh.ts` 在原简介变化时写入 description。直接改写此字段存在后续刷新覆盖的可能，需结合数据库更新逻辑继续验证。
- 两站 Telegram News 详情使用同一段生硬的自动翻译。本站该样本显示历史数据正在积累，近期趋势尚无数值，说明设计中的历史信息增值尚未在该样本充分体现。

## 当前判断与后续核验

内容差异度不足已获得线上与源码双重支持，证据最强的是三篇中文指南。简介链路主要保留和翻译外部资料，当前已查看路径未发现原创编辑简介生成器。尚不能将这些问题认定为审核延迟的原因。

下一步扩大不同类别详情、英文页及独有条目样本，检查实际新增信息、翻译准确性、数据更新日期和来源；继续追踪人工编辑、刷新及翻译失效路径。完成后按证据决定哪些内容改写、哪些生成逻辑调整、哪些数据需要补充。网站内容与生产配置当前保持待实施状态。

政策依据要求复制内容增加整理、评论或其他价值，开源许可与发布商审核分别核对。

来源 https://support.google.com/publisherpolicies/answer/11190248
