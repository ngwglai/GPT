# 仓库维护复核（2026-10-16）

基线 main：`b5563dd`（PR #8 后）。独立维护分支 `fix/repository-maintenance-20261016`，正常合并此前受阻的 CompressionLab 本地提交；不重写共享历史、不部署、不访问真实邮箱。遵守根 AGENTS.md，保留所有原测试断言、求解/物理容差及资源上限。

## 发现与修复

| 问题 | 修复与证据 |
| --- | --- |
| CompressionLab 本地交付滞留；旧记录仍将平台系统 committer 当作阻塞 | 采用 main 已合并的 PR #8；正常合并两项已核实的本地提交，完整复验 CompressionLab，纳入本轮 PR |
| 文本扫描豁免整个 GitHub 邮箱域，普通地址可漏检 | 收窄为精确公共系统地址；新增普通地址、子域、大小写、身份字段、合并父数与说明的拒绝测试 |
| 私有词表误列公开平台系统身份，当前环境与 CI 结论不一致 | 仓库外备份词表后仅纠正这一公开项；保留其余三个私人词条，不公开或提交词表/原值；显式 denylist 仍能拒绝系统地址 |
| 收窄后旧历史合成测试源触发误报 | 仅固定既有 blob 哈希、精确路径和单一虚构值保留原行为；不跳过扫描，新编辑/其他邮箱/私人词条均拒绝，回归覆盖；不改写历史 |
| 两个实验项目未纳入 CI required，独立路径过滤可能漏检 | 根 CI 调用 EntropyLab / CompressionLab 的可复用 Linux/Windows 工作流并汇总，失败/取消仍失败；保留原检查和基准，增加 EntropyLab Windows E2E |
| CompressionLab / EntropyLab 各 12 项 npm 已知告警（含开发依赖） | 固定升级 Vitest 5.0.5、typescript-eslint 8.71.2 与锁文件，移除受影响的旧依赖树；两者完整 npm 审计均降到 0 |
| 新建 Python venv 的旧 pip 有已知漏洞 | 本地、Python 项目 CI 与 Windows 启动器先升级 pip 26.2.1；CI 增加 pip check / pip-audit，失败停止 |
| 依赖审计仅为历史一次性结果，不能防止再次引入 | 四个 Node 项目均增加完整 npm 审计门禁；Python 两项目增加安装环境审计，无 ignore-vuln 或只查生产依赖的缩减 |
| QQ Mail MCP 文档称按钮仍为“一小时”，源码已是“授权一年” | 核对源码和 365 天实际存储期限；更正文档，在原 Chromium 授权流程中断言按钮文字，不修改令牌策略 |
| 维护合并可能触发隐式 Pages 发布；多处文档仍等待人工合并 | Pages push 保留构建/测试，发布 job 限定显式手动触发；同步当前索引、维护规则和历史快照说明 |

## 实际本地检查

Linux / Python 3.12.14 / Node.js 24.19.0 / Chromium 156；所有以下测试均实际执行，无新增重试/跳过。远程 Windows 与 Python 3.11 的执行结果以本 PR 最新 SHA 的 Actions 为准，不用本地 Linux 结果冒充。

| 检查 | 结果 |
| --- | --- |
| 隐私脚本与真实 hooks 回归 | 26/26 通过；新增 5 项（含单项多个反例） |
| RepoScope unittest | 35/35 通过，含真实 POSIX 权限/FIFO；ruff F、wheel、CLI Markdown/HTML 通过 |
| ConstraintLab 后端 pytest | 15/15 通过，原上游 httpx 弃用警告仍显示；ruff F、wheel、前端 TypeScript/Vite 通过 |
| ConstraintLab 真实服务 Playwright | 5/5 通过；完整基准 3 个问题 / 27 条记录成功 |
| EntropyLab Vitest | 90/90 通过；lint/typecheck/build 通过 |
| EntropyLab Playwright | 8/8 通过，真实 Canvas / Worker；独立计算基准 1 项通过，含 12 组场景 |
| CompressionLab Vitest | 106/106 通过；含 250 组样本的一项回环测试，不重复计数；lint/typecheck/build 通过 |
| CompressionLab Playwright | 13/13 通过，真实生产页面 |
| QQ Mail MCP | 62/62 Vitest 通过（已含 2 项真实 Chromium OAuth 流程），typecheck、Workers dry-run、项目隐私扫描通过 |
| npm 完整依赖审计 | 四个 Node 项目均为 0 已知漏洞，包含开发依赖 |
| Python 安装环境 | pip check 通过；升级 pip 后 pip-audit 0 漏洞分发包；editable 两个项目本身不查公共库，依赖已检查 |
| 可达 Git 历史 / 暂存区 / 提交说明 / 实际提交 | 按根 AGENTS 逐次主动检查；不依赖 hooks 代替主动执行，不使用 --no-verify |

总计 **334 项核心/集成测试 + 26 项独立 E2E + 1 项计算基准**；QQ 内嵌的两个 OAuth 浏览器测试已包含在 62 内，不再次相加。历史版本的已知计数和快照保留，并用最新记录说明状态变化。

## 仍存在的平台侧边界

- PR #1 旧提交接口仍可读到 3 个旧提交，作者/提交者共 6 项非规范身份；这是平台历史残留，不是当前 main 的可达历史。未输出原值、未强推或重写共享历史；需仓库管理员按 PRIVACY.md 的 GitHub Support 流程处理，本次无法由代码修复。
- 分支保护接口仍返回 HTTP 403；当前凭据无法读取或设置保护。CI required 的汇总检查已加强，但不能称为 GitHub 服务端强制保护已启用；需要具备对应管理权限的管理员操作。
- Pages 设置接口不可确认，不声称已部署。真实 QQ 邮箱、ChatGPT 私人账号连接、用户电脑、Firefox/WebKit 与真实手机未验收；本轮不要求读取私人内容或部署验证。
- npm/pip 审计是当日漏洞库结果，不是不存在未知漏洞的证明；未知私人姓名、编码图片、GitHub 隐藏引用和外部克隆仍在扫描能力边界外。

只有当前 PR 最新完整 CI 成功后才合并；本文件不把工作流配置存在当成已运行，也不把历史 CI 成功代替当前提交。
