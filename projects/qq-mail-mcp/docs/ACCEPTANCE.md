# 早期验收记录（历史快照）

以下记录对应首次部署阶段，不能作为当前配置或连接状态。当前代码/配置核对与迁移测试见 [MIGRATION.md](MIGRATION.md)，后续 OAuth 修复见 [CHATGPT-COMPATIBILITY.md](CHATGPT-COMPATIBILITY.md)。

验收日期：2026-10-15（北京时间）。本记录区分本地测试、线上服务和真实邮箱。

## 已完成

- 原 `qq-mail-mcp` 仅为 QQ TLS 欢迎信息测试，覆盖前保存原代码和 settings；部署前再次核对原 etag 未变。
- Cloudflare 官方插件实际部署成功，代码版本部署 ID `b376886149ed4985b7fac2410d58378b`；最终代码更新时间 2026-10-15 14:55:43 +08:00。之后临时 Secret 添加/删除产生配置版本变化，未更改代码。
- Worker 启动时间：Cloudflare 上传响应报告 42 ms；此数值不是每次请求 CPU 时间。
- 构建：1,064.27 KiB，gzip 291.15 KiB，低于 Workers Free 压缩代码大小限制。
- TypeScript 检查通过。
- Vitest：**48/48** 通过，含真实本地 D1 原子消费集成测试和模拟 IMAP。
- `npm audit --omit=dev --audit-level=moderate`：0 vulnerabilities（执行时注册表审计结果，不代表无未知漏洞）。
- 源码安全审查和隐私基线扫描通过，无真实邮箱数据、授权码或访问 Token；项目与其他仓库隔离。
- 创建并绑定免费 D1 `qq-mail-mcp-auth`，只用于 OAuth 元数据和令牌哈希；没有启用付费服务。

## 实际公网验收

| 项目 | 结果 |
|---|---|
| HTTPS `/health` | 200，readOnly=true |
| 未授权 `/mcp` | 401，包含 OAuth discovery challenge |
| Protected Resource / Authorization Server metadata | 200，resource、issuer、S256 一致 |
| OAuth DCR 注册 | 201 |
| 登录/同意页面、Cookie、一次性 nonce | 通过 |
| S256 PKCE code exchange | 200 |
| 授权码重放 | 400，拒绝 |
| 授权 MCP initialize | 成功，serverInfo=qq-mail-mcp |
| 授权 tools/list | 六个工具，全部 readOnlyHint=true |
| 授权 mail_status | 正常执行，明确返回 MAIL_NOT_CONFIGURED |
| 非法 UID 工具调用 | isError=true |
| 令牌撤销 | 后续请求 401 |
| 测试后恢复锁定 | Secret 列表无临时密码；未授权仍 401 |

公网 OAuth 测试经用户明确批准，使用临时随机 Owner 密码；测试结束删除该 Secret、撤销访问令牌并删除测试客户端。最终 OAuth 客户端和 grant 表均为 0 条。未配置真实邮箱 Secrets、未读取真实邮件、未把密码/Token 输出到报告或源码。

## 测试覆盖

IMAP 标签/多行/二进制 Literal、碎片化网络读取、登录失败/超时/断线/关闭连接、UID/UIDVALIDITY、modified UTF-7、中文 MIME 头、Base64、Quoted-Printable/GB18030、HTML 转文本、日期搜索/分页、非法参数/注入、附件元数据、邮件大小和批量总字节限制、部分成功、EXAMINE/BODY.PEEK、模拟 FLAGS 前后一致。

OAuth 发现、精确回调、CSRF、错误密码、S256/resource/client 绑定、consent/code 并发一次性消费、过期、撤销、只存令牌哈希、未授权 MCP、恶意 Origin/Host、限流、SDK 初始化/工具发现/调用。

## 尚未完成及原因

1. **真实 QQ 登录/搜索/读取/状态不变验收**：用户尚未安全配置 `QQ_MAIL_ADDRESS` 和 `QQ_MAIL_AUTH_CODE`，因此没有运行。模拟 FLAGS 验证不能代替真实邮箱验证。
2. **ChatGPT 界面连接**：实际服务已完成 SDK 和公网 OAuth/MCP 测试，插件接入包已准备；尚未在用户 ChatGPT 账号内完成私人连接与真实工具调用。
3. **GitHub 仓库上传**：查询同名仓库不存在/当前不可见，`gh repo create --private` 明确返回 `Resource not accessible by integration (createRepository)`。未创建远程仓库，不能提供一个已存在的仓库地址。用户建立私人空仓库并授权集成后即可推送本独立项目。
4. **复杂真实邮件的免费 CPU 实测**：尚无用户授权的真实样本。网络等待不消耗 CPU；MIME/HTML 成本受邮件结构影响，代码成功部署和启动时间不是 CPU 保证。

## 当前维护位置

项目已准备迁入多项目仓库 `projects/qq-mail-mcp/`，不再要求创建独立私人仓库。历史记录中的旧验收缺口须结合后续兼容性及迁移文档阅读；本次迁移不访问真实邮件。
