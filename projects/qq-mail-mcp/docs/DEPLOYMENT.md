# 部署与接入

## 配置与地址

公开示例地址为 `https://mail-mcp.example.com`（保留域名）；MCP 路径 `/mcp`，健康路径 `/health`。插件 `mcp.json` 也使用示例地址，使用前在私有副本中替换。

公开 `wrangler.jsonc` 保留 Worker 名、代码入口、兼容日期、Node.js 标志、D1/限流绑定结构、日志与安全选项；部署专属的 PUBLIC_ORIGIN、D1 ID、限流 namespace 已换为占位符。现有工作区的 `wrangler.local.jsonc` 保存从线上核对的实际非秘密配置，权限受限且被 Git 忽略，**不可提交**。新 checkout 应从模板复制，在本机安全填入当前服务实际配置（值来自 Cloudflare 控制台），保持 OAUTH_REDIRECT_URIS 精确白名单。三个 Secret 留在 Cloudflare，不写入该 JSON 配置。

已部署不等于真实邮箱验收完成；见验收与迁移记录。

## 用户安全配置（不要把任何密码发给 ChatGPT/Codex）

在 Cloudflare 控制台选择 **Workers & Pages → qq-mail-mcp → Settings → Variables and Secrets**，添加类型为 **Secret** 的三个值：

1. `OWNER_PASSWORD`：密码管理器生成的独立随机密码，至少 32 字符。用于浏览器中的私人 OAuth 授权页面。
2. `QQ_MAIL_ADDRESS`：QQ 邮箱地址。
3. `QQ_MAIL_AUTH_CODE`：QQ 邮箱设置中为 IMAP 生成的授权码，不是 QQ 登录密码。

QQ 邮箱需已开启 IMAP。在控制台保存并部署 Secrets。不要把这些值放入公开 vars、GitHub 文件、Issue、终端参数或聊天。可以先只配置 Owner Secret，完成 OAuth 接通后再配置邮箱 Secrets。

如果使用安全的本地终端，Wrangler 交互式提示同样可用：

```sh
npx wrangler secret put OWNER_PASSWORD --config wrangler.local.jsonc
npx wrangler secret put QQ_MAIL_ADDRESS --config wrangler.local.jsonc
npx wrangler secret put QQ_MAIL_AUTH_CODE --config wrangler.local.jsonc
```

不要在命令后追加 Secret 值。以上操作依赖用户已完成 Wrangler 官方登录，Cloudflare 插件授权不自动成为 CLI Token。

## ChatGPT 私人插件

1. 在支持自定义 MCP 的 ChatGPT 设置/插件管理中创建私人连接。
2. MCP URL 填写上面的 `/mcp` 地址；传输选择 Streamable HTTP；认证选择 OAuth。
3. 客户端模式选择 **DCR（动态客户端注册）**，不要填写静态 API Key，也不要关闭认证。本服务不宣告 CIMD。
4. 请求 scope 为 `mail:read`。服务提供完整 OAuth 发现端点，通常无需手动填写授权/Token 地址。
5. 核对管理页面显示的回调 URI。默认精确 allowlist 是 `https://chatgpt.com/connector_platform_oauth_redirect`。服务宣告并返回 RFC 9207 `iss`，官方文档说明这种情况下可使用稳定回调。若界面实际显示不同 URI，将该**完整 URI**加入 `OAUTH_REDIRECT_URIS`（逗号分隔），同步源配置后重新部署，绝不放开通配符。
6. 点击连接，在本 Worker 的 HTTPS 授权页面输入 `OWNER_PASSWORD`，确认只读范围。不要输入 QQ 授权码。
7. 先调用 `mail_status`，再调用 `mail_list_folders` 和 `mail_search`；从搜索结果取 UID 和 UIDVALIDITY 调用 `mail_read`。
8. 访问令牌 365 天过期（与当前线上版本一致），需重新授权；没有刷新令牌。若授权码交换失败，检查 exact resource `/mcp`、回调和 PKCE。

`plugin/qq-mail-reader/` 提供可导入的私有插件源码（OAuth/DCR 配置，不含秘密）；这是接入准备材料。没有完成授权和工具发现前不要宣称插件已可用。

官方依据：
- https://developers.openai.com/apps-sdk/build/auth/
- https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization
- https://developers.cloudflare.com/workers/runtime-apis/tcp-sockets/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/

## 后续代码部署

现有 Worker 覆盖前必须下载代码和 settings，并确认只属于此服务。首次原测试 Worker 的本地备份在 `backups/`，被 Git 忽略。

```sh
cd projects/qq-mail-mcp
npm ci
npm run typecheck
npm test
npm run build
npx wrangler d1 migrations apply qq-mail-mcp-auth --remote --config wrangler.local.jsonc
npm run deploy
```

`npm run deploy` 显式使用本地配置；缺少该文件时会失败，避免误用占位符。运行前核对现有 Secrets，使用 `--keep-vars` 保留控制台 vars 时须确认与本地配置一致；Wrangler 会保留未在文件中重定义的现有 Secret。API 部署使用下面的 keep_bindings 规则。部署后运行公开 smoke，并由用户在 ChatGPT 复验。此次迁移未运行上述迁移/部署/secret 命令。

D1 为免费套餐 OAuth 存储，只有客户端 redirect 和短期 grant/token 哈希。不要开启付费套餐。此项目首次已创建数据库、应用迁移并绑定，无需重复创建。API 部署应使用 `keep_bindings: ["secret_text"]` 保留现有 Secrets。

若要通过 GitHub Actions 部署，应先由用户在 GitHub Secrets 安全配置 Cloudflare 最小权限凭据，再添加 deployment job。当前工作流仅检查，不读取部署密钥，也不会自动覆盖线上服务。

## 公网验收

```sh
MCP_ORIGIN=https://your-worker.workers.dev npm run smoke
```

在依赖 HTTP 代理的 Node.js 环境使用 `NODE_USE_ENV_PROXY=1`。脚本没有 Token 时只测试公开健康、拒绝未授权和 OAuth 发现，并明确跳过授权测试。

使用 OAuth 获取访问令牌后，只通过当前终端的私密环境变量设置 `MCP_TEST_ACCESS_TOKEN` 再运行 smoke；脚本不会打印 Token 或邮件。可额外设置 `MCP_TEST_UID`、`MCP_TEST_UIDVALIDITY`、`MCP_TEST_FOLDER` 验证指定邮件读取。真实邮箱测试必须用户同意并安全配置授权码。

## 真实邮箱只读验收

自动化测试已经验证协议使用 EXAMINE/BODY.PEEK 及模拟 FLAGS 不变。线上验收还需：

1. 选一封已知未读的测试邮件，记下客户端未读状态。
2. 在 ChatGPT 搜索并读取该 UID，确认正文/中文/附件名称正确。
3. 再以同一文件夹、`unread:true` 和相同条件搜索，确认仍包含该 UID；刷新 QQ 邮箱客户端确认未读状态未改变。选择已读邮件时也检查状态不变。
4. 在此期间避免其他邮箱客户端自动标记邮件；必要时用受控 IMAP FLAGS 前后对比。
5. 记录通过/失败，不记录正文、真实地址和授权码。

## 恢复与撤销

立即停用：删除 `OWNER_PASSWORD` Secret，会使全部 MCP 请求拒绝访问。撤销当前令牌：POST `/revoke` 的 form 字段 `token`（只经 TLS，禁止记录请求体）。撤销所有授权：经用户批准清空 D1 `oauth_grants`；这是会话撤销，不影响邮箱或 OAuth 客户端记录。确认后可通过 Cloudflare 版本回滚恢复先前 Worker。不要回滚到原来的未认证网络测试代码作为生产服务。

## 仓库与 CI

项目维护位置为 `projects/qq-mail-mcp/`。仓库根目录 `.github/workflows/ci.yml` 执行锁文件安装、类型检查、Chromium 授权回归、全套测试、dry-run 构建和隐私扫描，并加入 `CI required` 汇总门禁。未配置部署任务、Cloudflare API Token 或自动发布。

## ChatGPT 创建时提示设置验证失败

先执行公开 OAuth 发现检查，再检查 DCR 的 HTTP 状态。发现端点返回 200 不代表授权服务器已就绪：邮箱 Secrets 存在也不代表 `OWNER_PASSWORD` 满足要求。

在 Workers Logs 中按 `event=mcp_http` 筛选：

- `/register` + 503 + `owner_password_too_short`：更新 Owner Secret 为至少 32 字符的独立随机密码（建议密码管理器生成 43–64 字符）。不要降低长度检查。
- `/register` + 503 + `owner_password_missing`：安全配置 Owner Secret。
- `/register` + 400 + `invalid_client_metadata`：`invalidFields` 标明未通过的标准 DCR 字段名，不含字段值。
- `/register` + 400 + `invalid_redirect_uri`：核对实际回调与精确 allowlist。

日志不会记录密码、Token、Cookie、邮件、查询参数或请求体。不要为了调试启用包含全部请求头/请求体的日志。若 DCR 为 201 而界面仍报错，按重试时间检查随后是否有 `/mcp` 请求，再分析具体失败阶段；不要先放开未授权工具访问或 CORS。
