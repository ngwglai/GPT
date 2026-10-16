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
| CompressionLab | [projects/compressionlab](projects/compressionlab/) | Testing | 纯本地字符压缩算法交互实验室；真实 trace 与编解码回环 | 本地功能验收通过；main 既有提交身份检查失败，pre-push 阻止推送，PR/合并待解除阻塞 |
| EntropyLab | [projects/entropylab](projects/entropylab/) | Testing | 浏览器内的计算物理与复杂系统交互实验室 | v1.1 已合并；下一步为用户电脑人工验收与按需部署 |
| ConstraintLab | [projects/constraintlab](projects/constraintlab/) | Completed | 本地 CSP 求解与算法实验平台 | 修复及整合 main 后 Linux/Windows 完整验收通过；按需扩展 |
| RepoScope | [projects/reposcope](projects/reposcope/) | Completed | 面向 Windows 用户的离线仓库规模、技术栈与维护风险分析；HTML / Markdown 报告 | HTML 修复与 Linux/Windows CI 通过；按需扩展功能 |
| QQ Mail MCP | [projects/qq-mail-mcp](projects/qq-mail-mcp/) | Testing | Cloudflare Workers 上的私人 QQ 邮箱只读 MCP，OAuth/DCR 与六个工具 | 迁移 PR 审查；保持现有服务，后续按本地配置手动部署并完成真实邮箱验收 |

## RepoScope v0.1.0（2026-10-15）

- **状态**：Completed；2026-10-15 用户同意按现有代码审查与 Codex 测试记录完成初步验收，已合并至 `main`。后续 Windows 原生自动测试已通过，详见下方审查修复记录。
- **目标与用户价值**：快速了解陌生本地代码库，生成可离线浏览及交给 AI 阅读的摘要；不上传扫描数据，无 API Key。
- **与现有项目的差异**：本仓库首个独立项目，目前不存在重复项目。
- **范围与已实现功能**：递归扫描、嵌套 `.gitignore` 与额外排除、敏感文件保护、二进制/编码识别、权限容错、链接循环规避；语言/行数/递归目录规模；六种清单的技术栈推断；Python AST 和 JS/TS 启发式指标；单文件响应式明暗主题 HTML 与 Markdown 阅读建议。
- **技术方案**：Python 3.11+，标准库为主；唯一运行依赖 `pathspec==0.12.1` 保证 Git 通配符语义，目标项目代码不执行。
- **验收标准**：安装后通过 CLI 扫描真实仓库，生成两种无外部资源的报告；敏感文件不读取内容，报告正确转义；临时数据测试全部通过，统计算法及局限明确说明。
- **目录 / 分支**：`projects/reposcope/`；开发分支 `feature/reposcope` 已通过 PR #1 合并至 `main`。
- **审查入口**：[Pull Request #1](https://github.com/ngwglai/GPT/pull/1)（已合并）；完整描述位于 `projects/reposcope/PR_DESCRIPTION.md`。
- **实际验证**：34 项 unittest 分别在 Linux / Python 3.12.14 与 3.11.17 全部通过、无跳过；覆盖权限、Unicode、注入、1,500 个小文件及链接循环等；真实仓库扫描、wheel 构建、无网络源安装、离线报告浏览器内容测试均通过。详见 [VALIDATION.md](projects/reposcope/VALIDATION.md)。
- **已知限制**：Windows CI 原生测试已通过，用户电脑的人工验收未执行；其他语言行数与 JS/TS 指标为估算，不是准确圈复杂度。云浏览器策略阻止 `file://` 导航，已用同一 HTML 内容离线验证渲染及主题。
- **后续事项**：如有实际使用需求，可补充用户电脑的人工验收；可选扩展编码/语言支持、入口识别和 JSON。当前无需继续开发。

## RepoScope 审查修复（2026-10-15）

- **分支**：`fix/reposcope-html-20261015`，已通过 PR #3 合并至 `main`（`01166a4`）。
- **变更**：排除 HTML 在源代码排行、代码集中度与目录代码行统计中的误计；新增 HTML 分类回归测试。
- **验收状态**：Linux Python 3.12.14：35 项 unittest 全部通过（含 HTML 回归），ruff F 类检查、wheel 构建、CLI 双报告检查通过；GitHub Actions 在 Linux/Windows、Python 3.11/3.12 的四组测试、构建与 CLI 检查均通过（运行 38709345362）。补充 PR 自动测试与隐私检查，ConstraintLab 检查仅在该项目存在的分支运行。

## 仓库隐私治理（2026-10-15）

- **范围**：审计所有可访问分支、标签、PR 引用及公开文本，准备匿名历史并为后续开发增加身份核验和标准库隐私检查；不修改 RepoScope 源码。
- **长期规范**：见根目录 `AGENTS.md` 与 [docs/PRIVACY.md](docs/PRIVACY.md)。每次提交前主动检查暂存区、拟提交说明和有效作者/提交者；hooks 不能替代主动检查。
- **交付边界**：原始备份、身份词表和 SHA 映射仅保存在仓库外。历史重写先在本地副本验证；远程历史替换、分支/标签删除及 PR 处理必须另经明确批准，GitHub 服务端引用与缓存不保证随之清除。
- **审计摘要**：见 [docs/PRIVACY_AUDIT.md](docs/PRIVACY_AUDIT.md)，不公开原始私人值。

## ConstraintLab 代码审查修复（2026-10-15）

- **修复分支**：`fix/constraintlab-review-20261015`，已通过 PR #4 合并到 `feature/constraintlab`（`0030fa7`）。PR #2 整合复验已通过，按本次任务授权合并；最终记录见 PR。
- **实现变更**：预检 AllDifferent 展开规模（上限 20,000）及取消/超时；实验问题用 SHA-256 去重且前端通过 `problem_id` 展示；CSV 每个问题的完整 JSON 只写一次；任务创建期间禁止使用尚不存在的取消 ID；保留任务查询与淘汰采用同一把锁。
- **新增验证用例**：大规模组合约束预算、标准小问题正确性、实验 JSON/CSV 去重和恢复、并发查找模拟、前端任务创建延迟时取消按钮。
- **实际验证**：15 项后端测试、TypeScript/Vite、4 项 E2E、wheel、静态检查和实验重放在 Linux/Windows 通过；Windows 原生启动器和中文/空格路径亦通过。CI：运行 38710374741。

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

- **状态**：Completed；PR #4 修复及整合最新 main 后完整验收通过（含 Windows 原生自动验收）。
- **目标与用户价值**：面向 CSP 学习者与算法研究者，在本机编辑问题、观察约束传播并比较搜索算法。
- **与现有项目差异**：独立算法实验平台，与 RepoScope 的仓库分析用途不同；未修改 RepoScope。
- **交付范围**：BT/FC/MAC、四种变量启发式、三种取值顺序、严格 JSON 模型、五类内置问题、独立验证/穷举、浏览器编辑与回放、重复/多规模实验及 JSON/CSV 导出、Windows/Linux 启动脚本。
- **验收标准**：浏览器完整求解与导出流程、完整解独立验证、随机 CSP 解集合差分一致、正确报告资源终止与枚举状态。
- **目录 / 分支**：`projects/constraintlab/`；`feature/constraintlab`。审查入口：[PR #2](https://github.com/ngwglai/GPT/pull/2)（完整验收通过；最终合并记录见链接）。
- **实际验证**：Linux / Windows 的 15 项后端测试（含 120 个随机 CSP 与 N=1–8 皇后计数）、4 项 Chromium 端到端测试、TypeScript/Vite 构建、报告重放；详见 [测试报告](projects/constraintlab/docs/VALIDATION.md)。
- **已知限制**：Windows Server 2025 原生自动验收通过，用户电脑人工验收未执行；MAC 是二元弧一致性，高元约束传播较弱；轨迹为有界计算后回放；峰值内存不测量。
- **下一步**：按需扩展功能；用户电脑人工验收仍可按 README 执行，不把它冒充已完成。

## 工程复验进度（2026-10-15）

- RepoScope：35 项 Linux unittest、静态检查、wheel 与 CLI 报告检查通过；PR #3 CI 在 Linux/Windows、Python 3.11/3.12 通过。
- ConstraintLab 审查修复：15 项后端测试、TypeScript/Vite 构建、4 项 Linux Chromium E2E、wheel、静态检查及实验重放通过；补充准备阶段取消初始化修复。PR #4 已合并；PR #2 整合 main 后完整 Linux/Windows 验收通过（CI 38711545297）。
- CI：两个项目独立检查，隐私脚本回归与提交历史检查自动运行。分支保护接口当前返回权限错误，尚未配置，不能视为已启用。

- **最终验收报告**：[docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。功能测试稳定；既有 PR #1 历史身份残留（P1）与分支保护管理权限（P2）尚未解决，不能视为整体严格验收全部通过。

- **预设加载竞态修复**：最终 CI 发现异步预设可能覆盖用户选择或在尚未载入时求解。已增加受控延迟回归、仅接受最新请求，并在加载时禁止求解/实验。E2E 总数增至 5 项；本地 5 项及 TypeScript 构建通过，合并门槛仍为最新完整跨平台 CI。

## EntropyLab v1.0（2026-10-15）

- **状态**：Testing；功能与本地自动验证完成，通过独立功能分支等待用户验收，不自动合并。
- **目标与用户价值**：面向学生、自学者和复杂系统爱好者，在浏览器调整参数、观察微观演化与实时统计，无需后端或付费 API。
- **与现有项目差异**：研究扩散、随机过程、细胞自动机和相变，与 RepoScope 的仓库分析及 ConstraintLab 的 CSP 求解用途不同；未修改其业务代码。
- **交付范围**：粒子扩散与空间 Shannon 熵、二维随机游走与 MSD 理论对照、可绘制/擦除且支持经典预设的生命游戏、Metropolis 二维伊辛模型；实时 Canvas、图表、数学原理与模型限制、深浅主题、响应式布局、暂停/恢复/单步/重置、参数与倍率。
- **技术方案**：独立 React + TypeScript + Vite；Vitest/ESLint/Playwright；纯数值算法与 UI 分离、固定步进、有界轨迹和历史，无后端、数据库或外部 API。
- **验收标准**：四实验实际运行且可操作；算法/边界/极值与控制逻辑测试通过；组件渲染、生产构建、真实浏览器交互及手机布局通过；PR 等待用户决定是否合并。
- **目录 / 分支**：`projects/entropylab/`；`feature/entropylab`，基于最新 `main` 创建。运行与 Pages 启用方法见 [README](projects/entropylab/README.md)。
- **实际验证**：60 项 Vitest、5 项生产页面 Chromium E2E、ESLint、TypeScript/Vite 构建及根目录 18 项隐私回归通过。详见 [验证记录](projects/entropylab/VALIDATION.md)。远程 CI 状态以 PR 检查页为准。
- **部署**：配置 `/GPT/entropylab/` base 与聚合 Pages 工作流；未部署，预期地址不代表已上线；Pages API 读取 404，管理员需检查/启用 GitHub Actions Pages 源。
- **已知限制及后续**：有限样本和有限尺寸、无热平衡时间平均、主线程按设备能力推进、图表保留 360 点、轨迹 128 点；用户验收前不合并。其他浏览器及用户电脑人工验收未执行。


## EntropyLab v1.1 硬盘气体（2026-10-16）

- **状态**：Testing；PR #7 已合并至 `main`，下一步为用户电脑人工验收与按需部署。
- **变更**：粒子扩散升级为二维硬盘气体；真实 e=1 弹性冲量、首次接触 CCD、跨网格事件与版本失效预测、有界事件堆。碰撞计算独立 Worker，忙碌时放慢推进，保留固定物理步长。
- **交互**：默认 500、上限 2,000 粒子；无重叠初态、半径与密度联动、初始 RMS 速度、碰撞开关和普通/速度显示模式；保留空间熵和直方图，新增速度分布、碰撞次数/频率、平均速率、总动能、总动量和能量偏差。
- **正确性与限制**：成对碰撞守恒向量动量/动能；壁面外部冲量单独累计。关闭隔板做有界位置投影，失败完整回退；多体同时接触为确定顺序近似，超事件预算暂停，不跳过碰撞。
- **本地验证**：90 项 Vitest（保留原 60 项覆盖并按新物理模型调整旧扩散断言，新增 30 项）、8 项生产 Chromium E2E、lint、typecheck、build、根目录 18 项隐私回归通过。计算和浏览器性能均已测量，详见 [PERFORMANCE.md](projects/entropylab/PERFORMANCE.md) 与 [VALIDATION.md](projects/entropylab/VALIDATION.md)。
- **后续**：以最新提交的 PR CI 为远程验证依据；用户验收前不合并、不部署。极端高密度高速组合可能慢于 1× 实际推进，不承诺全设备 60 FPS；其余三个实验及 RepoScope/ConstraintLab 业务代码保持原状。

## QQ Mail MCP 仓库迁移（2026-10-15）

- **状态**：Testing；迁入既有项目，不新建重复服务。
- **范围/验收**：完整源码、锁定依赖、IMAP/MIME/OAuth 测试、插件元数据、D1 迁移与 Workers 配置；公开内容无凭据及部署账号关联信息；线上模块与构建规范化比较一致，现有服务不改动。
- **目录/分支**：`projects/qq-mail-mcp/`，`feature/qq-mail-mcp-migration`；PR 地址见该分支的 GitHub PR。
- **测试/证据**：详见项目 [迁移记录](projects/qq-mail-mcp/docs/MIGRATION.md)。根 CI 增加独立 Node.js 24 / Chromium 检查，并接入 CI required；没有部署任务。
- **后续**：迁移 PR #6 已合并；后续部署使用私有本地配置和现有 Cloudflare Secrets。真实邮箱内容与未读状态验收仍需用户操作；当前线上令牌 365 天与按钮文案“一小时”不一致，迁移保留运行模块，后续应独立修正。

## CompressionLab v0.1（2026-10-16）

- **状态**：Testing；本地功能验收通过，但 pre-push 隐私 hook 因 main 既有两项 noncanonical-committer 拒绝首次推送。新增提交检查通过；未绕过 hook、未改写共享历史；PR 未创建、未合并、未部署。
- **目的/目标用户**：面向学生、自学者和算法实验者，直接观察数据冗余、信息熵、编码树、滑动窗口及可逆变换，无上传、账号或 API。
- **与现有项目差异**：研究文本与压缩编码；EntropyLab 研究计算物理，ConstraintLab 研究 CSP，RepoScope 分析仓库，QQ Mail MCP 连接邮箱。本次不修改这些项目业务代码。
- **MVP/交付**：四实验（Information Entropy、Huffman、RLE+LZ77、BWT+MTF）；六种纯 TypeScript 算法；真实 trace 单步/自动运行/暂停恢复/重置；五类通用数据集；深浅主题、窄屏、reduced-motion；UTF-8、元数据及逻辑载荷的明确统计口径。
- **验收标准**：前缀无歧义、所有编解码回环、BWT inverse、边界测试和生产浏览器交互均通过；typecheck/lint/build/隐私检查与 PR 最新 CI 通过才合并。
- **目录/分支**：[projects/compressionlab](projects/compressionlab/)；本地 `feature/compressionlab`，基于最新 main；已配置独立 Linux/Windows CI，但尚未远程执行。
- **实际验证**：本地 Linux 的 106 项 Vitest、13 项生产 Chromium E2E、TypeScript、ESLint、production build，根目录 18 项隐私回归通过；250 组 Unicode 样本回环包含在一项单元测试内。细节见 [验证记录](projects/compressionlab/VALIDATION.md)；远程 CI 尚未执行。main 既有历史身份规则问题需要独立处理后才能继续推送与合并。
- **限制/下一步**：主线程有界预计算，UI 512 符号、BWT 96；Unicode code point 而非 grapheme cluster；JSON token / 逻辑 Huffman bit 并非工业容器；Firefox/WebKit/真实手机与用户电脑人工验收未执行。按需加入二进制成本对照及 Worker，不扩张为 ZIP 等格式。
