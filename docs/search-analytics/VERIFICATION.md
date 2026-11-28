# TGSearch搜索分析最终实施与验收报告

核验日期2026-11-28（Asia/Shanghai）。本阶段独立worktree C:/Users/123/tgbox-search-analytics-verification，分支codex/search-analytics-verification，基线4f6ffe4 / 草稿PR #94。远端main再次核验d150e0d；阶段一至五PR均未被当作生产已具备功能。生产只读快照见PRODUCTION-SNAPSHOT.md，发布操作见RELEASE.md。

## 结论和交付边界

六个开发阶段已按节点形成完整功能：Web/Mini App/Bot采集、独立D1聚合/幂等/限流、隐私与审核、7完整日全局加权榜、KV派生缓存、Admin八视图和审计、每日任务/清理及独立关闭。本阶段完成关闭/回滚绕过修复、同范围安全/查询优化、容量实测和最终文档。源代码P0/P1已处理；生产资源、真实认证/挑战/地域性能等明确保留为获批后启用验收门槛。

工具化Codex Security扫描尝试被宿主Windows路径ACL安全检查拒绝（C:/Users可被其他用户替换），未返回scanId、canonical报告或SARIF；本报告不是其替代canonical结果。两路独立只读源码审查与主任务交叉复核已完成，实际发现、修复和局限均列于DEBT，不把“扫描未启动”写成“扫描通过”。

## 本阶段修改

| 路径/函数 | 改动与目的 |
| --- | --- |
| apps/web/src/layouts/BaseLayout.astro、components/search/SearchDialog.tsx | 移除构建期hotKeywords管道与关闭态静态回退；不开接口时安全空榜，Pagefind/UI/URL保留 |
| packages/search-analytics/src/normalize.ts::normalizeKeyword | NFKC及空白处理之后再检查禁止文本，关闭兼容编码写前绕过 |
| packages/search-analytics/src/ranking.ts::readSearchRanks | latest身份去重→MATERIALIZED逐词计分→逐词审核→稳定排序，避免逐身份重复规则匹配；无新索引 |
| packages/search-analytics/src/admin.ts::readSearchAdmin | 单页一次读取发布快照、映射已发布分数；空格筛选与空筛选等价，保留权限/审核版本 |
| packages/search-analytics/src/config.ts::minimumCleanupBatch/SearchSettings | 预算与清理能力校验，批大小10–2000；默认100、默认10000事件预算均不变，不自动抬预算 |
| client-policy.ts/client.ts/config.ts/publication.ts、Web trending.ts | 共用最多6项/字符上限和Secret最小长度，避免策略散落，不带入服务端数据库/凭证到浏览器 |
| apps/admin/features/search-analytics/settings-form.tsx | 展示当前预算所需最低批大小及局限，旧实验配置预检/兼容说明见RELEASE |
| 新capacity/config测试、Web关闭态及异常态e2e | 满额、最高预算、长词/包含规则、高词基数、清理、并发验证回调、三语言关闭与失败回归 |
| docs/search-analytics | 计划/报告/规则/ADR/架构/口径/配置/资源/发布/回滚/技术债/状态/记忆一致维护 |

数据方向不变：浏览器只发送v1候选遥测→固定来源认证API→共享服务→独立统计D1；核心D1只用于可信FTS证明/既有Bot搜索和推荐标题。Admin认证命令→统计D1事务CAS+HMAC审计→先安全失效再刷新。Cron和人工仍共用同一聚合函数、租约及KV权威指针。不增Worker/Queues/DO/VPS，不写核心统计表，不触发dirty/构建/部署。

## 验收记录

| 检查 | 实际结果与限制 |
| --- | --- |
| 共享服务 | 87项常规测试通过；4项容量测试分别显式执行通过。常规套件故意跳过重负载，不把跳过算通过；新增策略改动后36项重点再通过。 |
| Web | 450项串行通过（含SEO/静态构建/链接/三语）；双真实D1集成8项通过，核心容量专项1项通过。 |
| Bot/Admin | Bot181项串行通过；Admin136项通过，覆盖真实认证中间件、POST同源、CAS/日志等；新的清理提示随Admin真实浏览器复测。 |
| Web浏览器 | 原14项回归与三入口采集/榜单用例一起：关闭构建17通过，开启25通过；覆盖28个不同用例（两轮重复原回归）。最终协议常量整理后开启榜单6项/关闭三语3项再通过。 |
| Admin浏览器 | 11条真实交互通过：概览、25+5分页、筛选、零结果、人工榜、隐藏撤回、配置边界/版本、安全样本、任务和移动键盘滚动。 |
| 类型/Lint/脚本 | 全仓类型11/11通过；Lint通过，3既有警告；脚本类型与20项脚本测试通过。最新打包/CI结果在交付记录追加。 |
| 本机失败及纠正 | 全仓并行同时运行大型夹具时Node内存分配失败，Web/Bot改串行复测通过，不改项目验收超时来掩盖问题；初次浏览器缺默认Chromium改用已安装Edge。测试遇旧配置断言后，显式配足批大小，不放松schema。 |

浏览器环境：真实msedge，Web http://127.0.0.1:4329，Admin http://127.0.0.1:8794；桌面1280×720/1440×1000、移动390×844。Browser plugin not available，使用已有Playwright，无新浏览器依赖。Web API在浏览器层使用受控响应验证展示/失败，服务端正确性由双D1/共享D1测试补齐；不把mock当生产Siteverify或Cron实际触发。

## 业务/安全测试矩阵

| 需求 | 证据入口 |
| --- | --- |
| 手动/热搜/推荐/预填、零结果、200ms与1500ms、IME/过期查询/快速点击/失败隔离 | client.test.ts、Web e2e/search-analytics.spec.ts/search-publication*.spec.ts、search-analytics.integration.ts |
| Mini验签/auth_date/重复字段、TG跨入口去重、Bot webhook/300秒缓存 | service/foundation/session测试、Web双D1与Bot inline-search.test.ts；Telegram服务缓存命中无法完整计数明确保留 |
| 伪造来源/身份/会话、私密输入/NFKC/XSS式词、SQL注入、body1KB、Origin | service/limits/foundation/admin测试及入口集成；所有关键词输出为转义文本，不借用Pagefind HTML片段槽 |
| 并发UPSERT、贡献唯一、请求幂等、全局预算、Turnstile硬额/失败/重放 | service.test.ts/session.test.ts/schema.test.ts，真实D1并发与回滚；真实widget待授权后验收 |
| 黑名单/隐藏/pending/批准、配置CAS/审计事务、管理员/CSRF | admin.test.ts、Admin functions/server测试、浏览器隐藏→重建推荐；批准不能补造历史资格 |
| 7日最近贡献/权重/稳定排序、Cron人工并发/失锁/旧版本/清理边界 | publication.test.ts、ranking共享函数、capacity.test.ts；真实Cron平台调度仍待部署 |
| KV缺失/失败/版本竞态、关闭/回滚、安全降级 | publication.test.ts及开启/关闭两种三语构建；RELEASE中禁止回退到不具静态修复的历史前端 |
| SEO/索引路径/canonical/hreflang/sitemap/多语言/静态缓存 | Web450项与14项原浏览器回归；不生成关键词可索引页面，未改这些源代码路径；生产部署后仍需现场检查 |

## 容量实测

详细数值、口径、公式及成本来源见RESOURCE-USAGE.md。所有大夹具只在本地独立测试库执行，未压测生产。

- 70k日身份事实/500规则/100关键词：发布成功SQL读5150645→200745；700k事实/500规则/100关键词：51505645→1555745。结果和权重不变，低关键词基数夹具约降96–97%，不外推全部流量。
- 700k事实/100个64字词/500个64字contains规则：1555746读，本地约5.9秒；700k独立身份/140k合格词/500包含规则：72380545读，本地约21.9秒。后者接近单SQL30秒量级，实际地域/词分布和队列必须启用前观察。
- 90天45k聚合/5001任务/100项后台页：803092→252825读，0写；900行小夹具3654读/0写，概览1814读/0写。
- 1200016条到期rate按2000/批，601批清空；已知成功SQL4816297读/1200621写，本地约12.8–19.3秒。非多表峰值总耗时或生产CPU保证；故障/停任务/积压仍需drain。
- 核心2500/25000资源：两字符未命中分别2500/25000读，命中2读；FTS未命中0读/命中2读但内部匹配仍消耗SQL时间。没有改原有搜索索引、缓存或查询语义。
- 剩余接受预算1时，24并发验证回调，最终1事件接受、19统计写行；不能把有效事件预算当作FTS调用硬预算。该架构限制与运维触发条件已登记。

## 技术债与发布判断

两路独立复核确认分组后按词审核语义等价，NFKC修复不误伤正常Telegram用户名及资源名；主任务检查22个共享运行时模块相对导入图无循环/反向apps导入。索引、依赖、策略常量、类型抑制、无用代码、统计口径、缓存一致性、文档和回滚都列于DEBT。未发现未解决代码P0/P1；不能据此承诺生产无风险。

默认开关继续关闭。没有新迁移，既有统计迁移0000–0003和核心库完全分开；资源/Secrets/绑定/WAF尚未自动配置。RELEASE.md给出资源名称、最小绑定、交互式Secrets命令、只针对统计库的迁移、部署顺序、启用前门槛与关闭/安全回滚矩阵。用户确认之后，才可开展资源与关闭态部署验收；目前没有执行。

## Modern Web Guidance核对

本轮核对了deprioritize-background-fetches：既有榜单请求保留低优先级和AbortController（“priority: 'low'”），关闭状态不发请求，不为失败引入阻塞或陈旧回退；不支持优先级的浏览器按默认处理。没有新增相关Web API或为了指南更改Pagefind搜索。

## 最终关闭态打包

Admin正式构建及Wrangler4.132.0显式dist/server配置dry-run：5049.75KiB / gzip1443.07KiB；Web以固定本地资源夹具构建，267静态文件/47繁中页面，1225.44KiB / gzip332.35KiB；Bot1776.28KiB / gzip363.83KiB。都是整个Worker包，不是功能增量/CPU；生成配置保持核心DB和SEARCH_*开关0，没有本地fixture假ID。无上传或部署。实现提交/LinuxCI与最终Git diff摘要在交付记录补齐。

补充：Windows全仓Biome check受既有CRLF检出格式差异（815项），未批量改写无关文件；本节点26个代码/配置文件按LF核验通过，仅既有gtag警告。全仓Linux格式与测试以PR CI为准。

## Git交付记录

草稿[PR #95](https://github.com/forfreek/tgbox/pull/95)，基于阶段五codex/search-analytics-admin。实现4bfcabaec75940efc028d6bbfd6aebb4d640b8c0，49文件、1102新增/37删除；主要为安全回退修补、排名/管理查询、配置校验、容量/浏览器测试和验收发布文档。[Linux CI46145228889](https://github.com/forfreek/tgbox/actions/runs/46145228889)全部通过：全仓格式/类型、测试、脚本类型与20项测试。WindowsCRLF格式差异不影响Git LF内容；后续收尾提交仅文档。main只读核验仍为d150e0d，生产版本与Git提交不可凭版本ID推断对应。
