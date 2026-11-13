# 验证记录

日期：2026-11-13。第二轮状态：Testing / PR 草稿，未达到完整业务验收。独立后端暂不增加；没有购买、安装或部署新的网络基础设施。

## 已解决 / 已实现

- 同一视频、评论、登录类别的 Worker 匿名与登录对照完成；当前 Cookie 没有改善 412，详细六字段记录见下表。
- HTTP 412 立即停止，不再自动探测备用接口；停止继续试换头、域名和签名；提供默认关闭的可替换请求层及 B站专用 Node 后端。不是部署了公共代理。
- 修正 ChatGPT 连接说明：固定 Bearer API Key 不能用于当前 ChatGPT 自定义 MCP 认证表单，原文中的条件说明不能证明兼容。
- 已实现标准 OAuth 资源端：公开资源 metadata、401 discovery challenge、JWT 签名/issuer/audience/expiry/本人 subject 校验、读写 scope 隔离；写权限不足时在 B站调用前拒绝。授权服务器由本人选择的标准提供方负责，尚未配置或授权。
- 发布接口返回 HTTP 5xx 也明确标记 `WRITE_OUTCOME_UNKNOWN`，不重试、不切换出口，避免误判后重复发送。
- 原 9 个工具和输入输出、原静态令牌、Secrets 隔离继续保留。

## HTTP 412 对照证据

只保留环境、接口类别、HTTP 状态、业务码、是否携带登录态和是否成功。所有请求数量有限，不保存 Cookie、Token、完整请求头、完整 URL 或 B站原始内容。

| 环境 | 接口类别 | HTTP | 业务码 | 携带登录态 | 成功 |
| --- | --- | --- | --- | --- | --- |
| cloudflare-worker | video | 412 | — | 否 | 否 |
| cloudflare-worker | comments | 412 | — | 否 | 否 |
| cloudflare-worker | login | 412 | — | 否 | 否 |
| cloudflare-worker | video | 412 | — | 是 | 否 |
| cloudflare-worker | comments | 412 | — | 是 | 否 |
| cloudflare-worker | login | 412 | — | 是 | 否 |
| codex-cloud-development | video | 200 | 0 | 否 | 是 |
| codex-cloud-development | comments | 200 | 0 | 否 | 否 |
| codex-cloud-development | login | 200 | -101 | 否 | 否 |
| codex-cloud-development | comments_hot | 200 | 0 | 否 | 是 |

`—` 表示没有取得 B站业务 JSON，不能擅自填为业务码 -412。云端评论的首次默认排序响应没有有效评论，虽然 HTTP 200 / code 0 仍标失败；之后仅补一次热度请求取得非空评论。匿名 nav 的 -101 是未登录业务状态，不是 HTTP 风控。

Codex 云端携带登录 Cookie 组**未运行**：本地只有空凭据模板；没有从 Cloudflare Secrets 导出 Cookie，也没有要求用户在聊天中提供。Codex 云端不代表用户本机出口。

结论：本次 Worker 的三个类别、匿名和携带现有登录态全部 412，Codex 云端有有效匿名视频与评论结果，支持当前 Worker 出口或连接特征受限；**不能扩展为所有 Cloudflare IP 都被封禁的证明**。登录接口本身不需要 WBI，因此这组 412 不能用修改 WBI 或 CSRF 来解释。Cookie 有效性仍无法确认。

临时诊断入口仅放在现有 Worker，记录后已随正式版本替换移除；本轮没有创建另一个 Worker。后续方案、参考项目原理与费用/授权边界见 [NETWORK-AUTH.md](NETWORK-AUTH.md)。

## 正式 MCP 线上状态

使用官方 MCP TypeScript 客户端，HTTPS `/mcp` 初始化、九工具发现、未授权 401 和健康检查通过。第二轮仅补一次 `get_video_info` 正式调用验证现状，仍返回 `isError: true` / `RISK_CONTROL` / HTTP 412，不把协议 HTTP 200 当作业务成功。

| 工具 | 真实可用性 | 验收依据与限制 |
| --- | --- | --- |
| `search_videos` | 未通过 | 第一轮正式 MCP 返回 412；本轮未重复遍历 |
| `get_video_info` | 未通过 | 第二轮正式 MCP 仍返回 412 |
| `get_subtitle` | 未通过 | 视频详情前置步骤受阻，真实存在字幕与无字幕的线上端到端均未完成；已有分页模拟测试 |
| `get_user_info` | 未通过 | 第一轮正式 MCP 返回 412；本轮未重复遍历 |
| `get_user_videos` | 未通过 | 第一轮正式 MCP 的 nav/WBI 前置步骤受阻；不能把空列表视为成功 |
| `get_comments` | 未通过 | 第一轮正式 MCP 返回 412；第二轮匿名/登录出站对照均 412 |
| `get_comment_replies` | 未通过 | 线上 MCP 楼中楼完整读取未完成；不使用开发环境直接 HTTP 成功代替验收 |

按本轮收尾范围，暂不增加后端，继续保持直连；七个读取工具均不能标记为“已线上可用”。没有运行高频或全评论区采集。

## 评论发送与回复

模拟测试覆盖 Cookie/CSRF 缺失、格式、登录过期、表单与正文、根/父回复关系、缺少 OAuth 写 scope、网络不明结果及 HTTP 5xx 不重试。具体目标和正文已在私人任务对话获得授权，不写入公共报告。

实际登录检查仍被 HTTP 412 阻断，本轮没有进入发布接口，没有发表评论或回复；不能把模拟请求或工具发现当作真实写入成功。网络问题解决后仍须先验证登录与 CSRF，再按授权范围各发送一次，结果不明时先回读，禁止自动重发。

## ChatGPT / OAuth

- **已核对**：官方文档支持 Streamable HTTP；当前连接表单无自定义 API Key 输入。固定 Bearer Token 不等于 OAuth；账户套餐与工具权限单独生效。
- **已实现但未接通**：OAuth 资源端已通过签名验证和真实 MCP 协议模拟测试；外部授权服务器、授权码 + PKCE、刷新及客户端注册必须由本人选择并配置的提供方完成。不能称为完整 OAuth 上线。
- **需要用户操作**：提供方账户、精确 ChatGPT redirect URI、资源 audience 与本人 subject 白名单配置，以及实际 ChatGPT 账户连接。没有自动创建提供方账号、授予权限或申请付费资源。
- **未验证**：没有可操作的已登录 ChatGPT 账户会话，未实测 Plus 添加、认证和读取；官方页面未提供本项目可依赖的 Plus 完整能力保证。不会用协议测试冒充账户 UI 测试。

## 自动验证

- `npm run check`：通过。
- `npm test`：54 项通过（原 38 项 + OAuth、后端边界、HTTP 412 立即停止与写入不明结果的 16 项）。
- `npm run build -- --minify`：通过，gzip 约 170 KiB；JWT 使用原有锁定依赖树中的 jose，现显式声明为运行依赖，不手写加密协议。
- `npm audit --audit-level=moderate`：0 漏洞。
- `node --check backend/handler.mjs` / `backend/server.mjs`：通过。
- 第一轮仓库隐私工具 54 项回归已通过；本轮另执行暂存区、提交说明、新增提交和待推送范围的隐私检查。
- Linux / Windows CI 的当前提交状态以 PR #49 的 Actions 为准，不引用旧提交冒充最新通过。

部署继续使用原 Worker，保留 B站和服务 Secrets，后端默认关闭，OAuth 提供方留空；没有数据库、KV、Queues、定时任务、新网络后端或账号管理系统。配置与 GitHub 文件回读检查执行后再交付。未完成核心业务验收，保持 PR 草稿，不自动合并。
