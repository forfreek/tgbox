# 步骤五：后台人工控制

后续六B已接入批准公开投影与dirty标记，见 [STATIC-DATA](STATIC-DATA.md)。以下步骤五“批准不触发dirty”的说明属于当时边界；六C公开页面展示仍未实现。

2026-11-22，Asia/Shanghai。工作树C:/Users/123/tgbox-ai-summary-admin，分支codex/ai-summary-admin，基于步骤四2a121b7；PR的base为codex/ai-summary-models。模型保持Gemma 4 26B A4B、prompt-v7 / params-v3，没有新增模型试跑或修改提示词文本。

## 已实现的操作

交付为草稿 [PR #64](https://github.com/forfreek/tgbox/pull/64)，base=codex/ai-summary-models；依赖#61 → #62 → #63 → #64，保持不合并。补充同源校验后浏览器核心流程重新通过，使用原server-function协议头重放跨站Origin收到403；直接省略协议头的请求会进入框架错误路径，不能据此判定Origin检查。

本次新增写接口另加严格Origin同源校验：只允许同协议/主机/端口的POST，缺失、null、跨站及不匹配端口均拒绝；不依赖未配置的全局CSRF中间件，也不修改既有接口。新增8项同源检查后Admin合计111/111，以下“原有103”指加本次校验之前的基线测试数。

后台导航新增 `/ai-summary`。所有读写server function沿用adminMiddleware的Access/Telegram认证，写操作为POST，客户端不能指定actor。界面可按待审、失败、已批准、锁定筛选，列表每页20条；抽检按未检或最早检查优先，不宣称随机抽样。独立详情按需读取，最近20个生成版本倒序，不全量加载历史。查询使用React Query缓存，手动刷新或修改后失效，不高频轮询D1。

配置只提供已验证Gemma组合；每日调用上限、每日Neurons预留预算、单次预留量和最多尝试次数服务端校验。预留不可退款，显示的是预算账本，不是实际账单或严格费用上限。每日按UTC切换；单次预留至少100 Neurons，不能通过界面降为零。

最多选择20条预检或生成。预检只读D1/R2、执行规则，不写观察/任务、不推理；生成写独立来源与异步任务，同指纹/版本复用已有任务，不在后台请求里推理。单条读取错误保留独立结果，不阻断其他条目。重试只开放技术失败，保留旧尝试配额，创建新generation；insufficient、普通缺资料、锁定和配额暂停不能靠该按钮强制扣费重跑。

“启用异步生成”允许已选择任务消费；新增auto_scan开关默认false，才允许既有newest/rolling定时全站扫描。启用消费本身不再偷偷启动历史回填。灰度之前保持全站扫描关闭，线上是否启用留到后续授权节点；暂停不取消已发出的模型请求，但提交仍检查enabled及任务/编辑身份，暂停期间不提交公开或新草稿。

详情展示当前原简介、生成时证据和简中/繁中/英文草稿。繁中按需在浏览器加载既有@tgbox/hant转换，不额外推理、不在Worker请求里运行OpenCC；异步初始化不会覆盖已经输入的繁体内容。三语都可人工修改，中文120码点、英文90词硬限。表单使用显式label、原生约束、明确submit/helper按钮，提交错误通过status区域宣布并将焦点移至提示。

保存三语单独成稿，自动锁定、撤销旧批准；批准、撤回和标记抽检均为独立操作。人工动作通过source的edit_version及observation_token做CAS，增加generation并废止在途旧任务；并发编辑只允许一个成功。批准前重新读取D1/R2、核对来源指纹和生成修订，最终SQL事务再次核对D1资料/可见性。仅检查过时结果不会批准它；来源已变时可以撤回，需解锁重新生成才能再次批准。抽检只允许已批准稿。R2与D1不能跨服务事务提交，最终静态消费仍须重新核对来源，不能把后台通过当作永久有效。

## 数据、审计及版本保护

`ai_summary_reviews`独立保存三语人工稿、生成修订ID、draft/approved/withdrawn状态、版本、操作人、更新时间及抽检时间。生成修订和原始Telegram简介不覆盖；旧ai_summary_revisions.review_status不再作为人工批准的来源，步骤六应消费新的reviews及当前有效性。

人工更新和audit_log在同一D1 batch事务中；每次成功动作的audit payload包含三语稿状态/版本快照，可在既有操作日志追溯先前人工保存内容。配置使用整行旧配置CAS防丢失更新；日志的token不含凭据。批量生成记录请求意图，之后每条独立观察可能成功或失败；其记录不能冒称整个批次全部创建成功。

共享ai-summary-config模块保存已确认组合，prompts只重导出原版本常量，v7请求计划保持不变。consumer在领取/预留配额前检查受支持的配置与job组合；调用adapter显式传递job的promptVersion/paramsVersion，每次调用再检查，避免只校验工厂闭包。queue handler已接入adapter，但D1默认enabled=false、model=disabled，线上不会因合并此源码自动开始推理；部署资源和配置还须后续授权。

## 文件入口与迁移

| 文件 | 作用 |
| --- | --- |
| [共享配置](../../packages/shared/src/ai-summary-config.ts) | 冻结组合及支持判断 |
| [DB后台方法](../../packages/db/src/ai-summary-admin.ts) | 有界列表、配置CAS、人工稿、审计、重试 |
| [来源读取](../../apps/ai-summary/src/sources.ts) | 提取只读预检与批准前校验，不把GET变成生成 |
| [任务](../../apps/ai-summary/src/tasks.ts) / [入口](../../apps/ai-summary/src/index.ts) / [adapter](../../apps/ai-summary/src/models.ts) | 配额前守卫、job版本、消费接线、扫描开关 |
| [后台业务](../../apps/admin/src/server/ai-summary.ts) / [受保护函数](../../apps/admin/src/functions/ai-summary.ts) | 输入约束、来源复核、认证边界 |
| [界面](../../apps/admin/src/features/ai-summary/summary-page.tsx) / [路由](../../apps/admin/src/routes/ai-summary.tsx) | 配置、列表、三语审核 |
| [0023](../../packages/db/migrations/0023_skinny_angel.sql) | 独立人工稿表、外键、状态约束 |
| [0024](../../packages/db/migrations/0024_classy_hitman.sql) | settings.auto_scan默认false |
| [运行时回归](../../apps/ai-summary/test/admin.test.ts) | 真实本地D1/R2及mock模型的后台流程 |

Drizzle生成两份SQL、对应snapshot及journal，仅在测试/本地验收库应用；没有执行生产migration。Admin新依赖指向已有workspace包，无外部库升级；生成routeTree由Vite更新。vite.config提供TGBOX_LOCAL_ONLY=1关闭远程binding代理用于UI验收，默认开发行为不变。

## 实际验证与限制

- Worker运行时79/79（含新增11项）；本地D1/R2验证并发配置、人工编辑保护、D1及R2过期证据拒绝、资料不足不重试、不可退款配额、全站扫描默认关闭、任务版本传递及mock AI binding入口。没有真实模型调用。
- Admin原有103/103、DB74/74通过；全仓typecheck的10个任务通过，Web311文件零错误/警告/提示。Admin生产build和Worker dry-run通过（1055.37KiB / gzip182.76KiB，未部署）。
- Windows全仓pnpm check受现有CRLF影响失败（696项格式错误），没有改写无关文件；本任务变更文件定向Biome核验，Linux CI另行核实，不把本地失败写为通过。
- 浏览器流程：`http://127.0.0.1:8789/ai-summary` → 配置保存 → 只读预检 → 三语预览 → 保存锁定 → 批准 → 抽检 → 撤回。Browser plugin not available，使用现有Playwright1.63 + 本机Edge headless，1440×1000及390×844，最终无应用console/page错误、无失败资源、无横向溢出。截图已本地查看；初次标签定位失败后改成显式label与控件分离，重跑通过。初次默认headless shell缺失，使用已安装Edge，未安装浏览器。
- `.data/admin-ui.mjs`、`summary-admin-ui.json`及desktop/mobile截图为本地忽略的验收证据，不含生产资料。唯一测试条目为ui_summary_bot（虚构本地机器人），配置保持disabled及auto_scan=false；不会把本地dev bypass配置部署到生产。

未验证生产Access/Telegram端到端、真实队列资源、线上迁移/部署及公开详情展示。后台虽有完整审核入口，批准不会触发静态构建、dirty_since或公开页面变更；构建消费、失效复核、默认关闭展示和URL/metadata/搜索回归属于步骤六。

## 回退与下一节点

当前PR不合并、不部署，依赖顺序仍按步骤二、三、四、五。上线前的快速停止为enabled=false，同时保持auto_scan=false；撤回单稿只改reviews状态。源码回退不删除人工表或审计，不逆向破坏原资料；代码回退不能撤销已消耗的推理配额。

下一节点单独实现静态快照读取已批准且仍有效的人工稿，消费三语、处理过期/缺表/坏记录回退，并接入构建失效与开关；静态构建不能调用AI。之后再授权灰度和分批历史回填。
