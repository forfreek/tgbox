# 真实架构与数据流审查

审查日期为 2026-11-22。以下路径相对于仓库根，全部对应 [main 固定提交 cb0d6a6](https://github.com/forfreek/tgbox/tree/cb0d6a658d1dc57c45ef3e6092d9f15c66386b7b)。本地工作树及生产部署可能不同。按环节查阅所需源码。

## 录入、审核和发布

| 环节 | 实际行为 | 源码 |
| --- | --- | --- |
| Bot 投稿 | /submit 共用开放、黑名单、重复和日限检查。抓取资料，用户确认分类标签，写 pending 投稿，通知审核员 | apps/bot/src/bot/submit.ts；packages/core/src/submissions.ts；packages/db/src/access.ts |
| Mini App | initData 验证，preview 获取资料及建议；submit 再抓取并验证分类标签，身份取认证会话 | apps/web/src/pages/api/app/{preview,submit}.ts；apps/web/src/lib/app-auth.ts |
| 审核 | 先更新投稿 approved，再重新抓取并落库。当前简介优先，回退投稿快照。entries、entry_stats、entry_tags、FTS 同批写入。拒绝只改投稿 | apps/bot/src/bot/review.ts；apps/admin/src/functions/review.ts；packages/core/src/{review,submissions}.ts；packages/db/src/access.ts |
| 发布 | 新收录标脏并调度网站构建，可向配置的 Telegram 发布频道发公告。投稿通过与资源落库是两个状态 | packages/core/src/{build,publish,submissions}.ts |
| 后台新增 | 预览后 listEntryManually 抓取并直接插入 approved。审核和直接新增会抓到预览，但没有在这些入口持久化频道帖子 | apps/admin/src/functions/add.ts；packages/core/src/{add,entries}.ts |
| 编辑 | 状态、分类、标签、推广、机器人启动参数等有独立操作。原简介随 Telegram 刷新，帖子另有显示控制 | apps/admin/src/functions/{entries,posts}.ts；packages/core/src/{entries,moderation,taxonomy}.ts |
| 主线批量种子 | 清单给分类标签，Telegram 给资料。脚本应用迁移、写 D1，再传 R2。冲突保留 ID、listed_at 和状态，标签追加，FTS 重建。D1/R2 有中间态 | scripts/seed/{seed,seed-sql}.ts |

PR #19 在审查当天仍为 OPEN，head 为 2cca5c851e3953714aa9f6416c0b8865e2cf0af9。其中 scripts/import-ready-seed.ts 使用 profile.description 优先、外部说明回退。该入口不属于本次 main 基线。行动前重新核验。[PR #19](https://github.com/forfreek/tgbox/pull/19)

## 资料来源、清洗及可见性

packages/telegram/src/profile.ts 从公开 t.me 页面解析类型、标题、简介、头像、认证、人数或月用户数，将简介 HTML 转纯文本。snapshot.ts 对频道取 /s/{username}，channel.ts 解析非服务帖子，保存 ID、日期、文本、浏览量、可选缩略图，文本上限 500 个 Unicode 字符。群组首消息嵌入仅用于创建日期，机器人没有功能试用数据。lang 来自标题、简介、可用帖子合并检测。

分类和标签字典在 D1，条目 category_id 与 entry_tags 关联实际值。packages/shared/src/suggest.ts 先做关键词规则，分类不确定才由 packages/core/src/suggest.ts 调用 @cf/google/gemma-4-26b-a4b-it 返回 slug，标签仍按规则建议。用户选择、后台编辑和种子配置决定落库值。

packages/core/src/refresh.ts 与手动刷新共用 applyActiveSnapshot，写 D1 冷资料及统计、R2 avatars/posts/history。帖子内容 hash 排除 views，浏览量单独限频。packages/core/src/moderation.ts 和后台 posts 接口控制条目全部帖子、单帖和关键词屏蔽。packages/snapshot/src/build-site-data.ts 在发布快照时应用这些过滤及隐藏媒体设置，原 R2 对象可以仍包含被隐藏内容。

## D1、Cron 与翻译

迁移 0000 建 entries、submissions、entry_stats、entry_tags、taxonomy 和 site_state；0001 建 FTS；0006 建 hidden_posts 并增加 hide_posts；0009 加 description_zh、description_en、description_translated_at。迁移还覆盖审计、设置、支付、推广、用户、广播及分类扩展，最新为 0021_bot_start_payload.sql，编号中没有 0007。定义入口为 packages/db/src/schema.ts。

apps/bot/wrangler.jsonc 配置每五分钟和整点 Cron。apps/bot/src/index.ts 的五分钟任务先支付检查、再广播、余下预算交刷新。main 的 packages/core/src/refresh-progress.ts 用 site_state 持久游标和租约恢复，429 或预算不足延后。packages/db/src/access.ts 对失效累计及自动隐藏有阈值和状态保护，人工单次刷新不自动隐藏。此游标修复晚于本地 HEAD。

apps/bot/src/maintenance.ts 每小时维护推广后，以余下预算最多翻译 8 条原简介，模型 @cf/meta/m2m100-1.2b，长度范围 8–800。只保存另一种语言。源语言优先信条目 lang，其他值按是否含汉字回退。packages/db/src/translations.ts 按 updated_at 和翻译时间挑候选，仅按 entryId 回写。刷新原简介会清双语译文，种子冲突更新未做相同失效。新增摘要直接读取原始资料建立自己的指纹及版本。

## 详情摘要、多语言和搜索

apps/web/src/lib/seo.ts 的 entrySummary 用标题、用户名、类别、类型、语言、人数、标签、日期和活跃度拼首段。DetailPage.astro 的正文下方另显示 localizedDescription 选出的译文或原文。detailSeo 将模板放到简介前截断，简繁预算 90、英文 170，可能使简介内容不能进入 metadata。

三语 pages/{detail,en/detail,zh-hant/detail}/[username].astro 共用 DetailPage。根路径为简中，另两语用前缀。astro.config.ts 的构建结束钩子调用 lib/hant.ts，把繁中目录 HTML/JSON 通过 packages/hant 的 OpenCC 转换，外部 URL 属性有保护。新增摘要需检查品牌、标识及最终 metadata。

apps/web/scripts/pagefind.ts 只索引简中和繁中详情，保留各语言目录及既有 data-pagefind 区域。Bot 内联搜索走 D1 FTS，字段为 title、username、tag_names。lib/open-data.ts 明确映射原简介和双语译文。SEO 标签和 sitemap 位于 components/layout/Seo.astro、lib/sitemap.ts，URL、canonical、hreflang、robots 及 sitemap 策略不因摘要存在与否改变。

## 配置与构建

apps/{bot,admin,web}/wrangler.jsonc 绑定同一 tgbox D1、tgbox-media R2 和现用 AI。packages/{db,core}/wrangler.jsonc 用于测试。资源授权规则在 .cursor/rules/require-consent.mdc。

.github/workflows/ci.yml 执行检查、类型和测试。build-deploy.yml 由 main 提交、content-changed、六小时定时、每日强制和手动触发，串行发布 Web。scripts/build-site.ts 按表白名单导出 D1，快照用 SQLite 读取 approved 条目，packages/snapshot/src/r2-media.ts 用认证 S3 API 读取媒体，再输出 site-data.json、Astro HTML 和 Pagefind。认证 R2 修复晚于本地 HEAD。

packages/core/src/build.ts 标脏和限频 dispatch，小时维护提供补偿调度。packages/db/src/access.ts 的 dirty_since 只在不存在时写入，工作流按构建开始时间删除。摘要需独立发布修订号确认构建期间的新发布，避免只依赖旧脏标记。
