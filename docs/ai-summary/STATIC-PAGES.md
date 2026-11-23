# 六C：页面展示、人工繁中与契约验收

2026-11-23 六C交付完成：草稿 [PR #67](https://github.com/forfreek/tgbox/pull/67) 依赖#66，代码f1ad243d8a74a2181695d1a8186910ea93032d63的 [Linux CI 45114637565](https://github.com/forfreek/tgbox/actions/runs/45114637565) 全部通过（2m14s，含Web449项、全仓check/test及脚本类型/测试）。十一份文档267个本地链接及diff通过。后续仅补文档记录，代码不变；保持草稿不合并，未生产启用。下一节点七须明确生产授权。以下核验中记录保留当时边界。

2026-11-23，Asia/Shanghai。独立工作树C:/Users/123/tgbox-ai-summary-pages，codex/ai-summary-pages，基于六B的687854d。保持Gemma/v7/v3，无新模型调用、生产迁移、部署或线上灰度。本节点完成步骤六的本地页面接入，不代表生产已启用。

## 展示与回退

[DetailPage](../../apps/web/src/views/DetailPage.astro)仅在构建环境AI_SUMMARY_DISPLAY精确等于`1`且快照含完整有效三语稿时增加用途段。原事实首段、原简介、人数等内容保留，detailSeo及JSON-LD仍沿用原事实；新增段data-pagefind-ignore，不改变既有Pagefind内容来源。不存在、空白或其他flag值均关闭。

上游仍须通过六B的AI_SUMMARY_ENTRY_IDS（最多20个明确正整数ID）生成已批准且来源有效的快照。空/非法白名单关闭快照消费；展示开关不触发推理、不等同后台enabled或auto_scan。工作流仅新增两个既有GitHub变量的env传递，默认空，未设置实际生产变量、调用工作流或合并PR。

[approvedSummaryText](../../apps/web/src/lib/ai-summary.ts)按当前locale选简中、人工繁中或英文；任一语言损坏都回退整个AI段。[EntryView](../../packages/shared/src/site-data.ts)的可选AI字段增加catch(null)，外部旧快照或单条坏稿不会因该字段阻断整个页面构建，其他业务字段的原有严格校验不变。

这是静态开关：关闭后必须重新构建发布才能撤除已部署HTML。测试已执行关闭→开启→关闭重建，最后一次复用开启时的Astro缓存，生成HTML逐页恢复原样。正常生产入口应使用build-site完整数据管线，不能以未经重新核对来源的历史SITE_DATA_PATH直接发布，测试夹具只用于本地契约证明。

## 人工繁中与文本安全

三语介绍均通过Astro文本插值，未使用set:html、innerHTML或自动链接；引号、尖括号、&和换行以正文显示。核对Modern Web Guidance的sanitize-untrusted-html后，因本任务不接受富HTML，没有引入Sanitizer/DOMPurify及客户端HTML注入接口。

[hant.ts](../../apps/web/src/lib/hant.ts)只保护生成器明确标记为AI、preserve=true且内容为已转义纯文本的p节点，其余页面、metadata和外部URL沿用原转换。没有整页/整script保护，也没有可被用户正文碰撞的占位符。伪造的转义标记、不带AI标记的段落及含子标签的节点不能抑制转换。真实构建及浏览器验证人工繁中中的「后台」品牌、URL里的简体字和HTML特殊字符未被OpenCC改写，其他正文仍正常转繁。

## 构建、搜索与浏览器证据

[构建回归](../../apps/web/test/ai-summary-build.test.ts)使用合成批准稿和一条损坏稿，执行关闭、开启、关闭回退三次完整本地Astro构建。八项回归覆盖三语纯文本、坏稿回退、事实段保留、人工繁中原文、全部生成URL及SEO metadata（canonical/hreflang/JSON-LD等）和实际Pagefind输出。

开关前后，去掉唯一新增AI段后，其余全部HTML逐字节相同；关闭重建后与初始关闭版逐页相同。简中和繁中实际Pagefind词项index及fragment文件哈希一致。最初尝试整个Pagefind目录字节比较时，发现filter/entry辅助打包顺序有非确定差异；保留该发现，未声称所有辅助文件哈希一致。完整HTML比对保证原索引/筛选来源不变，本地浏览器又验证实际搜索结果、筛选项相同，专用AI测试词零命中。

Astro新构建测试使用独立TGBOX_BUILD_CACHE_DIR，默认不改变应用缓存路径。首次将手工build与完整测试并行运行导致Windows Astro缓存rename EPERM及既有链接检查5000ms超时；停止并行后，以--maxWorkers 1 --testTimeout 15000完整复跑448项通过，之后新增回退重建用例定向8项通过。仓库默认超时未改；最终默认449项由Linux CI核验。首次三个转义断言漏算Astro对引号的&quot;编码，修正测试预期，渲染代码不改为HTML注入。

全仓10项typecheck通过（Web314文件0错误/警告/提示），定向Biome/diff检查通过。合成输入只证明展示与安全契约，不是新的模型质量评价。没有调用build-site --remote或生产构建工作流。

浏览器环境为本地静态HTTP、Playwright与已安装Edge headless（Browser plugin not available），1440×1000及390×844。逐一验证三语textContent与批准稿相同、无script/img子节点、无对话框或页面异常、无手机横向溢出，并读取开关两套Pagefind实际搜索/筛选返回值。截图已查看，脚本、截图及summary-browser-report.json留在忽略的.data，均为合成测试内容，没有上传真实频道资料或凭据。

## 文件及下一步

新增ai-summary.ts及其单元测试、八项真实构建回归；修改DetailPage、hant及其测试、Astro可隔离缓存配置、共享AI可选字段回退及build-deploy变量传递。没有数据库新迁移、资源绑定或模型参数改动。

六A契约、六B数据、六C页面的本地实现边界已闭合。下一步步骤七仍须明确授权后进行：核验堆叠PR合并/自动部署影响、生产迁移和队列资源准备、固定10–20条白名单灰度、暂停/撤回/关闭重建演练。当前PR保持草稿不合并，推理与全站扫描默认关闭，不批量处理约2000条历史资源。
