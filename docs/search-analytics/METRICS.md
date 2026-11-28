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
