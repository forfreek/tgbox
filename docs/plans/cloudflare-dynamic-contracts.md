# P1-1 请求级公共 DTO 与查询边界

本节点承接 #26，定义迁移读取契约并用基础代码测试锁定现有公开字段。实现状态与契约要求分别记录，Phase 2 接入前逐项验证缺口。

## 数据层和页面契约

`packages/db/src/public.ts` 的 `publicFields` 为数据层白名单。现有 `PublicEntry` 从详情查询返回类型推导，保持单一字段来源。
包含 id、username、startPayload、kind、categoryId、category、title、description、descriptionZh、descriptionEn、lang、verified、avatarVersion、tgCreatedAt、listedAt、updatedAt、isPromoted、hidePosts、members、activityTier。
详情另含 tags，每项仅含 id、slug、nameZh、nameEn。最新列表复用白名单，数字页另含计算后的 promo。
这些结构仅供服务端组装，id、hidePosts 和 avatarVersion 等字段按页面用途消费，公开 JSON 必须经过现有 shared schema 校验。

`packages/shared/src/site-data.ts` 的 EntryView、CategoryView、TagView、SiteStats、PromoView 与 settings 相关 schema，及 `packages/shared/src/rankings.ts` 的 RankingsData/RankItem 继续作为公开输出契约。
时间从 D1 毫秒值转换 ISO，avatarVersion 转换现有 R2 URL。startPayload 只允许 bot 使用，翻译未完成保留 null，禁止用空值替代既有语义。
网站 locale、路径、canonical、hreflang 和繁体转换由页面适配层负责。繁体运行时兼容与包体仍待验证。

## 请求边界

| 用途 | 来源与输入 | 单次读取与输出边界 | 接入验收 |
|---|---|---|---|
| 详情基础 | getPublicEntry，lowercase username | 唯一索引单条 approved，标签按 entry_id | 已实现基础查询；标签数随单条关联规模变化，需测异常数据成本 |
| 最新流 | listPublicLatest，kind/categoryId/游标 | 最多60 DTO，取61判定续页 | 已实现；游标非冻结快照 |
| 数字目录 | readPublicPage，scope/sort/page/now | 60 DTO，单次跳过最多600键 | 已实现；needs_preparation/changed 由后续HTTP层编排 |
| 分类/标签 | listPublicTaxonomy，type/afterId/limit | 默认60、最多100，取limit+1，id seek | 已实现；slug解析和展示sort适配待接入，禁止循环收集全部taxonomy进入每次SSR |
| 首页统计 | getPublicTotals | all及三种kind固定4键 | 已实现；channel/group/bot 映射 SiteStats 的 channels/groups/bots |
| 首页列表 | 有界目录/最新查询 | 每个区块明确scope与limit，复用请求内结果 | Phase 2按实际组件需求验收，禁止getSiteData全量读取 |
| 推广 | listPublicPromotions，now/endsAt+id游标 | 默认60、最多100，取limit+1 | 已实现；筛选startsAt<=now<endsAt，关联条目需approved |
| 设置 | getPublicSiteSettings，固定site键 | 单行SiteSettings校验并合并默认值 | 已实现；公开输出按页面schema白名单，支付凭据及Bot配置排除 |
| 排行 | 四榜与评估时间 | 每榜最多50，沿用RankingsData | P1-5原型已验证，生产投影/时间代次/同步继续实施 |

数字页的状态、排序差异、准备预算以 `cloudflare-dynamic-pagination.md` 为准。排行增长规则与 R2 恢复协议以 `cloudflare-dynamic-rankings-design.md` 为准。

## 详情兼容缺口

- EntryView.online 尚未进入基础 publicFields，Phase 2 实现时补齐并测试 group/bot 语义。
- 详情 promo 需组合手动标记与生效付费等级，当前 getPublicEntry 尚未组装该字段。
- posts/memberHistory 来自单个 username 的 R2 对象。现有快照应用 hidePosts、hidden_posts、关键词与媒体过滤，动态读取需复用规则并逐一回归。禁止在SSR扫描所有R2对象。
- related 每类最多6条，网站展示会组合最多2个站点pin并保持原列表长度。定向候选查询、相关性与并列排序尚待实现及计划成本验证，禁止全站回表排序。
- R2对象本身的字节数与历史点数量尚无本节点验证的固定上限。实现前测量大小、CPU和过滤成本，按兼容方案确定边界，避免静默截断既有历史。

以上属于后续实现和验收事项，本节点只完成定义。详情完整性不能仅通过基础 DTO 测试判定。

## 版本、缓存与公开状态

请求上下文按 locale、规范化输入和读取时间区分。基础查询保持独立，跨组件复用在请求内部进行，避免跨用户共享可变状态。
缓存键至少含 schema、locale、数据版本、scope、sort、page/cursor，排行再含榜单与时间代次。详情含username，R2相关内容须纳入失效协议。
readPublicCached 已有前后两次权威版本校验、解码失败回源和写入失败降级。请求级版本复用、Cache/KV适配及真实命中成本继续在 Phase 2/P1-6 验证。
推广/排行自然时间变化约束 validUntil。删除、下架、隐藏必须在所有公开输出前得到权威确认，不能靠TTL撤回。
getPublicTotals/listPublicTaxonomy 单独调用只做前置版本检查，组合响应需由版本协议包围读取并校验末尾版本。重试次数及HTTP错误映射在接入时明确。

Sitemap、公开JSON和随机推荐需要单独的有界输出/分片流程。Bot日报沿用/data/rankings.json契约，Mini App沿用分类ID和现有提交接口，Phase 2/3通过各自入口测试后再切换。

## 测试、审查和回滚

- [x] 审查 public.ts、public-pages.ts、public-operations.ts、public-cache.ts 与既有 shared schema、snapshot/site-data 调用语义。
- [x] 增加详情、最新列表字段精确白名单及标签字段测试，锁定私有审核/任务字段排除规则。
- [x] DB 100/100、全仓typecheck 9/9通过，Astro 303文件零诊断，变更文件Biome与diff check通过。PR CI以独立PR checks为准。
- [x] 记录基础查询与完整页面的差异，后续阶段按缺口列表逐项验收。

本节点交付契约文档和回归测试。回滚可撤回本节点提交，既有运行读取入口继续使用前置版本。数据库与Worker资源变更另行按对应实现节点授权和验收。
