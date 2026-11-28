# 阶段二：共享统计与防滥用服务

日期：2026-11-28。此节点只交付库、迁移、测试及文档；未接入任何 Worker 路由或搜索入口，缺省开关关闭。

## 文件与职责

| 入口 | 实现 |
| --- | --- |
| config.ts | 唯一默认值、Zod安全范围、配置关联约束、部署关闭门禁 |
| normalize.ts / character-fold.gen.ts | NFKC、空白/大小写、OpenCC字符归并、安全展示、隐私过滤与内容待审信号 |
| auth.ts / identity.ts | Mini App验签/时效、Bot可信适配能力、网站签名会话、用途分域HMAC |
| boundary.ts | POST、精确Origin、JSON类型及实际流式1024bytes限制 |
| quota.ts / writer.ts | D1原子receipt fence、配额、日聚合、身份贡献和单写入接口 |
| session.ts | 受限签发、可疑会话挑战、Siteverify校验/防并发重放、短期可信状态 |
| security.ts | 固定原因码1%采样、每日封顶100条样本，禁止按恶意词或身份无限建行 |
| runtime.ts | 安全诊断与D1成功查询meta汇总 |
| migrations/0001_rule_revision.sql | 规则插入/更新/删除自动递增审核版本，供阶段四严格撤回使用 |

依赖：入口应用 → search-analytics → telegram纯验签函数 / zod / 独立D1。共享服务不依赖core/db/apps；核心FTS由 verifyResult 回调注入。OpenCC仅devDependency，生成4,230项字符映射，不进入运行时。附Apache数据许可。

## 接受事件的数据流

1. 部署开关、服务端认证capability、版本化事件契约。
2. 规范化与隐私过滤（在任何D1访问之前）。
3. 读取当前配置/审核版本与受限规则集；黑名单拒绝，隐藏/待审不授榜单资格。
4. 匿名会话按每小时行为和短时新会话数量判断挑战。
5. HMAC事件key和payload digest识别重试/冲突。
6. 已知配额耗尽时提前拒绝，不调用FTS；最终仍在事务中重验。
7. manual + reported results 候选调用服务端注入的结果复核；失败只保留客户端报告统计、不授资格。
8. 一次D1 batch内：领取带随机attempt的receipt → 原子加限额 → 自动待审 → 日统计 → 日身份贡献 → 各维度日汇总 → 日独立身份事实。
9. 全部效果都检查本次attempt，重试不能操作已有receipt。中途失败整体回滚。
10. 返回安全结果及usage；数据库失败时usageComplete=false，不能把不完整meta当完整计费。

Bot与Mini App统一Telegram身份，website使用另一域；同一天同身份同关键词跨入口/语言至多一个eligible事实。最近7完整日取最新贡献和权重的聚合属于阶段四。

## 会话与Turnstile

网站会话是有限期签名token；阶段三适配器负责HttpOnly/Secure/SameSite/host-only Cookie，复用有效Cookie而不在每次打开页面重签发。签发先受IP/全局独立预算，避免无限创建身份。
原始IP仅短暂输入HMAC，不持久化。Mini App复用verifyInitData，额外拒绝重复认证字段、空auth_date及非正身份。Bot factory只能在既有webhook secret-header认证后调用，不能用于公开body source选择。
认证对象冻结并登记WeakSet，复制字段或原型不能制造可信能力。

Siteverify检查success/hostname/action/cdata，token用独立请求头（<=2048字符）；不得塞入1KB JSON。cdata由challengeContext绑定服务端会话，由阶段三安全返回客户端。验证前D1原子领取token HMAC receipt并扣独立验证预算；并发重放只会调用一次供应商。失败消耗验证额度，不无限重试，需新token。
验证成功后再次核对配置版本，再签短期trustedUntil；不能提高任何硬限额。未启用/不可用时需要挑战的统计拒绝，正常搜索继续。

## 内容与异常

私人联系方式、明显密钥、私有邀请、XSS/控制字符先过滤；公开@用户名和t.me/公开资源链接可保留。隐私检测是保守启发式，不保证穷尽所有私人信息，也可能误拒长随机样式名称，人工批准不能绕过过滤。
词法简繁归并不是OpenCC词组转换或语义翻译，保留安全原展示；字符歧义可能合并同形词。生成器check纳入包测试，不更新锁定依赖版本。
推广用语及单词短时新身份增长进入pending，黑名单阻止统计，隐藏词继续统计但无榜单贡献。规则上限500；超出时安全拒绝，不无限读规则。
安全统计明确是截断的抽样，不能宣称精确拒绝数或精确真人数。

## 本地验证

- 统计包50项（含真实Workers D1并发/事务回滚、重试、跨入口身份、限额、Turnstile重放、配置竞态、请求流限制）。
- telegram包96项回归通过。
- 统计包Biome/类型/生成映射一致性通过；全仓Lint通过（3条既有警告），全仓类型11/11通过。
- 具体资源meta见RESOURCE-USAGE.md和资源snapshot。
- 未连接真实Siteverify、未创建widget、未设置Secrets/WAF/binding、未执行生产迁移或部署。
- HTTP路由、浏览器IME/1500ms/点击合并属于阶段三；KV/Cron/清理属于阶段四；Admin属于阶段五，不能据共享库测试宣称这些已完成。

官方依据：[D1 batch事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)、[Siteverify和token重复传播限制](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/)、[OpenCC](https://github.com/nk2028/opencc-js)。

打包探针以本地test配置显式dry-run成功，整库导出探针944.10KiB/gzip169.60KiB；未包含OpenCC/Franc运行时字典，不等于现有Worker的实际增量大小。服务器结果复核有3秒截止，超时保留报告统计但不给贡献；不能取消已经提交的底层D1操作。
