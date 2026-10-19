# 自动测试与合并维护

## CI

`.github/workflows/ci.yml` 在所有 PR、`main` / `feature/constraintlab` 推送及手动触发时运行。仅使用读取仓库权限，不向测试进程保存 checkout 凭据；Actions 固定到核实过的发布版本提交，任务有超时限制。

- 隐私：在 Linux / Windows × Python 3.11 / 3.12 运行根目录标准库回归（含新 checkout、旧快照重迁移、真实 hooks、detached HEAD、嵌套标签及失败关闭），以及 `privacy_check.py --all-history`。CI 的公开 noreply 策略来自仓库身份脚本对账号邮箱接口的实际核验，不需要给 PR 提供私人邮箱接口权限。隐私任务明确报告无私人词表，不能代替开发环境的私有检查。每个开发 checkout（包括旧快照恢复）仍须独立运行 `configure_git_identity.py --install-hooks`。
- RepoScope：Linux / Windows × Python 3.11 / 3.12；unittest、ruff F 类检查、wheel 构建、真实 CLI 双报告。Windows 按原测试条件跳过 POSIX 权限与 FIFO 两项，不能将跳过项算作通过。
- ConstraintLab：仅在 checkout 中存在该独立项目时运行；Linux / Windows 的 Python 测试、ruff、wheel、锁文件安装、TypeScript/Vite 构建、Playwright 浏览器流程和多规模实验。服务采用源码 editable 安装，与 README 和启动脚本一致；wheel 只提供 Python 核心/API，不带前端。
- Windows 浏览器验收：复制项目到含空格及中文的临时路径，执行原生 `start-windows.cmd`，等待真实页面可用，再运行完整 E2E。结束时清理整个服务进程树。此项是 Windows 原生自动验收，不等同于在用户电脑上人工双击验收。
- QQ Mail MCP：Node.js 24、npm ci、Playwright Chromium 安装、类型检查、OAuth/IMAP/MIME 测试、Workers dry-run 构建与项目隐私基线。使用项目工作目录与锁文件缓存，不访问 Cloudflare Secrets，不部署；项目测试需 Chromium，缺失即失败。
- EntropyLab / CompressionLab：通过可复用工作流分别运行 Linux/Windows 的 npm 锁文件安装、完整依赖审计、lint、typecheck/build、Vitest 和生产 Chromium E2E；EntropyLab 另保留 Linux 计算基准。两个工作流可手动运行，所有 PR 与 main 推送由根 CI 调用，避免路径过滤漏检和重复执行。
- 依赖：四个 Node 项目都执行包含开发依赖的 `npm audit --audit-level=moderate`；Python 项目先固定升级 pip 26.2.1 / setuptools 84.0.0，再执行 `pip check` 和 `pip-audit`，检查失败不会忽略。审计器对 editable 项目本身不查公共漏洞库，其已安装第三方依赖仍逐项检查；项目源码由测试和审查覆盖。
- ModelCheckLab：独立可复用工作流，Linux/Windows 原生 Node.js 22；锁文件安装与完整依赖审计、lint、类型、真实 BFS/100种子独立参考差分、生产构建、Chromium Worker/导入导出/回放 E2E，不部署。
- SynthLab：独立可复用工作流，Linux/Windows 原生 Node.js 22；锁文件安装、完整依赖审计、lint/typecheck、独立小语法穷举和50种子规格对照、生产构建、真实Worker Chromium E2E，预算/取消/故障与有限域结论独立，不部署。
- `CI required` 汇总全部适用任务；任一必需任务失败或取消均失败。只有项目确实不存在时，允许跳过其独立任务。失败时保留服务日志与浏览器失败信息供排查。

配置存在不代表运行成功，验收应引用对应提交的 Actions 运行链接。不得用旧提交结果代替新提交验证。

## 本地复验

从根目录执行隐私回归：

```sh
python -m unittest discover -s tests -v
```

RepoScope 与 ConstraintLab 各自的安装、核心测试、构建及浏览器流程见其独立 README。安装 ConstraintLab 并完成前端构建后，也可从根目录执行：

```sh
python scripts/ci_constraintlab_e2e.py
# 只允许在原生 Windows 使用：
python scripts/ci_constraintlab_e2e.py --windows-launcher
```

本地需预先安装 Playwright Chromium，或通过 `CHROMIUM_PATH` 选择实际安装的浏览器。程序会检查页面就绪、传播测试退出码并停止服务；不会吞掉失败。端口 8765 应空闲。

## 身份与隐私

遵守 [PRIVACY.md](PRIVACY.md)：每次提交主动检查暂存区、拟提交说明、实际新增提交，推送前检查所有待推送提交。使用经 API 验证的当前账号 noreply 身份，不修改全局配置，不重写已有历史。全历史扫描必须包含 PR 的 detached HEAD，拒绝浅克隆；pre-push 检查推送对象，不因无关标签误阻断，也不能用未知远程基线排除历史。合并后的 main 再扫描；GitHub PR 生成的系统 committer 仅在 AGENTS.md 的严格条件内允许，普通提交仍须是经核实的仓库 noreply 身份。GitHub 的 PR 合并状态需另行核实。

自动扫描不是秘密不存在的证明：未知真实姓名、图片或编码内容、远程隐藏引用和外部克隆仍在能力边界之外。不得把私人词表、原始审计或历史备份放入公开仓库。

## 默认分支限制与清理

2026-10-15 检查时，分支列表显示 `main` 未保护；当前集成调用分支保护管理接口返回 HTTP 403。不能据仓库元数据中的 admin 标记推断令牌具有管理权限，也不能把未完成的设置记录为成功。

管理员取得相应权限后，建议要求 `CI required` 通过、分支与目标保持最新、通过 PR 合并并解决评审对话，禁止强推与删除默认分支。启用前须确认合并工具产生的作者、提交者符合本仓库身份策略。单人仓库不强制要求额外批准人，避免无法完成自审的锁死。

只清理已合并且确认不再需要的临时分支。旧分支若因既有 squash 或历史治理不在默认分支祖先链中，先比较项目内容，不能只凭提交数量删除。保留未完成验收的功能分支；不强推、重写历史或更改公开状态。

## 发布与维护复验

Pages 在 main 的相关变更后继续构建并测试，只有显式 `workflow_dispatch` 才运行发布 job，避免常规维护合并隐式发布。没有运行真实邮箱验收或修改线上 Secrets。

2026-10-16 的完整本地复验和已知平台侧限制见 [REPOSITORY_REVIEW.md](REPOSITORY_REVIEW.md)。旧文档中的测试计数及“用户验收前不合并”属于当时快照；当前工作流以根 AGENTS.md 和该文档的最新自动验收记录为准。分支保护接口仍返回 403，不能声称已经配置保护。

## 私有环境维护（2026-10-19）

环境创建者应通过私有持久存储/挂载恢复词表，并注入 `PRIVACY_DENYLIST` 路径，然后执行 `python scripts/configure_git_identity.py --install-hooks`。重建 checkout、恢复旧快照及更换容器都重复此步骤；幂等迁移负责纠正已审定的公共系统误列，不能仅依赖上一轮对话中手工修改过的私有文件。来源优先级、权限、备份及故障处理见 [PRIVACY.md](PRIVACY.md)。不要把私人数据写入启动脚本、工作流、Actions artifacts、缓存或公开日志。

本次可验证的边界：仓库已提供持久的初始化逻辑和合成重建回归，当前环境实际迁移并通过完整扫描；环境平台模板未开放配置接口，无法从仓库内证明或修改它的存储持久化机制。没有私有来源的新环境须报错并恢复来源，不可自动生成或缩减词表。
