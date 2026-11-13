# Bili Observer

个人使用的 B站远程 MCP 服务。TypeScript、Cloudflare Workers、官方 MCP TypeScript SDK，提供 7 个读取工具和 2 个真实发布工具。独立开发，不复用邮件项目。

无前端、数据库、定时任务和主动采集；不使用 Cron、D1、R2、KV、Queues 或额外 AI API。每次请求创建独立 MCP Server / B站客户端，通过 Streamable HTTP `/mcp` 提供工具发现及调用。健康检查为 `/health`。

## 安装与本地开发

需要 Node.js 24 LTS、npm、Python 3.11+。Windows 的 Python 命令也可用 `py -3`。

```sh
cd projects/bili-observer
npm ci
python scripts/configure.py --local --token-only
npm run dev
```

本地地址通常为 `http://localhost:8787/mcp`。登录相关功能可再运行 `python scripts/configure.py --local --cookie-only`。脚本隐藏输入，只写被 Git 忽略的 `.dev.vars`；不要把 Cookie 发到聊天、Issue 或 PR。Windows 请将该文件 ACL 限制为当前用户。

```sh
npm run check
npm test
npm run build
```

`npm test` 在真实 Workers 运行时执行，B站上游被模拟，不会发布真实评论。`worker-configuration.d.ts` 由 `wrangler types` 生成并提交；修改绑定后重新生成。生成时请让 `.dev.vars` 包含 `.dev.vars.example` 中所有变量名（未配置的 B站项可留空），避免遗漏类型。

## 部署到自己的 Cloudflare

项目使用锁定版本的 Wrangler；所有命令均从项目目录运行。

```sh
npm exec -- wrangler login
npm exec -- wrangler whoami
# 如账号可访问多个账户，在本地环境设置 CLOUDFLARE_ACCOUNT_ID 选择目标。
python scripts/configure.py --token-only
npm run deploy
```

先设置令牌，即使部署初期缺少令牌，`/mcp` 也返回 503 而非开放服务。首次设置 Secrets 时 Wrangler 可能先创建 Worker 草稿，随后 `npm run deploy` 上传完整实现。部署输出的 HTTPS 根地址是服务地址，后加 `/mcp` 是连接地址，后加 `/health` 是健康检查。生产凭据不会由 `.dev.vars` 自动上传。

本项目已经进行真实部署；私人账户的域名及访问凭据仅在交付对话中提供，不写入公开仓库。再次部署不会发布或测试评论，不修改其他 Worker。

### Secrets 与 Cookie

| Secret | 用途 | 必需性 |
| --- | --- | --- |
| `MCP_ACCESS_TOKEN` | 独立服务访问令牌，至少 32 字符，建议随机 256 位 | 所有 MCP 请求 |
| `BILI_SESSDATA` | B站登录 Cookie 中的 `SESSDATA` 值 | 写入及登录限制字幕 |
| `BILI_JCT` | 同一账号 Cookie 中的 `bili_jct` 值，32 位十六进制 CSRF | 写入 |
| `BILI_BUVID3` | Cookie 中的 `buvid3` 值 | 可选，部分接口可能需要 |

自行在已登录的 B站浏览器中查看 Cookie，分别输入值，不要输入整段 Cookie Header。保持浏览器中 `SESSDATA` 的原始编码格式。不要把不同登录会话的值混用。

```sh
python scripts/configure.py --cookie-only
```

该脚本通过 stdin 调用 `wrangler secret bulk`，不在命令参数、日志中放凭据；`--cookie-only` 保留现有服务令牌，`--token-only` 保留 Cookie。不带两个选项时同时配置两者。脚本默认不显示令牌，若需要复制，只在本地终端明确选择显示；Cookie 永不显示。也可在 Cloudflare Dashboard 的 Worker → Settings → Variables and Secrets 中分别新增 **Secret**。不要创建为普通文本变量。

配置后可用 `npm exec -- wrangler secret list` 检查变量名称。Cookie 失效时重新运行配置脚本；更换服务令牌后同步更新客户端。删除登录凭据可在 Dashboard 完成，保留只读服务；服务不提供删除评论工具。

## 连接 MCP 客户端

传输：Streamable HTTP。URL：部署后的 `https://<worker-host>/mcp`。

所有协议请求都需要 Header：

```http
Authorization: Bearer <MCP_ACCESS_TOKEN>
```

不接受 URL 查询参数令牌。`/health` 不需要令牌且不返回凭据配置状态。客户端若尝试 GET SSE 会收到 405；此服务使用无会话的 Streamable HTTP，不提供旧版 `/sse`。

通用配置示例（具体字段以客户端文档为准）：

```json
{
  "mcpServers": {
    "bili-observer": {
      "type": "streamable-http",
      "url": "https://worker.example.com/mcp",
      "headers": { "Authorization": "Bearer <MCP_ACCESS_TOKEN>" }
    }
  }
}
```

客户端的本地配置同样包含服务凭据，不能提交仓库。支持独立 Authorization Header 的 MCP Inspector / MCP 客户端可直接测试。不要把 `MCP_ACCESS_TOKEN` 当作 B站 Cookie，或将 Cookie 配在客户端 Header 中。

### ChatGPT

**固定 Bearer Token 不能直接用于当前 ChatGPT 自定义 MCP 连接表单。** 官方入口支持 OAuth、无鉴权及两者混合；本服务保留鉴权，不使用无鉴权方案。

本轮已实现标准 OAuth 资源服务器，可对接本人控制的 OAuth 2.1 提供方。它验证 JWT 签名、签发方、受众、过期时间、本人 subject 和读写 scope；授权码、PKCE 与刷新由提供方处理。本轮没有创建或授权第三方提供方，生产配置仍为空，因此不能声称 OAuth 或 ChatGPT Plus 实机连接已经成功。

完整配置、账户权限限制及逐步连接说明见 [NETWORK-AUTH.md](NETWORK-AUTH.md)。当前 Plugins 界面通常无需先打开旧 Developer Mode；Plus 是否具备入口与读写权限需要在实际账号确认，不能保证。服务器保留全部九个工具。

## 工具与参数

所有输入均拒绝多余字段。`video_id` 支持 BV 号、`av` 号或数字 aid 字符串，不接受任意 URL；`mid`、`root_id`、`parent_id` 均为数字字符串，避免大整数精度损失。`page` 默认 1、范围 1–1000；`page_size` 默认 20、范围 1–50。每次只读取一页，不自动翻页。

| 工具 | 必填 | 可选 / 默认 |
| --- | --- | --- |
| `search_videos` | `keyword`（1–100 字符） | `page`, `page_size`, `order`: `totalrank` / `click` / `pubdate` / `dm` / `stow`，默认 `totalrank` |
| `get_video_info` | `video_id` | 无 |
| `get_subtitle` | `video_id` | `page` 是视频分 P；`language`；`offset` 默认 0、最多 100000；`limit` 默认 200、最多 500 个片段 |
| `get_user_info` | `mid` | 无 |
| `get_user_videos` | `mid` | `page`, `page_size`, `order`: `pubdate` / `click` / `stow`，默认 `pubdate` |
| `get_comments` | `video_id` | `page`, `page_size`, `sort`: `hot` / `time`，默认 `hot` |
| `get_comment_replies` | `video_id`, `root_id` | `page`, `page_size`；B站默认顺序 |
| `post_comment` | `video_id`, `message` | 无；真实发布 |
| `reply_comment` | `video_id`, `root_id`, `message` | `parent_id`，省略时直接回复根评论；真实发布 |

`message` 是调用方提供的原文，1–1000 字符、不能全空白或包含 NUL；服务不改写、不生成正文。写入工具标记 `readOnlyHint: false`、`destructiveHint: true`、`idempotentHint: false`。仅在用户明确要求向具体目标发送具体正文时调用，不支持批量、定时和自动互动。

### 返回值

工具同时返回可读文本 JSON 与 `structuredContent`，声明了 outputSchema。

```json
{ "ok": true, "data": { "...": "工具数据" } }
```

业务错误设置 `isError: true`，结构如下；参数错误由官方 SDK 拒绝。

```json
{ "ok": false, "error": { "code": "COOKIE_MISSING", "message": "此操作需要 BILI_SESSDATA Secret。" } }
```

视频包含标题、链接、作者、发布时间、统计、简介和分 P。未提供字段为 null / 空字符串，不伪造点赞量。搜索接口通常不含点赞量，详细统计需调用 `get_video_info`。

字幕自动优先选择可用人工字幕，其次选择 AI 字幕；`available_subtitles` 包含语言、类型、可用性，`language` 可指定语言。状态为 `available` / `unavailable` / `login_required`。读取 `next_offset` 可继续获取原始分段，无字幕时不调用语音识别。

评论保留正文、用户名、时间、点赞、评论 ID、根 ID、直接父 ID；不提前总结，不把置顶或内嵌回复重复塞入主评论。楼中楼使用独立分页，不承诺热度排序。上游排序和分页可能随新评论变化。

发布成功返回 `status: submitted`、评论 ID 和 `#reply` 目标链接。仅表示接口接受提交，公开展示仍受 B站审核影响。若发送后网络中断或缺少有效评论 ID，返回 `WRITE_OUTCOME_UNKNOWN`；必须先读取确认，禁止自动重发。真实发送测试必须另有用户指定的视频、正文及账号授权。

## 请求边界与维护

- API 细节集中在 `src/bilibili/`；工具定义位于 `src/tools.ts`；鉴权与 HTTP 入口位于 `src/index.ts`。
- 公开资料读取不发送登录 Cookie；字幕和写入按需登录。默认直连时 Cookie 只发到精确的 `api.bilibili.com`；显式批准并开启后端时，会由本人受信后端在内存中转交，字幕 CDN 请求不携带 Cookie；禁止跟随重定向。
- 每个请求内部 API 调用至少间隔 300 ms，预算最多 9 次 / 28 秒，单次出站最多 12 秒；HTTP 412 立即停止，不尝试其他接口；其他可恢复读取最多尝试一次备用接口；写入绝不重试。
- 无持久状态，无法跨并发 Worker 全局限流。个人客户端建议串行调用、每秒最多一次，遇风控停止重试，不自动循环扫描。
- MCP 请求体最多 16 KiB；普通上游 JSON 最多 4 MiB，字幕 JSON 最多 8 MiB。字幕输出最多 500 个片段；过大上游返回明确错误，不无限缓冲。
- 日志只含请求随机 ID、工具名、状态、错误类别及耗时；不记录正文、查询、完整 URL、Cookie、CSRF 或上游响应。Workers Logs 与抽样 Traces 已启用；未使用持久化业务数据。
- B站接口为公开网页使用的非官方稳定契约，可能受到风控、登录、地区或版权限制。WBI 使用实时公开签名信息；不绕过验证码或账号限制。
- 主要错误：`LOGIN_EXPIRED`、`CSRF_MISSING`、`CSRF_INVALID`、`CSRF_OR_ACCESS_DENIED`、`RISK_CONTROL`、`NOT_FOUND`、`UPSTREAM_NETWORK`、`UPSTREAM_HTTP`、`WRITE_OUTCOME_UNKNOWN`。保留安全的 `upstream_code` 便于排查，不转发上游错误原文或 Cookie。

## 手动线上只读冒烟

```sh
# 在本地安全设置 MCP_URL 与 MCP_ACCESS_TOKEN，或使用仅当前用户可读的 MCP_TOKEN_FILE。
npm run smoke
```

脚本使用官方 MCP 客户端，测试鉴权、发现、7 个读取工具及参数错误；只输出脱敏结果，不发布评论。设有代理的 Node.js 24 环境可按需设置 `NODE_USE_ENV_PROXY=1`。实际验证和剩余限制见 [VALIDATION.md](VALIDATION.md)。

## 独立网络出口与本轮状态

本次 Worker 匿名/登录六次对照均返回 412，Codex 云端匿名存在有效视频与评论结果，证据支持当前出口/连接特征受限。继续变换头、域名或 WBI 参数不能作为修复方案。代码已提供默认关闭的 `BILI_TRANSPORT=backend` 适配层和仅接受 B站白名单的 Node 后端；未部署新服务器、Tunnel 或其他网络资源。

本人设备可只在使用时上线，不必 24 小时运行，但后端和 Tunnel 退出后服务无法读取 B站。没有可用设备时，需要先确认受信托管服务、真实出口可达性、费用和授权。具体可审查方案、命令与凭据边界见 [NETWORK-AUTH.md](NETWORK-AUTH.md)。
