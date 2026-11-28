# 资源、部署与回滚（仅准备，不执行）

## 资源和权限

| Worker | ANALYTICS_DB | PUBLIC_CACHE | 其他 |
| --- | --- | --- | --- |
| Web | 接受事务/审核版本 | 公开榜单读取 | 现有核心 DB 仅 FTS 候选复核；原生限流、Siteverify |
| Bot | 可信事件写入 | 无 | 现有 webhook认证及核心搜索 |
| Admin/Cron | 管理/聚合/清理 | 生成版本发布 | 现有管理员认证、独立 daily scheduled |

Cloudflare D1/KV binding 不提供逐语句只读权限；通过共享服务能力、导出边界、服务器鉴权和配置约束降低权限。不能在文档伪称只读绑定。

待审批资源命令示例（须用项目固定 Wrangler，实际执行前核验帮助与账户）：

```powershell
pnpm exec wrangler d1 create tgbox-analytics
pnpm exec wrangler kv namespace create tgbox-cache
```

统计迁移仅 packages/search-analytics/migrations，核心 packages/db/migrations 不改。资源 ID 在审批创建后填写，禁止无 ID 自动 provisioning。生产配置不写假 ID，不运行部署脚本来“验证创建”。

Secret 清单：SEARCH_IDENTITY_SECRET（Web/Bot一致，独立用途域）、SEARCH_SESSION_SECRET（Web）、SEARCH_TURNSTILE_SECRET（Web）。现有 BOT_TOKEN/WEBHOOK_SECRET/管理员凭证继续按原途径管理。公共配置：Turnstile sitekey、生产 hostname/action allowlist、部署 kill switch、绑定 IDs。测试凭证只用于本地且必须 ignore，不打印生产值。

## 阶段三绑定和配置准备

实际配置未添加统计资源ID/原生限流namespace，不可启用。审批后在Web/Bot分别追加ANALYTICS_DB，migrations_dir为../../packages/search-analytics/migrations，database_name为tgbox-analytics，ID用新建资源真实输出；不得替换核心DB条目。Web再配置ratelimits数组，name=SEARCH_RATE_LIMITER、namespace_id=经核验不冲突的数字字符串、simple={limit:60,period:60}。本地Wrangler4.132.0 schema支持该字段，未升级工具或创建namespace。

边缘阈值由部署配置生效，后台ipPerMinute仅控制严格D1事件门禁，不能动态提高原生60/min上限；如需更高边缘阈值须单独调整部署配置。边缘按位置近似，不作为全局账本。

构建变量PUBLIC_SEARCH_ANALYTICS_ENABLED=1才能启用前端采集（服务器关闭仍拒绝）。当前Web/Bot wrangler.jsonc全部SEARCH_*_ENABLED=0。Web设置SEARCH_ALLOWED_ORIGINS、SEARCH_TURNSTILE_SITE_KEY，验证开关SEARCH_TURNSTILE_ENABLED；事件开关详见COLLECTION。关闭部署变量可停新统计，无需先回滚网站静态资源。Cookie采用HTTPS host-only，不共享apex/www身份。

依次用各Worker目录的固定Wrangler secret put命令写入上述Secret，禁止参数或文档填真实值；此处仅列清单，本阶段没有执行。启用前核验widget预期hostname/action=search_analytics，以及CSP对挑战域的允许情况，不自动修改站点/WAF配置。

## 顺序

1. 用户审批资源/权限与成本；确认 Workers 套餐、D1/KV现有总额度、Turnstile widget及限流 entitlement。
2. 创建独立统计资源；只对统计 D1 执行新迁移；核心 DB 不迁移。
3. 配置三个 Worker binding、Secrets 与关闭态开关，生成真实 types；本地/隔离环境测试。
4. 部署关闭态代码并验证旧功能；启用采集小流量，核对实际 D1 meta。
5. 验证审核撤回/并发/清理，再启用每日 Cron 和真实榜单。
6. WAF仅新统计/会话/验证路径，不触碰 Pagefind与详情页。现有规则不自动覆盖。

## 回滚

先用部署级 kill switch 关闭采集、公开榜单、Cron；旧版 Worker 可忽略统计 binding。独立统计数据库保留，不自动删库/删KV/降级迁移。KV版本可重建，禁止绕过审核指针“回滚”已隐藏词。Worker 回滚不回滚数据库；迁移向前兼容，新增结构不影响核心业务。

实际生产执行记录和命令需在部署授权后追加，当前没有执行。
