# 可复用决策

- 公开域名 URL 是页面输出配置，不能兼任构建输入鉴权策略。快照的媒体输入必须显式选择目录或读取器。
- 构建数据从 R2 S3 数据平面按需读取；不通过公开域名、固定 GitHub IP 白名单或 Cloudflare 管理 API 批量下载。
- 只将 NoSuchKey 作为对象缺失。NoSuchBucket、AccessDenied、服务故障与损坏 JSON 不能降级为空内容后发布。
- 构建日志的媒体字节统计是 JSON payload；逻辑请求量为 N+C，实际 GET 还可能包含 SDK 重试。生产规模以实际运行统计为准。
- 跨 D1/R2 的原子快照不是本节点已解决能力。现有 dirty 门禁保留后续变更，下一轮构建继续追赶。
- 证据入口：PLAN 的失败 Actions 链接；STATE 的实测结果与未验证边界。
- 2026-11-20 Actions 44587011095 实测：1959 条公开条目需 N+C=2734 个 JSON GET，正文 8,861,591 bytes。482 个对象缺失正常处理，完整构建成功；这只是当次规模快照。
- 可用现有 Build & deploy 的 verify_only=true 在 PR 分支验证真实 D1/R2 输入，保持 dirty 标记并跳过发布。不得把成功的只构建验证记为已部署。
