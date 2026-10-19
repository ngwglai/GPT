# SynthLab v0.1 验证记录

## 环境与预检

2026-10-19：托管 Debian 13 Linux 执行环境启动后，实际运行 Shell、文件系统读取、Git 2.52.0、Node.js 24.19.0、npm 11.9.0、Python 3.12.14，命令均成功启动。通过 npm ping 验证网络与注册表，实际安装锁定依赖及 Chromium。没有把环境启动等待当作命令失败，未为此修改业务代码、CI、身份或 Git 历史。

读取最新根 AGENTS、README、PROJECTS、ENGINEERING、PRIVACY；工作树干净、无开放 PR/其他 worktree 冲突。从 origin/main `2fa563e` 建立 feature/synthlab。执行 configure_git_identity.py --install-hooks，通过账号邮箱接口核验 noreply、仅配置当前仓库并安装 hooks，未打印私人身份。

初次全历史扫描发现 12 项既有 private-identity 命中；只读逐词归因确认来自外部词表中一个精确公共 GitHub 系统标识。得到本次用户明确授权后，在仓库外建立受限备份并逐字节核验，仅移除此公共误列条目，另外三项词条及其他字段保持一致；未改检查器、豁免、hooks、Git 历史或其他项目。修正后全历史 94 提交 / 435 唯一 blob / 0 命中；根 28 项回归通过。私人词表及备份未进入仓库。

## 实际运行的本地检查

| 命令 | 结果 |
| --- | --- |
| npm ci | 重新执行锁文件安装成功 |
| npm run lint | ESLint 通过 |
| npm run typecheck | 严格 TypeScript 通过 |
| npm test | 105 项 Vitest 通过，无跳过 |
| npm run build | 生产构建通过，包含独立打包 Worker |
| npm run test:e2e | 13/13 通过（最终完整复跑 6.3 秒；首次标签定位问题修复后复验） |
| npm audit --audit-level=moderate | 包含开发依赖，0 已知漏洞 |
| python -m unittest discover -s tests -v（根） | 28 项隐私回归通过 |
| python scripts/privacy_check.py --all-history（根） | 94 提交 / 435 blob / 0 命中（开发基线） |

单元覆盖类型/元数/字段/尺寸校验、解释器、边界与溢出、严格布尔与惰性条件、确定性枚举、完整小语法对照、剪枝开关对照、50 固定种子规格、真实样例拟合、完整有限域计数与反例、CEGIS 重新枚举、五类预算、取消、内部异常、Worker 生命周期/故障、导入导出及四案例。独立参考解释器用 BigInt 加减和单独树表示；独立穷举器不调用内核生成器、值运算或目标规格。

已人工查看真实生产页面的桌面浅色与390px窄屏深色截图，无横向溢出；截图仅作本地检查，未提交。

13 项生产 Chromium E2E 包括四案例真实 Worker、编辑失效/重置、非法输入/规格冲突、无解与预算区分、立即取消、验证预算、下载与导入不信任结果、非法文件、真实 Worker 资源加载失败、自定义受限规格、390px 窄屏和主题。未伪造求解响应；Worker 故障项仅阻断真实脚本加载。

## 性能实测

`npm run benchmark` 使用同一真实引擎及默认配置，包含协作让出、各轮搜索与验证；Node 24 / Linux 单次实测，无性能阈值断言，不作为跨机器速度保证。

| 案例 | 候选尝试 | 观察剪枝 | 轮数 | 最终节点数 | 最后验证输入数 | 时间约 ms |
| --- | --- | --- | --- | --- | --- | --- |
| Max2 | 99 | 80 | 3 | 6 | 49 | 20 |
| Abs | 3014 | 2631 | 4 | 8 | 7 | 48 |
| Clamp | 1017 | 956 | 3 | 11 | 7 | 27 |
| Sign | 2016 | 1864 | 5 | 11 | 7 | 47 |

以上四项均 verified。最大值/绝对值/截断/符号的独立分段参考逐输入复核通过。Clamp 为 [-2,2]，避免整数 [-1,1] 截断与 Sign 相同；预算无需提高。默认案例没有交换运算符，结构剪枝可为 0，并非伪造统计。

## 远程 Linux / Windows CI

独立工作流 `.github/workflows/synthlab.yml` 已接入根 `CI required`，保留其他项目所有检查。矩阵使用原生 ubuntu-latest / windows-latest、Node 22，执行锁文件安装、完整依赖审计、lint、typecheck、Vitest、build、生产 Chromium E2E。不部署。

功能实现头 `93d9b3ee7cfb5c365ec7f31e64c7e651c0bbd2ba` 的 [CI 39190553784](https://github.com/ngwglai/GPT/actions/runs/39190553784) 已实际完成，**22/22 作业全部成功**，包括原生 SynthLab Linux/Windows、根隐私检查和 CI required。两个平台的 npm ci、完整审计、lint、typecheck、npm test、build 与生产 E2E 步骤均成功，运行的是本提交的105单元/13浏览器完整测试配置，无测试筛选或跳过。Actions作业与步骤状态已逐项核验；当前接口返回空日志内容，未伪造远程控制台日志或将空日志当作额外证据。

[PR #16](https://github.com/ngwglai/GPT/pull/16) 为交付入口，最终合并 SHA、最新记录提交的检查与合并状态以 PR 时间线及 Checks 为准。本验收记录只补充文档与索引，仍要求其最新完整 CI 全部成功后按任务授权合并；不使用旧头结果替代合并门槛。

首头 a6e1687（104单元）的旧运行因后续更新被替代，不作为最终验收。交付自检发现合法多轮历史可能超过原128 KiB导入限制，已调整到2 MiB并加入大记录往返测试；本地105单元和13生产E2E完整复跑通过后再验证上述功能头。

合并前全历史隐私复验：96提交 / 470唯一blob / 0命中；每次提交主动扫描暂存区、提交说明、实际新增提交和全部待推送范围，hooks额外执行。合并后的main仍需扫描实际合并范围与全历史；最终结果将在交付报告中确认。


## 未验证与限制

未在用户 Windows 电脑上人工运行；Windows 原生自动测试需以实际 Actions 记录为证。未测试 Firefox、WebKit、真实手机、精确峰值内存、无限域数学性质及高并发恶意输入。小语法穷举和 50 固定种子对照不等于对无限语法的形式化实现证明；观察剪枝的纯函数/错误合同关系及成本归纳见 README。资源终止保持未确定状态，不包装为无解或通过。
