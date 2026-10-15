# 自动测试与合并维护

## CI

`.github/workflows/ci.yml` 在所有 PR、`main` / `feature/constraintlab` 推送及手动触发时运行。仅使用读取仓库权限，不向测试进程保存 checkout 凭据；Actions 固定到核实过的发布版本提交，任务有超时限制。

- 隐私：运行根目录 18 项标准库回归测试，以及 `privacy_check.py --all-history`。CI 的公开 noreply 策略来自仓库身份脚本对账号邮箱接口的实际核验，不需要给 PR 提供私人邮箱接口权限。每个开发 checkout 仍须独立运行 `configure_git_identity.py --install-hooks`。
- RepoScope：Linux / Windows × Python 3.11 / 3.12；unittest、ruff F 类检查、wheel 构建、真实 CLI 双报告。Windows 按原测试条件跳过 POSIX 权限与 FIFO 两项，不能将跳过项算作通过。
- ConstraintLab：仅在 checkout 中存在该独立项目时运行；Linux / Windows 的 Python 测试、ruff、wheel、锁文件安装、TypeScript/Vite 构建、Playwright 浏览器流程和多规模实验。服务采用源码 editable 安装，与 README 和启动脚本一致；wheel 只提供 Python 核心/API，不带前端。
- Windows 浏览器验收：复制项目到含空格及中文的临时路径，执行原生 `start-windows.cmd`，等待真实页面可用，再运行完整 E2E。结束时清理整个服务进程树。此项是 Windows 原生自动验收，不等同于在用户电脑上人工双击验收。
- QQ Mail MCP：Node.js 24、npm ci、Playwright Chromium 安装、类型检查、OAuth/IMAP/MIME 测试、Workers dry-run 构建与项目隐私基线。使用项目工作目录与锁文件缓存，不访问 Cloudflare Secrets，不部署；项目测试需 Chromium，缺失即失败。
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

遵守 [PRIVACY.md](PRIVACY.md)：每次提交主动检查暂存区、拟提交说明、实际新增提交，推送前检查所有待推送提交。使用经 API 验证的当前账号 noreply 身份，不修改全局配置，不重写已有历史。快进合并保留已验证的提交身份；GitHub 的 PR 合并状态应另行核实。

自动扫描不是秘密不存在的证明：未知真实姓名、图片或编码内容、远程隐藏引用和外部克隆仍在能力边界之外。不得把私人词表、原始审计或历史备份放入公开仓库。

## 默认分支限制与清理

2026-10-15 检查时，分支列表显示 `main` 未保护；当前集成调用分支保护管理接口返回 HTTP 403。不能据仓库元数据中的 admin 标记推断令牌具有管理权限，也不能把未完成的设置记录为成功。

管理员取得相应权限后，建议要求 `CI required` 通过、分支与目标保持最新、通过 PR 合并并解决评审对话，禁止强推与删除默认分支。启用前须确认合并工具产生的作者、提交者符合本仓库身份策略。单人仓库不强制要求额外批准人，避免无法完成自审的锁死。

只清理已合并且确认不再需要的临时分支。旧分支若因既有 squash 或历史治理不在默认分支祖先链中，先比较项目内容，不能只凭提交数量删除。保留未完成验收的功能分支；不强推、重写历史或更改公开状态。
