# ChatGPT 创建验证排查（2026-10-15）

## 证据与根因

用户报告北京时间 15:30 创建失败。查询该 Worker 过去 24 小时日志，只有旧网络测试的 GET 请求；当时业务版 `invocation_logs=false` 且没有应用日志，无法从历史记录认定 ChatGPT 具体访问过哪些端点。

实际公网重放发现：

- Protected Resource Metadata（根路径及 `/mcp` 后缀路径）返回 200。
- Authorization Server Metadata 返回 200，issuer 与各端点同源，resource 为 `/mcp`，scope 为 `mail:read`，宣告 S256、DCR、token auth `none`。
- 未授权 `/mcp` 返回 HTTP 401、JSON Content-Type 和指向正确 metadata 的 WWW-Authenticate。
- 合法 DCR POST `/register` 返回 **503 temporarily_unavailable**。此时还未解析 DCR body；改变 token_endpoint_auth_method 不影响 503。
- 部署脱敏诊断后，北京时间 15:38:04 的真实公网探针日志明确记录 `reason=owner_password_too_short`、`path=/register`、`status=503`、`origin=absent`。

**已证实的阻断根因：线上 Owner Secret 值少于 32 字符。** Secret 名存在并不等于配置有效。发现文档不受该就绪检查限制，因此会出现“高级设置自动发现成功，但创建时注册失败”的现象。没有读取或输出 Secret 内容及具体长度。

此外，诊断日志捕获到北京时间 15:39:46–49 的新验证请求序列：POST /mcp → 401，GET protected resource / authorization server metadata → 200，POST /register → 503（owner_password_too_short）。该序列符合插件创建验证阶段；未记录客户端身份凭据或原始 User-Agent，因此不额外声称验证了客户端身份。仍需用户更新 Secret 并重试确认是否还有下一层问题。

## 变更

- 添加闭合字段的结构化诊断，不记录原始 URL query、Origin 值、Authorization、Cookie、请求体、邮件或凭据。
- OAuth 日志区分 Owner 缺失、过短、DCR schema 失败、回调不匹配；对公网仍保持脱敏错误。
- 增加 Secret 长度门槛和诊断不泄密回归测试。
- 增加四个 MCP 协议版本、JSON Content-Type、工具 schema、MCP-Protocol-Version 和 ChatGPT Origin 回归测试。
- 更新部署故障排查及安全文档。
- 保留 OAuth、S256、精确回调 allowlist、只读 IMAP、原有 Secrets 和限流。没有为了通过验证开放匿名 initialize/tools/list。

## 协议与浏览器策略

SDK 支持 2024-11-05、2025-03-26、2025-06-18、2025-11-25，逐一初始化回归通过。`application/json; charset=utf-8`、`Accept: application/json, text/event-stream`、`MCP-Protocol-Version` 均正常；工具列表返回六个 object inputSchema。

ChatGPT Origin 被允许进入认证检查，无授权仍 401。没有 CORS 通配符；未授权 OPTIONS 也为 401。本次已复现的注册失败来自无 Origin 的服务端请求，故没有证据支持修改 CORS。客户端实际重试的路径/状态仍需日志确认。

## 测试结果

完整 Vitest 回归 **57/57 通过**；TypeScript 检查、Wrangler dry-run 构建、隐私基线扫描通过。线上元数据与 401 challenge 已重放核对。本次不使用用户的密码执行授权页面登录，也不读取真实邮件；Owner 配置修复后的实际创建结果仍待用户确认。

## 部署

诊断代码部署 ID：`997bae6a2f8748039013928c7942ae73`。
部署时间：2026-10-15 15:37:59 +08:00。
使用 `keep_bindings: ["secret_text"]` 保留用户的三个 Secrets，未覆盖它们。

## 第二轮：Owner 更新后的 DCR 错误

用户确认已更新 Owner 并重试。北京时间 15:44–15:49 的实际请求日志显示 `/register` 从 503 转为 400，`reason=invalid_client_metadata`，唯一失败字段 `grant_types`；此前 `/mcp` 401、两类发现文档 200。由此确认密码门槛已通过，第二个阻断位于 DCR schema，而不是 CORS 或 MCP 工具协议。

旧 schema 只允许数组内每一项为 `authorization_code`。依据 [RFC 7591 §3.2.1](https://www.rfc-editor.org/rfc/rfc7591#section-3.2.1)，注册服务器可以用适当的值替换请求元数据，并在响应中返回实际注册值。本次允许同时请求 `authorization_code` 与 `refresh_token`，仍要求包含授权码模式；响应与发现文档均只返回 `authorization_code`。不签发刷新令牌，不增加授权方式，不改变 PKCE、Owner、回调、scope 或 resource 校验。

新增闭合枚举诊断记录 requestedGrants（authorization_code / refresh_token / other / absent / invalid_type），绝不记录未知原文。旧日志仅证明字段不兼容，不能据此断言 ChatGPT 所提交的完整数组；待用户新重试日志确认。

新增注册协商到真实本地 D1 授权/令牌完整流程测试，并拒绝空数组、仅 refresh、client_credentials、未知值及非数组。完整回归 **59/59**；类型检查、构建及隐私扫描通过。公网以两个 grant 类型重放 `/register` 返回 **201**，明确协商为 authorization_code；探针生成的客户端记录已按独立 ID 删除。公网 health、401 challenge、OAuth discovery 检查通过。当前用户已配置真实 Secret，因此没有替换密码做公网登录，也没有读取真实邮件；本次公网授权后 MCP 流程尚待实际用户连接验证。

修复部署版本：`80e43d90526a4fdb986bd1ce55a56e28`，时间 2026-10-15 15:54:25 +08:00。三个 Secret 均通过 keep_bindings 保留。

## 待完成

用户保持 DCR 设置重新创建，核对真实 requestedGrants、注册 201 与后续授权/MCP 流程。公网探针通过不等于 ChatGPT 界面验收完成。


## 第三轮：浏览器授权表单（16:02 部署）

实际重试日志确认 ChatGPT 请求 grant_types 为 authorization_code + refresh_token，修复后注册 201，GET /authorize 200；随后 POST /authorize 403、origin=other。用户看到 ORIGIN_DENIED，定位在外层来源检查。

真实 Chromium 回归复现：授权 HTML 的 Referrer-Policy: no-referrer 导致浏览器 POST 发送 Origin: null，被现有 allowlist 拒绝。原代码本就允许 PUBLIC_ORIGIN，不是误把 ChatGPT 回调当 Origin。修改表单页为 Referrer-Policy: same-origin，浏览器 POST 恢复正确的 Worker Origin。回调 303 仍使用 no-referrer，避免向外泄漏来源。

浏览器还复现 form-action 'self' 阻止跨站 303 回调，因此 CSP 加入本次已经精确验证的 callback origin + path。没有通配符，OAuth redirect_uri 的配置白名单与客户端绑定均保持不变。GET 授权页允许无 Origin 的导航；POST 必须明确等于 PUBLIC_ORIGIN，缺失、null、ChatGPT 和其他跨站 Origin 均拒绝，不依赖可缺失的 Referer 放行。

新增 Chromium 浏览器测试使用本地 D1、测试随机密码、Worker 路由和浏览器自动 Cookie/Origin；外部网络由不可用本地代理阻断，只观察浏览器发起的回调 GET，不访问真实 ChatGPT 账户。覆盖旧策略失败、新策略同源 POST/303、Secure/HttpOnly/SameSite=Lax Cookie、nonce、state/issuer、授权码 PKCE 交换及 Cookie 清除；原有 CSRF/replay/白名单测试继续通过。运行需要系统 Chromium（默认 /usr/bin/chromium，可用 CHROMIUM_PATH 指定）。完整测试 **62/62**，typecheck/build/privacy 均通过。

部署版本 **13e05d497f464e5eb5456278ca266154**，2026-10-15 16:02:39 +08:00。线上授权页 200，Referrer-Policy/CSP/Cookie 已验证；health、未授权 MCP 401、OAuth discovery 通过。探针客户端和 consent 记录已单独清理。未读取/替换用户 Secret 或读取邮件。需关闭旧授权页，由 ChatGPT 重新发起以取得新响应头和 nonce；真实账户最终授权结果待用户确认。
