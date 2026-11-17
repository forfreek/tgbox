# SEO 第一阶段项目记忆

此文件保存已核验事实与决策入口。当前进度查询 [STATE](STATE.md)，执行方案查询 [PLAN](PLAN.md)。

## 工作区基线

- 2026-11-17 工作区为 `C:/Users/123/tgbox`，分支 `cursor/about-drop-awesome-list`，HEAD 为 `6fa6b00`。后续行动须重新检查。
- 审查起点的旧工作区未发现 docs/INDEX.md 或 AGENTS.md。实施基线 origin/main 已包含内容专题索引与 AGENTS，本节点在其上合并 SEO 专题入口。
- 其他工作树中动态迁移、内容审查的历史记录不能替代此处源码和授权状态。

## 已核验事实

- 公开分类与排行使用 D1/R2 快照构建静态 HTML。页面访问复用 Workers Assets，getSiteData 有进程内缓存。
- 分类每页 60 条，成员数和最新排序均有推广优先规则。语言及标签筛选作用于当前页。
- 排行榜各榜最多 50 条，先全站截取，再由客户端筛类型。推广不加权。
- 增长基线为至少 6/27 天前的最近历史点，仅正增长上榜。机器人指标来自月活用户。
- 活跃等级当前仅频道有值，根据频道近期帖文采样及浏览量调整。
- 快照 generatedAt 表示快照时间。D1 stats_written_at 尚未进入公开快照。
- 后台已有分类、标签、状态、推广与刷新能力。当前没有条目人工简介及分类 SEO 正文编辑入口。
- 现有繁体链路主要是简体字典加构建后 OpenCC 转换。新增专题内容须独立本地化。

## 本阶段方案决策

- 采用无 D1 migration 方案，内容配置放在 web 本地化层，事实来自现有 SiteData。
- 简介优化采用已有原文、翻译及确定属性。缺简介时只陈述确定事实。
- 时间展示采用快照时间并明确命名。
- 排行榜默认榜与 JSON-LD 统一选择规则。保持数值算法与 JSON 消费契约。
- 2026-11-17 用户确认实施完整 AI 分类页节点并创建 PR。
- 实施工作树为 C:/Users/123/tgbox-seo-ai，分支 codex/seo-ai-category，基线 origin/main d9cd3d4。原工作区用户修改保留。
- D1 只读导出包含 1930 个公开条目，AI 群组 16 个。R2 网络连接重置，分类验收快照保留真实 D1 属性和头像 URL，明确省略帖子与历史，不用于验证生产增长榜。

## 用户已有修改快照

2026-11-17 git status 已存在以下修改，实施前须重新检查并保留。

- apps/web/src/components/layout/Seo.astro
- apps/web/src/content.config.ts
- apps/web/src/i18n/ui.ts
- apps/web/src/layouts/BaseLayout.astro
- apps/web/src/lib/guides.ts
- apps/web/src/views/GuidePage.astro
- scripts/lib/run.ts
- scripts/seed/seed-list.json
- 未跟踪的 apps/web/src/content/guides/zh/telegram-chinese-language-pack.md，以及三个语言的 help 路由目录。

## 事实来源索引

源码路径和任务映射见 PLAN 的文件表。线上读取来源为 https://tgsearch.app/group/ai/ 与 https://tgsearch.app/rank/，仅为读取时网页工具返回的内容，不代表生产部署版本与本地 HEAD 一致。

## 节点一交付

2026-11-17 已创建 [PR #50](https://github.com/forfreek/tgbox/pull/50)。代码提交 78c4b14 的 Linux CI 通过，本地 web 421 测试、类型检查、三语言两视口筛选与导航检查通过。基线与修改版共有 Edge ViewTransition 中止提示，真实快照验证的 R2 边界见 STATE。当前等待评审，后续恢复先查 STATE 与 PR 最新状态。
