# 当前状态

## 最新：阶段三，2026-11-28

工作树 `C:/Users/123/tgbox-search-analytics-collection`，分支 `codex/search-analytics-collection`，base=阶段二 `9d4a5d2` / PR #91。实现及验收见 [COLLECTION.md](COLLECTION.md)。阶段三草稿 [PR #92](https://github.com/forfreek/tgbox/pull/92)，实现377f65e；Linux CI 46118001213全部通过，后续为文档收尾。

共享55、Web双D1集成6、Bot181、采集浏览器5及原浏览器回归14项通过；全仓类型11/11和Lint通过。Web原450项有1项Windows5秒超时，单独15秒重跑通过；Linux全仓CI通过。无生产资源/迁移/部署/合并。下一步阶段四榜单发布，核心LIKE负载压测为生产启用前P1门槛。

最终Web类型复核0错误，Web/Bot固定Wrangler4.132.0显式配置dry-run通过；总gzip分别331.00KiB/363.57KiB。截图在C:/Users/123/.codex/visualizations/2026/11/28/search-analytics-stage3，已查看桌面和移动终态。

阶段四实施入口见PUBLICATION-PLAN.md，尚未实现；不得将计划当作生产或本分支已具备的功能。

远端main本阶段再次确认为d150e0d20041eb3a1c5d1315672bf0cb54c17e8f；生产部署版本未重新核验，以下为阶段二历史交付记录。

## 阶段二交付快照

核验日期：2026-11-28（Asia/Shanghai）。
工作树：C:/Users/123/tgbox-search-analytics-service。
分支：codex/search-analytics-service，base=codex/search-analytics-stage1（520fbc9）；阶段一PR #90。
当前节点：阶段二草稿PR #91（https://github.com/forfreek/tgbox/pull/91），依赖#90；实现代码以PR head核验，本地验收完成，Linux CI记录见末尾。阶段三尚未开始，未接入现有Worker入口。

## 当前实现

- 共享配置、轻量OpenCC字符归并、写前隐私过滤、HMAC身份域和签名会话。
- Mini App纯验签与Bot可信capability分离，Telegram跨入口身份一致；网站匿名身份不等于真人。
- receipt/严格预算/日聚合/身份贡献同一D1事务，跨入口/语言同身份同词每日一次贡献；已知触限不调用FTS。
- 签发和挑战独立限额；Siteverify校验hostname/action/cdata，D1原子token receipt防并发重放，配置竞态不授可信状态。
- 内容/增长异常进入pending，规则变更触发审核revision；固定原因码抽样有日封顶。
- 新0001统计迁移仅添加规则版本触发器，核心数据库迁移不变。

## 实际验证

- 统计包51/51测试通过，涵盖真实Workers D1并发、幂等、回滚、跨入口、限额、Turnstile重放/配置竞态、敏感输入及流式正文上限。
- Telegram包96/96回归通过；统计包类型/Biome与生成映射一致性通过。
- 全仓类型11/11通过；全仓Lint通过，3条既有警告。
- 成功meta基线：Bot新身份58读/19写；网站68读/22写；重试/触限4读/0写；会话签发11读/6写；500规则2054读/19写。见RESOURCE-USAGE.md。
- 失败查询可能缺少计费meta，usageComplete=false时不能当作完整账单。

## 最新用户确认

1. 公开榜单可查询统计D1主库审核版本，不符/故障安全空榜。
2. 客户端手动上榜候选可追加核心FTS复核，搜索不等待统计。
3. 用户确认付费版，不为免费额度刻意限流；默认业务参数保持，全局事件/签发/验证日预算后台范围1–100000，不自动改线上值。

## 基线与历史证据（阶段一快照）

- main重新读取仍为d150e0d20041eb3a1c5d1315672bf0cb54c17e8f；阶段一#90代码5b42156的Linux CI 46097134175通过，后续为文档记录。
- 阶段一核验Web 7f7c763f、Bot ac61a4c4、Admin 8923c4ef；版本易变，不宣称本阶段重做生产部署验证。
- 原入口C:/Users/123/tgbox有用户改动，保留，仅追加恢复指针。
- 域名Free Website与Workers付费不是同一概念；旧Billing API权限不足记录不否定用户付费确认。
- 统计资源与本站Turnstile/限流binding尚未创建，待单独授权。

## 下一步与边界

阶段三接三入口、1500ms/IME/点击合并、Cookie及原生边缘限流；阶段四KV/Cron/清理；阶段五Admin；阶段六完整验收与生产准备。
本阶段未测试浏览器、真实Siteverify、生产CPU/网络，不把库测试当入口或发布验收。
未生产迁移、创建/修改资源、写Secrets/WAF、部署或合并main。

2026-11-28 收尾：新增0002数据库级全球日贡献唯一约束，本地51/51通过；成本基线每接受事件增加1行索引写。前一head d5f5ee5的Linux CI 46101482836通过，当前追加修改的CI待核验。

阶段二交付核验：实现提交398462b的Linux CI 46102332989全部通过。51项统计测试、96项Telegram回归、类型/Lint与本地显式配置dry-run通过；最终打包探针944.50KiB/gzip169.75KiB。PR #91依赖#90，均未合并，后续仅文档记录。下一阶段接三入口。
