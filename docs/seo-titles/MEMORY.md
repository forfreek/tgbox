# 标题优化项目记忆

2026-11-21 决策与证据。

- 独立专题来自网站标题与关键词研究。私有报告入口为 https://app.openseo.so/p/a7cf7268-8a2b-4c43-bbac-1f3d7eb03c97/reports/5992d758-20a6-4027-abd0-3543513e9aee 。现有 SEO 第一阶段 AI 分类和排行已交付，本专题单独管理进度。
- 动态 metadata 链路为 scripts/build-site.ts 导出 D1 并生成快照 → packages/snapshot/src/build-site-data.ts 的 stats.total = entries.length → SITE_DATA_PATH → getSiteData() → HomePage 的 homeSeo(locale, data.stats) → 字典 {total} 填充 → Meta Description、OG Description、Organization 与 WebSite JSON-LD。数量随构建发布刷新。
- 当前首页 Title 由字典提供主题，Seo.astro 自动追加站名。节点一保留既有品牌写法 TGsearch，避免把首页节点扩大为全站品牌更名。
- zh-hant 既有机制是渲染后转换最终 HTML。首页关键短语独立提供繁体本地化，需以最终构建验证「搜尋」「貼文」等词仍正确。
- 本节点不需要新增数据接口、数据库迁移或资源。后续分类需要核对机器人月活用户与群组成员，以及推广置顶的排序口径。
- 用户原目录 C:/Users/123/tgbox 仍有既存修改，本节点只在独立工作树提交。
- 市场月搜索量、KD、Trends 时序未验证。提醒为 tgsearch-seo，每周一北京时间 10:00。正式观察窗口随每个 URL 的新版 Google 抓取确定。
- 429 项 web 测试与 311 文件 Astro 检查通过，三语构建断言覆盖动态摘要和 H1。浏览器验证使用开发快照与本地 Pagefind，生产头像与第三方脚本未验证。临时 Windows 静态服务需使用 path.resolve 标准化根路径，否则 startsWith 判断可能把正确文件识别成 404。
- 节点一为 PR #58，源码提交 87f6115。推送采用账户既有的 16814512+forfreek@users.noreply.github.com 提交地址，避免 GitHub 邮箱隐私保护拒绝。易变 CI、合并和发布状态行动前复核。
- 2026-11-21 用户确认将之前讨论的繁体首页几处文字台湾用词化，补充节点从 main b45cdda 开始。仅调整繁体首屏说明、搜索入口、最新收录及动态摘要，沿用独立 zhHant 词条。台湾用语应在文案层维护，避免依赖 OpenCC 字形转换自动完成用词本地化。
- 补充节点 429 项 web 测试、311 文件 Astro 检查与三语桌面/移动端交互通过，最终 HTML 保留动态摘要数量。证据前缀 seo-taiwan，分支 codex/seo-home-taiwan。PR #58 合并与部署流程成功已核验，网页生产状态与 Google 抓取单独确认。
