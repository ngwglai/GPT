# QQ-Mail-Gateway 1.1 验证记录

日期：2026-11-13。代码在原项目改造，生产仍使用原 Worker，未新建替代项目、覆盖 Secret、修改 OAuth 数据或启用付费服务。

## 自动化验证

| 项目 | 结果 |
|---|---|
| `npm ci` | 现有锁文件安装成功 |
| `npm run types` / `npm run typecheck` | 已生成绑定类型，TypeScript 通过 |
| `CHROMIUM_PATH=/usr/bin/chromium npm test` | 6 个文件、99 项测试全部通过，无跳过 |
| `npm run build` | Wrangler dry-run 成功，gzip 约 297 KiB |
| `npm audit --audit-level=moderate` | 0 个漏洞 |

测试覆盖：

- 原 IMAP TLS/认证成功、失败、断线、超时；发件人/主题/日期筛选、分页、详情与 MIME 中文解析；BODY.PEEK/EXAMINE 不改 FLAGS，附件只取元数据。
- SMTP TLS socket 打开失败、AUTH LOGIN、文本/HTML/alternative、中文长主题折行、UTF-8 正文、CC/BCC envelope、BCC 不进入头部、认证失败、DATA 前/后的断线、明确拒绝、超时和持久化标记失败。
- 使用真实本地 D1：队列任务登记/领取、状态/结果、重复 ID 与冲突、并发投递、规范化 JSON 指纹、过期任务、失败脱敏、短期结果清理、长期去重墓碑。
- SMTP 已接受但保存结果失败的注入故障：再次投递不重新连接发送，旧 processing 最终变为 unknown。
- 状态任务不复制正文以延长其保存期；瞬时 D1 故障重试；邮件结果超限时不会持续保存大对象。
- 原 OAuth/DCR/PKCE/撤销和 Chromium 授权页回归；六个 MCP 工具保持只读且无发送工具。

SMTP 协议测试使用可控模拟 socket；不等同于 QQ 生产 SMTP TLS/认证或真实投递验证。自动化测试没有发送真实邮件。

## 官方连接器与生产验证

实际使用当前连接的官方 Cloudflare 插件执行，非仅根据文档推测能力：

| 验证 | 结果 |
|---|---|
| Queue / D1 读取及资源创建 | 成功，使用现有权限，无新增授权 |
| `POST .../queues/{queue_id}/messages` | `content_type:json` 成功，返回结构化 `success:true` 与队列指标 |
| Worker 部署 | 成功，原 Worker 返回 queue / scheduled / fetch handler，启动约 40ms |
| Consumer | 绑定原 Worker，batch=1、concurrency=1、retry=5、delay=60 秒 |
| 任务 D1 迁移与参数化查询 | 成功，独立任务库，不读取 OAuth 授权记录 |
| 真实邮件搜索 | 成功，限制一条摘要，D1 为 completed |
| 真实邮件详情与正文 | 成功，正文非空，包含发件人/收件人/抄送/主题/时间及不可信内容标记 |
| 故意提供错误 UIDVALIDITY | failed，错误为 UIDVALIDITY_CHANGED |
| 重复投递已完成搜索任务 | 保持原完成记录，无再次执行 |
| 公开 HTTPS smoke | health、未授权 MCP 拒绝、OAuth discovery 通过 |
| 邮箱结果及时清理 | 验证后已清空真实搜索/读取任务的结果，仅保留去重元数据 |
| 生产清理 Cron | 将非邮件状态探针结果设为过期后，实际自动清理已将结果和过期字段清空 |

生产测试未公开邮件正文、主题、地址、UID 或账户关联 ID。Cloudflare API 的账户管理能力已经授权，不表示任意第三方可以提交任务；本项目没有增加公网业务入口。连接器现有授权也不是由 Worker 强制限制的单库沙箱，详见接入文档。

## 未完成的验收

1. 用户尚未明确安排测试邮箱与真实发送，故没有执行真实 SMTP 测试，也没有核对实际收件。`sent` 仅代表 SMTP 接受，不能当作实际送达。安排后需单独验证 QQ SMTP TLS、授权、中文文本/HTML、CC/BCC 和实际收件结果；不能自动群发。
2. 本轮公网 smoke 没有使用 OAuth 访问令牌，因此已认证 MCP 真实调用为明确跳过；本地 OAuth/MCP 回归全通过，兼容接口保留。官方插件真实 IMAP 读取链路已通过。
3. GitHub Actions 与 PR 状态以最终 PR 检查页为准；生产 Cron 自动清理及本地结果期限测试均已通过。
4. `unknown` 没有自动核实或重发机制。相同 ID 永不重发，人工核实前不能换新 ID 绕过去重。D1 恢复副本、Cron 平台延迟和免费配额是明确的运行边界。

因此：代码、部署和真实读取链路已完成；包含真实发送与收件核实的最终验收仍待用户明确安排。
