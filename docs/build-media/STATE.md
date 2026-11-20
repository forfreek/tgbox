# 当前状态

日期：2026-11-20，Asia/Shanghai。

- 基线：origin/main a7e1939；独立工作树 `C:/Users/123/tgbox-build-media`，分支 `codex/build-media-r2`。
- 原工作树的用户修改保持不动。本工作树只交付构建媒体读取修复。
- 已实现：输入/公开链接分离、S3 签名按需读取、凭据检查、对象数和 JSON 字节统计、Pagefind 挑战状态识别。
- 已验证：修改文件 Biome 检查通过；仓库 9 个包的 typecheck 通过（6 个任务命中缓存）；脚本 tsc 通过；8 项脚本测试通过，含首页/Pagefind 的挑战与普通 403/404 探测。
- snapshot 最终串行复核 38/38 通过（`vitest run --maxWorkers=1 --testTimeout=20000`），包括完整快照一致性对比。默认并发复测曾在既有支付开关测试遇到 Windows 5 秒超时；未修改仓库默认超时。
- `pnpm check` 在 Windows 因已有 CRLF 格式差异失败（668 条错误），未批量格式化无关文件；Linux 的全仓检查与测试以 [PR #55 的 CI](https://github.com/forfreek/tgbox/pull/55/checks) 对应提交结果为准，避免将本地局部检查写成全仓通过。
- 源码自审：核对了输入选择、公开条目筛选、并发上限、缺失与故障区分、SDK 生命周期、凭据注入范围及日志脱敏；本次没有增加公开 HTTP 回退或发布失败数据的降级路径。
- 2026-11-20 用户已自行配置 R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY；真实 S3 签名和读取权限已通过完整构建验证。原 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN 保留。未执行写入测试，未核实实际 token 策略或模拟远端故障重试。
- PR #55 已于 2026-11-20 02:30（Asia/Shanghai）合并；原 PR 的实现、只读验证及文档版本 CI 均通过。
- 增加工作流 `verify_only` 手动选项：使用真实 D1/R2 完整构建，但跳过部署、公网探测、清除 dirty 与下游派发；默认发布行为保持不变。guard 脚本测试通过，脚本测试合计 9/9；3e24dfa 的 Linux 全仓 CI 通过。
- 本会话未修改生产防护设置。PR 合并后主分支已自动部署成功，见下方发布记录。此前插件重连失败、CLI 无凭据管理接口权限是当次快照，不应作为未来连接状态的结论。

## 真实输入验证

- [Actions 44587011095](https://github.com/forfreek/tgbox/actions/runs/44587011095)，提交 3e24dfa，verify_only=true，2026-11-20 02:22–02:24（Asia/Shanghai），成功。
- 1959 条公开收录（775 频道 / 421 群组 / 763 机器人）；2734 个逻辑 GET，2252 个存在、482 个 NoSuchKey；JSON 正文合计 8,861,591 bytes，约 8.86 MB，不含协议开销及可能的重试流量。
- 生成 5877 个详情页、10659 个静态文件、3999 个 Pagefind 文件；完整 job 用时 2 分 18 秒。
- 部署、公网探测、清除 dirty、下游派发均由工作流确认 skipped。此为真实生产输入的只读构建验证，不是生产发布验收。
- 未确认当时 Bot Fight 状态；本地抽查原失败对象的公开 URL 返回 404（无 challenge header），不能用此证明防护开启。防护开启下的发布及访客访问仍待后续验收。

## 合并后发布记录

- 2026-11-20 02:30–02:32（Asia/Shanghai），[主分支 Actions 44588503483](https://github.com/forfreek/tgbox/actions/runs/44588503483)，提交 816f37a，成功。
- 真实 R2 读取、完整构建、部署、公网探测、清除 dirty 步骤均成功；下游 awesome 派发跳过。首页 canonical 为 https://tgsearch.app/，HTTP 200；该次日志无实际 challenge 警告。
- 读取量仍为 2734 个逻辑 GET、8,861,591 JSON 正文字节；静态文件 10659。部署上传 557 个文件，复用已有 10100 个资产。
- 该记录证明部署流程成功；未独立确认当时 Bot Fight 开关，也未完成浏览器端完整功能与性能验收。

## 下一步：数据增长风险

- 用户要求登记数据增大问题；详见 [容量与扩展性待办](SCALING.md)。当前仍为全量读取、全量生成，尚无条目级增量构建。
- 后续先测峰值内存、单对象体积、阶段耗时、产物大小和文件数；按既有计划评估动态化、数据窗口或有正确失效机制的增量处理。
- 当前仅完成记录，未启动容量改造或扩大已授权开发范围。
