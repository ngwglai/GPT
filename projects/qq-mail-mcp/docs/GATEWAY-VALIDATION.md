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

自动化 SMTP 协议测试使用可控模拟 socket，自动化测试本身不发送真实邮件。另在用户明确指定测试收件邮箱和内容后，通过官方连接器提交了一次真实 SMTP 任务，结果见下表。

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
| 真实 SMTP TLS / 认证 / 发送 | 使用原邮箱 Secrets，经 QQ TLS 465 完成 AUTH LOGIN；一封中文文本/HTML alternative 测试邮件返回 SMTP 250、任务为 sent |
| 实际收件核实 | 用户明确确认已收到，中文显示正常；此证据来自收件人反馈，不仅是 SMTP 返回值 |
| 原已授权 MCP 兼容入口 | 使用现有 QQ-Mail-MCP 连接实际调用 mail_status，connected/authenticated 均为 true |
| 邮箱结果及时清理 | 验证后已清空真实搜索/读取任务的结果，仅保留去重元数据 |
| 生产清理 Cron | 将非邮件状态探针结果设为过期后，实际自动清理已将结果和过期字段清空 |

生产测试未公开邮件正文、主题、地址、UID 或账户关联 ID。Cloudflare API 的账户管理能力已经授权，不表示任意第三方可以提交任务；本项目没有增加公网业务入口。连接器现有授权也不是由 Worker 强制限制的单库沙箱，详见接入文档。

## 验收边界与后续

1. 已按用户明确安排发送一封中文文本/HTML alternative 测试邮件，用户确认实际收到且中文正常。CC/BCC、错误认证、断线及结果不明等故障路径使用模拟 socket 验证，没有额外真实发送。其他任务的 sent 仍只代表 SMTP 接受，不能泛化为所有邮件均已送达。
2. 公网 smoke 脚本没有注入 OAuth 访问令牌，其已认证部分明确跳过；随后通过现有已授权 QQ-Mail-MCP 连接实际调用 mail_status 成功，兼容入口已验证。本地六工具回归及官方插件真实 IMAP 读取链路均通过。
3. GitHub Actions 与 PR 状态以最终 PR 检查页为准；生产 Cron 自动清理及本地结果期限测试均已通过。
4. `unknown` 没有自动核实或重发机制。相同 ID 永不重发，人工核实前不能换新 ID 绕过去重。D1 恢复副本、Cron 平台延迟和免费配额是明确的运行边界。

因此：代码、部署、官方连接器真实读取/搜索/发送和任务查询链路均已验证；本次测试邮件的实际收件和中文显示由用户确认。最终 PR/CI 状态见检查页。
