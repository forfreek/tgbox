# TGbox Cloudflare 原生动态化实施计划

> - 状态：Phase 0 已完成，Phase 1 数据读取层实施中
> - 当前阶段：Phase 1（实施中，独立堆叠 PR）
> - 基线：`main@c087f77e61f4cabf746cf6da9b8a6e9170f64d45`
> - 更新日期：2026-11-12

本文固化已完成的源码分析结论，用于分阶段实施，不替代阶段内的测量和验证。标为
`待验证` 的设计不得直接视为强制实现。所有生产操作都需要单独、明确的人工确认。

## 1. 当前架构与最终目标

### 1.1 当前数据与发布链路

当前 Bot、Admin、Mini App 已经直接写入同一个 D1；公开网站并不直接读取这些更新，而是经过
GitHub 内容构建：

```text
Bot / Admin / 定时刷新 / 推广与设置变更
                    │
                    ▼
                   D1
                    │ markDirtyAndDispatch()
                    ▼
GitHub repository_dispatch: content-changed
                    │
                    ▼
D1 export → site-data.json → Astro 静态构建 → Pagefind → wrangler deploy
```

主要依赖如下：

- `apps/web/src/lib/site-data.ts` 的 `getSiteData()` 在构建期通过 `node:fs` 读取完整快照，并以模块级变量缓存；详情、分类、标签、排行、首页和公共布局均从该全量对象筛选。
- `scripts/build-site.ts` 负责远端 D1 导出、`@tgbox/snapshot` 生成静态快照、Astro 构建及 Pagefind 索引生成。
- `.github/workflows/build-deploy.yml` 响应代码 push、`content-changed`、每 6 小时检查和每日强制构建；构建后清理 `site_state.dirty_since`。
- `packages/core/src/build.ts` 负责 dirty 标记、GitHub dispatch、节流、失败兜底和手动构建；条目、审核、分类标签、推广、设置、友链、刷新和帖子隐藏流程均可能调用它。
- `apps/web/scripts/pagefind.ts`、`apps/web/src/lib/pagefind.ts`、`SearchDialog.tsx` 和 Mini App 的 `browse.tsx` 共同构成构建期搜索依赖。
- `apps/web/astro.config.ts` 将 `/zh-hant/` 的 HTML/JSON 在构建结束后由简体转换为繁体；SSR 请求不会经过该转换步骤。
- `/data/app-*.json`、`/data/rankings.json`、随机池和 `/data/entries.json` 都来自构建快照。Bot 日报读取静态排行 JSON，Mini App 读取静态数据并使用 Pagefind。
- `BaseLayout.astro`、`Footer.astro` 等公共组件还从快照读取公告、推广、友情链接及当前伪“热门词”，使部分内容页也间接依赖内容构建。
- 详情页的帖子与成员历史存于 R2；快照生成过程还应用 `hide_posts`、`hidden_posts`、关键词和媒体隐藏规则，并计算相关推荐与增长排行。
- 可选的 awesome-list dispatch 和公开 `/data/entries.json` 是外部兼容依赖，不能在切换时被意外删除。

### 1.2 最终目标

- 收录内容新增、审核、修改、下架、恢复和删除后直接以 D1 为权威状态供网站读取，不再触发 GitHub 内容构建。
- Astro 采用静态资源与按需 SSR 混合方式，保留现有 URL、多语言、canonical、hreflang、SEO、Sitemap 和公开 JSON 契约。
- 公共网站与 Mini App 使用 D1 实时搜索；输入过程不计入搜索统计。
- 最近 7 天热门搜索按 15 分钟窗口在 D1 聚合，复用现有 Cron 生成 Top 10 并写入 KV；KV 故障不影响正常搜索。
- GitHub Actions 继续承担代码检查和代码部署，移除的仅是“内容变化触发整站构建”的职责。
- 删除、下架和隐藏状态在新请求中由 D1 实时校验；任何派生缓存失效都不能成为撤回内容的唯一保障。

## 2. 分阶段实施任务

阶段必须按依赖推进。允许根据测量结果调整单个阶段的技术方案，但不得跳过验收后整体切换。
每个可验收交付节点必须完成与变更范围相称的基础代码测试和源码审查，以独立 PR 交付，
注明对应计划任务和必要依赖，并同步更新本计划与项目记忆。有依赖的节点使用堆叠 PR，
后续节点另开 PR。阶段完成后补充整阶段验收。浏览器截图、人工点验或仅验证文档格式不能替代基础代码测试。

### Phase 0：基线检查与兼容性记录

- 状态：已完成（验收证据见 `docs/plans/cloudflare-dynamic-phase-0-baseline.md`）
- 前置依赖：本计划已评审；可用的本地/预发布隔离环境。
- 涉及模块：`apps/web/src/pages`、`apps/web/src/views`、`apps/web/src/lib`、
  `packages/snapshot`、`apps/bot/src/digest.ts`、`.github/workflows`、各 Worker 的
  `wrangler.jsonc`。
- 验收条件：形成可复现的 URL、响应、SEO、排序、数据契约和资源使用基线；未改生产状态。
- 测试要求：运行与阶段范围相称的类型检查、单元/集成测试和源码审查，保存可复现证据；
  浏览器截图或人工点验不能替代基础代码测试。生产读取仍需事先授权。
- 回滚方法：本阶段只新增记录和规则；撤回该阶段文档变更即可。

- [x] P0-1 记录三种语言的首页、类型、分类、标签、详情、排行、随机页及分页 URL 样本。
- [x] P0-2 记录 canonical、hreflang、x-default、robots、JSON-LD、noindex 和 404 行为。
- [x] P0-3 固化 `/data/*.json`、Sitemap、Bot 日报和 Mini App 数据契约样本。
- [x] P0-4 记录 `getSiteData()`、snapshot、Pagefind、繁体转换及 GitHub dispatch 的调用图。
- [x] P0-5 核对所有公开状态变化入口，包括自动失效、推广过期、帖子隐藏和翻译更新。
- [x] P0-6 在等价固定样本中记录条目数、标签规模和分页边界；生产读取未获授权且未执行，真实成本保留为 Phase 1 前置验证。
- [x] P0-7 建立阶段验收表，明确动态结果与当前静态结果允许存在的时间差异。

### Phase 1：D1 动态数据访问层与必要索引

- 状态：实施中；P1-2/P1-3/P1-4 实现与 P1-5 设计验证已完成，见 `docs/plans/cloudflare-dynamic-phase-1.md`。
- 前置依赖：Phase 0 验收完成；目标查询及真实或等价数据规模已记录。
- 涉及模块：`packages/db/src/schema.ts`、`packages/db/src/access.ts`、新增公共读取模块、
  `packages/db/migrations`、`packages/core` 写入路径、测试数据库夹具。
- 验收条件：所有页面所需数据均有带边界的定向查询；SSR 不加载全量目录；下架状态在每个公开查询中生效。
- 测试要求：DB 单元/集成测试、并发写入测试、`EXPLAIN QUERY PLAN` 和 D1
  rows-read/rows-written 对照。
- 回滚方法：保持旧快照读取与旧表可用；新表/索引采用增量迁移，应用回退时停止双写，不立即删除结构。

- [x] P1-1 定义请求级公共 DTO 和条目、分类、标签、首页、排行、推广、设置的查询边界。契约及实现缺口见 `docs/plans/cloudflare-dynamic-contracts.md`，后续接入逐项验收。
- [x] P1-2 实现按 username 的公开详情查询，并统一强制 `status = 'approved'`。
- [x] P1-3 实现类型、分类、标签的成员数/最新排序查询及每页 60 条的稳定分页。推广排序、数字页锚点及准备状态见 `docs/plans/cloudflare-dynamic-pagination.md`。
- [x] P1-4 实现首页统计、分类/标签计数、推广、公告和友情链接的有界读取。
- [x] P1-5 设计排行所需的 D1 投影或有界计算；R2 历史迁移方案标记为待验证后再定。设计与 SQL 原型证据见 `docs/plans/cloudflare-dynamic-rankings-design.md`。
- [ ] P1-6 为每条目标 SQL 记录查询计划；仅添加有性能依据且写放大可接受的索引。同步记录缓存键、数据依赖、权威状态校验成本和读写预算，验证内容写入与缓存失效的并发顺序。
  - 缓存时间/并发子节点与已验证SQL族清单见 `docs/plans/cloudflare-dynamic-cache-validation.md`，完整SQL与生产规模成本继续验收。
  - 首页统计、taxonomy、设置和推广SQL证据见 `docs/plans/cloudflare-dynamic-operations-cost.md`，推广稀疏有效候选扫描问题继续待解决。
- [ ] P1-7 覆盖新增、审核、编辑、下架、恢复、分类标签、翻译、推广和隐藏操作的索引/投影同步。
- [ ] P1-8 实现迁移回填脚本的分批、幂等、可续跑和结果校验，但不在未授权时执行生产 migration。

### Phase 2：Astro SSR 页面迁移、多语言与 SEO

- 状态：未开始
- 前置依赖：Phase 1 读取层和状态门禁验收完成；繁体方案完成 Worker 运行时验证。
- 涉及模块：`apps/web/astro.config.ts`、`apps/web/wrangler.jsonc`、`src/pages`、
  `src/views`、`src/layouts`、`src/components`、`src/i18n`、`packages/hant`。
- 验收条件：数据页面直接读取 D1；静态页面边界明确；现有 URL 与 SEO 输出对照通过；下架条目不再展示。
- 测试要求：Cloudflare Workers 运行时集成测试、三语言页面快照、SEO/状态码 E2E、冷启动与 CPU 测量。
- 回滚方法：通过阶段开关恢复旧静态读路径；保留旧构建产物和页面实现，回滚不得恢复已下架内容的公开访问。

- [ ] P2-1 将默认输出与逐路由 prerender 规则写成明确边界，并验证当前 Astro/Cloudflare adapter 版本行为。
- [ ] P2-2 迁移首页、类型、分类、标签、标签索引和详情页到按需 SSR。
- [ ] P2-3 迁移排行、友情链接、广告、收录说明及其他读取运营数据的页面。
- [ ] P2-4 将随机页和 Mini App 保留为静态外壳，改用动态有界数据接口。
- [ ] P2-5 让公共布局的公告、推广、友情链接和热门词脱离 `getSiteData()`。
- [ ] P2-6 保持原分页路径、排序语义、404/noindex 行为以及 canonical/hreflang/x-default。
- [ ] P2-7 实现并验证繁体动态字段转换/投影，禁止转换 username、URL、slug、payload 和外部链接。
- [ ] P2-8 迁移动态 Sitemap 和公开 JSON 的读取来源，保持现有 URL 与响应结构。
- [ ] P2-9 验证 Worker assets 路由不会让旧静态 HTML/JSON 抢先于 SSR 响应；在切换前完成基础内容缓存及下架一致性验收，记录命中/未命中的 D1 查询次数、rows-read、延迟、CPU 和失效失败处理。

### Phase 3：D1 实时搜索，替换公共网站和 Mini App 的 Pagefind

- 状态：未开始
- 前置依赖：Phase 1 公共读取层可用；Phase 2 至少完成详情 URL 和公开状态门禁。
- 涉及模块：`packages/db` FTS/搜索访问层、`apps/web/src/lib/search.ts`、
  `SearchDialog.tsx`、Mini App `browse.tsx`、动态搜索 API、Pagefind 相关测试。
- 验收条件：新增或更新条目无需构建即可搜索；公共网站与 Mini App 行为兼容；下架项绝不返回。
- 测试要求：中英简繁、username、短词、转义、过滤、并发更新、分页、限流和查询成本测试。
- 回滚方法：阶段开关可恢复 Pagefind 客户端；新 FTS/投影继续双写，旧索引和依赖暂不删除。

- [ ] P3-1 评估现有 `entries_fts` 的字段、trigram、同步覆盖和公共搜索排序是否可安全复用。
- [ ] P3-2 定义统一规范化、敏感输入长度、FTS 转义、候选上限和稳定分页规则。
- [ ] P3-3 扩展或新增版本化搜索投影，覆盖标题、username、标签及允许公开的简介/翻译字段。
- [ ] P3-4 验证中文一至二字查询策略；禁止以无索引全表 `%LIKE%` 作为正式方案。
- [ ] P3-5 实现公共搜索 API，最终 JOIN 权威 entries 状态并施加结果与成本上限。
- [ ] P3-6 替换网站搜索框的 Pagefind 调用，保持快捷键、分类标签和可访问性行为。
- [ ] P3-7 替换 Mini App 浏览搜索，并验证现有提交、推广和详情跳转行为不变。
- [ ] P3-8 对新增、编辑、标签改名、翻译、下架、恢复和删除执行即时可搜索验收。
- [ ] P3-9 灰度观察错误率和查询成本；Pagefind 只在阶段验收后进入待清理状态。

### Phase 4：真实热门搜索统计、D1 聚合、KV 缓存和 Cron

- 状态：未开始
- 前置依赖：Phase 3 搜索 API 已稳定；隐私、限流和有效事件规则已评审。
- 涉及模块：D1 schema/migrations、搜索事件 API、`SearchDialog.tsx`、Bot scheduled handler、
  Web/Bot `wrangler.jsonc`、Worker 类型和测试。
- 验收条件：只记录有效搜索；最近 7 天 Top 10 每 15 分钟刷新；KV 故障不影响搜索。
- 测试要求：去重竞态、限流、隐私过滤、重复 Cron、时间窗口、KV 超时/旧值/不可用及清理任务测试。
- 回滚方法：关闭统计写入和热门词展示；搜索 API 独立运行；D1 最新成功榜单可作为 KV 降级源。

- [ ] P4-1 定义有效事件：输入/预取/翻页不计数，显式提交或首次结果选择才可计数。
- [ ] P4-2 定义规范化、每日轮换匿名摘要、最小主体阈值、敏感内容过滤和数据保留期。
- [ ] P4-3 设计搜索词、去重、限流、15 分钟桶和榜单快照表，并记录索引成本。
- [ ] P4-4 实现防抖、请求取消和一次性事件 ID，避免 Enter 与结果点击重复计数。
- [ ] P4-5 用 D1 原子批处理实现去重、限流和桶计数，避免先查后写的并发重复。
- [ ] P4-6 复用 Bot Cron，在整 15 分钟执行最近 7 天 Top 10 聚合，并防止重复任务覆盖新榜单。
- [ ] P4-7 创建并绑定共享 KV namespace；该生产资源操作必须先取得明确人工确认。
- [ ] P4-8 实现热门词 API 的 `KV → D1 最新快照 → 空榜单` 降级，搜索 API 不依赖 KV。
- [ ] P4-9 分批清理短期事件、匿名摘要、限流桶和过期聚合桶，并记录 rows-written 预算。

### Phase 5：取消 GitHub 内容构建依赖，保留代码部署

- 状态：未开始
- 前置依赖：Phase 2 至 Phase 4 全部验收；至少完成一次完整回滚演练；兼容消费者已确认。
- 涉及模块：`packages/core/src/build.ts` 及调用方、Admin 构建面板、Bot maintenance、
  `.github/workflows/build-deploy.yml`、`scripts/build-site.ts`、Pagefind/snapshot 工具与文档。
- 验收条件：任何内容变化都不产生 GitHub Actions；代码 push 仍完成检查和部署；兼容接口正常。
- 测试要求：内容全链路、代码部署、部署 smoke、Bot Cron/日报、Mini App、公开 JSON 和 Sitemap 回归。
- 回滚方法：保留一个兼容当前 D1 schema 的已验证 Worker 版本；不得以可能暴露已下架内容的旧静态站作为常规回滚。

- [ ] P5-1 盘点并证明所有 `markDirtyAndDispatch()`、`dispatchStaleBuild()` 和 `triggerBuild()` 调用已有替代链路。
- [ ] P5-2 移除内容 `repository_dispatch`、dirty 检查/清理和内容定时强制构建。
- [ ] P5-3 保留并验证代码 push、CI、手动代码部署、部署并发控制和动态 smoke-check。
- [ ] P5-4 移除 Bot/Admin 的内容构建派发逻辑、手动构建 UI 和对应 GitHub token 配置。
- [ ] P5-5 验证 Bot 日报、Sitemap、公开 JSON 和 awesome-list 兼容链路不再依赖内容构建。
- [ ] P5-6 在 Pagefind 与旧快照读取零流量并完成回归后，单独提交删除依赖和脚本的变更。
- [ ] P5-7 更新 README 和运维说明，明确代码部署与内容更新的不同路径。

### Phase 6：根据实际性能数据优化缓存与查询

- 状态：未开始
- 前置依赖：Phase 5 稳定运行并具备足够观测样本。
- 涉及模块：Web 公共读取层、D1 查询/索引、可选 Workers Cache/KV 热门词、监控与测试。
- 验收条件：优化由实际瓶颈驱动；缓存不削弱下架一致性；D1 和 Worker 成本符合 Paid 资源预算。
- 测试要求：缓存命中/穿透、revision 竞态、过期推广、删除下架、故障注入和负载基准。
- 回滚方法：每项优化带独立开关；关闭缓存后直接回到已验收的 D1 定向查询路径。

- [ ] P6-1 收集每条热点查询的延迟、rows-read/rows-written、Worker CPU 和请求量。
- [ ] P6-2 仅针对已确认瓶颈调整 SQL、索引、投影或分页锚点，并复测写放大。
- [ ] P6-3 验证 `content_revision` 或等效版本缓存方案的原子性与竞态处理，再决定是否实施。
- [ ] P6-4 验证推广自然过期、设置变化和内容下架在缓存命中时仍满足公开状态要求。
- [ ] P6-5 为缓存和 D1 故障建立明确的 503/降级边界，禁止用陈旧内容掩盖权威状态不可用。
- [ ] P6-6 记录优化前后数据、保留或撤销结论，并更新本计划的最终验收记录。

## 3. 关键技术决策

| 决策 | 结论与原因 | 状态 |
|---|---|---|
| SSR/静态边界 | 首页、类型、分类、标签、详情、排行及内容 Sitemap 使用按需 SSR；指南、隐私、关于、固定资源等不依赖收录数据的页面保持静态。随机页和 Mini App 可保留静态外壳，数据动态获取。 | 已确定，具体 Astro 配置待版本验证 |
| D1 查询与索引 | 页面读取使用有界定向 SQL、稳定排序与分页，禁止请求内构造完整 `SiteData`。新增复合索引必须以目标 SQL、查询计划和写放大数据为依据。 | 已确定 |
| 现有 FTS 复用 | 现有 trigram `entries_fts` 可作为起点，但字段覆盖、短中文词、公共排序和所有写入同步尚不足；先评估扩展或版本化新索引。 | 待验证 |
| 短词搜索 | 正式方案不得退回无索引的全目录 `%LIKE%`；bigram 投影、精确前缀或其他受控方案需要按规模测量后选择。 | 待验证 |
| 繁体中文 | 静态构建后的整页 OpenCC 转换不能直接套用到 SSR。优先验证写入时生成动态字段繁体投影；必须测量 Worker 包体、初始化 CPU 和转换正确性。 | 待验证 |
| 有效搜索事件 | 只有显式提交或首次选择搜索结果可以计数；输入防抖、建议、预取、翻页和程序重试不计数，同一事件 ID 只能成功一次。 | 已确定 |
| 搜索隐私 | 仅保存规范化词与必要的轮换匿名摘要；原始 IP 不落库；敏感文本可搜索但不统计、不公开；配合去重、速率限制和最小匿名主体阈值。 | 原则已确定，阈值待验证 |
| KV 用途 | KV 只缓存最近 7 天 Top 10 等允许最终一致性的派生数据；每 15 分钟由现有 Cron 刷新。读取失败回退 D1 最新成功快照，再回退空榜单，绝不影响搜索。 | 已确定 |
| 内容缓存 | Phase 1 设计数据依赖与失效协议，Phase 2 切换前验证基础缓存和读写成本；Phase 6 根据运行数据进一步优化。Workers Cache 或版本化结果缓存的具体选择以运行时和一致性测试为依据，KV 只承载允许最终一致性的数据。 | 阶段安排已确定，具体机制待验证 |
| 下架与删除 | 所有公开查询最终检查 D1 状态；新请求不能因旧搜索投影、随机池、排行或缓存继续展示下架项。D1 权威状态不可用时不得用陈旧内容伪装成功。 | 已确定 |
| Sitemap | 保留现有 URL、三语言 alternate 和准确 lastmod；使用覆盖索引与 keyset 分批生成。是否需要进一步分片取决于生产规模。 | 兼容原则已确定，分片待验证 |
| 公开 JSON | 保留 `/data/entries.json` 及现有本地化兼容接口。完整导出不可避免枚举公开数据，应使用受控、版本化生成并避免扫描私有业务表。 | 已确定，生成策略待验证 |
| Bot 日报 | 继续使用相同排行口径，改为动态排行接口或共享查询层；不能继续依赖每日强制网站构建。 | 已确定，调用方式待验证 |
| Mini App | 保留浏览、提交、推广、详情跳转和认证行为；仅替换 Pagefind 与静态 JSON 数据来源。 | 已确定 |
| GitHub Actions | 保留 CI、代码 push 和手动代码部署；仅在动态链路全量验收后删除内容 dispatch、dirty 构建、每日强制构建和 Pagefind smoke。 | 已确定 |

## 4. 部署与资源约束

### 首次动态切换前的缓存验收

- Phase 1 为首页、列表、详情、排行、Sitemap 和公开 JSON 分别记录缓存范围、键、过期条件、
  语言/分页/排序维度及写入后的失效依赖，公共搜索在 Phase 3 补充相同记录。
- Phase 2 用重复访问与内容变更测试证明缓存能够减少 D1 查询次数或 rows-read，并记录实际收益。
  每次请求若仍需 D1 版本或公开状态校验，必须将这些查询计入成本。
- 删除、下架、隐藏、恢复及推广自然过期必须覆盖缓存命中、并发回填、跨地区请求和失效失败场景。
  直接缓存整页前须证明公开状态校验仍然生效。具体实现保持待验证。
- 缓存故障采用有界 D1 回源或明确错误响应。权威状态不可确认时遵循既有下架保障。
  TTL 单独过期方案不能承担即时撤回职责。
- 记录缓存收益与一致性约束的取舍。只有证明缓存协议满足撤回要求后，才能宣称命中请求可以完全免查 D1。

| 阶段 | D1 migration | KV/Binding | Worker 配置 | Cron | GitHub Actions | 生产操作与确认 |
|---|---|---|---|---|---|---|
| Phase 0 | 否 | 否 | 否 | 否 | 否 | 默认只读；任何生产指标读取也需确认权限与范围 |
| Phase 1 | 预计需要 | 否 | 可能需要类型/开关 | 否 | 否 | 生产 migration、回填和双写启用均需逐项人工确认 |
| Phase 2 | 依赖 Phase 1 | 否 | 需要 Web SSR/assets 路由变更 | 否 | 暂不修改内容触发 | 预发布验证后，生产 Worker 部署需人工确认 |
| Phase 3 | 预计需要 | 否 | 需要搜索开关/API 路由 | 否 | 暂不删除 Pagefind | 生产索引回填、灰度与部署需人工确认 |
| Phase 4 | 需要 | 需要共享 KV namespace 与 Web/Bot binding | 需要 Web/Bot 配置与 secret | 复用现有 Cron，可能调整 handler，不默认新增 Worker | 否 | 创建 KV、修改绑定、执行 migration、调整生产 Cron/部署均需人工确认 |
| Phase 5 | 不应新增破坏性 migration | 保留热门词 KV | 移除 GitHub dispatch 配置 | 保留业务 Cron | 修改，保留代码部署 | 生产切换和密钥清理需人工确认；先完成回滚演练 |
| Phase 6 | 仅有数据证明时 | 不扩展 KV 权威范围 | 可能增加缓存开关 | 通常不变 | 通常不变 | 所有生产缓存、索引和资源调整逐项确认 |

实施时遵守以下资源边界：

- 复用现有 `tgbox-web`、`tgbox-bot`、`tgbox-admin` 和同一个 D1/R2；不新增不必要的 Worker。
- 不引入 VPS、Docker、Durable Objects 或外部数据库。
- KV 预计只新增一个共享 namespace，用于热门词等派生缓存；创建前必须获得明确授权。
- 所有 migration 必须先在本地和隔离预发布环境运行，具有回填校验和应用回滚路径。
- 禁止在未授权情况下运行 `wrangler d1 migrations apply ... --remote`、修改生产 binding、Cron、secret、DNS 或执行 `wrangler deploy`。

## 5. 进度维护机制

后续每完成一个阶段，必须在同一 PR 或紧随其后的状态更新中同步维护本节和对应 checklist。

### 当前阶段

- Phase 1：P1-2/P1-3/P1-4 实现及 P1-5 设计验证完成，其他节点与整阶段验收继续跟踪。

### 已完成事项

- 已完成源码级架构分析。
- 已固化迁移开发规则和分阶段计划。
- 已完成 Phase 0 的 URL、SEO、公开数据、构建调用链、状态入口、等价规模和允许差异基线。
- 已运行基础代码测试并记录 Windows 测试可移植性问题；详细结果见 Phase 0 基线文档。
- Phase 1 已实现公开详情、成员数/标签基础分页、投影计数和首页运营读取，以及版本化缓存协议与分批回填基础。
- P1-5 排行投影与 R2 历史设计验证完成；候选 SQL 在本地 D1 验证，生产实现及待验证决策继续按后续节点验收。

### 未完成事项

- Phase 1 至 Phase 6 的实施和验收任务。
- 生产资源、数据规模及真实查询成本核验。

### 阻塞问题

- 尚未建立隔离预发布 D1/KV 资源及明确的测试数据规模。
- 繁体运行时/写入时转换、短中文词搜索、增长排行投影和内容缓存方案尚待测量。
- Mini App 所引用的 `.scratch/miniapp-contract.md` 未纳入版本控制，正式替换数据源前需补齐可审查契约。
- Windows 本地测试存在 CRLF 生成文件比较及 `node_modules/.bin/astro` 路径可移植性问题；
  不阻塞文档基线，但不能在后续代码阶段忽略。

### 关键决策记录

| 日期 | 决策 | 依据 | 影响 |
|---|---|---|---|
| 2026-11-12 | D1 作为公开收录数据唯一权威来源，KV 只缓存允许最终一致性的派生数据 | 当前 Bot/Admin 已直接写 D1；下架一致性不能由 KV TTL 保证 | 所有公开查询最终校验 D1 状态 |
| 2026-11-12 | 分阶段替换快照、SSR、搜索、统计，最后删除内容构建 | Pagefind、繁体、Mini App、日报和公开 JSON 存在隐藏构建依赖 | 禁止一次性整体切换 |
| 2026-11-12 | GitHub 继续用于代码检查与部署 | 目标只取消内容变化触发的构建 | Phase 5 不能删除代码部署链路 |
| 2026-11-12 | 每阶段以基础代码测试、源码审查、独立 PR 和项目记忆更新作为完成门禁 | 防止一次性切换和只做表面验证 | 后续阶段必须附测试与审查证据 |
| 2026-11-12 | Phase 0 不读取生产数据，使用 61 条固定夹具记录等价分页与状态样本 | 未获得生产只读授权，且基线必须可复现 | Phase 1 索引前仍需隔离环境查询计划和成本数据 |
| 2026-11-12 | 基础内容缓存前移到 Phase 1 设计、Phase 2 切换验收 | 用户指出原计划将缓存安排到 Phase 6，首次 SSR 切换的 D1 访问控制不足 | 首次切换需提供缓存收益、失效与公开状态一致性测试，具体机制待验证 |
| 2026-11-12 | 每个可验收交付节点独立 PR，依赖通过堆叠 PR 表达 | 用户明确要求节点级 PR | 第一批拆为 PR #24，第二批 PR #23 以 #24 分支为 base，后续节点另开 PR |

### 测试与验收记录

| 阶段 | 日期 | 提交/PR | 测试结果 | 验收人 | 结论 |
|---|---|---|---|---|---|
| 规划 | 2026-11-12 | `b8657e6` / PR #21 | 文档检查与 GitHub CI 通过 | PR 审查中 | 规划已固化 |
| Phase 0 | 2026-11-12 | PR #22 | typecheck 通过；Bot 156/156；其余包通过数与 Windows 环境阻塞见基线；Linux CI 通过 | 待确认 | 阶段完成，待 PR 审查合并 |
| Phase 1 第一批 | 2026-11-12 | PR #24（P1-2） | DB 78/78；全仓 typecheck 通过；真实查询 SQL 的 EXPLAIN 索引检查通过 | 待确认 | 公开详情与最新分页完成，全阶段实施中 |
| Phase 1 第二批 | 2026-11-12 | PR #23 | DB 86/86；1000 条稀疏标签样本业务查询 rows-read 从 1003 降为 4；全仓 typecheck 通过 | 待确认 | 首页运营读取完成，投影/缓存与回填基础已实现，完整阶段继续验收 |
| P1-5 | 2026-11-12 | PR #25，依赖 #23 | DB 90/90；排行原型 4/4；既有排行测试 13/13；typecheck 9/9；四榜在 1000 个候选下均读取 100 行 | 待确认 | 设计与原型验证完成，R2 镜像顺序等按待验证方案跟踪 |
| P1-3 | 2026-11-12 | #26，承接 #25 | DB 99/99；页码 9/9；分类排序 8/8；迁移 1/1；typecheck 9/9 | 源码审查完成，CI 以 PR checks 为准 | 数据访问层完成，HTTP 接入和准备编排由 Phase 2/P1-7 验收 |
| P1-1 | 2026-11-12 | 独立分支 codex/cloudflare-p1-1-contracts，承接 #26 | DB 100/100；typecheck 9/9；字段精确白名单测试通过 | 源码审查完成，CI 以 PR checks 为准 | 完成契约定义，online、详情推广、R2过滤与相关推荐等实现缺口按契约后续验收 |
| P1-6 缓存子节点 | 2026-11-12 | 独立分支 codex/cloudflare-p1-6-cache，承接 #27 | DB 103/103；typecheck 9/9；命中2 SQL/12 rows-read，详情回源4 SQL/16 rows-read | 源码审查完成，CI以PR checks为准 | 时间和并发失效子任务完成，P1-6整项继续待验收 |
| P1-6 运营查询子节点 | 2026-11-12 | 独立分支 codex/cloudflare-p1-6-operations，承接 #28 | DB 108/108；运营查询5/5；typecheck9/9；同结束时间推广续页180降至121 rows-read | 源码审查完成，CI以PR checks为准 | 首页/分类标签/设置/推广SQL证据完成，稀疏有效推广候选扫描待解决 |

当前 PR 依赖顺序为 #21 → #22 → #24 → #23。PR #24 包含第一批提交 `d55b5af`，
PR #23 的 base 为 `codex/cloudflare-phase-1-detail`，仅审查第二批及规则/进度更新。
第二批对应 P1-4 及排序、缓存、回填的前置基础，其余任务继续按 checklist 跟踪。
P1-5 通过 PR #25 的独立分支 `codex/cloudflare-p1-5-rankings` 交付，依赖 #23 的 `codex/cloudflare-phase-1` 分支。

### 下一步行动

1. 按依赖顺序审查各节点 PR，结合用户安排合并。
2. 按 P1-1 契约继续 P1-6/P1-7/P1-8 的查询成本、任务同步和完整回填验收。
3. 明确 Mini App 契约落库方式和 Windows 测试可移植性问题的处理批次。
4. 按 Phase 1 实施记录继续剩余任务，生产 D1 migration 和 Cloudflare 资源操作逐项确认。

### 阶段任务统计

| 阶段 | 任务数 | 完成数 |
|---|---:|---:|
| Phase 0 | 7 | 7 |
| Phase 1 | 8 | 5 |
| Phase 2 | 9 | 0 |
| Phase 3 | 9 | 0 |
| Phase 4 | 9 | 0 |
| Phase 5 | 7 | 0 |
| Phase 6 | 6 | 0 |
| 合计 | 55 | 12 |
