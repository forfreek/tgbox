# 步骤七A：生产准备与灰度执行边界

核验日期：2026-11-23，Asia/Shanghai。工作树C:/Users/123/tgbox-ai-summary-rollout，分支codex/ai-summary-rollout-plan，基于六C6073368，PR依赖#67。本节点只读审查、文档与本地验证；没有合并、生产迁移、创建资源、部署、改生产配置或调用模型。

## 结论

代码已具备小批灰度入口，但生产前置尚未具备。不能以“CI通过”或“Workers Paid”推断线上已经可运行。应按七A准备、七B关闭状态部署、七C固定白名单生成与审阅、七D展示及回退演练推进；每个执行节点独立交付，跨节点等用户指示。七A不代表整个步骤七完成。

## 当前证据

| 对象 | 本次核验结果 | 证据入口与限制 |
| --- | --- | --- |
| PR链 | #61→#62→#63→#64→#65→#66→#67均OPEN、未合并；#61/#62非草稿，其余草稿 | GitHub只读核验；不能沿用“全部草稿”的旧描述 |
| main | cb0d6a6，最近合并#60 | git fetch后核验；merge-tree(main,6073368)无冲突，只证明能合并，未验证合并树运行行为 |
| 代码CI | f1ad243的45114637565成功；6073368的45114915818首次失败，原配置复跑成功 | 首次快照CLI `writes SiteData JSON and prints counts`在5000ms超时（build-site-data.test.ts:430），Turbo中止其他任务。保留首次失败，不调整默认超时；复跑已完成全仓检查/测试与脚本检查 |
| GitHub变量 | 仅SITE_URL、R2_PUBLIC_URL、PUBLIC_BOT_USERNAME；无两个AI变量 | gh variable list，不读取secret值；组织/环境配置和外部部署系统未穷尽审计 |
| 生产D1 | tgbox / 426a1d23-bde7-42fc-a5ab-e76b3b408df5，最新迁移0021；无ai_summary_*表 | Cloudflare连接器只读SELECT，schema和migration两次查询rows_written均0；没有导出用户资料 |
| 生产Worker | 既有tgbox-web、tgbox-admin、tgbox-bot；无tgbox-ai-summary | Cloudflare Workers列表；只记录相关资源，不把列表中其他项目纳入操作 |
| Queues | 无tgbox-ai-summary、tgbox-ai-summary-dlq | 当前账户队列列表共11条、1页；未创建或消费消息 |

当前连接账户已核对目标D1可读；未来使用CLI部署前仍须核对CLI账户/权限与此账户一致。本次只读权限不证明有迁移、Queues或Worker写权限。

## 合并与自动部署影响

[build-deploy](../../.github/workflows/build-deploy.yml)的push只监听main；应用代码或build-deploy工作流变化会触发网站构建，纯Markdown等被paths-ignore排除。SITE_URL已设置，push强制build，不依赖dirty flag。该任务只导出D1、读R2、生成静态页并部署tgbox-web；不运行D1 migrations apply，不部署tgbox-admin、tgbox-bot或tgbox-ai-summary。

因此按依赖顺序合并到main会真实触发网站部署，不能称“合并无生产影响”。合并到依赖分支本身不会触发main的push部署，但最终进入main仍会。每次合并后核验下一PR的base、diff、CI与部署结果；不要提前批量retarget所有PR到main，避免把依赖重复包含或丢失。当前无合并冲突不替代每次合并后复核。

关闭边界：AI_SUMMARY_ENTRY_IDS为空使[build-site](../../scripts/build-site.ts)不导出AI公开表；AI_SUMMARY_DISPLAY非精确1使[详情页](../../apps/web/src/views/DetailPage.astro)不显示AI段。AI字段无效时回退，原摘要与metadata保持。故代码合并可保持旧展示，但依然是一次生产网站构建/发布，并非零风险。

后台采用独立Vite构建和部署，README的既有部署说明见[项目README](../../README.md)；仓库仅CI和网站Build & deploy工作流，没有后台/新Worker自动发布流程。Bot和核心refresh在本系列相对main没有改动，不需要为摘要功能重新注册Telegram webhook。

## 七B：关闭状态的生产准备（尚未执行）

严格按以下顺序执行，并对每个远端操作记录目标、SHA、结果和回退入口：

1. 审查通过PR链；记录当前Web/Admin版本、回退版本和队列/数据库状态。确认合并会自动部署Web，AI变量仍关闭。合并按依赖顺序推进，不跨入全量回填。
2. 重新只读列出D1未应用迁移，必须只出现本次已审查的0022–0025；如出现其他迁移先核查，不能把所有待执行迁移默认为本任务授权。记录迁移前恢复书签/备份入口。
3. 应用已批准迁移，再核对表、索引及默认值。四份迁移分别为[0022任务基础](../../packages/db/migrations/0022_ai_summary_jobs.sql)、[0023人工稿](../../packages/db/migrations/0023_skinny_angel.sql)、[0024自动扫描开关](../../packages/db/migrations/0024_classy_hitman.sql)、[0025公开投影](../../packages/db/migrations/0025_tough_black_crow.sql)。不得删除原表或回写Telegram资料。
4. 新建两条队列tgbox-ai-summary、tgbox-ai-summary-dlq；若同名资源已存在，停止创建并核对归属/消费者。两者同jurisdiction。不得修改本账户其他项目队列。
5. 部署新Worker tgbox-ai-summary，配置来自[wrangler.jsonc](../../apps/ai-summary/wrangler.jsonc)：DB复用tgbox，MEDIA复用tgbox-media，AI绑定；5分钟cron；主队列batch2/concurrency1/max_retries3，DLQ batch2/concurrency1；workers.dev和preview URL关闭；Logs/Traces开启。无需新域名、DO、VPS、数据库或R2桶，也无需给该Worker添加现有bot密钥。
6. 构建并更新既有tgbox-admin，保留原认证、域名、密钥与其他设置；先核对生成配置及远端绑定，防止部署覆盖漂移设置。此时必须enabled=false、auto_scan=false、model=disabled；页面加载成功，其他后台流程抽检正常。
7. 检查cron和队列不调用AI，没有任务或自动扫描意外启动。新表缺失时后台AI页/新Worker不保证可用，必须先迁移再部署使用者；关闭变量时现有静态构建可继续回退。

以下命令是经本地工具帮助核对的执行模板，本轮未运行任何remote写命令。远端操作前再次核对cwd、配置、账号、实际pending列表与授权范围：

```powershell
# 仓库根：只读检查待迁移清单
pnpm --filter @tgbox/ai-summary exec wrangler d1 migrations list tgbox --remote
# 仅待迁移集合确认等于0022–0025后，授权执行
pnpm --filter @tgbox/ai-summary exec wrangler d1 migrations apply tgbox --remote
pnpm --filter @tgbox/ai-summary exec wrangler queues create tgbox-ai-summary
pnpm --filter @tgbox/ai-summary exec wrangler queues create tgbox-ai-summary-dlq
pnpm --filter @tgbox/ai-summary exec wrangler deploy
# 既有Admin：先构建，再用构建产物关联的配置部署
pnpm --filter @tgbox/admin build
pnpm --filter @tgbox/admin exec wrangler deploy
```

Wrangler锁定4.132.0，不在本节点升级。D1 apply会应用所有未执行文件，不是只挑指定四份；失败迁移回滚不代表之前成功迁移也回滚，见[官方命令说明](https://developers.cloudflare.com/workers/wrangler/commands/d1/)。DLQ不存在时平台可能自动创建，见[官方DLQ说明](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)，因此部署本身也必须涵盖资源创建授权，不能以省略create命令绕过确认。

## 七C：固定小批生成与人工审阅（尚未执行）

- 只选择10–20条明确ID，建议12条、频道/群组/机器人各4条；优先有明确用途，同时保留资料不足、重要限制和混合简介案例。灰度选样未完成，不把历史16条调优回归称为独立新样本。
- 保持Gemma 4 26B A4B，summary-prompt-v7 / summary-params-v3，禁止联网补资料。先执行后台批量预检，再仅为可生成项确认生成；不足正常跳过，来源冲突复核，不强行补写。
- 首批建议dailyCalls=20、dailyNeurons=2000、reservation=100、maxAttempts=1，enabled=true、auto_scan=false。一次至多20个ID，首轮暂不自动技术重试；需要重试时在原样本内另行记录，避免无意追加调用。UTC日界限见[claimSummaryJob](../../packages/db/src/ai-summary.ts)，跨日会恢复配额，不是永久20次总额。
- 应用的neurons是固定reservation记账；[adapter](../../apps/ai-summary/src/models.ts)返回正文、不把提供商实际usage结算回D1，因此不能视为真实账单上限。以dailyCalls限制最大尝试数，另看Cloudflare实际用量。旧v7的14次164.790902 Neurons仅历史测量，不是本批承诺或最新报价。
- enabled允许已有选中任务消费，并不是ID级推理白名单；auto_scan=false禁止定时newest/rolling扫描，但有权限的后台仍可选择别的ID。启用前检查待任务为空或全部属于本批，暂停其他管理员批量操作；AI_SUMMARY_ENTRY_IDS只管构建消费，不能限制推理。
- 默认展示仍关闭。逐条对照来源、zh/hant/en、refs、重要限制、身份归因和自然度；重复原简介、补事实、错误或价值不足均不批准。允许人工编辑并锁定，不为凑覆盖率批准。保存生成/跳过/冲突/失败/编辑/批准统计及实际用量，再暂停enabled。

## 七D：白名单展示与回退（尚未执行）

1. 人工批准后设置AI_SUMMARY_ENTRY_IDS为本批中批准的ID（逗号分隔正整数、最多20个），先保持AI_SUMMARY_DISPLAY关闭。执行verify_only构建核验实际来源指纹及产物；不以“后台批准”推断一定能进快照。
2. 再明确开启展示变量AI_SUMMARY_DISPLAY=1，构建部署Web；只发布同一白名单。抽查三语HTML、用途/限制/品牌、旧事实段、canonical/hreflang/JSON-LD、搜索、投稿及审核通行。资料已变化的批准稿允许快照回退，并记录原因，不绕过指纹守卫。
3. 暂停：enabled=false阻止新领取/提交，auto_scan=false保持；已发出的模型请求可能仍产生费用。暂停不撤销已部署的静态段。
4. 单条撤回：后台撤回使公开投影删除并标dirty，重建发布后确认三语回退。不要只检查后台状态；现有静态HTML在新部署前仍含旧段。
5. 全站关闭：DISPLAY设0并清空ENTRY_IDS，先检查所有在途/排队build-deploy。该工作流concurrency不取消已在运行的部署，改变量不会修改旧run已捕获的环境；需按授权取消/等待旧启用构建结束，确保最后成功的是关闭版，再核对线上。紧急可恢复已记录的无AI Web版本，然后按最新数据重建。
6. 不逆向删除AI表、审计或原资料；Worker回退不回退D1/Queues数据，迁移不做破坏式down。全库Time Travel会影响其他正常业务，不能作为单摘要撤回手段。保留审阅和运行证据后再报告步骤七结果，不自动扩大至2000条。

verify_only由[现有工作流测试](../../scripts/build-workflow.test.ts)验证不会部署、清dirty或触发下游dispatch；它仍读取生产D1/R2、消耗构建资源，且不会把产物自动变成可人工审核的artifact。本轮没有触发verify_only或其他生产构建。

## 执行授权的具体范围

七B需要明确同意：按依赖合并#61–#67（会自动部署网站）、对既有tgbox应用0022–0025、新建两条指定Queues和tgbox-ai-summary Worker、更新既有tgbox-admin；保持推理、全站扫描和AI展示关闭。不包括新域名/密钥/桶/数据库，也不包括真实生成、全站回填或删除资源。

七C/七D再按固定ID、配额和展示范围执行，不能把七B的关闭部署授权自动延伸为真实推理或公开发布。项目[资源规则](../../.cursor/rules/require-consent.mdc)要求具体create/delete先确认；当前“开始”用于准备审查，没有覆盖这组新资源创建。

## 本节点验证及限制

本地安装使用frozen-lockfile/offline，未升级依赖。Wrangler4.132.0及migrations list、queues create帮助已核对，remote写模板未执行。临时内存SQLite依次应用现有25份SQL，验证8张AI表、默认enabled=0/auto_scan=0/model=disabled、外键一致及任务/公开表为空；脚本留在忽略的.data/check-rollout.mjs。该检查验证SQL结构和默认关闭，不替代Cloudflare生产迁移验收。

`node --test scripts/build-workflow.test.ts`两项通过，验证verify_only保护和部署探测；Git merge-tree无冲突。没有应用代码/配置变更，未重复运行模型或把文档检查称为新增功能验收。本节点文档链接/diff、独立PR和CI结果另记STATE/MEMORY。
