# 故障处理

阶段三采集故障：先关闭对应部署SEARCH_WEBSITE_ENABLED/SEARCH_MINIAPP_ENABLED/SEARCH_BOT_ENABLED或全局SEARCH_ANALYTICS_ENABLED；无需停止Pagefind/索引或撤回核心DB。检查独立ANALYTICS_DB、身份Secret长度与一致性、网站sessionSecret、SEARCH_RATE_LIMITER和Origin allowlist。缺能力返回503并停采；限流429不要求用户停止搜索。日志只查固定原因码，不能打印关键词、Cookie、initData或token。真实绑定/限流/Turnstile尚未生产配置，不能用“开关为1”证明接入成功。详见COLLECTION和DEPLOYMENT。

1. 采集异常：先关闭全局或单入口开关；Pagefind/inline 正常运行，不回滚搜索。
2. DB 故障：拒绝统计；公开榜单空榜，不信任旧审核；不转写核心 D1。
3. KV 故障：保留权威发布指针与已生成版本，失败不清空上次正常数据；无法通过审核验证则不展示。
4. Turnstile 故障：可继续搜索；需要挑战的统计拒绝，不降级为已验证。
5. Cron 失败：Admin 查看 job run 原因码和 fence；过期租约允许重试，先检查审核/配置版本。手动刷新复用服务，不手改 KV 计数。
6. 误公开词：隐藏/黑名单事务递增审核 revision，后续 API 校验失败关闭旧榜；异步重生成。已显示浏览器内容无法远程抹除。
7. 刷榜：暂停对应入口、提高挑战要求或调整已授权限额；不提高全局预算，不逐请求追加审计。
8. 秘钥轮换：版本化 HMAC；旧身份不可与新身份直接比较，需记录窗口冷启动影响。不要输出 Secret/token。
9. 清理积压：有限批次按 day/expires_at 索引清理，记录进度，避免在搜索请求中清理历史。

## 阶段四排障

公开空榜：检查Web部署展示开关、原生限流、身份Secret、统计D1/KV绑定、D1 publication、权威指针与版本；KV新版本传播未完成可暂时空榜，禁止强行恢复previous/静态推荐。任务失败先看job reason/published及固定日志码，published=1且cleanup失败表示已发布可用榜单，继续排空清理，不回退指针。超时running下次取锁会标superseded，旧任务不能释放新锁。

清理逾期：检查任务开关、90秒/900批上限、cleanupBatch和实际积压。恢复/人工重复运行同一服务排空；大预算采集启用前验证删除吞吐。KV长期故障可关闭publication保留jobs；关闭jobs时应安排人工刷新或恢复任务，不能宣称物理TTL仍会自动兑现。job rows_read/rows_written只代表已知成功SQL，排除收尾日志/释放锁及核心回调，不作完整账单。

## Admin排障（阶段五）

- 读取失败：检查Admin的统计绑定和迁移，不转向核心数据库读写统计；页面可重新读取，无自动无限重试。查看固定admin-read/admin-write诊断，不输出原SQL、词、凭证。
- 保存冲突：重新读取当前版本再编辑；不自动覆盖他人更改。规则重复/500条上限同样安全拒绝，可编辑或停用已有规则；停用规则仍占容量，可复用其行改为新规则并保留审计。
- 审核后空榜：正常安全失效，后台刷新可能遇到已有租约/失败。到热搜管理手动刷新并保持页面连接，查任务日志；严禁手改previous或恢复静态词绕过审核。
- HTTP waitUntil只有请求结束后有限延长（Cloudflare通常30秒），不是可靠队列；后台重建可能停止，120秒租约恢复后可重新运行。手动刷新等待当前请求内任务（库90秒预算），断连仍不保证完成；长期清理/容量门槛在阶段六验收。
- published=1/status=failed：发布成功而清理失败，保留正常榜单，恢复后重复刷新排空。不得因看到失败而清空KV。
- 管理员审计记录在独立search_admin_audit事务中，主体为HMAC，不在核心操作日志里存原始TG/邮箱。统计库自身故障时操作失败，不绕过审计。
