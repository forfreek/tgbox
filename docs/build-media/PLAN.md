# 构建媒体输入与访客防护隔离

日期：2026-11-20，Asia/Shanghai。范围：静态构建读取媒体 JSON；不调整动态化计划。

## 根因与证据

- Actions [44578471076](https://github.com/forfreek/tgbox/actions/runs/44578471076)，commit a7e1939：D1 导出成功，快照读取 `media.tgsearch.app/posts/aftermidnighnn.json` 返回 403，Astro 构建及部署尚未执行。
- 用户报告仅启用 Bot Fight 后出现。日志本身未包含 Cloudflare 事件 Service 字段，尚未独立核实该请求的安全事件。
- 快照使用同一个 `mediaBaseUrl` 同时生成公开资源链接、获取构建数据，把机器读取耦合到访客防护策略。改 User-Agent、吞掉 403、放行整个 GitHub 地址段不能修复这个边界。

## 决策

采用官方 AWS S3 SDK，通过带签名的 R2 S3 API 按需读取对象。`mediaBaseUrl` 只用于输出资源链接；输入是本地目录或显式注入的读取器。CLI 必须明确选择输入，不再支持隐式公开 HTTP 回退。

不增加中转 Worker，不进行全桶同步或临时 JSON 目录镜像。不采用 Cloudflare 管理 API 批量 Get：管理 API 存在账户累计 1200 次/5 分钟限额，不应把对象数据面读取压力转移到管理平面。

## 实施与验收

1. 拆分公开链接与构建输入，保留本地目录；验证公开域名不可访问时仍能构建 fixture。
2. R2 读取只允许 `posts/`、`history/` 下的条目 JSON。对象不存在沿用空数据语义；鉴权、桶不存在、超时及解析失败必须阻止发布。
3. 保留已有 16 个并发任务；SDK 标准重试最多 3 次，连接超时 5 秒，socket 无活动超时 15 秒，单次 send 总预算 45 秒。连接由 CLI finally 关闭。
4. 仅请求已筛选公开条目：逻辑 GET 数为公开条目数 N + 公开频道数 C；重试可能增加实际操作数。不使用 LIST。仅 JSON，不包含图片/视频。记录 requested/found/missing/bytes；bytes 是成功读取的 JSON 响应体字节，不是总网络流量。
5. 构建步骤注入限定桶的只读 S3 凭据；缺少凭据时在导出 D1 前失败。权限不会写入源码或命令行。
6. 上线探测区分明确挑战与真实失败；首页与 Pagefind 被挑战时输出未完成公网验证，不宣称线上检查通过；普通 403/404 仍然失败。
7. 运行 snapshot 测试、类型检查、脚本检查及仓库规定检查，创建独立 PR；实际结果写 STATE。

## 一致性、成本与上线

可先在 PR 分支手动运行 Build & deploy，传 `verify_only=true`。该模式仅导出 D1、签名读取 R2、构建页面及索引；不部署、不清除 dirty、不触发下游构建。工作流 guard 由脚本测试约束。它验证真实凭据与构建输入，不证明线上防护状态或部署结果。

沿用原有 D1 导出后逐对象读取的一致性边界，不承诺 D1/R2 跨存储原子快照。构建中有新写入时依赖现有 dirty 时间门禁保留下一次构建；本节点不引入跨存储事务或版本镜像。

S3 直读绕过公网缓存，会增加直接 R2 GET（Class B）读取；具体总量与字节需要真实运行后看统计，不能按全桶容量推测。无需升级域名 Pro 套餐，但仍受现有 R2 计费/额度约束。

上线前需创建限定 `tgbox-media` 的 Object Read only R2 凭据并写入两个 GitHub secrets。创建凭据、写 secrets、合并触发部署及修改 Bot Fight 都需另行明确授权；本节点先交付可审查代码。真实验收应在 Bot Fight 开启时运行完整构建，确认源数据读取、页面构建、部署以及公网验证的实际状态。

回滚：回退 PR 可恢复旧流程，但公开输入重新受 Bot Fight 影响；不可把回退描述为防护开启时可用的修复。

## 官方依据

- [Bot Fight 例外限制](https://developers.cloudflare.com/bots/get-started/bot-fight-mode/)
- [R2 S3 认证与权限](https://developers.cloudflare.com/r2/api/tokens/)
- [R2 S3 JavaScript SDK](https://developers.cloudflare.com/r2/examples/aws/aws-sdk-js-v3/)
- [管理 API 限额](https://developers.cloudflare.com/fundamentals/api/reference/limits/)
