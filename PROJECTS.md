# 项目索引与候选池

本文件是跨对话、跨开发代理的项目进度记录。启动新任务前先检查，避免重复开发。

## 状态定义

- **Idea**：候选想法，尚未形成实施方案。
- **Planned**：已有范围、技术方案与验收标准，待启动。
- **Developing**：正在开发。
- **Testing**：实现完成，等待验证或验收。
- **Completed**：已验收、可使用。
- **Paused**：暂缓，保留后续可能。
- **Abandoned**：决定不再推进，说明原因。

## 项目总览

| 项目 | 目录 | 状态 | 价值/用途 | 下一步 |
| --- | --- | --- | --- | --- |
| ConstraintLab | [projects/constraintlab](projects/constraintlab/) | Testing | 本地 CSP 求解与算法实验平台 | v0.1.0 实现与 Linux 验证完成，等待 PR 审查和 Windows 原生验收 |
| RepoScope | [projects/reposcope](projects/reposcope/) | Completed | 面向 Windows 用户的离线仓库规模、技术栈与维护风险分析；HTML / Markdown 报告 | v0.1.0 已实现并在 Linux 验证，等待用户验收及 Windows 原生回归 |

## RepoScope v0.1.0（2026-10-15）

- **状态**：Completed；2026-10-15 用户同意按现有代码审查与 Codex 测试记录完成初步验收，已合并至 `main`。Windows 原生运行尚未验证，不代表 Windows 测试通过。
- **目标与用户价值**：快速了解陌生本地代码库，生成可离线浏览及交给 AI 阅读的摘要；不上传扫描数据，无 API Key。
- **与现有项目的差异**：本仓库首个独立项目，目前不存在重复项目。
- **范围与已实现功能**：递归扫描、嵌套 `.gitignore` 与额外排除、敏感文件保护、二进制/编码识别、权限容错、链接循环规避；语言/行数/递归目录规模；六种清单的技术栈推断；Python AST 和 JS/TS 启发式指标；单文件响应式明暗主题 HTML 与 Markdown 阅读建议。
- **技术方案**：Python 3.11+，标准库为主；唯一运行依赖 `pathspec==0.12.1` 保证 Git 通配符语义，目标项目代码不执行。
- **验收标准**：安装后通过 CLI 扫描真实仓库，生成两种无外部资源的报告；敏感文件不读取内容，报告正确转义；临时数据测试全部通过，统计算法及局限明确说明。
- **目录 / 分支**：`projects/reposcope/`；开发分支 `feature/reposcope` 已通过 PR #1 合并至 `main`。
- **审查入口**：[Pull Request #1](https://github.com/ngwglai/GPT/pull/1)（已合并）；完整描述位于 `projects/reposcope/PR_DESCRIPTION.md`。
- **实际验证**：34 项 unittest 分别在 Linux / Python 3.12.14 与 3.11.17 全部通过、无跳过；覆盖权限、Unicode、注入、1,500 个小文件及链接循环等；真实仓库扫描、wheel 构建、无网络源安装、离线报告浏览器内容测试均通过。详见 [VALIDATION.md](projects/reposcope/VALIDATION.md)。
- **已知限制**：Windows 原生尚未实测；其他语言行数与 JS/TS 指标为估算，不是准确圈复杂度。云浏览器策略阻止 `file://` 导航，已用同一 HTML 内容离线验证渲染及主题。
- **后续事项**：如有实际使用需求，再补充 Windows 原生测试；可选扩展编码/语言支持、入口识别和 JSON。当前无需继续开发。

## 仓库隐私治理（2026-10-15）

- **范围**：审计所有可访问分支、标签、PR 引用及公开文本，准备匿名历史并为后续开发增加身份核验和标准库隐私检查；不修改 RepoScope 源码。
- **长期规范**：见根目录 `AGENTS.md` 与 [docs/PRIVACY.md](docs/PRIVACY.md)。每次提交前主动检查暂存区、拟提交说明和有效作者/提交者；hooks 不能替代主动检查。
- **交付边界**：原始备份、身份词表和 SHA 映射仅保存在仓库外。历史重写先在本地副本验证；远程历史替换、分支/标签删除及 PR 处理必须另经明确批准，GitHub 服务端引用与缓存不保证随之清除。
- **审计摘要**：见 [docs/PRIVACY_AUDIT.md](docs/PRIVACY_AUDIT.md)，不公开原始私人值。

## 候选想法

当前为空。每次选题前，先检查仓库现有项目与候选池；优先考虑能实际使用、易测试、无需付费服务的工具。

## 每次选题记录模板

### 项目名称（日期）

- **状态**：Idea / Planned / Developing / Testing / Completed / Paused / Abandoned
- **目标与用户价值**：
- **现有项目与替代方案对比**：
- **最小可行功能（MVP）**：
- **技术方案与运行环境**：
- **验收标准（可验证）**：
- **目录 / 分支 / PR**：
- **已完成工作与测试结果**：
- **已知问题及下一步**：

## 选题优先级

优先考虑真实可用性、独特性、开发可行性、低维护成本；如果旧项目更值得完善，可以选择迭代而不是强行新建项目。

> 本仓库采用手动触发流程；此文件不表示任何后台任务已经启动。

## ConstraintLab v0.1.0（2026-10-15）

- **状态**：Testing，等待用户验收。
- **目标与用户价值**：面向 CSP 学习者与算法研究者，在本机编辑问题、观察约束传播并比较搜索算法。
- **与现有项目差异**：独立算法实验平台，与 RepoScope 的仓库分析用途不同；未修改 RepoScope。
- **交付范围**：BT/FC/MAC、四种变量启发式、三种取值顺序、严格 JSON 模型、五类内置问题、独立验证/穷举、浏览器编辑与回放、重复/多规模实验及 JSON/CSV 导出、Windows/Linux 启动脚本。
- **验收标准**：浏览器完整求解与导出流程、完整解独立验证、随机 CSP 解集合差分一致、正确报告资源终止与枚举状态。
- **目录 / 分支**：`projects/constraintlab/`；`feature/constraintlab`。PR 审查入口见本次交付链接。
- **实际验证**：Linux / Python 3.12，11 项后端测试（含 120 个随机 CSP 与 N=1–8 皇后计数）、3 项 Chromium 端到端测试、TypeScript/Vite 构建；详见 [测试报告](projects/constraintlab/docs/VALIDATION.md)。
- **已知限制**：Windows 原生未验证；MAC 是二元弧一致性，高元约束传播较弱；轨迹为有界计算后回放；峰值内存不测量。
- **下一步**：用户审查 PR，按 README 在 Windows 启动并验收；未经确认不合并。
