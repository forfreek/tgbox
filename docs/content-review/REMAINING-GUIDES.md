# 剩余两篇指南改写

## 范围与交付

2026-11-15 用户授权继续文案节点。改写频道运营、频道群组机器人区别的中英版本，保留既有 slug 和发布日期，更新日期为 2026-11-15。繁体由既有构建生成。

分支 codex/remaining-guides，基线 c80c8cd。收录指南 PR #42 仍开放且最新 CI 通过，本节点使用依赖该分支的独立堆叠 PR，按顺序合并。

## 技能应用

- coreyhaines31/marketingskills 的 content-strategy v2.1.8，固定 commit 1f837447b20bb6f0e72d87b80ece1c221c362c7d，完整读取入口。使用 Searchable Content 的信息增量检查和任务匹配。仓库查询为 60,378 stars。
- AgriciDaniel/claude-seo 的 seo-content v2.6.1，固定 commit 2e40a5fa6220fc846fcc56d666831fd1315bedc7，完整读取入口及 eeat-framework、eeat-scoring-guide 引用。使用事实与来源核对、短段落、清楚标题、内部链接和更新时间检查。仓库查询为 29,435 stars。
- 本轮按 commit 获取文件。技能中的字数、评分和发布节奏建议按本文任务适用性取用。
- 页面验收使用 frontend-testing-debugging。Browser plugin not available，采用仓库已有 Playwright 与本机 Edge。另查阅 modern-web-guidance 的 html 指南，保留原生链接导航，修复现有构建转换。

检索结果包含上游相同指南、频道群组对比文章和运营 FAQ。常见内容集中在功能定义、人数上限和推广建议。本次增加可直接修改的简介例子、推广前检查步骤，以及经源码核实的本站提交与反馈入口。

## 改写结果

- 频道运营改为写清名称简介、检查公开链接与内容、分享、评论、提交收录和效果检查的步骤。去除搜索字段和排名的绝对断言、固定阅读率阈值、增长曲线判定买粉和自动上榜承诺。
- 区别指南按读资讯、提问讨论、查询提交三个任务说明入口，保留简短场景表。删去普通读者无需掌握的迁移实现和广播群组细节，补充群权限检查、机器人通知与停止方式。
- 本站场景来自 EnrollPage、Bot 帮助和已交付的收录指南，使用站内路径连接目录、收录入口和详细要求。
- 保留用户刚要求删除的收录段落调整。
- 浏览器发现繁体指南正文链接回到简体、目录 fragment 与转换后的标题 ID 不一致。为指南正文添加构建标记，复用 localizePath 转换正文站内链接，片段与标题同步繁体转换，并增加具体回归测试。

## 来源核实

- https://telegram.org/faq_channels ，公开与私密频道、订阅规模、近似阅读计数及转发计数。
- https://telegram.org/faq#q-who-is-telegram-for ，群组用途和规模。
- https://telegram.org/blog/filters-anonymous-admins-comments#channel-comments ，评论与关联讨论群。
- https://telegram.org/faq_spam ，不受欢迎的消息、举报和账号限制。
- https://core.telegram.org/bots ，机器人功能及交互。
- https://core.telegram.org/bots/features#privacy-mode ，私聊与群消息访问权限。
- https://telegram.org/blog/similar-channels ，核实原文“没有推荐”的说法存在遗漏，改写时移除。

## 上游文字复测

按 evidence/2026-11-15-remaining-guides-comparison.json 记录的方法，对照上游 d297cdbc7c10866d024c0575e9e99cd7501ebecd。剔除 frontmatter，统一品牌并去空白，计算本地独有连续五字符片段出现在上游的比例。

| 文章 | 语言 | 修改前 | 修改后 |
| --- | --- | --- | --- |
| 频道运营 | 简中 | 93.8% | 4.9% |
| 三类区别 | 简中 | 94.8% | 6.0% |
| 频道运营 | 英文 | 94.0% | 21.0% |
| 三类区别 | 英文 | 97.1% | 23.2% |

文字重合率用于检查改写覆盖范围。效果验收结合事实准确性、读者操作和页面验证。

## 验证

- Web 405/405 测试通过，类型检查 303 个文件零错误，Biome 与 diff 检查通过。
- 静态构建输出 264 个文件和 46 个繁体页面，使用既有开发数据。
- 本地 http://127.0.0.1:4334 ，Edge 1440×1000 与 390×844。六个指南页面身份和正文正确，框架覆盖层检查通过。
- 六次目录导航定位成功，18 个正文内部链接均返回 200。实际点击运营指南中的提交入口，进入收录页，再进入详细要求指南。
- 手机无横向溢出。四张桌面手机首屏截图保存在系统临时目录并完成检查。
- 既有 ViewTransition 提示出现 2 次，其他页面异常为零。其他浏览器与生产数据尚待发布后复核。
