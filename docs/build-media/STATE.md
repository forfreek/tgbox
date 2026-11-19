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
- PR #55 已正式待审；实现与文档版本 c6954c6 的 Linux CI 全部通过。
- 增加工作流 `verify_only` 手动选项：使用真实 D1/R2 完整构建，但跳过部署、公网探测、清除 dirty 与下游派发；默认发布行为保持不变。guard 脚本测试通过，脚本测试合计 9/9；3e24dfa 的 Linux 全仓 CI 通过。
- 未修改生产防护设置，未合并或部署。Cloudflare 插件重连仍失败，本机 Wrangler OAuth 有效但无凭据管理接口权限；使用 GitHub secrets 验证，未读取密钥值。

## 真实输入验证

- [Actions 44587011095](https://github.com/forfreek/tgbox/actions/runs/44587011095)，提交 3e24dfa，verify_only=true，2026-11-20 02:22–02:24（Asia/Shanghai），成功。
- 1959 条公开收录（775 频道 / 421 群组 / 763 机器人）；2734 个逻辑 GET，2252 个存在、482 个 NoSuchKey；JSON 正文合计 8,861,591 bytes，约 8.86 MB，不含协议开销及可能的重试流量。
- 生成 5877 个详情页、10659 个静态文件、3999 个 Pagefind 文件；完整 job 用时 2 分 18 秒。
- 部署、公网探测、清除 dirty、下游派发均由工作流确认 skipped。此为真实生产输入的只读构建验证，不是生产发布验收。
- 未确认当时 Bot Fight 状态；本地抽查原失败对象的公开 URL 返回 404（无 challenge header），不能用此证明防护开启。防护开启下的发布及访客访问仍待后续验收。
