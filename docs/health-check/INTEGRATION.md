# 2B2 运行入口与后台接入

2026-11-27，Asia/Shanghai。工作树 C:/Users/123/tgbox-health-integration，分支 codex/health-check-integration；依赖2B1 #86。本文记录本地实现，生产仍未迁移或部署。

## 运行策略

- snapshot 产生 health-v1 网页观察与 profile/preview 来源结果。主页识别是身份诊断；占位、HTTP异常、网络错误与类型变化均不修改发布状态。预览不可用不会推翻有效主页；创建时间辅助页也纳入 preview 退避。
- Cron、手动刷新、新增、审核和Bot采集统一使用来源控制；429/401/403/5xx/网络/结构错误进入各来源退避。Retry-After按秒或HTTP日期解析；profile和preview分别控制，批内保留最严重结果及最长等待，批末各最多一次CAS写入。
- 头像优先通道仅抓主页并更新头像；不产生健康证据，不写资料/统计/帖子。常规与手动仅在持久化接受且当前公开状态为accessible时更新完整资料，身份复核不能被正常网页悄悄解除。
- 已移除所有生产调用recordLivenessResult、自动隐藏/恢复与失效通知。hidden/restored仅保留空日志结构；旧数据库函数、列、枚举及收录瞬时正向门禁的兼容返回留至阶段四删除。不得重新接回旧写入方。
- 新收录仍需正向识别；unknown不自动通过。人工审核权限保留，未知网页不等于机器批准。生产历史隐藏没有恢复。

## 后台、机器人与权限

- 列表筛选/徽标、仪表板历史系统隐藏、收录/审核预览采用安全口径。缺新健康行默认未检查，旧active/banned/fail_count不转换为新结论。
- 后台新增证据与人工验证面板，最多16条证据；公开身份与机器人功能分开显示，保留检查时间/历史成功时间、验证操作/范围/时间。
- 人工功能记录与身份确认通过adminMiddleware；输入严格白名单，拒绝actor/时间/observationId/status等客户端字段，由服务端生成。身份确认须当前待复核、revision及时间栅栏；确认后清为未检查，不恢复上线。
- 人工健康、证据、审计在同一D1 batch内提交；审计失败整批回滚，旧revision/重放不追加审计。网页观察仍按2 SQL，人工记录改为3 SQL预算。
- Bot /status简中/繁中/英文显示公开身份、确认时间、独立功能结果与实际操作范围；无健康记录不再显示旧连续失败或active断言。
- 通用编辑没有健康写入字段，私有健康/证据/人工备注没有进入静态导出或Pagefind。

## 预算及回归

- 整个Cron上限45：前置maxId+claim+取页+来源读取最多6 SQL；regular每条保守预留14，头像每条4；末尾预留7（dirty/dispatch4、来源CAS2、checkpoint1）。兄弟任务已花39时不再开始读取。D1 batch按SQL条数保守计账。
- 2092条目录本地集成场景，6条候选均需完整写入，断言处理与延后合计6、总计<=45、延后项零采集、健康行数等于已处理数。此为代码计账回归，不当作生产计费或耗时测量。2B1另测2093条库中100条health页实际300 rows-read。
- 测试入口：packages/telegram/src/snapshot.test.ts；packages/core/test/health.test.ts；packages/db/src/{health,admin}.test.ts；apps/bot/test/{refresh/refresh,bot/admin,bot/submit}.test.ts；apps/admin/src/features/entries/health-input.test.ts。
- 本地全量：Telegram96项、core161项、db99项、Admin113项；Bot全量175项通过后新增三语3项及规模1项，最新专项admin12项/refresh36项通过。全仓typecheck10任务通过（Astro314文件0诊断）；Admin生产构建通过。最终Linux CI按PR最新检查核验。
- Node旧库升级回归1项通过；Wrangler本地应用0000–0027，没有生产迁移。缺0027会显式报错，不降级到旧隐藏规则。数据库兼容保留不意味着允许回滚旧策略。

## 浏览器验收

Browser插件未提供，依frontend-testing-debugging使用项目已有Playwright和Edge；本地127.0.0.1:8789、dummy .dev.vars、local-only模式、模拟条目910001–910003，不连接真实机器人操作。未新增依赖或提交QA库。

- 桌面1440x1000：列表健康与成员数据、面板无加载即报错、空提交阻止、机器人记录保存、身份确认保存均通过。读回两种人工审计的actor为email:dev@localhost；确认身份后hidden_by_system保持。
- 手机390x844：面板滚动、原生必填、功能记录真实POST保存、无横向溢出；无pageerror。两页相同revision并发保存，第二页明确显示冲突。
- 对健康GET以非localhost主机127.0.0.2重放，adminMiddleware返回401 Unauthorized。另一dummy域名被Vite allowedHosts以403提前拦截，不能将其当成应用鉴权证据。POST授权仍由相同middleware、严格输入及现有认证测试覆盖。
- 本地截图 .data/health-desktop-form.png、health-mobile.png、health-mobile-submit.png 已查看；.data不提交。验证是本地模拟，不证明线上机器人功能或全站采集成功。

## 剩余阶段与发布门禁

本节点交付阶段二实现及本地集成。阶段三重新取历史系统隐藏证据，形成逐条清单；经明确授权才修复。阶段四按0027迁移、Bot/Admin一致发布、网站构建顺序执行；观察一轮常规扫描与头像通道、复核积压和真实请求读写，然后移除旧列/函数/枚举/兼容输出。专题在清理与生产验收前保持未完成。

回滚只允许支持新表且不自动隐藏/恢复的安全版本。旧阶段一仍含类型变化隐藏，不能作为可直接部署的回滚包；需专门安全补丁。不得将旧Worker与新Admin混用上线。

## CI修正记录

2026-11-27 PR #87 CI45949457611：lint/typecheck通过，测试发现繁体生成词典不同步（简体源格式化后未重生成，且localeCompare受宿主ICU默认排序影响）。已修正为固定码点顺序、规范生成换行，按最终简体源重新生成；同步测试只忽略checkout换行，新增禁止宿主localeCompare及CRLF/LF等价回归。Hant本地6项与类型检查通过；最新完整CI待核验。
