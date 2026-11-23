# 七D：固定50条灰度与审核弹层

## 授权及步骤（2026-11-23）

用户授权自动摘要小范围上线50条观察，后台审核改为当前视区叠层。替代旧10–20条上限，不等于全站扫描或未经审核自动发布。

工作树 C:/Users/123/tgbox-ai-summary-rollout50 / codex/ai-summary-rollout50，基于404564f，独立PR依赖七C#70。顺序执行：

1. 实现和本地验证：已完成。固定名单见[机器记录](../../apps/ai-summary/evaluation/rollout50-2026-11-23.json)，当前已批准且原简介去空白长度至少15的最新50条，20频道/19机器人/11群组。这是候选范围，不表示50份摘要均合格，资料不足仍跳过。
2. 独立PR、Linux CI、按依赖顺序合并；部署已有Admin和摘要Worker，保护远端认证变量及密钥。无新资源，无生产迁移。先核对白名单，再启用生成。
3. 通过带旧配置比较的操作开启enabled/auto_scan，保留最新管理员配额；向原队列发送50条observe消息作首次回填。后续每5分钟检查名单内2条，一轮125分钟，同指纹不重新推理，人工锁定不覆盖。
4. 只让人工已批准投影展示：GitHub构建白名单与Worker一致，AI_SUMMARY_DISPLAY=1，重建部署；检查三语批准页、未批准/名单外回退、原段落及canonical/hreflang/搜索边界。记录任务、尝试、弃答、失败、越界数量和实际版本。长期质量及SEO效果须后续观察。

## 实现入口及契约

- `apps/admin/src/features/ai-summary/summary-page.tsx`复用Base UI Dialog/Portal，当前视区限高、内部滚动、标题、关闭/Esc、焦点恢复，保存及错误反馈留在弹层内。批次20条后台操作限制不变。
- `packages/shared/src/ai-summary-rollout.ts`共用解析器，上限50；空/非法/星号/51条关闭。快照入口复用，最多预载50条。
- `apps/ai-summary/src/index.ts`始终把解析后名单传给tasks；空配置关闭。扫描只观察名单，消费拒绝越界；`packages/db/src/ai-summary.ts`原子outbox领取增加参数绑定JSON过滤，范围外待办不能抢队列。底层不传scope的旧函数契约保留，生产入口不会用其进行全站扫描。
- 源码wrangler白名单默认空，生产部署显式传固定名单；不带名单重新部署会安全关闭。模型Gemma/v7/v3保持，不联网补资料，不改原始Telegram资料，不在构建推理。

首次观察消息为`{"v":1,"action":"observe","entryId":1997}`，只通过真实source loader观察及派发，不直接推理。普通生成消息不变，含jobId/generation/inputHash/dispatchedAt；消费仍经过来源、租约、配额、锁定检查。重复observe不会重复调用，观察进DLQ会记录错误，后续名单内cron可重新观察。

无需新增表、字段或迁移。人工批准/锁定门禁保留，不替管理员批准新稿。

## 实际本地验证

Worker84/84，含固定50条整轮、重复不推理、范围外待办不派发/消费、空名单关闭、首次观察幂等和暂停；DB74/74，Admin111/111，快照摘要14/14；全仓10包类型检查通过，Web314文件0错误/警告/提示；Admin build、Worker dry-run通过。本地测试不调用真实模型。

UI使用虚构本地D1/R2、remoteBindings=false、独立无界面Edge/Playwright；Browser插件未提供。1440×1000和390×844验证当前视区打开、限高/内部滚动、原页面不滚动、Esc/关闭返回按钮焦点、弹层内保存锁定和反馈、无应用运行异常。临时截图和QA记录在仓库外。没有操作用户已登录浏览器。其他浏览器/屏幕阅读器未验证。

## 生产记录及回退

部署前核验：Admin70e805f9-27f9-4d70-a601-35b529ef0989，摘要Worker ff4d5366-55fe-41f5-b84b-75fa7295e7af，Web6eeabb69-8272-486e-816c-31a9ab59fc8a；D1 bookmark 000012e5-00000000-0000512c-948263d32551069df5b864e250c5d5c0。

当前管理员配额200次/日、8000预留Neurons、每次100、maxAttempts=1，保留其调整。预留值不是Cloudflare实际账单。上线结果待追加。

回退：后台关闭enabled，必要时关闭auto_scan；GitHub AI_SUMMARY_DISPLAY改0并重建。清空Worker名单可停止扫描/派发/消费。单条撤回后重建；不删除原简介、生成历史或人工编辑，不恢复整个D1。代码回滚用部署前版本；旧Worker没有名单保护，回滚前必须关enabled/auto_scan。
