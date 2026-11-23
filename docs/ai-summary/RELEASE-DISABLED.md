# 七B：保持关闭的生产部署记录

2026-11-23，Asia/Shanghai。独立工作树C:/Users/123/tgbox-ai-summary-release，codex/ai-summary-release，基于七A1e02419，交付PR依赖#68。用户在确认七B的具体资源/迁移/部署清单后，询问是否全局替换；明确答复生产部署但生成、扫描、展示均关闭、不会处理历史条目，用户回复ok。此授权覆盖本节点，不含七C真实推理或七D公开展示。

## 已执行范围

| 项目 | 实际结果 |
| --- | --- |
| PR合并 | #61–#67按依赖顺序retarget至main后使用merge提交合并；草稿转ready，合并核对预期head SHA。未合并#68或本节点交付PR |
| main | 最终6551bd9c797aafd2965b50ac647c46592c303bd8；与本部署工作树apps/packages/scripts/workflows/lockfile差异为0 |
| D1 | 既有tgbox（426a1d23-bde7-42fc-a5ab-e76b3b408df5），仅应用待执行集合0022–0025，未更新原始资源资料 |
| Queues | 创建tgbox-ai-summary和tgbox-ai-summary-dlq；仅此两条，均连接tgbox-ai-summary消费者 |
| Worker | 新建部署tgbox-ai-summary，版本ff4d5366-55fe-41f5-b84b-75fa7295e7af；DB/MEDIA/AI复用既有资源；5分钟cron及两队列触发器登记；无公开域名、workers.dev关闭 |
| Admin | 本地Vite构建后更新既有tgbox-admin，版本70e805f9-27f9-4d70-a601-35b529ef0989；保留原域名、认证、全部线上明文变量及secret名称集合 |
| Web | main自动构建部署成功，版本8bb049ce-c8fa-4298-b2e8-405462952053；不含AI段 |
| 开关 | enabled=0、auto_scan=0、model=disabled；GitHub仍仅原三个业务变量，没有AI_SUMMARY_ENTRY_IDS或AI_SUMMARY_DISPLAY |
| 数据 | 部署后SELECT：任务0、尝试0、公开摘要0；外键检查无异常。没有新模型调用或2000条回填 |

合并SHA依次为：#61 b66707f、#62 ca5ea6e、#63 690a9b0、#64 08da263、#65 72cc163、#66 5838f49、#67 6551bd9。受GitHub concurrency影响，部分旧的待运行CI/部署被新run自动替代；未手动取消运行中的部署。最终main的CI和完整网站部署均成功，不以旧中间run替代最终验收。

## 验证

- 最终main [CI45117657530](https://github.com/forfreek/tgbox/actions/runs/45117657530)和[Build & deploy45117657499](https://github.com/forfreek/tgbox/actions/runs/45117657499)成功，含导出、快照、Astro/Pagefind、部署、线上smoke和dirty清理。没有手动运行verify_only或新增推理任务。
- 本机Wrangler4.132.0重新OAuth登录成功，whoami确认同一目标账户，具备D1/Queues/Workers写权限；本地依赖frozen/offline安装，版本未升级。摘要Worker dry-run1056.38KiB / gzip182.96KiB通过；后台Vite构建通过，既有inputValidator弃用提示保留，不改无关接口。
- API读回确认摘要Worker四个绑定正确、Logs和Traces均开启；主队列batch2/concurrency1/max_retries3且DLQ正确，DLQ消费者batch2/concurrency1。不是只凭CLI成功文字推断部署结果。
- 后台线上与源码默认变量存在漂移，尤其Access认证空默认值。部署前读取线上plain_text集合，覆盖本次忽略的dist/server/wrangler.json.vars，再用`wrangler deploy --keep-vars`保留未列变量和secret；部署后逐项比对plain_text完全一致，secret名称集合也一致，没有读取或输出secret值。未把线上变量写回源码，不仅依赖keep-vars处理同名变量。
- Playwright+本机Edge，在全新未登录上下文只读访问线上：简中/英文/繁中首页与telegramtips详情页共6页HTTP200；三语详情原事实段各1、AI段各0，canonical指向各自URL，首页lang正确。最终Web发布后重跑相同检查通过。未提交真实投稿、修改稿件或发送消息。
- `/ai-summary`未登录访问仍由既有Cloudflare Access引导登录，没有关闭或绕过认证。受认证后台的真实生成/批准/撤回流程未在生产执行；其功能测试沿用六C及步骤五代码验收，不冒称七B完成线上模型和人工审阅验收。

本地忽略的.data保存迁移、建队列、Worker/Admin部署日志及public-verification.json/verify-public.mjs；临时授权重定向query未写入报告。构建只修改过生成routeTree的换行，已恢复，不提交生成噪声。本节点没有应用代码、配置或依赖改动。

## 异常及边界

1. 原Wrangler令牌过期，首次OAuth回调网络fetch失败；用户要求重试，第二次授权成功。未读取旧凭据，也未要求用户提供密钥。
2. 第一次迁移返回Cloudflare7500内部错误；只读确认仍停留0021、AI表不存在后原命令重试成功。最终读回四份迁移名、关闭设置、计数及外键；不盲目重复可能部分成功的迁移。
3. 七A文档追加提交1e02419的CI45116469119也发生快照CLI5000ms超时，原配置复跑成功。所有失败保留，未改仓库超时；最终main CI另已成功。
4. CLI live tail连接ETIMEDOUT退出；只读遥测查询在登记初期未取到新Worker事件，不把空查询视为cron成功。定时触发登记及代码关闭保护已核验，首次真实执行证据待补核验；查询使用dry=true，未保存额外日志查询对象。[Cloudflare说明](https://developers.cloudflare.com/workers/configuration/cron-triggers/)新cron传播可达15分钟，不能将初期无事件直接判为故障，也不能据此宣称执行成功。

## 回退入口与下一步

部署前记录Web版本7065019e-0249-4584-96b7-337054e6ff76，Admin版本c76b2635-6b71-450f-bdd3-c7808ca6f739。D1迁移前bookmark为000012a7-00000006-0000512c-e15f26dce0c7e84c091f270d24398e2f；仅作为全库灾难恢复证据，不自动Time Travel或删除新表。本轮未执行任何回退或资源删除。

默认关闭即当前运行状态。若后台有故障可恢复旧Admin版本；Web可恢复上述旧版本，或基于最新数据关闭构建部署。代码回退不会自动还原D1/Queues数据；保持AI表、审计及原始资料。不会为了消除定时读而擅自删Worker/队列。

下一节点七C须再获继续指示：固定10–20条、先预检再按配额生成、人工逐条审阅，展示仍关闭；七D另行确认白名单发布及撤回/关闭重建演练。七B完成不等于开始全局替换摘要、真实推理或历史回填。
