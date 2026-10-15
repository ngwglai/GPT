# v0.1.0 测试与性能验证

日期：2026-10-15。前半部分保留初始版本的测量记录；最新修复与 Windows 原生自动验收见末尾章节。

## 执行环境与结果

Linux x86_64，Python 3.12.14，Node.js 24.19.0；系统 Chromium、Playwright 1.64.1，Vite 6.4.4。核心实现只用 Python 标准库；API 依赖版本见 pyproject.toml，前端有 package-lock.json。

| 验证 | 实际结果 |
| --- | --- |
| pytest backend/tests -q | 11 passed；1 条测试客户端 httpx 兼容弃用警告，不影响测试 |
| 随机差分 | 固定种子 2026，120 个小型随机 CSP；穷举与 BT/FC/MAC 的完整解集合及 SAT/UNSAT 一致 |
| 已知皇后计数 | N=1..8 三算法全部枚举通过：1、0、0、2、10、4、40、92 |
| 内置实例 | 4×4/9×9 数独、图/地图着色、排课返回 SAT，解独立验证；三角图两色 UNSAT |
| 边界与恢复 | 空模型、空域、无约束、矛盾、空 OR、多解、传播空域、父域与输入未修改 |
| 启发式复现 | 四种变量 × 三种取值策略，重复求解的解及轨迹一致 |
| 资源限制 | 零超时、零节点、真实异步任务取消、轨迹截断；未把限额终止标为 UNSAT |
| API | 验证、任务生命周期、JSON/CSV、非法 JSON/图输入、Host/Origin、请求大小上限 |
| 前端 TypeScript / Vite | 构建成功，28 模块，主 JS 约 203 kB / gzip 65 kB |
| Chromium E2E | 3 passed：创建→求解→验证→回放→实验→导出；错误导入/有效导入/数独编辑；超时 UNKNOWN/轨迹截断提示 |
| 视觉检查 | 1440px 桌面完整页面截图人工检查；390px 窄屏截图亦检查通过 |
| Python wheel | 构建成功；仅包含 constraintlab 核心/API 包，不包含测试或前端构建产物 |
| 静态检查 | ruff F 类检查通过；源码完成格式整理 |
| 依赖 | npm audit 零已知漏洞；pip-audit 零已知漏洞（本地 ConstraintLab 非公开包跳过），pip check 通过 |

初次前端构建曾因无用 CSS data 导入失败，删除后构建通过。一次过早启动的浏览器测试遇到未构建页面 404；构建并重启服务后完整复验通过。依赖审计发现旧 Vite/Playwright/Starlette/pytest/pip 漏洞后升级，表中记录的是修复后的结果。

## 性能实验

复现：安装本项目后，在项目根目录执行 `python docs/benchmark.py > benchmark.json`。相同 N 皇后实例，MRV、自然值顺序、首解、trace_limit=0、timeout=5 秒、节点上限 100,000；每配置重复 3 次，种子 42/43/44。下表是当前 Linux 单机平均核心耗时，全部 SAT / solution_limit，枚举未完成。节点三次相同。

| N | 算法 | 平均耗时 ms | 搜索节点 |
| --- | --- | ---: | ---: |
| 4 | BT | 0.399 | 26 |
| 4 | FC | 0.282 | 8 |
| 4 | MAC | 0.706 | 5 |
| 8 | BT | 61.683 | 876 |
| 8 | FC | 19.298 | 75 |
| 8 | MAC | 33.888 | 20 |
| 10 | BT | 47.143 | 975 |
| 10 | FC | 3.560 | 35 |
| 10 | MAC | 26.498 | 16 |

MAC 减少分支，但本实现的 AC-3 重新建队列和多次支持检查有额外代价；FC 在这些首解实例上更快。首解搜索难度不随 N 单调增加，不能以此推导最坏复杂度或跨硬件结论。附带的高难度 9×9 数独在默认 MAC/MRV、10 秒限制下返回 UNKNOWN / timeout（1,064 节点）；另用 Dom/Ddeg、关闭轨迹、30 秒限制补测，仍为 UNKNOWN / timeout（2,643 节点）。这是诚实的资源终止，不是无解。主要瓶颈是 Python 约束检查、分支域复制、MAC 重建弧队列；可进一步用可逆 trail 和支持缓存优化，但需保留差分测试。峰值内存未可靠测量，保持 null。

## 验收建议与未验证项

1. Windows 安装 Python/Node，运行 start-windows.cmd 并访问本机地址；原生启动、路径兼容及实际性能尚未验证。
2. 4 皇后将最大解数设为 100，确认两个解且枚举完成；3 皇后应 UNSAT；超时设 0 应 UNKNOWN。
3. 导入 examples/sum-composition.json 并验证；数独改网格后求解；图着色改颜色数观察 SAT/UNSAT。
4. 轨迹前后步、暂停、调速，检查域与决策路径；将轨迹限制设 2，确认截断提示。
5. 实验选择 BT/FC/MAC 与多个 N，导出 CSV/JSON，核对问题哈希、完整问题、种子与状态。

没有 Windows 原生测试、生产负载测试或可靠隔离峰值内存测量。浏览器轨迹为求解完成后的回放；不支持后端暂停/续算。没有宣称高元广义弧一致性或工业级求解性能。PR 不自动合并。

## 审查修复复验（2026-10-15）

本次修复分支在 Linux / Python 3.12.14 / Node 24.19.0 实际复验：15 项后端测试、TypeScript/Vite 构建、4 项 Chromium E2E、ruff F 类、Python wheel、pip check 全部通过；npm audit 为零已知漏洞。后端包含 120 个随机 CSP 差分、N=1..8 三算法计数、展开约束预算、准备阶段取消及多问题 JSON/CSV 去重与重放校验。

本次发现并修复：新增的准备阶段取消/超时检查可能在轨迹函数与初始域初始化前退出，引发 UnboundLocalError。将初始化提前，零超时恢复 UNKNOWN/timeout，准备阶段取消返回 UNKNOWN/cancelled 和最终轨迹。未删除或降低原有测试。

实验脚本重新执行：3 个问题、27 条记录全部 SAT；搜索节点与旧报告一致。耗时因机器与运行状态变化而变化，不用旧耗时作为新版本结果。

首次本地浏览器启动被执行沙箱的 socket 权限阻止；授予执行工具的网络权限后重跑全部 4 项通过。httpx 测试客户端仍有一条上游弃用警告，未屏蔽。

Windows 原生结果须以 CI 的 windows-latest 作业实际结果为准；配置完成不代表验收通过。该作业运行原生 Python 测试、构建，并在含空格及中文的临时路径执行 start-windows.cmd 和完整 E2E。

首次 CI 的 Linux 服务检查失败：CI 使用普通 wheel 安装，API 无法定位源码目录下的前端构建。按 README 与启动脚本改为 editable 安装后复验；wheel 仍单独构建检查。未绕过页面就绪检查。

## Windows 原生验收（PR #4，2026-10-15）

CI：[38710374741](https://github.com/ngwglai/GPT/actions/runs/38710374741)，全部任务成功。Windows Server 2025：Python 3.11 后端 15 项通过；原生 start-windows.cmd 在含空格及中文的临时路径重新安装、构建并启动服务，启动器实际选择 Python 3.14.7，4 项 Playwright Chromium E2E 通过。Linux 对应 15 项测试与 4 项 E2E、两平台 wheel、静态检查、前端构建与实验脚本均通过。

这是 Windows 原生 runner 上的自动验收，未执行用户电脑上的人工双击验收，不用 Linux 结果代替 Windows。PR #4 合并后，PR #2 整合 main 的完整 CI 仍须单独通过。

补充本地验收：九个示例分别执行并独立验证全部返回解；普通示例 SAT，高难数独在 2 秒预算下 UNKNOWN/timeout，符合已知资源限制。4 皇后 CLI 完整枚举得到 2 解；wheel 在独立虚拟环境无依赖离线安装后核心求解通过。
