# Cloudflare 动态化 Phase 0 基线与源码审查

> - 基线提交：`main@c087f77e61f4cabf746cf6da9b8a6e9170f64d45`
> - 计划提交：`b8657e68e878746c63db96c16e190be527a04af3`
> - 阶段 PR：[#22](https://github.com/forfreek/tgbox/pull/22)（堆叠于规划 PR #21）
> - 记录日期：2026-11-12
> - 范围：只读源码审查、固定测试夹具和基础代码测试
> - 生产操作：无；未读取生产 D1/R2，未执行 migration、资源修改或部署

本文是 `cloudflare-dynamic-migration.md` 的 Phase 0 验收证据。它冻结迁移前的兼容契约和隐藏依赖，
不代表 Phase 1 之后的实现细节已经确定。生产规模、D1 查询计划和 Workers 运行时成本仍需在隔离环境验证。

## 1. 基线来源与等价样本

- URL、SEO 和公开 JSON 契约以 `apps/web/src/pages`、`apps/web/src/views`、
  `apps/web/src/components/layout/Seo.astro` 及现有构建测试为准。
- 数据规模样本以 `packages/snapshot/test/fixtures/build-fixture.ts`、
  `apps/web/test/build.test.ts` 和 `apps/web/src/lib/dev-site-data.ts` 为准。
- 固定构建夹具包含 61 个已审核频道，可覆盖每页 60 条时的第二页、已审核/隐藏状态、推广、
  帖子隐藏、翻译和排行历史；这只是可复现的等价样本，不替代生产规模测量。
- 未经授权不读取生产指标。Phase 1 新增索引前，仍须在隔离 D1 上记录目标 SQL、
  `EXPLAIN QUERY PLAN`、rows-read/rows-written 和写放大。

## 2. URL 与路由兼容基线

三种公开语言前缀固定为：简体中文无前缀、英文 `/en`、繁体中文 `/zh-hant`。
下表中的 `{locale}` 表示分别展开为 `""`、`/en` 和 `/zh-hant`。

| 页面/资源 | 代表路径 | 迁移约束 |
|---|---|---|
| 首页 | `/`、`/en/`、`/zh-hant/` | 路径与尾斜杠语义不变 |
| 类型页 | `{locale}/channel/`、`{locale}/group/`、`{locale}/bot/` | kind 枚举不变 |
| 分类页 | `{locale}/{kind}/{category}/`、`.../2/`、`.../latest/`、`.../latest/2/` | 每页 60 条；成员数/最新排序语义不变 |
| 标签索引与标签页 | `{locale}/tags/`、`{locale}/tag/{slug}/`、`.../2/` | slug 和分页路径不变 |
| 详情页 | `{locale}/detail/{username}/` | username 路径与 Telegram start payload 行为不变 |
| 排行与随机页 | `{locale}/rank/`、`{locale}/random/` | 页面路径不变，数据可动态化 |
| 内容固定页 | `{locale}/links/`、`advertise/`、`enroll/`、`guides/` 等 | 不依赖目录的内容继续静态化 |
| Mini App 外壳 | `/app/*`、`/en/app/*` | 仅有中英外壳；不存在 `/zh-hant/app/*` |
| Mini App API | `/api/app/me`、`prefs`、`preview`、`submit`、`upload`、`orders/*` | 认证、字段和状态码兼容 |
| 运行时端点 | `/api/health`、`/r/{id}` | 保持当前 Worker 行为 |
| 公开数据 | `/data/*.json`、`/zh-hant/data/{entries,hot-*,random-*}.json` | URL 和响应结构兼容 |
| Sitemap | `/sitemap-index.xml`、`sitemap-pages.xml`、`sitemap-guides.xml`、`sitemap-{kind}-{locale}.xml` | 现有 11 个分片命名不变 |

不存在的类型、分类、标签、详情或分页仍应返回本地化 404，而不是空的 200 页面。

## 3. SEO 与多语言契约

- `html lang`/`hreflang` 分别为 `zh-CN`、`en`、`zh-Hant`；`x-default` 指向无前缀简体路径。
- 可索引页面输出指向自身语言路径的 canonical，并输出三语言 alternate 与 `x-default`。
- `noindex` 页面输出 `<meta name="robots" content="noindex, follow">`，不输出 canonical 或 hreflang。
- 分类的 `latest` 排序页始终 `noindex`；少于 3 条的分类和标签页 `noindex`，且不进入 Sitemap。
- 分页 canonical 指向自身页，例如第二页不能折叠到第一页；标题保持现有页码后缀逻辑。
- 详情页 JSON-LD、页面语言、Telegram 链接、图片和可见字段语义保持不变；不存在条目仍走本地化 404。
- `robots.txt` 继续禁止抓取 `/api`、`/data`、`/go`、`/r`、`/app` 和 `/en/app`。
- Sitemap 的详情 `lastmod` 来自条目更新时间，聚合列表来自数据生成时间，指南保留各自更新时间；
  每项继续带三语言 alternate 与 `x-default`。
- 现有繁体实现是在 Astro 构建完成后转换 `/zh-hant/` 的 HTML/JSON。动态化后不得转换
  username、URL、slug、payload 或外部链接；运行时转换或写入投影仍为 `待验证`。

## 4. 公开数据与消费者契约

### 4.1 `/data/*.json`

- `/data/entries.json` 保持 `version: 1`，顶层为 `site`、`generatedAt`、`stats`、
  `categories`、`tags`、`entries`。条目按成员数排序，只包含
  `username`、`startPayload`、`kind`、`category`、`tags`、`title`、`description`、
  `descriptionZh`、`descriptionEn`、`lang`、`verified`、`members`、`tgCreatedAt`、`listedAt`；
  不泄露推广内部状态、帖子、成员历史或头像 URL。
- `/data/app-browse.json` 每个 kind 最多 200 条，站内 pin 优先、其后按成员数和 username；
  条目字段为 `username`、`startPayload`、`kind`、`title`、`members`、`avatarUrl`、`promo`，
  并携带 `announcements`、`banners`。
- `/data/app-taxonomy.json` 保持分类 `id/slug/kind/nameZh/nameEn/count` 和标签
  `id/slug/nameZh/nameEn`；`/data/app-products.json` 同时返回 `products` 与 `payments`。
- `/data/rankings.json` 保持 `generatedAt`、`weeklyGrowth`、`monthlyGrowth`、`newest`、`active`；
  每榜最多 50 条。周/月基准现为 6/27 天，活动榜仅包含活动等级大于 0 的条目。
- `hot-{kind}.json` 使用紧凑字段 `u/t/v/a/m/p`，前端每次展示 10 条；随机池仍保持现有紧凑
  DTO 和简介截断语义。动态端点必须继续过滤非公开状态。

### 4.2 Bot、Mini App 与外部消费者

- Bot 日报当前读取 `/data/rankings.json`，取最近 24 小时最多 10 个新条目及最多 5 个增长条目。
- Mini App 静态浏览、分类、产品数据和 Pagefind 共同工作；动态搜索迁移不能改变提交、推广、订单、
  详情跳转或 Telegram init data 认证行为。
- `packages/shared/src/miniapp.ts`、`apps/web/src/lib/app-data.ts` 和
  `apps/web/src/components/app/browse.tsx` 引用了未纳入版本控制的
  `.scratch/miniapp-contract.md`。在正式替换 Mini App 数据源前，必须以代码、测试及本文基线补齐可审查契约。
- `/data/entries.json` 仍可能被镜像或 awesome-list 消费；完整导出可以在受控任务中枚举公开数据，
  但不能在每个 SSR 请求中全量扫描 D1。

## 5. 构建与运行时隐藏依赖调用图

```text
D1 导出白名单
  -> scripts/build-site.ts
  -> @tgbox/snapshot 生成 site-data.json
  -> getSiteData() 以 node:fs 全量读取并模块级缓存
  -> Astro 静态路由、公共布局、/data/*.json、Sitemap
  -> /zh-hant/ HTML/JSON 构建后转换
  -> Pagefind 简体/英文与繁体索引
  -> wrangler deploy
  -> clearDirty()
  -> 可选 awesome-list dispatch

Bot / Admin / Cron 的公开状态变化
  -> D1 写入
  -> markDirtyAndDispatch() / dispatchStaleBuild() / triggerBuild()
  -> GitHub repository_dispatch: content-changed
  -> 上述完整构建链
```

`getSiteData()` 不只服务数据页：`BaseLayout.astro`、`Footer.astro`、首页热门组件等也读取公告、
推广、友链、分类或条目，因此固定内容页存在间接构建依赖。搜索框通过 `SearchDialog.tsx` 加载
Pagefind；Mini App 的 browse 在 200 条静态列表之外也依赖 Pagefind。详情帖子和成员历史来自 R2，
快照构建还应用帖子隐藏规则并计算相关推荐与增长排行。

## 6. 公开状态变化入口审查

| 领域 | 主要入口/模块 | 必须保持的公开结果 |
|---|---|---|
| 条目 | `packages/core/src/entries.ts`，Bot/Admin 批量状态与手工新增/刷新 | 新增、编辑、approved/hidden/恢复即时反映 |
| 审核 | `submissions.ts`、`review.ts`，Bot/Admin 审核入口 | 只有 approved 条目公开 |
| 分类/标签 | `taxonomy.ts` 及 Admin CRUD/排序 | 计数、路由、搜索投影同步 |
| 内容刷新 | `refresh.ts`、Bot 5 分钟 Cron、Admin refresh | 冷字段、成员数、存活状态、头像、帖子和历史一致 |
| 自动下架/恢复 | `packages/db/src/access.ts` 的 liveness 失败阈值与恢复 | 下架后新请求不可见，恢复后重新可见 |
| 帖子隐藏 | `moderation.ts`、`hide_posts`、`hidden_posts` 及关键词/媒体规则 | 详情与派生数据均不返回被隐藏内容 |
| 推广 | `promotions.ts`，支付、人工创建、结束、延期、每小时过期维护 | 未生效/已过期推广不展示，目标条目仍需 approved |
| 翻译 | `apps/bot/src/maintenance.ts` 的小时翻译任务 | 翻译更新进入公开详情与搜索投影 |
| 设置/友链 | `settings.ts`、`friend-links.ts` | 公告、品牌位和友链变化不再等待构建 |
| 构建派发 | `packages/core/src/build.ts`、Bot maintenance、Admin 构建面板 | Phase 5 前保留；证明所有替代链路后才删除 |

所有未来公开读取都必须在最终查询中校验 D1 权威状态。搜索、排行、随机池、推荐、Sitemap 或 KV
命中不能绕过这道门禁。

## 7. 性能与分页基线

| 项目 | 当前基线 | Phase 1/后续要求 |
|---|---:|---|
| 目录分页 | 60 条/页 | 稳定排序；深分页方案按规模验证，避免无界 OFFSET |
| 分类/标签索引阈值 | 3 条 | SEO 语义保持 |
| Mini App 静态浏览上限 | 每 kind 200 条 | 替换为有界 API 后保持可用性，不全量返回 |
| 首页热门展示 | 10 条/次 | API 有候选上限 |
| 每个排行 | 50 条 | 有界查询或投影，不请求内扫描全目录 |
| 固定夹具目录 | 61 个 approved 频道 | 可复现 2 页与隐藏/推广/翻译/排行行为 |

本阶段没有生产条目数、标签基数、热门查询分布或 D1 rows-read 数据，不据此强制新增复杂索引。
这些指标是 Phase 1 的前置验证项，而不是 Phase 0 假设。

## 8. 动态结果允许差异与验收表

| 场景 | 当前静态行为 | 动态化允许差异 | 不允许差异 |
|---|---|---|---|
| 新增/编辑/审核 | 下一次成功构建后可见 | 成功写入后下一次请求即可见 | URL、字段、公开状态错误 |
| 下架/删除/隐藏 | 下一次构建后撤回 | 成功写入后下一次请求必须撤回 | 依赖 KV TTL、旧投影继续展示 |
| 统计刷新 | 快照构建时更新 | 直接读取 D1，可更新更快 | 未 approved 条目进入公开结果 |
| 推广 | 构建/维护后更新 | 请求时校验起止时间，可更及时 | 过期推广长期展示 |
| R2 帖子/历史 | 构建读取后进入快照 | 可按有界缓存提高新鲜度 | 绕过隐藏规则或返回陈旧下架内容 |
| 搜索 | Pagefind 构建后更新 | D1 即时更新；相关性排序可经验证调整 | 下架项返回、链接和过滤契约破坏 |
| 繁体 | 构建后整页转换 | 运行时或写入投影的可见文本语义等价 | 转换标识符、URL、slug、payload |
| 时间戳/排序并列 | 取构建时间 | 请求/聚合时间可不同，并列使用稳定次序 | 分页重复/丢失或 lastmod 失真 |

## 9. 源码审查发现

| ID | 发现 | 风险与后续动作 |
|---|---|---|
| P0-F1 | Mini App 契约文档只以 `.scratch/miniapp-contract.md` 被引用，仓库中不可审查 | Phase 3 前补齐版本化契约或等价契约测试；不在 Phase 0 改代码 |
| P0-F2 | 本地 Windows 测试受 CRLF 生成文件比较和硬编码 `node_modules/.bin/astro` 影响 | 属于既有测试可移植性问题；Linux PR CI 为合并门禁，后续单独修复，不混入迁移实现 |
| P0-F3 | `BaseLayout`/`Footer` 等公共组件调用 `getSiteData()` | Phase 2 必须先拆除布局隐式全量依赖，否则静态/SSR 边界不真实 |
| P0-F4 | Web 搜索和 Mini App browse 均依赖 Pagefind | Phase 3 必须双端一起验收，不能只替换公共搜索框 |
| P0-F5 | Bot 日报直接依赖静态 `/data/rankings.json` | Phase 5 删除每日构建前必须替换或保持动态兼容端点 |
| P0-F6 | R2 帖子与历史使用现有键并由快照读取 | Phase 1/2 需验证新鲜度、隐藏规则和缓存边界，方案仍 `待验证` |
| P0-F7 | 公开 `entries.json` 是完整目录导出 | 必须改为受控版本化生成，禁止每个 SSR 请求执行全量 D1 扫描 |
| P0-F8 | 现有 FTS 对短词仍存在受控 LIKE 路径 | Phase 3 先测量再决定 trigram 扩展或新投影，不把全表 `%LIKE%` 固化为方案 |

上述均为迁移前风险和前置条件，本阶段未修改业务实现。

## 10. 基础代码测试与审查记录

| 检查 | 结果 | 说明 |
|---|---|---|
| `pnpm turbo run typecheck` | 通过 | 9 个 package 通过；Astro 检查 303 个文件，0 error、0 warning、0 hint |
| `pnpm --filter @tgbox/bot test` | 通过 | 15 个测试文件、156 个测试全部通过 |
| 非 Hant package 单元/集成测试 | 部分受环境阻塞 | shared 152、telegram 85、db 74、core 150、snapshot 27、admin 103 通过；Web 329 通过、68 跳过、1 个构建测试因 Windows `.bin/astro` 路径/VM ESM 环境失败 |
| `pnpm test` | 环境性失败 | `@tgbox/hant` 的生成文件字节比较受 Windows CRLF 影响；未发现 Phase 0 文档变更导致的业务回归 |
| 源码审查 | 完成 | 覆盖路由、SEO、公开 JSON、`getSiteData()`、Pagefind、繁体转换、GitHub Actions、Bot/Admin/Cron 状态入口 |
| PR Linux CI | 通过 | [PR #22](https://github.com/forfreek/tgbox/pull/22) 的 `check` 完成 lint、typecheck、测试及 scripts 检查 |

Phase 0 的回滚仅需撤回本基线文档、计划状态与规则增量；没有数据库、Cloudflare 资源或生产状态需要回滚。
