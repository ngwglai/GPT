# 仓库收尾验收（2026-10-15）

## 合并记录

- PR #3 → main：01166a4；HTML 源统计回归与跨平台检查通过。
- PR #4 → feature/constraintlab：0030fa7；准备阶段取消崩溃和原审查问题修复通过。
- 工程 PR #5 → main：c31bd90；固定 Actions、统一门禁、Windows 原生验收脚本及维护说明。
- [PR #2](https://github.com/ngwglai/GPT/pull/2) → main：整合版本完整验收通过，按授权在最终 CI 通过后合并；最终合并记录见链接。

## 实际测试

- 隐私脚本：18 项回归；当前分支及新增提交的作者、提交者、内容、尾注检查通过。
- RepoScope：Linux Python 3.11/3.12 各 35 项；Windows 两版本各 33 项通过、2 项 POSIX 专属按原规则跳过；wheel、ruff、CLI 双报告通过。
- ConstraintLab：Linux/Windows 各 15 项后端测试，包含 120 个随机差分和 N=1..8 三算法完整计数；TypeScript/Vite、wheel、ruff 通过。浏览器基线 4 项跨平台通过；新增预设加载回归后共 5 项，本地已通过，最终 Windows 结果以最新 CI 为准。
- 实验：3 个问题、27 条记录 SAT；CSV/JSON 去重与重放测试通过。九个示例返回解均独立验证，困难数独在资源限额下如实 UNKNOWN/timeout；4 皇后 CLI 完整枚举 2 解；wheel 在独立环境离线安装后核心求解通过。
- Windows Server 2025：在含中文及空格的临时路径执行真实 start-windows.cmd 并完成浏览器流程，启动器选择 Python 3.14.7。没有以 Linux 结果替代 Windows，没有执行用户电脑上的人工验收。
- npm audit 零已知漏洞，pip check 通过。一条 httpx 上游弃用警告保留；无失败被屏蔽。首次发现的准备阶段取消错误已修复；首次 CI 的非 editable 安装导致页面 404 已修正，后续对应完整 CI 通过。

## 工程与风险

CI 对两个项目分别测试和构建，使用只读权限、固定 Actions 发布提交、超时和 CI required 汇总门禁。历史脚本扫描只覆盖其可达引用，不代表 GitHub 隐藏 PR 引用与缓存被清除。

- P1：既有 PR #1 的 3 个旧提交仍含非规范作者和提交者（共 6 项元数据命中）。不公开原值，不重写历史。当前分支及 PR #2–#5 均符合经 GitHub 邮箱接口确认的 noreply 身份。PR #1 平台侧残留需通过 GitHub Support 等渠道处理；本次未解决。
- P2：main 尚未保护；当前集成的分支保护管理接口 HTTP 403。建议管理员启用 CI required、目标更新、PR 与评审对话限制，并禁止强推/删除；启用前确认合并工具符合身份策略。
- P3：上游 httpx 弃用警告、困难实例超时以及尚未执行用户电脑人工验收是已记录边界。

已删除合并的三个临时修复/工程分支。旧 feature/reposcope 因自动审批拒绝删除而保留：它不是明确的临时修复分支，并与 main 历史分叉；未绕过限制。

功能与工程测试稳定，可继续开发新项目。由于旧 PR 身份残留及分支保护权限限制，不能宣称仓库整体已达到全部严格验收标准。未修改仓库公开状态，未强推或重写历史。

## CI 证据

- [RepoScope PR #3](https://github.com/ngwglai/GPT/actions/runs/38709815182)：成功。
- [ConstraintLab PR #4](https://github.com/ngwglai/GPT/actions/runs/38710374741)：成功，含真实 Windows 原生验收。
- [工程 PR #5](https://github.com/ngwglai/GPT/actions/runs/38710640006)：成功。
- [整合 main 后 PR #2](https://github.com/ngwglai/GPT/actions/runs/38711545297)：全部成功，含两项目和 Windows 原生验收。

最终文档提交及 main 合并后运行，可由 [Actions 列表](https://github.com/ngwglai/GPT/actions) 按对应提交核对。

## 最终预设加载修复

文档提交 c35b6f7 的 PR CI 38712453623 曾失败，同提交 push CI 通过；未将其视为最终通过。实测定位为加载期间可误用旧问题以及旧响应覆盖新选择。新增可控延迟回归在旧界面失败，修复请求顺序与加载状态后本地 5 项 E2E 通过。保留全部原断言，不添加重试或降低标准；合并以最新完整跨平台 CI 为准。
