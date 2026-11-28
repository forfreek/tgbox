# 当前状态

## 生产发布进行中：2026-11-28

用户已授权合并、必要资源/Secrets/迁移配置及验收启用。当前分支codex/search-analytics-release，仍在verification工作树；见[生产发布记录](PRODUCTION-RELEASE.md)。D1/KV/widget和新Secrets已配置，迁移与部署待完成。历史默认关闭状态见下方，不再作为当前资源不存在的判断。


## 最新：阶段六最终验收，2026-11-28

工作树C:/Users/123/tgbox-search-analytics-verification，分支codex/search-analytics-verification，base=4f6ffe4 / 草稿PR #94（其最新文档CI46125270288也通过）。main再次只读核验d150e0d。完整报告[VERIFICATION.md](VERIFICATION.md)，操作单[RELEASE.md](RELEASE.md)，资源/绑定片段bindings.example.jsonc，生产快照PRODUCTION-SNAPSHOT，当前技术债DEBT头部。阶段六草稿[PR #95](https://github.com/forfreek/tgbox/pull/95)，实现提交4bfcabaec75940efc028d6bbfd6aebb4d640b8c0；[Linux全仓CI 46145228889](https://github.com/forfreek/tgbox/actions/runs/46145228889)全部通过（格式/类型、全仓测试、脚本类型/测试）。后续提交仅补文档记录。

关闭/回滚静态推荐P1已修复，NFKC/规则查询/后台快照/空格筛选/清理能力已修正；默认业务预算10000不变，不自动加预算，cleanupBatch默认100/上限2000并跨字段校验。独立两路源码复核完成；Codex Security工具因Windows父目录ACL拒绝启动，未形成工具化报告，不能宣称扫描通过。

本地验收：共享87常规+4显式容量、Web450+8双D1+1核心容量、Bot181、Admin136，Web开启25/关闭17（28不同用例）及最终榜单6/关闭3再通过，Admin11交互、全仓类型11/11/Lint/脚本20通过。最终构建和固定Wrangler dry-run通过；打包数值/实现CI见后续交付记录。没有生产迁移/资源/Secrets/WAF/部署/合并；新开关默认0。下一步仅在用户确认操作单后开展资源配置、关闭态部署及真实站点启用验收，不另开未记录开发阶段。

以下为各阶段历史快照，不能当生产状态。

# 当前状态

## 最新：阶段五，2026-11-28

工作树C:/Users/123/tgbox-search-analytics-admin，分支codex/search-analytics-admin，基于0130d88 / PR #93（未合并）。八视图、共享管理访问层、认证/同源/CAS/匿名审计、手动刷新和操作日志已本地实现。实施报告见[ADMIN.md](ADMIN.md)，计划见[ADMIN-PLAN.md](ADMIN-PLAN.md)。草稿[PR #94](https://github.com/forfreek/tgbox/pull/94)，实现821908850fff8068cbd2bab95485ee026556fb02；实现提交的Linux全仓CI 46124984114全部通过；后续仅文档收尾，不能当作生产功能。

共享83、Admin136、真实Edge浏览器11条检查通过；全仓类型11/11和Lint通过（3条既有警告）。最终构建/固定Wrangler dry-run与Linux CI追加于下方交付记录。无新迁移/云资源/Secrets，无生产迁移、资源、WAF、部署或合并。下一阶段六最终验收/安全容量与技术债专项。

以下为阶段四及更早历史快照。

# 当前状态

## 最新：阶段四，2026-11-28

工作树 `C:/Users/123/tgbox-search-analytics-publication`，分支 `codex/search-analytics-publication`，base=阶段三76ca142 / PR #92。聚合/发布/撤回/清理及Web/Admin接入已实现；完整报告见[PUBLICATION.md](PUBLICATION.md)。草稿[PR #93](https://github.com/forfreek/tgbox/pull/93)，实现3e41929的Linux CI 46121763628全部通过；后续为文档收尾，不是生产功能。

共享统计69项、Web双D1 8项、Admin115项、新榜单浏览器3项及原浏览器14项通过；全仓类型11/11与Lint通过。最终提交检查见后续记录。Admin构建/固定Wrangler dry-run通过，总gzip1427.85KiB，生成cron为5 16 * * *。

本阶段新增统计迁移0003，只扩展search_job_runs私有发布快照；未执行生产迁移。当前无生产资源/Secret/WAF/部署/合并操作。下一节点阶段五Admin，阶段六容量和技术债最终验收。

以下为阶段三及更早历史快照，不能套用为当前工作树。

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

阶段四最终本地收尾：Web450/450（Windows CLI 15秒且不改项目配置）及双D1 8/8通过；Admin115项含启用Cron适配验证。桌面/移动截图在C:/Users/123/.codex/visualizations/2026/11/28/search-analytics-stage4，已查看。Web/Admin最终dry-run总gzip331.74/1427.85KiB。

## 阶段五最终本地检查

全仓类型11/11、Lint通过（3既有警告，无新增）；Admin136和共享83项通过，14项真实D1管理测试包含100词分页，浏览器可复现脚本11条交互通过。Admin最终构建及Wrangler4.132.0显式配置dry-run总gzip1443.53KiB。

新增上线前P1：旧前端编译关闭/回滚静态推荐可能绕过已建立的隐藏规则，证据SearchDialog.tsx visibleWords。阶段六必须修复并测试，见DEBT；当前生产没有改动，不允许未解决即上线。

阶段五交付：草稿PR #94依赖#93；8219088的CI46124984114（https://github.com/forfreek/tgbox/actions/runs/46124984114）全部步骤成功。最终文档记录不改运行时代码。下一阶段六先修复静态推荐关闭/回滚P1，再做独立安全/容量/技术债/SEO回归与部署准备。
