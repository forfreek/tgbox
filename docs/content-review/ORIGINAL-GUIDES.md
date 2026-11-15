# 两篇原创指南

## 用户范围与选题

2026-11-15 用户在公共文案节点完成后，要求新增一到两篇本站自有文章。本节点选择两篇操作型指南，依据本站实现和已核对的 Telegram 官方资料编写中英内容，繁体通过现有构建生成。

| 文章 | 新增内容 | 路径 |
| --- | --- | --- |
| 读懂 Telegram 成员数、涨幅和活跃度 | 字段用途、增加量与增长率演算、采样窗口、缺失历史和复查表 | /guides/read-telegram-directory-data/ |
| 怎样核对 Telegram 机器人入口与启动结果 | 身份记录、启动参数、本站提交流程示例、试用记录、使用条件与反馈 | /guides/check-telegram-bot-links/ |

两篇英文分别位于 /en/ 对应路径，繁体位于 /zh-hant/ 对应路径。选题由本轮按本站已有字段和入口选择。数字演算明确采用假设数据，文中没有声称未经执行的真实试用。

## 事实依据

- apps/web/src/lib/detail-trend.ts 的 memberDelta 使用最新历史采样作为终点，再找相应周期边界之前的采样作为起点。没有足够早的采样时返回 null。
- DetailPage.astro 按条目类型使用订阅、成员或机器人月活标签，缺失字段与消息预览按现有数据呈现。
- packages/shared/src/telegram-links.ts 保留已审核的 bot start 参数，apps/bot/src/bot/start-help.ts 将 start=submit 接入提交流程。
- 频道阅读计数依据 https://telegram.org/faq_channels 。
- 机器人深链接依据 https://core.telegram.org/bots/features#deep-linking 。
- 机器人数据可见范围和使用说明依据 https://telegram.org/faq#q-are-bots-safe 。

## 内容方法

沿用 content-strategy 的信息增量要求和 seo-content 的来源核对方法，先解释读者能够完成的任务，再给出演算与记录模板。文章使用独立标题、描述、FAQ 与本地化站内链接，通过既有指南入口发布。

## 集成验证

- 新增 4 个中英 Markdown 文件，slug 配对，发布与更新日期均为 2026-11-15。
- 更新原有指南列表顺序断言，让两篇新文章列于旧文章之前。
- 扩展 canonical、hreflang、Sitemap、FAQ 与正文示例回归，保留全站内部链接检查。
- Web 测试 403 项通过，本地 Windows 采用 15 秒单项超时。
- Astro 类型检查 303 个文件，0 errors、0 warnings、0 hints。
- 独立构建首轮曾因并行 Astro 任务共享 .astro 临时文件而失败，后续验证串行执行。最终构建和浏览器结果记录于 STATE，远端 CI 以 PR 最新提交为准。
- 串行构建通过，共 267 个静态文件、47 页繁体转换。Playwright Edge 检查新增的 6 个三语言页面及目录导航，手机 390px 页面无横向溢出。无应用错误，浏览器有已记录的偶发转场提示。

## 交付边界

构建与页面验证使用开发数据，机器人流程示例通过源码和已有测试核对。真实 Telegram 对话及生产全量数据仍需在相应验证环境观察。后续继续按 COPY-PLAN 处理既有指南和批量页面文案。
