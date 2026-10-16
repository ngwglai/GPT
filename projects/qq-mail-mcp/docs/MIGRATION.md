# 迁移与线上一致性核对（2026-10-15）

## 范围

从既有独立工作区迁入 `projects/qq-mail-mcp/`，保留 TypeScript 源码、精确版本依赖与锁文件、所有测试、D1 SQL、Workers 配置、插件元数据及文档。不导入原仓库 Git 历史、依赖目录、构建产物、日志、邮件数据、数据库、备份或 Secrets。

## 当前线上核对

只使用 Cloudflare GET 接口读取 Worker 模块、settings 和 deployments；未调用上传、部署、Secret、数据库写入接口。当前线上运行版本为 `59e93e20-aaf3-45a1-9ea7-21451320649d`（100%，2026-10-15 09:23:34 UTC）。下载模块不含 Secret 内容；不发布原始 API 响应和操作人员元数据。

工作区旧副本的令牌 TTL 为 3600 秒，当前线上模块为 31536000 秒。迁入源码按当前运行模块同步为 31536000 秒，没有改变线上行为。README 和安全文档同步该事实，并在本地 D1 测试中核对实际存储期限。既有授权按钮仍显示“一小时”，与线上 TTL 不一致；为了本次代码对齐，未修改这个运行时文案，应后续另立修复并验收。

模块比对：

| 对象 | 大小（bytes） | SHA-256 |
| --- | ---: | --- |
| 下载的线上 index.js | 1091722 | ef37f3d1ec73a731ea8abbb16d840e7369b9ebd1dd64b9b5ebc7fc87beaa2a00 |
| 迁入源码 dry-run 构建 index.js | 1091720 | 569804a6afa69a8927b9959e7be7d3c0672ad7fc8d025ae921f5b99f494a60ae |

两者仅有两处数值表示差异：线上 `31536000`，minifier 生成 `31536e3`（完全相等的 JavaScript 数值）。将线上这两处写法规范化后 SHA-256 为 `569804a6afa69a8927b9959e7be7d3c0672ad7fc8d025ae921f5b99f494a60ae`，与本地构建完全相同；其他所有模块字节一致。不是原始字节完全相同的声明。

settings 核对：Worker 名、入口、compatibility_date=2026-10-15、nodejs_compat、D1 AUTH_DB、RATE_LIMITER（30 次/60 秒）、PUBLIC_ORIGIN、精确 OAUTH_REDIRECT_URIS、日志启用/查询脱敏/invocation_logs 关闭及三个 Secret 名一致。Secret 值未读取。实际账号域名、D1 ID、限流 namespace 在被忽略的本地 `wrangler.local.jsonc` 中保持原值；公开模板与测试用保留域名、示例 ID，避免公开账号关联信息。公开模板不能直接用于现有服务部署。

## 测试和隐私

- 项目完整测试 62/62：本地 Miniflare D1、真实 Chromium 授权表单、PKCE/CSRF/Origin/replay、MCP 协议版本、六个只读工具、模拟 IMAP/MIME 与未读状态保护。
- npm ci、TypeScript、Wrangler dry-run 构建、项目隐私扫描通过。
- 根目录隐私工具 18/18 回归通过；提交前/说明/实际提交与推送范围按根 AGENTS 规则检查。
- 仓库根 CI 增加 QQ Mail MCP 任务，使用现有固定 Actions、只读权限、锁文件缓存、Chromium 和超时，纳入 CI required。没有自动部署或 Cloudflare 凭据。
- 本次不使用 OWNER_PASSWORD，不签发公网 Token，不连接真实邮箱；真实邮件中文/附件/未读状态验收不在此次测试结论内。Windows 原生尚未验证。

PR 及对应 CI 以 GitHub 最新提交的检查为准，不能用本地通过代替尚未结束的远程 CI。

## 后续部署

从仓库根进入本项目，使用已核对的私有本地配置，运行安装、类型/测试/构建；确认现有服务和 Secrets 后，按 [DEPLOYMENT.md](DEPLOYMENT.md) 手动执行迁移和 `npm run deploy`。本次不执行这些外部写入操作；CI 和创建 PR 不会触发部署。
