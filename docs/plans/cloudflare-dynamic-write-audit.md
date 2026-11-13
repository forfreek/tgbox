# P1-7 写入入口与缓存失效验收

本节点承接#32，核对D1源表触发器与现有业务入口，补齐R2对象缓存的跨存储失败读取保护。P1-7整体继续待验收，Phase1保持5/8、总任务12/55。

## D1覆盖清单

| 入口/操作 | 实际写入链路 | 公开数据同步 |
|---|---|---|
| Bot提交、Mini App提交 | bot/submit.ts、Web app-api → createSubmission | 未审核submission不进入公开数据，审核后写entries |
| Bot/Admin审核与手动新增 | core/review.ts、core/entries.ts → entries/entry_stats/entry_tags | 版本与0025目录/计数触发器同事务维护 |
| 编辑、下架、恢复、删除、手动pin | Admin functions/entries.ts、core/entries.ts | entries版本触发器，状态/排序变更维护各scope |
| Cron/Admin刷新 | core/refresh.ts → updateEntryCold/upsertEntryStats/recordLivenessResult | 版本、成员排序、公开状态同事务更新 |
| 分类标签修改/删除 | core/taxonomy.ts、db/admin-taxonomy.ts | taxonomy、关联与entries版本变更，目录scope同步 |
| 翻译与源文修改 | Bot maintenance.ts、db/access.ts | 源文变更清翻译，翻译写入entries使缓存版本推进 |
| 隐藏全部帖子/单帖子 | Admin functions/posts.ts → core/moderation.ts | entries.hide_posts/hidden_posts版本推进 |
| 推广购买、编辑、过期与撤销 | core/payments、core/promotions、Bot维护 → promotions | 版本及推广状态dirty，准备结果重新评估 |
| 公告、关键词过滤、媒体隐藏、友链 | core/settings.ts → settings | 固定设置表版本触发器覆盖，公开DTO仍按白名单 |
| 产品/广告容量 | products | 产品源表版本触发器覆盖 |

`0023_public_listing.sql`负责各源表insert/update/delete版本触发器，`0025_public_numbered_pages.sql`补齐推广排序状态与目录同步。现有入口复用DB层，原子版本更新无需在每个Worker重复手写。
新增回归连续执行24个源变更，逐项证明热缓存不重新加载时保持命中、源事务提交后必须重新加载。包含翻译、审核状态、统计删除、taxonomy、帖子隐藏、推广、设置与产品变更。
已有DB投影、事务回滚、数字页、准备缓存，以及Core/Bot/Admin的入口测试继续回归。该清单是源码路径核对与本地测试证据，生产数据一致性仍由P1-8审计验收。

## R2对象缓存保护

refresh.ts写posts/history/avatar，Bot推广图片写promos。对象写入与D1后续写入不处于同一事务；仅依靠写完后调用D1失效可能在失败窗口保留旧缓存。
新增Core `readPublicMediaCached()` 直接复用现有R2绑定的对象version与ETag作为缓存键依赖，在读取前head、回源get时校验二者、缓存I/O结束后再次head。version也覆盖正文相同但metadata变化的重写。
最后一次R2校验通过 `readPublicCached` 的可选validateDependencies回调运行于末尾D1权威版本与时间检查之前。
由此保留命中两次轻量D1查询，并覆盖最后一次R2请求等待期间的D1隐藏变化。检查失败报retry，R2无法确认对象身份时明确失败。

- R2成功、D1后续事务回滚时，新请求使用新ETag键，旧缓存不会命中。
- 重试走未变化对象或history不足一周提前返回时，读取端仍核对对象ETag，无需靠再次R2写入触发失效。
- 并发覆盖、删除、创建及head/get之间变化分别验证，对象不存在也有独立的missing键。
- 真实Core帖子隐藏入口测试证明，即使R2内容不变，D1版本变化也会使已缓存帖子重新应用隐藏规则。

该协议保护经此入口读取的R2对象内容缓存。它没有把R2和D1变成原子写入，头像公开URL/浏览器CDN兼容、R2历史镜像与排行投影恢复仍按各自节点验收。
Phase2必须接入此读取入口，并在loader内应用approved、hidePosts、hidden_posts、关键词和媒体过滤。不能将未经D1规则处理的原始R2对象作为公开页面响应。

## 成本、测试与剩余工作

命中基础成本为2条D1版本SQL及2次R2 head；未命中再增加一次R2 get与loader所需定向查询。命中跳过对象正文，ETag随对象正文原生更新，写入路径和Cron预算变更为0。
相比纯D1内容缓存，每个R2对象增加两次head。详情posts/history多对象的合并读取、Cache/KV网络、字节/CPU与真实延迟仍需等价Worker测量。

- [x] 24项D1源写入热缓存失效与既有投影/失败回滚回归。
- [x] R2成功/D1回滚、并发变化、缺失/删除/重建、R2故障与最终D1门禁测试。
- [x] Core真实帖子隐藏入口与ETag缓存组合测试。
- [x] DB120/120、Core157/157，全仓typecheck9/9与最终Core增量检查通过；R2/真实隐藏专项9/9、Biome/diff check通过。独立PR CI以对应checks为准。
- [ ] Phase2实际页面接入、完整帖子过滤与多语言公开DTO验收。
- [ ] R2历史镜像/排行投影恢复、头像URL语义与P1-8完整回填审计。

## 回滚与部署

回滚可revert本节点，现有调用方未传入validateDependencies时保持既有缓存协议。新读取入口撤回后，R2内容缓存的SSR切换仍需重新完成依赖验收。
数据库结构、索引、Worker配置、Cron和生产操作为0。旧GitHub内容构建及代码部署逻辑继续由迁移阶段分别验收。
