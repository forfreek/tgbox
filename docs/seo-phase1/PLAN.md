# TGSearch SEO 第一阶段计划

制定于 2026-11-17，AI 分类页节点已获用户确认实施。约束见 [CONSTRAINTS](CONSTRAINTS.md)，实时进度见 [STATE](STATE.md)。

## 一、目标与验收

优化 `/group/ai/`、`/rank/` 及其英文和繁体版本。保持既有筛选与排序正常，核心内容可从 HTML 直接读取，三语言内容真实且自然，条目及统计数据保持兼容，沿用 Cloudflare 发布流程。

## 二、当前能力与缺口

### 架构与 SEO

D1 导出与 R2 媒体历史由 packages/snapshot 生成 SiteData，web 在构建时读快照，Astro output 为 static，公开页由 Workers Assets 提供。getSiteData 和用户名索引在构建进程缓存。Seo.astro 输出 Canonical、hreflang 和社交 metadata，页面输出 ItemList 与面包屑结构化数据。

已有 GitHub Actions 内容变更派发、六小时 dirty 检查、每日强制构建、Pagefind 与发布检查。当前审查未验证生产数据、部署版本和全部语言页面。

### AI 分类页

- 已有成员数及最新排序、分页、当前页语言及标签筛选、详情内链。
- 通用介绍声称包含活跃度等信息，但紧凑卡片主要展示标题和单行简介，群组没有频道活跃分级。
- 页面缺少筛选范围、推广优先说明、AI 专题介绍及相关资源内链。
- 少于 3 条现有策略为 noindex，零条分类不生成路径。维持现有策略并验证边界。

### 排行榜

- 周增长基线为距快照时间至少 6 天的最近历史点，月增长为至少 27 天。当前值减基线，仅保留正增长。
- 增长按绝对增量、增长率、用户名排序。最新按 listedAt 降序、用户名排序。
- 活跃榜筛等级大于 0，按等级、成员数、用户名排序。采集链路仅频道有活跃等级。
- 活跃等级来自近 30 天帖文采样，满页 20 篇且均在窗口内时外推频率，平均浏览量低于 100 时可能降级。
- 各榜全站最多 50 条，类型按钮在该结果内筛选，推广不参与加权。
- 机器人 members 字段来自月活用户，公开说明须区分指标。
- 时间为快照生成时间，现有空榜文案不能覆盖全部真实原因。
- 当前页面默认周榜，JSON-LD 在周榜空时回退最新榜，需要统一选择结果。

### D1 与后台

已有 categories、tags、entries、entry_stats、entry_tags、settings 等表。简介有原文、中英文翻译及翻译尝试时间，entry_stats 有统计写入时间，历史点来自 R2。

后台支持分类标签维护、条目分类标签修改、推广、状态与刷新。当前条目编辑面板无人工简介编辑，分类编辑无专用 SEO 正文。当前阶段复用已有能力，通过页面配置补充三语言专题内容。

## 三、实施步骤

### 节点一 AI 分类页

1. 核验工作区差异，记录六页 metadata、HTML、条目集合和排序基线。检查真实快照来源，显式防止把开发样例当生产数据。
2. 在 web 本地化层建立同形字段的 zh、zh-hant、en 专题内容，分别编写自然表达。新增 AI 专用 metadata 与介绍分支，仅在 group/ai 生效。
3. 复用现有排序和筛选组件，解释当前页筛选与推广优先。最新排序说明随 sort 改变。
4. 为 KindGrid 与 EntryCardCompact 增加可选详情展示参数，AI 分类开启多行简介及已有成员数、语言等属性。保留其他页面默认行为。
5. 简介复用 localizedDescription。空值使用确定属性说明，缺失与零分别处理，不生成推荐或质量判断。
6. 从真实关联标签生成少量 /tag/ 内链。其他 AI 类型分类仅在存在且有内容时展示。链接全部使用 localizePath，避免硬编码语言路径或虚构资源。
7. 完成测试、源码审查、三语言构建与浏览器验证，更新进度与记忆，交付独立 PR。

### 节点二 排行榜

1. 复用现有 buildRankings，提取页面说明所需常量和诊断信息，避免复制算法或改变 RankingsData 消费契约。
2. 输出 HTML 统计摘要和可展开方法说明，包含 50 条上限、正增长、6/27 天基线、同分规则、机器人指标、活跃等级与推广规则。
3. 用 time 元素展示快照生成时间及明确时区，不把 generatedAt 写成各条数据的采集时间。
4. 空榜区分无条目、缺少当前值或基线、无正增长、所选类型未入当前榜。原因基于实际计数，不能仅由榜单为空推断。
5. 无有效 hash 时，周榜有数据选周榜，否则选最新榜。有效显式 hash 保持可访问，默认面板与 ItemList 使用同一选择结果。
6. 保留类型按钮与键盘行为，补充频道、群组、机器人目录的普通 HTML 导航。说明类型筛选针对全站榜内条目。
7. 完成测试、源码审查与三语言验收，更新进度与记忆，交付独立 PR。

## 四、涉及文件与查询入口

所有路径相对仓库根目录，实施时按需读取。

| 路径 | 用途 |
| --- | --- |
| apps/web/src/views/CategoryPage.astro | 分类介绍、AI 分支、相关资源 |
| apps/web/src/components/kind/KindGrid.astro | 可选展示参数传递 |
| apps/web/src/components/EntryCardCompact.astro | AI 卡片可选详情模式 |
| apps/web/src/lib/kind-listing.ts | 复用排序、筛选数据及路径 |
| apps/web/src/views/RankPage.astro | 方法、时间、空态与结构化数据一致性 |
| apps/web/src/lib/rankings.ts | 复用算法、共享参数与诊断 |
| apps/web/src/scripts/rankings.ts | 默认榜与类型筛选交互 |
| apps/web/src/lib/seo.ts | AI 专用 SEO 分支及简介复用 |
| apps/web/src/i18n/ui-seo.ts、ui-rank.ts | metadata 与排行榜本地化 |
| apps/web/src/i18n/ | 按现有风格放置 AI 三语言专题词条，文件名实施时确定 |
| apps/web/src/components/layout/Seo.astro、layouts/BaseLayout.astro | 回归对象，已有用户修改 |
| apps/web/src/lib/hant.ts、apps/web/astro.config.ts | 核验繁体构建后的实际内容 |
| packages/shared/src/rankings.ts、packages/shared/src/ | 排行与 SiteData/EntryView 契约 |
| packages/snapshot/src/build-site-data.ts | 快照过滤与来源核验 |
| packages/db/src/schema.ts、packages/db/migrations/ | D1 模型与历史兼容依据 |
| packages/core/src/entries.ts、refresh.ts | 后台操作与统计更新依据 |
| packages/telegram/src/activity.ts | 活跃等级真实定义 |
| apps/admin/src/features/entries/edit-sheet.tsx、functions/taxonomy.ts | 后台复用能力依据 |
| .github/workflows/build-deploy.yml、apps/web/wrangler.jsonc | 发布与资源成本核验 |

## 五、数据库、兼容性与成本

当前方案不新增 D1 字段，不迁移或回填数据，不新增 Cloudflare 绑定。公开说明采用现有快照时间，相关资源在构建时计算。保持静态资源交付。

如确需新增字段，须先记录技术依赖，采用可空字段或兼容默认值，旧快照缺字段回退，完成读写链路和旧数据测试。生产迁移按明确授权执行。此次方案无需该步骤。

## 六、验证清单

- 运行 pnpm --filter @tgbox/web test、pnpm --filter @tgbox/web typecheck，并根据影响运行 shared 及 snapshot 测试。
- 在现有 seo、rankings、kind-listing、build、hant 测试中按需补充本阶段回归断言。
- 使用真实数据快照经 scripts/build-site.ts 的现有入口构建。执行前读取该脚本参数与环境要求，记录实际命令，避免误触远端写入或部署。
- 解析六个目标 HTML，检查介绍、条目简介、内链、时间、空态、Canonical、互指 hreflang、ItemList 与面包屑。
- 对照基线检查条目集合、数值、排序和 /data/rankings.json 契约。
- 浏览器覆盖当前页语言与标签组合、最新排序、分页、榜单 hash、类型筛选、空结果、键盘及移动端。
- 检查缺简介、缺统计、零值、无历史、无正增长、无活跃条目，以及分类少于 3 条和零条边界。
- 回归非 AI 分类的默认卡片、Pagefind 与既有构建约束。
- 生产三语言与部署验收在获授权发布后进行，记录未完成事项，不以部署成功推断收录或排名提升。

## 七、回滚方案

- 两节点各自独立提交和 PR，使用对应 revert 经现有流程重建发布。
- 发布异常可恢复上一 Workers 版本，同时回退代码以防后续构建再次发布问题版本。
- 无数据库变更，条目及统计由现有链路维护，无需数据库回滚。
- 回滚只针对本任务提交，保留用户原有工作区修改。

## 八、授权记录

2026-11-17 用户确认完成 AI 分类页节点并创建 PR。本节点沿用无数据库迁移方案。排行榜节点与生产发布按后续明确授权推进。

## 九、节点一实际交付映射

- AI 专题介绍与 metadata 在 CategoryPage 和 ui-ai-category 内实现，通用 seo.ts 保持既有逻辑。
- ai-category.ts 从真实条目关联计算标签及其他类型的 AI 分类链接，最多 8 个标签。
- KindGrid 与 EntryCardCompact 的 detailed 可选参数仅由 AI 群组分类开启，展示多行简介、真实成员数与检测语言。
- 为英文移动端筛选增加受限宽度的滚动容器，保留既有 hash 筛选脚本。
- 新增 ai-category.test.ts 并扩展现有 build.test.ts，具体结果见 STATE。
- 本节点文档、索引与实现一并通过独立 PR 交付。
