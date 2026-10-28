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
| CompilerLab | [projects/compilerlab](projects/compilerlab/) | Completed | 本地微型编译流水线、独立解释器与栈式 VM 语义对照 | PR #23；最终修复头253单元/14生产E2E、Linux/Windows与CI required已35/35通过；最新验收记录仍需完整CI成功，不部署 |
| CalibrationLab | [projects/calibrationlab](projects/calibrationlab/) | Completed | 本地概率预测、独立样本校准与可靠性图 | PR #22；最终121单元/13生产E2E；初始功能头Linux/Windows与CI required全通过，数值修复头仍须完整CI，不部署 |
| AgentTrustLab | [projects/agenttrustlab](projects/agenttrustlab/) | Completed | 确定性智能体信任边界与独立工具授权；四策略真实比较 | PR #20已合并；161单元/13生产E2E、Linux/Windows、CI required及合并后main CI全通过；不部署 |
| DeltaLab | [projects/deltalab](projects/deltalab/) | Completed | 离线 DAG 缓存、脏传播与输出变化传播的真实运算比较 | PR #19；224单元/18生产E2E与修复头Linux/Windows、CI required全通过；按需本机试用，不部署 |
| AdversaryLab | [projects/adversarylab](projects/adversarylab/) | Completed | 固定输入空间中的算法性能对抗搜索；真实计数与独立精确排序对照 | PR #17；本地125单元/17生产E2E；旧功能头跨平台CI通过，修复后最新CI通过即合并，不部署 |
| SynthLab | [projects/synthlab](projects/synthlab/) | Completed | 本地类型引导枚举、观察等价剪枝与真实 CEGIS 程序合成 | PR #16；105单元/13生产E2E、Linux/Windows与CI required通过；按需本机试用，不部署 |
| ModelCheckLab | [projects/modelchecklab](projects/modelchecklab/) | Completed | 有限状态 BFS、不变量/死锁/目标可达性与最短反例 | PR #14 已合并（1355655）；167单元/15生产E2E、Linux/Windows及CI required全通过；不部署 |
| CausalLab | [projects/causallab](projects/causallab/) | Completed | 可复现 SCM、混杂/碰撞/辛普森、观察估计与 do 干预 | PR #12 已合并（1c66bb6）；Linux/Windows 与 CI required 全通过，隐私阻塞已解除；按需本机试用，不部署 |
| MatchupLab | [projects/matchuplab](projects/matchuplab/) | Completed | 本地对抗决策、探索利用与策略迁移实验；两博弈 / 四算法 / 多种子 | PR #10；Linux / Windows 全部验收通过，隐私阻塞已解除；按需本机验收，不部署 |
| CompressionLab | [projects/compressionlab](projects/compressionlab/) | Completed | 纯本地字符压缩算法交互实验室；真实 trace 与编解码回环 | 旧推送阻塞已解除；完整本地复验通过，纳入维护 PR 自动验收 |
| EntropyLab | [projects/entropylab](projects/entropylab/) | Completed | 浏览器内的计算物理与复杂系统交互实验室 | v1.1 已合并；依赖审计清零、完整复验通过，按需手动部署 |
| ConstraintLab | [projects/constraintlab](projects/constraintlab/) | Completed | 本地 CSP 求解与算法实验平台 | 修复及整合 main 后 Linux/Windows 完整验收通过；按需扩展 |
| RepoScope | [projects/reposcope](projects/reposcope/) | Completed | 面向 Windows 用户的离线仓库规模、技术栈与维护风险分析；HTML / Markdown 报告 | HTML 修复与 Linux/Windows CI 通过；按需扩展功能 |
| QQ Mail MCP | [projects/qq-mail-mcp](projects/qq-mail-mcp/) | Testing | Cloudflare Workers 上的私人 QQ 邮箱只读 MCP，OAuth/DCR 与六个工具 | PR #6 已合并，62 项本地回归通过；真实邮箱验收和部署仍待安全本地配置 |

> 下方按日期保留历史开发快照；当前状态以总览和末尾最新维护复验为准。旧记录中的人工合并约束已由当前 AGENTS.md 的自动验收规则替代。

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

## 仓库维护复核（2026-10-16）

- **范围/分支**：基于最新 main `b5563dd` 创建 `fix/repository-maintenance-20261016`，保留正常历史并整合 CompressionLab 本地交付，不部署、不读取真实邮件。
- **修复**：隐私系统邮箱豁免收窄、增加拒绝/真实 hook 测试、纠正仓库外公开系统词条误报；两个实验项目接入 CI required；Vitest/TypeScript ESLint 开发依赖漏洞清零；Python pip 升级和持续审计；QQ 授权按钮文档纠正；Pages 发布改为手动触发、保留 push 构建。
- **实际本地验证**：26 隐私、35 RepoScope、15 ConstraintLab、90 EntropyLab、106 CompressionLab、62 QQ Mail MCP 测试全部通过；独立 E2E 5+8+13=26 项、计算基准 1 项及所有静态/构建检查通过；npm 四项目与 Python 审计 0 已知漏洞。跨平台最终结果以本维护 PR 最新 SHA 的 CI 为准。
- **仍需平台处理**：PR #1 旧引用的 6 项身份元数据残留、分支保护接口 403。未降低新提交隐私标准、未删除私人词条、未强推或改写共享历史；不将这些平台风险伪称已修复。
- **详细记录**：[REPOSITORY_REVIEW.md](docs/REPOSITORY_REVIEW.md)。


## MatchupLab v0.1（2026-10-18）

- **状态**：Completed；本地与 Linux/Windows 自动验收通过，通过 [PR #10](https://github.com/ngwglai/GPT/pull/10) 交付，未部署。
- **目的 / 目标用户**：面向学生、自学者和算法实验者，研究陌生对手下探索与利用、行为变化和冻结策略的迁移表现。
- **差异**：重复零和博弈与在线策略学习，不重复已有计算物理、压缩、约束求解、仓库分析或邮箱项目业务。
- **目录 / MVP**：[projects/matchuplab](projects/matchuplab/)；标准石头剪刀布、非对称幅度战术收益矩阵；均匀/固定/偏好/响应/切换对手；随机、ε-greedy、UCB1、EXP3；注入式 PRNG、统一 Agent、冻结独立测试与迁移、多种子比较、曲线/动作分布/胜率/收益、CSV / JSON、三个实验模板。
- **工程**：React / TypeScript / Vite；规则、Agent、对手、模拟、统计和导出独立；Web Worker、200 万对局 / 32 种子上限、30 秒计算预算、暂停/恢复/单步/取消；Linux/Windows 工作流接入 `CI required`，不升级其他项目依赖。
- **验收标准**：收益与算法更新可验证、同 seed 可复现、训练/测试隔离、全部模板比较与导出可用、静态/单元/生产浏览器与隐私检查通过后按规范 PR 合并。
- **实际验证**：本地 Linux 类型、lint、构建、92 项 Vitest、8 项生产 Chromium E2E、根 26 项隐私回归通过，依赖审计 0 已知漏洞；随机化覆盖 30 种子×两环境×四算法，详见 [VALIDATION.md](projects/matchuplab/VALIDATION.md)。远程 CI 运行 39107193164 的 16 项作业全部成功，包含 Linux / Windows 项目验证及 `CI required`；Windows 并非本地执行。
- **隐私阻塞处理**：原提交 `978f464` 的既有测试 fixture 命中 `known-private-identity`，文件与远程 main 相同。确认全部 12 项历史命中来自一个精确公共系统项误列，经用户明确批准、仓库外受限备份后仅纠正该项；其余私人词条、规则与钩子保留。全历史及原项目提交 / 待推送检查通过，未改写共享历史。
- **后续 / 限制**：用户电脑人工验收按 README 启动；少种子、非平稳收益、相关对局和冻结策略可能误导比较，无任何算法对所有对手最优的保证；按需增加遗忘算法与配对差异统计。


## MatchupLab 参数校验修复（2026-10-18）

- **问题**：PR #10 的 Codex 审查发现，验证器会检查所有对手参数，导致已隐藏的非活动字段为无效值时仍阻止实验启动；关闭迁移后也会检查未使用的目标对手。
- **修复**：按策略类型仅校验实际使用的字段；仅在启用迁移时校验目标对手。新增回归测试覆盖五种策略的活动/非活动字段，以及迁移开关。
- **验收**：通过修复 PR 的 Linux / Windows 自动检查后合并；不修改其他项目或依赖。


## CausalLab v0.1（2026-10-18）

- **目的 / 目标用户**：面向学生、自学者与算法实验者，用合成结构因果模型区分相关、混杂、选择偏差与因果效应；不输出现实因果结论。
- **差异 / MVP**：独立因果实验教学工具，不重复既有博弈、压缩、计算物理或约束项目。支持小型 DAG 编辑、连续线性与二元仿射概率、固定种子、统计/观察估计/后门调整、do 配对干预、解析真实 ATE、三个案例和模型/实验/结果 JSON/CSV。
- **目录 / 分支**：[projects/causallab](projects/causallab/)；基于最新 main `db02a968002d` 创建 `feature/causallab`。
- **验收标准**：实际数学算法、非法输入、精确复现、三案例、多种子及生产浏览器流程通过；类型/lint/build/隐私检查与最新 PR Linux/Windows CI、CI required 全通过后按规范合并。
- **本地实际验证**：95 项 Vitest、10 项生产 Chromium E2E、类型/lint/build、依赖审计 0 漏洞、根 26 项隐私回归通过；远程 CI 未执行（既有隐私检查阻塞），详见 [VALIDATION.md](projects/causallab/VALIDATION.md)。
- **环境记录**：执行环境曾 `pending/offline`，命令返回 `No usable execution environment is available`；之后恢复正常。平台信息不足，未确认根因；未为此修改仓库配置或历史。
- **限制 / 后续**：12 节点、20000 行、64 KiB 导入；仅仿射连续/二元机制、完全观测独立噪声；OLS 非稳健标准误；主线程有界批量计算。本地 feature 分支保留（功能提交 `4cfc707`）；既有 main 历史 12 项、该提交整树 1 项 known-private-identity 命中阻塞推送。暂存区通过不等于提交通过；本段后续诊断修正未提交。未创建 PR、未合并，故无合并 SHA；未改词表/规则/历史。需先按独立隐私流程解决，再执行 PR/CI/合并；按需本机试用、稳健标准误或 Worker，不部署。


## CausalLab 隐私阻塞修复与交付恢复（2026-10-18）

- **根因**：脱敏逐词归因确认，全部 12 项历史命中来自一个精确公共平台系统 noreply 标识被误列入仓库外私有词表；其优先级按规范阻断检查。不是 CausalLab 数据泄露、夹具设计缺陷或检查器缺陷。
- **实际修复**：按用户授权及现有 PRIVACY.md 流程，在仓库外建立 0700 目录/0600 备份并逐字节核验；仅移除这个精确公共条目，其他词条和字段保持一致。未提交词表/备份，未更改检查器、豁免、hooks、扫描范围或 Git 历史。
- **隐私复验**：修正后全历史 84 提交/384 唯一 blob/0 命中，原功能提交 4cfc707 整树 1 提交/229 blob/0 命中；28 项根隐私回归通过，新增配置纠正仍保留其他检测能力、提交范围仍扫描未修改文件的两项测试，原 26 项保留。
- **项目状态**：保留 CausalLab 全部实现及之前暂存的诊断记录。Linux 95 项单元、10 项生产浏览器与静态/构建/审计复验结果见最新 VALIDATION.md；PR/Windows/汇总 CI 运行后再记录真实状态及合并 SHA。


## CausalLab v0.1 交付验收（2026-10-18）

- **结果**：通过 [PR #12](https://github.com/ngwglai/GPT/pull/12) 合并至 main，功能合并 SHA `1c66bb64f9814abcfa13edbdf47cdf5c166b5c62`；保留正常历史，没有强推、改写或外部部署。
- **远程验收**：PR 最新功能头 `11b210d001f566096d35215e26d483990a3cfd04` 的 [CI 39116012295](https://github.com/ngwglai/GPT/actions/runs/39116012295) 全部 18 项作业成功，包含 CausalLab Linux/Windows、根隐私检查及 CI required。Windows 是 GitHub Actions 原生执行，不是本地测试或用户电脑人工验收。
- **本地验收**：恢复后重新安装并运行 95 项 Vitest、10 项生产 Chromium E2E、ESLint、TypeScript、生产构建、0 已知漏洞审计；根 28 项隐私回归通过。原提交、恢复提交、全部待推送范围及全历史检查通过；合并后再次核验隐私。完整记录见 [VALIDATION.md](projects/causallab/VALIDATION.md)。
- **隐私修复范围**：受限备份并核验后，仅纠正仓库外一个精确公共系统条目的误列；其余私有词条和检查规则不变。旧阻塞记录保留为历史快照，当前已解除。
- **后续 / 限制**：用户电脑人工试用、Firefox/WebKit 与真实手机未验证；12 节点/20000 行/64 KiB、仿射连续/二元、完全观测独立噪声及标准误假设不变。按需扩展稳健标准误或 Worker，不输出现实因果结论。功能合并后的 [main CI 39116453472](https://github.com/ngwglai/GPT/actions/runs/39116453472) 亦已 18 项全通过；本验收记录以独立文档 PR 入库，仍要求其最新完整 CI 通过后合并。


## ModelCheckLab v0.1（2026-10-19）

- **目的 / 用户**：面向学习者与开发者，穷举有限状态系统，用真实可达状态及最短轨迹验证指定安全性质。
- **差异 / 范围**：独立模型检验教学工具，不重复已有因果、博弈、压缩、物理或 CSP 项目。安全 JSON AST、有限整数/布尔/枚举、多初态、原子动作、BFS 去重、不变量、终止/死锁区分、独立目标三态、Worker 预算/取消、中文编辑器、反例回放/变化高亮、有界状态图和 JSON 导出。
- **案例**：互斥、双锁、银行守恒、生产者消费者，各有正确/错误版，均为普通模型数据，无结果硬编码。
- **目录 / 分支**：[projects/modelchecklab](projects/modelchecklab/)；从最新 main `9089c8b` 建立 `feature/modelchecklab`；[PR #14](https://github.com/ngwglai/GPT/pull/14)，不修改其他项目业务代码。
- **验收标准**：独立100种子参考枚举比较状态集合、错误与最短轨迹；单元、静态、生产浏览器、隐私和最新 Linux/Windows CI、CI required 全通过后按规范直接合并。
- **实际验证 / 状态**：本地167单元、100种子独立差分、15生产E2E、类型/lint/构建、0漏洞审计与根28隐私回归通过。PR #14 最终头 d19f8f0 的Linux/Windows及CI required全通过；当前为Completed。详细测试与环境见 [VALIDATION.md](projects/modelchecklab/VALIDATION.md)。
- **环境 / 隐私**：初次命令未启动，等待环境恢复后验证 Shell、文件系统与工具，未为环境故障修改代码。Git 身份经邮箱接口核验；既有12项历史命中脱敏归因于一个精确公共系统条目，按本次用户授权在仓库外受限备份并核验，仅纠正该项，其他词条、规则、hooks 和历史不变；全历史88提交/391唯一blob/0命中。
- **边界 / 后续**：50,000状态/200,000转移/15秒/12变量/64 KiB；图500节点、2,000边；不支持时序逻辑、公平性或活性，无任意代码执行。结论仅适用给定有限模型与性质，不证明实际程序绝对正确；按需本机试用，不部署。


## ModelCheckLab v0.1 交付验收（2026-10-19）

- **合并**：[PR #14](https://github.com/ngwglai/GPT/pull/14)，合并SHA `135565574b9e2456661e9151954e4329318b751e`；功能头 `d19f8f09ade9caf1ebebf0a8ea57285ebd4c30b6`。
- **远程证据**：[CI 39183207787](https://github.com/ngwglai/GPT/actions/runs/39183207787) 20/20作业成功，含ModelCheckLab原生Linux/Windows的167单元、15生产Chromium E2E及全仓库CI required。旧头的取消运行不代替最终验收。
- **正确性与审查**：100固定种子参考图DFS/边松弛，不复用内核，比较状态集、目标、错误及真实最短路径；真实默认状态/转移预算返回inconclusive。只将已定义语义错误归类反例，内部异常返回未确定；预算变化与超限导入清除旧证据。审查中误指非PR提交的身份问题经实际提交扫描排除，未改写历史。
- **合并后复核**：main干净并同步origin/main；合并范围4提交/269唯一blob/0隐私命中，全历史92提交/433唯一blob/0命中。项目状态Completed，未部署。验收记录作为独立文档PR入库，仍需最新完整CI通过后合并。
- **运行 / 边界**：Windows/Linux进入 `projects/modelchecklab` 后 `npm ci`、`npm run dev`，按终端URL访问。用户电脑人工验收、Firefox/WebKit和真实手机未验证；无时序逻辑、公平性或活性证明。详见独立README与VALIDATION。


## SynthLab v0.1（2026-10-19）

- **目的 / 用户**：面向程序合成学习者与开发者，从输入输出样例真实搜索小型程序，并用有限域反例修正过拟合候选。
- **差异 / 范围**：独立于 CSP、因果和状态图验证；纯 TypeScript 类型安全整数/布尔 AST、按节点分层枚举、精确含错误值的观察等价剪枝、每轮重建 CEGIS、独立安全规格、Worker 预算/取消/故障、中文响应式深浅主题、真实统计/轨迹、JSON 导入导出。
- **案例**：Max2、Abs、Clamp [-2,2]、Sign 均用通用合成器；常量与 6/8/11 节点预算下可合成，无答案硬编码。
- **目录 / 分支**：[projects/synthlab](projects/synthlab/)；从最新 main 2fa563e 建立 feature/synthlab；交付入口 [PR #16](https://github.com/ngwglai/GPT/pull/16)；不改其他项目业务代码。
- **验收标准**：独立小语法完整穷举及最小成本对照、50固定种子规格、溢出屏蔽剪枝、真实反例及每轮重搜、四案例、生产浏览器、静态/构建/审计/隐私、最新原生 Linux/Windows CI 与 CI required 均通过后直接合并。
- **当前验证 / 状态**：Completed（功能验收完成，合并状态以PR为准）；本地105单元、13生产E2E、类型/lint/build、0漏洞审计与根28隐私回归通过；功能头93d9b3e的 [CI 39190553784](https://github.com/ngwglai/GPT/actions/runs/39190553784) 22/22作业全部成功，含原生Linux/Windows和CI required。本记录提交仍需最新完整CI通过后按授权合并。详情见 [VALIDATION.md](projects/synthlab/VALIDATION.md)。
- **隐私**：按本次用户授权，在仓库外受限备份并核验后仅修正一个精确公共系统标识的词表误列，另外三项、规则、hooks和Git历史保持不变；基线94提交/435唯一blob/0命中。
- **限制 / 后续**：最多2变量、15搜索节点、4096域输入、500万候选、30秒；结论只对指定有限域成立，不是无限域证明。Windows用户电脑人工试用、Firefox/WebKit未验证；按需扩展纯DSL及独立验证，不部署。


## AdversaryLab v0.1（2026-10-19）

- **目的 / 用户**：面向算法学习者与实验者，寻找使具体算法真实操作成本增加的困难输入，比较同一空间与评价预算下三种搜索策略。
- **差异 / 范围**：独立于 SynthLab 的程序合成、ModelCheckLab 的有限状态性质验证与 MatchupLab 的决策博弈；不是随机数据生成器或任意代码执行平台。三排序、BFS/DFS/Dijkstra、三搜索策略、独立排序小规模精确枚举、种子复现、真实计数、Worker暂停/恢复/取消/超时、中文响应式明暗主题、数组/图/曲线、多种子与JSON/CSV导出。
- **目录 / 分支**：[projects/adversarylab](projects/adversarylab/)；从最新 main a205347 建立 feature/adversarylab，未修改其他项目业务代码或依赖；[PR #17](https://github.com/ngwglai/GPT/pull/17)。
- **验收标准**：独立算法参考与穷举最优对照、合法固定输入、统一预算、确定随机序列、真实终止及生产浏览器交互/导出；类型/lint/build/审计/隐私及最新PR原生Linux/Windows CI、CI required均通过后直接合并。
- **当前实际验证 / 状态**：Completed（功能验收完成，合并状态以PR为准）；本地125单元、17生产Chromium E2E、类型/lint/构建、0漏洞审计与根28隐私回归通过；含独立CSV回读；功能头8e38fca的 [CI 39211870981](https://github.com/ngwglai/GPT/actions/runs/39211870981) 24/24作业成功，含原生Linux/Windows与CI required。最大数组窄屏首尾滚动及精确阶段开始前中断的审查修复已完成，本修复提交仍需最新完整CI通过后按授权合并。详见 [VALIDATION.md](projects/adversarylab/VALIDATION.md)。
- **隐私**：初始99提交/473blob有12项命中，脱敏定位为一个公共系统条目误列；本次用户明确授权后，在仓库外受限备份并逐字节核验，仅纠正该项，其他词条/规则/hooks/历史保留；全历史复验0命中。
- **资源 / 限制 / 后续**：排序长度≤64，图≤20节点/100固定边/权重0–20；每策略每种子≤20000评价、≤8种子、批次活动墙钟≤30秒；精确仅互异排列n≤8，最多40320次真实执行。部分运行不进入完整预算均值统计；无图全局证明。Windows本地人工试用、Firefox/WebKit、真实手机与浏览器峰值内存未验证。后续按需扩展图小空间精确验证与结果导入，不部署。


## 工程基础设施与隐私初始化（2026-10-19）

- **范围**：仅根目录工程脚本、测试、CI 与规范文档；不修改项目业务代码。
- **根因**：当前私有源仍是旧版本，精确公共系统标识误列导致重复命中；之前的手工纠正没有随 Git 或初始化逻辑持久化。未知词条保留，未绕过检查或改写历史。
- **修复**：初始化验证私有来源、受限字节备份、幂等精确迁移；新 checkout 可从私有环境路径恢复，来源缺失停止。全历史包含 detached HEAD、标签递归及非提交目标；pre-push 仅扫描实际推送标签，未知远程基线/URL 保守扫描；拒绝浅历史、忽略 replace 替身，检查三种 hooks 与实际身份覆盖。
- **验证**：本地 Python 3.11 / 3.12 各 53 项根回归、ruff F 检查及实际私有配置迁移通过；105 提交 / 523 唯一 blob 的基线扫描无命中。GitHub Actions 扩展隐私矩阵到 Linux/Windows × Python 3.11/3.12，最终结果以本维护 PR 的最新提交和 `CI required` 为准。
- **维护边界**：平台环境模板/私有存储需由环境配置提供，仓库不上传词表或修改平台模板；CI 仅公开规则，不能代替本地带私人词表检查。其他历史治理和分支保护限制仍见工程文档。


## DeltaLab v0.1（2026-10-20）

- **目的 / 用户**：面向增量计算学习者与实验者，比较同一 DAG 更新批次中完整重算、脏后代传播和实际输出变化传播的真实运算次数。
- **差异 / MVP**：独立于已有程序合成、模型检验和对抗搜索；纯 TypeScript 离线计算核心、六种有限数值运算、拓扑与环校验、事务批量更新、共享后代去重、完整结构重建缓存、独立参考逐节点/缓存验证、四种子预设、中文 DOM/SVG 编辑与真实 trace 回放、明暗/窄屏、安全 JSON 导入导出。
- **目录 / 分支**：[projects/deltalab](projects/deltalab/)；基于最新 main c7e9e75 创建 feature/deltalab，不修改其他项目业务代码。不部署。
- **验收标准**：150种子×20批次全节点差分、1000节点长链/宽分支/共享与随机图运算计数、生产浏览器和静态/构建/审计/隐私通过；最新PR原生Linux/Windows与CI required成功后直接合并。
- **实际验证 / 状态**：本地最终224项单元、18项生产Chromium E2E、根53隐私回归、类型/lint/build和审计0漏洞通过；含150种子×20批差分及1000节点计数。窄屏测试滚动已修正，最终完整重跑通过；最终证据见 [VALIDATION.md](projects/deltalab/VALIDATION.md)。Completed（功能验收完成，合并元数据以PR为准）；[PR #19](https://github.com/ngwglai/GPT/pull/19) 修复功能头 fb0b540 的 [CI 39355256554](https://github.com/ngwglai/GPT/actions/runs/39355256554) 已29/29作业成功，含原生Linux/Windows与CI required；初始功能头CI也全部通过。三处交互/参数审查问题已修复并增加回归，身份意见误引非PR对象已核实排除；本记录提交同样要求最新完整CI通过后才合并。
- **环境 / 隐私**：启动期间命令无法启动，等待恢复后完成工具/文件系统/远程验证；未为环境问题改代码。按现有初始化脚本验证私有源并迁移精确公共系统误列，匿名身份接口核验通过；基线107提交/534blob/0命中。
- **边界 / 后续**：最多1000节点、512KiB JSON、同步主线程、精确双精度比较、结构变更全重建；统一单位运算成本不代表耗时节省。无任意脚本、后端、动态依赖或循环。按需增加Worker、图缩放与批次历史；用户电脑人工验收和Firefox/WebKit未验证。


## AgentTrustLab v0.1（2026-10-20）

- **目的 / 用户**：面向学习者、开发者与安全研究者，通过确定性模拟比较提示注入、工具越权、最小权限及高风险确认的实际效果。
- **差异 / MVP**：独立于现有算法搜索、模型检验与因果实验；18场景（12恶意/6正常）、四策略、独立授权引擎与一次性凭证模拟器、中文DOM/SVG权限配置、同输入批量比较、逐项轨迹、快照重放及安全JSON配置导入与JSON/CSV导出。无真实LLM、MCP、网络或私人文件操作，不部署。
- **目录 / 分支**：[projects/agenttrustlab](projects/agenttrustlab/)；从最新origin/main bc1034f创建feature/agenttrustlab。复用既有TypeScript/Vite/Vitest/Playwright设施，只增加本项目及必要CI接入。
- **验收标准**：独立授权矩阵/指标真值、零样本/确认/绕过/参数/导入安全与CSV回读、生产浏览器交互、类型/lint/build/审计/隐私及最新PR原生Linux/Windows与CI required全通过后直接合并。
- **当前验证 / 状态**：Completed；[PR #20](https://github.com/ngwglai/GPT/pull/20)已合并，功能合并提交1b8fadf。最终161单元、13生产Chromium E2E、类型/lint/构建及0漏洞审计通过，根53隐私回归通过；最新功能头0f5f935的[CI 39382205636](https://github.com/ngwglai/GPT/actions/runs/39382205636)与合并后main的[CI 39383025794](https://github.com/ngwglai/GPT/actions/runs/39383025794)均31/31成功，含原生Linux/Windows与CI required。重放后编辑的引用隔离和双重重放回归已纳入最终验证。真实证据见[VALIDATION.md](projects/agenttrustlab/VALIDATION.md)。
- **环境 / 隐私**：环境就绪后最小命令与读写通过；匿名身份及私有来源/hooks初始化成功，基线53根回归与111提交/568blob/0命中。离线缓存与浏览器安装未完成的启动失败均单独记录，未作为测试通过。
- **限制 / 后续**：128KiB配置、最多18场景×4策略、单次预定义调用、有限枚举与主线程；结果仅适用实现的场景与策略，不代表真实LLM普遍安全率。按需增加多步模拟与参数级权限；用户电脑人工验收及Firefox/WebKit未验证。


## AgentTrustLab v0.1 交付验收（2026-10-20）

- **合并**：[PR #20](https://github.com/ngwglai/GPT/pull/20)状态MERGED，功能合并SHA `1b8fadf844f7d7ecf90d667d09a6b623e77c4285`，最终功能头 `0f5f93567305f97c159202c0292e0124995de941`。
- **实际远程验证**：[功能头CI](https://github.com/ngwglai/GPT/actions/runs/39382205636)及[合并后main CI](https://github.com/ngwglai/GPT/actions/runs/39383025794)均31/31作业成功，包含本项目原生Linux/Windows及CI required；旧功能头的取消运行不代替最终验收。Windows由Actions执行，不是本地或用户电脑人工测试。
- **隐私与工作区**：匿名身份、词表和hooks初始化成功；每次提交前主动检查暂存区/说明，提交后及推送前检查实际提交身份、尾注与文件。功能合并范围3提交/363唯一blob/0命中，全历史114提交/597唯一blob/0命中。main已同步且干净；不强推、不改写历史、不部署。本验收记录作为独立文档PR入库，仍要求其最新完整CI通过后合并。
- **本地与边界**：Linux 161单元、13生产E2E、53根隐私回归，类型/lint/build、开发浏览器冒烟及0漏洞审计通过；初期缓存、浏览器启动、筛选标签及测试示例域的实际失败和修复见[VALIDATION.md](projects/agenttrustlab/VALIDATION.md)。保持确定性模拟、18×4请求和128KiB配置边界；不代表真实LLM普遍安全率。按需本机试用，Firefox/WebKit与真实手机未验证。


## CalibrationLab v0.1（2026-10-20）

- **目的 / 用户**：面向概率预测学习者与开发者，比较真实生成概率、预测概率与观测频率，理解校准、区分能力和总体评分的差别。
- **差异 / 范围**：独立于 CausalLab 因果识别与 MatchupLab 决策实验；React/TypeScript/Vite 本地应用，四种数学定义的 IID 生成机制、可注入 PRNG、独立校准/测试划分、Platt 与 PAVA 保序回归、评分与 Wilson 可靠性图、中文响应式控制、同测试样本比较和 CSV/JSON 导出。无后端或付费 API，不部署。
- **目录 / 分支**：[projects/calibrationlab](projects/calibrationlab/)；从最新 origin/main 25f3120 创建 feature/calibrationlab；开发前无未合并 PR 或重复项目。不修改其他项目业务代码或依赖。
- **验收标准**：独立手算评分、固定种子统计性质、PAVA 穷举参考、训练测试隔离、校准可变差、真实生产浏览器操作与下载；类型/lint/build/审计/隐私及最新 PR Linux/Windows、CI required 全通过后直接合并。
- **当前状态 / 实际验证**：Completed（功能验收完成，合并元数据以 [PR #22](https://github.com/ngwglai/GPT/pull/22) 为准）；数值与分箱边界审查修复后最终 121 项核心单元与数学性质测试、13 项生产 Chromium E2E、类型/ESLint/构建、依赖审计 0 漏洞已通过；功能头 ac9af63 的 [CI 39403983403](https://github.com/ngwglai/GPT/actions/runs/39403983403) 已 33/33 成功，含原生 Linux/Windows、四组隐私与 CI required。种子32浮点线搜索停滞已真实复现并修复，保留严格梯度阈值；增加300固定种子与生产回归。22箱精确边界问题也已修复，测试覆盖2–30箱所有边界及相邻浮点数。本最终修复提交仍须最新完整 CI 通过后才合并，不以旧头替代。最终命令、失败与修复见 [VALIDATION.md](projects/calibrationlab/VALIDATION.md)。
- **环境 / 隐私**：首次命令因环境未就绪无法启动，待环境 ready 后最小执行及工具版本通过；私有词表、匿名身份与 hooks 初始化成功；基线 53 根隐私回归与 116 提交/599 唯一 blob 扫描 0 命中。提交前暂存区/说明、实际提交及推送前私有检查通过；功能提交范围 1 提交/377 唯一 blob/0 命中，全历史复验 117 提交/620 blob/0 命中；未绕过检查。
- **边界 / 后续**：20,000 样本/30 箱、主线程；常量分数或不足样本明确拒绝拟合，Platt 采用明确的平滑目标与微小 L2 版本；Wilson 为逐箱区间，ECE 依赖分箱。合成结果不代表真实模型，校准不保证改进。ESLint 9 结束支持，后续独立维护升级；Firefox/WebKit、真实手机与用户电脑人工测试未执行。


## CompilerLab v0.1（2026-10-21）

- **目的 / 用户**：面向编译原理学习者与开发者，用真实流水线理解源码、类型、优化与栈式执行。
- **差异 / MVP**：独立于 SynthLab 的程序搜索和 ModelCheckLab 的有限状态验证；先写语言规范，纯 TypeScript int/bool DSL，Lexer/Parser/AST/语义分析、独立按名 AST 解释器、安全局部优化、字节码与按槽位 VM、可复现轨迹、中文 React 阶段/优化对照和单步/继续/重置/错误定位。完全本地，无宿主代码执行或外部服务。
- **目录 / 分支**：[projects/compilerlab](projects/compilerlab/)；从最新 origin/main 036ae0c 创建 feature/compilerlab；开始时无未合并 PR 或重复项目。不修改其他项目业务代码，仅接入必要独立 CI 与项目索引。
- **验收标准**：模块单元、手算语义与小整数独立 oracle、160 固定种子原/优化 AST 与原/优化 VM 差分（输出、错误/位置、顶层状态）、真实 trace、生产 Chromium E2E；typecheck/lint/build/完整审计/隐私及最新 PR 原生 Linux/Windows、根 CI required 全通过后按授权合并。
- **实际验证 / 状态**：Completed（修复功能验收完成，合并元数据以[PR #23](https://github.com/ngwglai/GPT/pull/23)为准）；最终本地253单元（含1156小整数独立oracle组合与160固定种子）/14生产E2E、静态/构建/0漏洞完整审计通过；最新代码和跨平台证据见 [VALIDATION.md](projects/compilerlab/VALIDATION.md)，初始功能头a970ac3的[CI 39523075196](https://github.com/ngwglai/GPT/actions/runs/39523075196)已35/35成功，含原生Linux/Windows及CI required。补充头c0e9e59的CI也35/35成功；随后审查提出低层VM逻辑右值校验与未完成历史回放继续按钮两个边界，均已修复并增加回归，修复头8afffd5的[CI 39524971287](https://github.com/ngwglai/GPT/actions/runs/39524971287)已35/35全部通过，含原生Linux/Windows及CI required，两条讨论已解决，恢复Completed。本次仅补充验收记录，仍要求该记录提交的最新完整CI成功后才合并。
- **环境 / 隐私**：环境 ready 后最小 shell、Git/工具/实际 Chromium 启动成功；私有来源/匿名身份/hooks 初始化成功，基线53根回归及121提交/633blob/0命中。首次脚手架相对路径、类型推断、位置断言的实际失败与修正已记录；不回显私人值，不绕过检查。
- **限制 / 后续**：8192字符/2048Token/512AST节点/32深度/128声明/2048指令/4096步骤/256输出；对称整数范围±2147483647，溢出/除零报错，除法向零截断。预算终止单独报告；同步主线程，无循环/函数/文件/网络。用户电脑人工试用、Firefox/WebKit和真实手机未验证；按需扩展控制流图或源码断点，不部署。

## 共享 CI 依赖审计修复（2026-10-28）

- **触发**：RogueLab PR 的原有仓库安全门禁发现新增依赖通告；与游戏实现无关。单独维护分支修复，不关闭审计或跳过现有项目测试。
- **变更**：共享 Python CI 与 ConstraintLab Windows 安装器将 setuptools 84.0.0 更新至 84.1.0；QQ Mail MCP 更新 postal-mime、Wrangler、匹配的 Miniflare / Workers 类型，并刷新受影响的 body-parser、fast-uri、undici 锁定版本。业务源码与部署配置不变。
- **本地验证**：QQ Mail MCP npm audit 0 漏洞、类型检查、62 项测试、dry-run 构建及隐私基线通过；没有部署邮件服务。跨项目 Linux / Windows 完整验收仍由现有 CI 执行。
