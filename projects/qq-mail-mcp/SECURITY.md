# 安全模型与审查

此服务仅用于单用户私人邮箱。公网访问必须先通过 OAuth；部署不能等同于真实邮箱验收或 ChatGPT 已接通。

## 已实现的控制

- QQ 邮箱地址、IMAP 授权码和独立 Owner 密码仅从 Cloudflare Secrets 读取。
- OAuth 使用 S256 PKCE、精确回调 allowlist、精确 resource、`mail:read` scope、RFC 9207 issuer、短期一次性 code。
- D1 `DELETE ... RETURNING` 原子消费授权凭证，避免 KV 最终一致导致重放。令牌保存 SHA-256 哈希。Token 不进入 URL/日志。
- 授权页面用 HttpOnly/Secure/SameSite Cookie、一次性 consent nonce、Origin 校验、CSP、防嵌入和 no-referrer；验证 Owner 密码之后才签发授权码。
- 密码比较先哈希为等长数据再 constant-time 比较；Owner 密码至少 32 字符，应使用密码管理器随机生成。
- DCR 只接受配置中的 HTTPS 回调，最多 100 个客户端；不会抓取客户端提交的 URL，避免 SSRF。
- 固定 TLS QQ 目标，未关闭证书验证；工具不接受任意命令、网络地址或连接选项。
- IMAP 输入拒绝控制字符并对引号/反斜杠编码；Literal 按字节读取，递归语法解析，限制长度和嵌套。
- 仅 `LOGIN`、`LIST`、`EXAMINE`、`UID SEARCH`、`UID FETCH`；正文仅 `BODY.PEEK`。不发送 `SELECT`、`STORE`、`CLOSE`、`EXPUNGE` 等更改操作。
- 无附件下载，无邮件链接访问、远程图片加载、HTML/JS 执行、自动回复/转发和第三方内容上传。
- 邮件字段返回在明确标注的不可信数据中，工具和服务说明告知模型不可执行邮件指令。
- 不记录正文、邮箱地址、密码、令牌、原始 IMAP 响应或异常堆栈。Workers 自动请求日志关闭，查询参数脱敏；应用只输出封闭字段的诊断日志：固定端点名称、HTTP 方法/状态、Origin 分类、协议版本分类、授权头是否存在和校验失败原因；不输出原始请求头、请求体、查询参数或 Secret 长度/值。
- 所有操作有时间、数量、字节预算，异常响应不暴露上游原文；缺少配置、限流绑定和认证故障均拒绝访问。

## 风险与运维

OAuth 使用自行实现的小型单用户授权服务器，已测试主要绑定和重放情形，但不是第三方安全认证。单用户随机密码不替代企业 SSO/MFA。访问令牌 365 天过期（与当前线上版本一致），无 refresh token；密码更换不会自动删除已签发的令牌，撤销全部会话必须清理 D1 的 `oauth_grants`。删除/修改密码使全部访问即时失败，但重新启用密码前应先清理旧令牌。

邮件提示注入不能仅靠“只读工具”彻底解决：已授权模型仍能读取用户邮箱。应只在可信会话启用此插件，不遵循邮件中要求额外读取或外传数据的指令。限流为每个 Cloudflare 节点最终一致，分布式攻击仍可能耗尽免费请求额度；D1 达到免费额度会拒绝服务。客户端注册记录不自动过期，以免破坏现有 ChatGPT 连接；达到上限后由用户审查并清理。

原 Worker 代码/配置备份保留在本地 `backups/`，不提交。部署保留 Secrets 类型绑定，不记录其内容。任何未来启用日志/trace/tail 的变更都需要重新审查隐私。

## 验证

自动化测试覆盖输入注入、字节 Literal、UIDVALIDITY、只读 FLAGS、中文编码、MIME、分页、部分成功、连接失败/超时，以及 OAuth CSRF、错误 PKCE/resource/client、并发重放、过期、撤销、MCP 未授权/工具调用。生产依赖审计和实际测试结果记录于 `docs/ACCEPTANCE.md`。

收到安全问题后先关闭访问（移除 Owner Secret 或撤销全部会话），不要在 Issue 中粘贴邮件、Token 或授权码。
