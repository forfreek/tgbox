# 指标定义

- entry/source：website、miniapp、bot；由服务端认证适配固定。
- trigger：manual、trending、recommended、prefill；客户端触发声明属于遥测，不能验证真人意图。
- reportedResult：results、zero；网站/Mini App 为不可信客户端遥测。Bot 为服务器结果。
- verifiedResult：榜单资格的服务端 FTS/实际 Bot 查询证明；不是 Pagefind 结果数量。
- accepted searches：通过身份、隐私、预算、幂等后接受的事件；同一事件重试不增加。
- reported zero searches：接受事件中的 zero。零结果率 = reported zero / accepted。不宣称为浏览器外可独立证实的结果。
- trending/recommended/prefill clicks：分别记录，均不给公开排名贡献。
- eligible daily identity：manual + reported results + server verified + 规则允许，同一身份同一词同一天最多一个。
- 7 天 ranking identities：7 完整日跨 source/locale 去重；最近一次 eligible day 决定权重。
- unique identities：可用身份记录范围内去重的匿名身份，不是精确真人；匿名跨设备无法合并，Mini App/Bot 可以合并。
- identity-days：每日独立身份计数的和；超出 8 天留存的 30/90 天页面仅用此名称，不称 90 天独立用户。
- keyword count：筛选窗口中规范化关键词去重数量。
- security metrics：精确接受/重复与采样拒绝需标明来源、采样比例、误差，不假造未采集指标。
- Telegram cache blind spot：300s 缓存可能使查询不触发 webhook，Bot 统计仅覆盖实际收到的请求。

## 后台展示口径（阶段五）

概览卡片今日/昨日/7/30/90天（除昨日外均含今日）；排行榜仍使用前7个完整自然日。这两个窗口不能混称。来源/语言分布与趋势采用所选日期，不将客户端筛选当可信来源。独立身份仅在当前配置的身份留存区间内去重，更长范围显示身份日；没有完整逐次原始日志。聚合查询裁切到配置保留期；降低后再提高保留期不能恢复已删除历史，当前起点不保证从建站之日起完整采集。

关键词列表的独立身份按所选日期/来源/语言COUNT DISTINCT，超出身份留存返回null，不能当0。每日贡献合计是日级指标。榜单资格得分由共享ranking.ts对当前全局完整日窗口计算，不受列表的语言/来源筛选影响，门槛/规则不满足为0；公开安全过滤仍生效。已发布得分是当前D1发布指针对应的私有快照，未上榜为null，规则/配置失效后不再显示旧分数。

批准/取消隐藏只影响当前审核与后续采集，不为过去被pending/hidden排除的事实补发贡献。此前符合条件且仍在窗口中的事实可参与；绝不从日聚合推造身份/手动/已验证事实。正常搜索次数包含接受的手动、热搜、推荐和预填事件；只有符合条件的手动事件给榜单贡献。

安全页记录有封顶的1%样本，不按100倍估算攻击规模；边缘拒绝不在D1，缺失原因代表无已存样本而非没有攻击。待审核规则数量不冒称异常真人或精确异常关键词数量。任务SQL meta缺失败查询/收尾和外部资源，明确不是完整账单。

Web自动URL预填（包括首次导航）按阶段三策略不主动上报，避免自动导航/刷新计为有效搜索；prefill契约计数字段保留，但不能解释为完整URL预填访问量。未来改变该覆盖范围须先确认口径并保持不上榜/刷新不计。
