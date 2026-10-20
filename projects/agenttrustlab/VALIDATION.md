# AgentTrustLab v0.1 验证记录

日期：2026-10-20。当前状态：Completed。功能通过PR #20合并至main；最新功能头及功能合并后的main CI均31/31成功。本记录为合并后文档更新，其最新完整CI仍须通过后才能合并。

## 环境前置检查

- 执行环境从 starting 恢复 ready；独立最小命令输出固定字符串、退出0，文件读写探针退出0。
- 初始工作目录不是Git根目录，Git报告非仓库；这是命令成功启动后的路径错误。定位已有checkout后确认远程ngwglai/GPT、工作区干净，fetch最新origin/main为bc1034f，创建feature/agenttrustlab。
- 没有同任务分支、未合并PR或其他开发工作进程。根AGENTS、README、PROJECTS与工程指南已读取，沿用DeltaLab的工程依赖和测试配置，不修改其他项目业务。
- Linux / Node 24.19.0 / npm 11.9.0 / Git 2.52.0 / Python 3.12.14，满足Node≥22.12；GitHub、npm源及Playwright浏览器下载可达。
- 匿名身份/私有来源/hooks初始化成功，已有私有来源可读并按既有脚本完成精确公共误列迁移及备份；未创建空词表或修改检查规则。基线53项根回归通过；111提交/568唯一blob/0隐私命中。
- 首次离线Vitest启动因无缓存返回ENOTCACHED；正常npm ci后Vitest真实启动成功。误在仓库根运行npm ci返回EUSAGE，改到项目目录后锁文件安装通过。这些均不是执行器故障。

## 当前本地证据

- 161项Vitest通过，0失败/跳过：包括72格独立授权矩阵、全部指标固定预期、原始轨迹独立循环重算、零/全正常/全恶意样本、100种子子集不变量、配置和参数校验、CSV独立解析与公式保护。
- ESLint、TypeScript、生产Vite构建通过；完整依赖审计0已知漏洞。
- 初次13项E2E因浏览器安装尚未结束，全部在browserType.launch阶段失败（退出1），未执行应用断言；安装完成后重新运行。随后两次运行均为12通过/1失败（筛选框标签定位超时）；已补明确aria-label，重新构建后13项全部通过。
- 最终完整复验：161单元、13项生产Chromium E2E均通过，0失败/0跳过；lint、typecheck、Vite构建与完整npm审计（0漏洞）通过。包括修改请求参数后不能复用模拟确认的回归。
- 额外实际启动开发服务：浏览器加载CSS、批量72条记录、无浏览器错误；开发模式仅允许本机HMR与样式注入，生产仍connect-src none。桌面1440px与窄屏390px截图人工检查通过（截图仅本地未提交）。
- 暂存区隐私检查首次发现1处合成负向测试地址使用非标准示例域，已换为example.com保留域，保持参数拒绝用例语义；未涉及真实私人资料，未修改检查器或词表。
- 根53项隐私回归复验通过；基线全历史再次0命中。初期lint的控制字符正则错误已替换为字符检查，未关闭规则。测试文件尚未创建的一次Vitest启动返回No test files found（退出1），不计作通过。

## 远程验收与限制

新增AgentTrustLab可复用工作流，原生Linux/Windows执行npm锁文件安装、审计、lint、类型、单元、生产构建与Chromium E2E，并接入根CI required。[PR #20](https://github.com/ngwglai/GPT/pull/20)已经合并。自查修复重放后编辑与上次快照的引用共享，并扩展双重重放浏览器回归。最新功能头CI通过后才合并；初始头取消运行不作为最终验收证据。

未执行用户电脑人工试用、Firefox/WebKit和真实手机测试；未部署、不连接真实LLM/MCP/邮箱/文件或网络工具。


## 已核实的远程交付结果

| 对象 | 实际结果 | 证据 |
| --- | --- | --- |
| 最终功能头0f5f935 | 31/31作业成功，含本项目Linux/Windows与CI required | [CI 39382205636](https://github.com/ngwglai/GPT/actions/runs/39382205636) |
| 功能合并提交1b8fadf | 31/31作业成功，含本项目Linux/Windows与CI required | [main CI 39383025794](https://github.com/ngwglai/GPT/actions/runs/39383025794) |
| PR #20 | MERGED，完整合并SHA 1b8fadf844f7d7ecf90d667d09a6b623e77c4285 | [PR #20](https://github.com/ngwglai/GPT/pull/20) |
| 合并范围隐私 | 3提交 / 363唯一blob / 0命中 | 本地带私有词表扫描 |
| 合并后全历史隐私 | 114提交 / 597唯一blob / 0命中 | 本地带私有词表扫描 |

原生Windows与Linux均执行同一套本项目单元与生产Chromium验收。平台条件步骤（另一系统的安装分支）及仅失败时上传artifacts的跳过不计为测试通过。仓库既有RepoScope的Windows POSIX条件跳过仍按其原规则，不包含在本项目161/13的通过数中。

合并后本地main已fast-forward到远程同一提交，工作区干净。此后仅通过独立文档PR更新PROJECTS和本记录，不修改业务或依赖；该文档提交仍需最新完整CI通过后才合并，并在最终交付前核实最终main CI与隐私状态。
