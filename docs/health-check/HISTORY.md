# 阶段三：历史误隐藏只读复核

核验日期2026-11-27，Asia/Shanghai。工作树C:/Users/123/tgbox-health-history，分支codex/health-check-history，基线9f41632，依赖2B2 PR #87。本节点没有生产写入或恢复授权，不执行迁移、部署、状态修复、Bot消息或客户端/start。

2026-11-27后续发布更新：#84–#88已合并，0027与安全Bot/Admin/Web已按新授权上线，见[发布记录](RELEASE.md)。下文14:30–14:38数据保留为历史快照，不能继续当作当前schema状态；历史条目尚未恢复。

## 本次结论

- 初始生产只读快照 2026-11-27 06:30:50 UTC：2172条目录记录，其中12条系统隐藏、3条上线但保留旧not_found/失败计数；13条removed排除，人工隐藏不纳入。范围不是固定12条名单，查询见HISTORY-EXPORT.sql；分页哨兵301，采集器拒绝超过300条。
- 实际网页采集完成 2026-11-27T06:37:17.876Z（北京时间14:37:17）。15条候选、20次t.me GET；5条系统隐藏现在正向识别为channel，1条原bot现在识别为channel，9条无法确认（6条隐藏+3条上线）。没有网页结果能证明永久不可用/被封禁。
- 这5条只确认当前公开身份，尚无稳定Telegram ID或独立客户端原主体核验，不能写成“5条已确认有效”或自动恢复。3条当前标题与旧记录相同；aisecnews和ferdesmozek当前标题有变化，需核对内容。不能从标题变化直接推断主体被转让。
- 四类最终人工判定“确认有效/确认不可用/无法确认/身份类型变化”中，前两类本次均为0；已知类型异常1；其余14条仍待人工身份/可用性核验，其中5条有正向网页线索。4个历史bot均未做功能验证，其中1个当前类型不符，3个Contact占位。
- 二次生产只读快照 2026-11-27 06:38:05 UTC：这15条记录所有导出字段逐条相同。查询meta均changes=0、rows_written=0、changed_db=false；不据此声称整个生产库在此期间没有其他业务变化。
- 当前0027迁移和两张新健康表均不存在，#84–#87尚未上线。旧服务仍可能继续产生旧诊断；本报告是带日期证据，不是永久恢复名单。

## 逐条清单

| ID | 用户名 | 发布状态/原类型 | 旧标记 | 本次网页结果 | 后续核验 |
|---|---|---|---|---|---|
| 174 | [@gpegucxozphzl6gj](https://t.me/gpegucxozphzl6gj) | approved/channel | not_found (2) | 无法确认；HTTP 200 / Contact占位 | 客户端核对；占位页不能证明失效 |
| 209 | [@kgndni5hqox3hhf6](https://t.me/kgndni5hqox3hhf6) | hidden_by_system/channel | not_found (3) | 无法确认；HTTP 200 / Contact占位 | 客户端核对；占位页不能证明失效 |
| 316 | [@oyn4uj6viui8pni](https://t.me/oyn4uj6viui8pni) | approved/channel | not_found (4) | 无法确认；HTTP 200 / Contact占位 | 客户端核对；占位页不能证明失效 |
| 317 | [@zng7qbrh9uaes6](https://t.me/zng7qbrh9uaes6) | approved/channel | not_found (4) | 无法确认；HTTP 200 / Contact占位 | 客户端核对；占位页不能证明失效 |
| 351 | [@magazinesclubnew](https://t.me/magazinesclubnew) | hidden_by_system/channel | banned (12) | 公开身份可识别，原主体待确认；HTTP 200 / 主页正向识别 | 标题相同仍非主体证明；客户端核验 |
| 702 | [@barmapsbot](https://t.me/barmapsbot) | hidden_by_system/bot | not_found (13) | 无法确认；HTTP 200 / Contact占位 | 客户端核对身份与功能；不能认定被封禁 |
| 1092 | [@rigvault_bot](https://t.me/rigvault_bot) | hidden_by_system/bot | not_found (11) | 无法确认；HTTP 200 / Contact占位 | 客户端核对身份与功能；不能认定被封禁 |
| 1259 | [@mybestfriend_ai_en_bot](https://t.me/mybestfriend_ai_en_bot) | hidden_by_system/bot | type_changed (14) | 身份/类型待复核；HTTP 200 / 与收录类型不符 | 原机器人现识别为频道；核对原主体，禁止自动改类型 |
| 1276 | [@macos_ru](https://t.me/macos_ru) | hidden_by_system/group | not_found (14) | 无法确认；HTTP 200 / Contact占位 | 客户端核对；占位页不能证明失效 |
| 1335 | [@dailyscorefootbot](https://t.me/dailyscorefootbot) | hidden_by_system/bot | not_found (14) | 无法确认；HTTP 200 / Contact占位 | 客户端核对身份与功能；不能认定被封禁 |
| 1350 | [@hacking_group_channel](https://t.me/hacking_group_channel) | hidden_by_system/channel | banned (7) | 公开身份可识别，原主体待确认；HTTP 200 / 主页正向识别 | 标题相同仍非主体证明；客户端核验 |
| 1356 | [@aisecnews](https://t.me/aisecnews) | hidden_by_system/channel | banned (3) | 公开身份可识别，原主体待确认；HTTP 200 / 主页正向识别 | 当前标题有变化；人工核对身份与内容 |
| 1918 | [@transfernews_live](https://t.me/transfernews_live) | hidden_by_system/channel | banned (2) | 公开身份可识别，原主体待确认；HTTP 200 / 主页正向识别 | 标题相同仍非主体证明；客户端核验 |
| 1946 | [@ferdesmozek](https://t.me/ferdesmozek) | hidden_by_system/channel | banned (5) | 公开身份可识别，原主体待确认；HTTP 200 / 主页正向识别 | 当前标题有变化；人工核对身份与内容 |
| 1995 | [@ai_virtualcard1](https://t.me/ai_virtualcard1) | hidden_by_system/group | banned (3) | 无法确认；HTTP 200 / View占位 | 客户端核对；占位页不能证明失效 |

## 可复核证据

- evidence/2026-11-27/input.json：生产只读导出、分组统计、schema readiness和读写meta；只包含公开资源元数据及原健康字段，不含账号、token、订单、人工备注或原始HTML。
- review.json：首次Node直连8秒超时；1次请求后来源退避，其余14条deferred。这是采集路径故障，不是资源失效结论。保留这份失败证据，不覆写成“全部检查过”。
- review-proxy.json：等待首次退避到期后，使用Windows已启用系统代理对应的Node环境代理，携带首轮sources继续采集；未修改系统代理、未提前清除退避。逐条记录HealthObservation、HTTP/解析形态/类型、时间/规则版本及有限标题，不保留HTML。
- recheck.json：采集后的生产二次只读导出。脚本按id/username/kind/status/updated_at及旧字段/标题生成SHA256指纹；输入与前轮报告使用parsed-json-v1摘要，避免换行格式造成假差异。首次review.json的inputSha256是改进前原始字节摘要，后轮另以规范JSON摘要链接该文件。
- profile与preview均来自Telegram，不算独立主体证明。本次Web工具曾返回缓存页面，未纳入实时证据、未据此作恢复结论。

## 工具与复现

scripts/health-history.ts只有collect命令：离线导入已审核SELECT导出，只发固定https://t.me路径GET，串行最多两次/资源；不读账号凭据、不连接D1/R2/GitHub、不写生产健康或发布状态。输入白名单拒绝人工隐藏/移除、重复ID、危险用户名和截断；输出使用wx避免覆盖，已有输出在网络请求前拒绝。

命令：node scripts/health-history.ts collect <export.json> <new-report.json> [previous-report.json]。

如需系统既有代理，可按该机器已批准配置设置当前进程HTTP_PROXY/HTTPS_PROXY并使用node --use-env-proxy；工具不读取/改变系统代理。中断后传入上一报告保留Retry-After/来源退避；损坏来源状态显式报错。报告无生产应用入口，所有productionMutationAllowed=false。

已验证：Node专项8项、scripts类型检查、变更TS/JSON Biome及git diff --check；最后结果以STATE和PR CI为准。本次不改Workers/UI运行代码，继承2B2已通过CI45950431638，不重复以浏览器点验替代代码检查。

## 修复执行前必须具备的条件

1. 按依赖合并并经明确授权完成0027迁移与安全Bot/Admin/Web发布，停用所有旧隐藏/恢复写入方。不能先恢复再让旧规则重复隐藏。
2. 管理员用客户端/既有可信资料核对原主体与内容，机器人另记实际动作、时间和功能范围；不能把一次网页可识别代替此步骤。本次没有伪造人工确认或功能结果。
3. 重新SELECT并采集新证据，以id+username+kind+status+updated_at及指纹比对。本清单时效只限本次观察；任一变化、人工隐藏、移除、身份/类型变化、证据过期或无法确认都应跳过并重新复核。
4. 修复工具需走可信服务端、按revision/绑定/当前hidden_by_system条件更新，写永久审计（actor、理由、证据、前后值）并标dirty构建；重复执行无新变化，不覆盖人工稿/人工状态。正式执行前本地验证并发、回滚、重复与部分失败。此PR没有提供绕过这些门禁的SQL恢复脚本。
5. 核验数据库状态、审计、构建及网站页面，再进入阶段四覆盖一轮常规扫描/头像通道的生产观察和旧字段/函数最终清理。回滚不能重新启用旧自动隐藏。

阶段三只读复核已交付；正式修复、本地修复执行器演练与生产验收尚未完成。当前证据不足以科学地自动恢复任何一条，不能把“PR下一步”视作生产迁移、上线或恢复授权。
