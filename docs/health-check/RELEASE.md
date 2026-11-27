# 健康检查合并与生产发布

2026-11-27，Asia/Shanghai。用户明确授权“pr 合并部署”。记录工作树C:/Users/123/tgbox-health-release，分支codex/health-check-release；来源main acf9e3d，与已审核交付工作树dd25ec6的Git tree相同：92b80adfb98554ce55b6a41c7eb9fc2580974fe9。原任务与各阶段分支历史边界保留。

## 合并与迁移

#84→#85→#86→#87→#88按顺序合并，后续堆叠PR逐一重定向main后合并，匹配事前核验的head SHA；没有部署含旧隐藏逻辑的阶段一Bot包。最终main CI45976512365、Web构建部署45976512454成功。中间Web推送按现有串行队列运行，最终版本覆盖中间产物，没有取消运行中的部署。

使用项目Wrangler4.132.0，whoami核验既有生产账号权限；迁移清单只有0027_entry_health.sql。按授权应用此兼容迁移，命令返回成功；读回迁移记录及两张空健康表，0条新健康/证据，未从旧active/banned/fail_count伪造回填。没有删除旧列/旧数据，也未新增账号资源、域名、Secret或外部服务。

## 服务发布与配置保护

- Bot：ac61a4c4-1676-4b05-a2a1-9c443d075808，UTC09:46:57/北京时间17:46:57；100%流量。keep-vars发布，原5分钟/每小时Cron、REFRESH_BATCH_SIZE=6与全部绑定保持。
- Admin：8923c4ef-3a91-40c6-b5a5-393b45544619，UTC09:47:24/北京时间17:47:24；100%流量。先build/dry-run，将部署前线上plain_text原值写入忽略的dist/server/wrangler.json.vars，再keep-vars发布，避免源码空Access默认值及不同R2 URL覆盖生产配置。未将线上变量写回源码或读取Secret值。
- Web：9b45a126-bad7-43bd-8501-73ea516743d5，UTC09:49:39/北京时间17:49:39；main最终构建部署成功，100%流量。新增Mini App来源退避随Web运行端发布。
- 三服务bindings逐项读回与发布前完全相同，包含plain_text值及Secret名称集合。业务settings完全相同。AI设置为部署前线上实际值：enabled=0、auto_scan=0、daily_calls=100、daily_neurons=6000、reservation=100、max_attempts=1；未覆盖为历史笔记中的额度，也未触发生成或改写人工稿。
- 发布前后12条历史系统隐藏ID/类型/status/旧liveness/fail_count一致；没有执行历史恢复或类型改写。

## 生产点验

公开首页200且标题为TGsearch；Mini App的/api/app/me与/api/app/preview匿名请求均401 unauthorized；后台匿名请求首页与新健康server function路径均302到原authacs.cloudflareaccess.com。不能把随跳转后的200登录页当成后台应用渲染成功，亦不能把此Access拦截称为应用middleware401测试。认证配置保持，但本次没有真实管理员会话创建生产人工功能/身份记录。Bot根路径404为既有无根路由，不作为Webhook失败。

UTC09:50（北京时间17:50）真实头像优先tick：scriptVersion为新Bot，outcome=ok、exceptions=[]；处理6条，14子请求，hidden/restored均空，0 R2/条目写入，avatarNextId推进至1935，regular nextId保持128。随后健康/证据计数仍0，证明该通道不写诊断。无新增头像不能解释成这些资源全部无公开头像。

UTC09:55（北京时间17:55）真实regular tick：outcome=ok、exceptions=[]，检查范围128–133，处理theblockclub/adguardcn/materialgram三条，41子请求（<=45），22行写入与6次R2写入，另外三条按预算deferred。nextId推进131而不是跳过延期项，avatarNextId保持1935，租约释放。D1读回三条accessible，均为health-v1/tme-profile-v2/HTTP200/profile_recognized，证据数3；没有隐藏/恢复，功能列未被网页冒充为已验证。两个来源控制均failures=0/notBefore=0。

UTC09:56最终只读比对：AI设置与业务settings完全一致，12条历史系统隐藏ID/类型/status/旧liveness/fail_count一致。新增常规内容变化按既有30分钟dispatch节流保留dirty，等待正常后续构建，不手动清dirty或跳游标。全目录常规扫描、独立人工功能验证、历史误隐藏修复及旧列/枚举/函数最终清理尚未完成，不将初始上线当成专题关闭。

## 证据与安全回滚

evidence/2026-11-27/release.json记录部署版本、绑定名称与比较结果、AI数值及CI；不包含Secret值、业务settings正文或认证令牌。cron-release.json仅保存筛选后的两个refresh事件；production-health.json记录三条真实新诊断、来源状态及最终保护比较。Wrangler Tail直连超时后沿机器既有代理连通，未改系统代理或Worker配置。

回滚必须使用新表兼容且无自动隐藏/恢复的安全包。旧Bot版本和阶段一基线仍含旧隐藏策略，禁止直接回滚；必要时从本次安全代码做最小回退修补。保留健康表与证据，按revision/绑定保护诊断。后续在明确授权、原主体/功能核验证据充分及事务化修复演练后才能恢复历史隐藏。
