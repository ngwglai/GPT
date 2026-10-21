# CompilerLab v0.1 验证记录

日期：2026-10-21（Asia/Shanghai）。本记录仅列实际执行结果；远程与本地分别报告。

## 环境与开发前检查

本地 Linux 6.18.55 x86_64 / Debian 13，系统 Chromium 154.0.8037.57；Node/Python 版本见下表。环境 ready 后在仓库根目录执行；基础 shell 能启动，未将终端故障当成代码失败。阅读根 AGENTS.md、README.md、PROJECTS.md、docs/PRIVACY.md、docs/ENGINEERING.md 及工程复核记录后实现。相关目录没有额外 AGENTS.md。

| 实际命令 / 检查                                                                       | 退出 / 结果                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pwd`、`ls -la /workspace`                                                            | 0；shell/目录可用，目标 checkout 已存在                                                                                             |
| `git rev-parse --show-toplevel`、`git status --short --branch`                        | 0；正确仓库，原 work 分支干净                                                                                                       |
| `git fetch origin --prune`、`git log -1 origin/main`、`git ls-remote --heads origin`  | 0；最新 main 为 036ae0c，无 compilerlab 分支或目录                                                                                  |
| `gh pr list --state open --json number,title,headRefName`                             | 0；空列表，无未合并 PR                                                                                                              |
| `gh run list --branch main --limit 3 --json databaseId,headSha,status,conclusion,url` | 0；最新 main CI [39407887446](https://github.com/ngwglai/GPT/actions/runs/39407887446) success                                      |
| `git switch -c feature/compilerlab origin/main`                                       | 0；基于最新 main，保留其他项目与已有分支                                                                                            |
| `node --version`、`npm --version`、`python --version`、`gh --version`                 | 0；Node 24.19.0、npm 11.9.0、Python 3.12.14、gh 2.46.0                                                                              |
| `command -v chromium`                                                                 | 0；系统 Chromium 可用                                                                                                               |
| `python scripts/configure_git_identity.py --install-hooks`                            | 0；经账号邮箱接口验证匿名身份；验证已有受限私有来源，备份核验并迁移已审定的精确公共误列项；未知词条保留，hooks 启用，无全局身份改动 |
| `python -m unittest discover -s tests -q`                                             | 0；53/53 根隐私与真实 hooks 回归通过                                                                                                |
| `python scripts/privacy_check.py --all-history --json`                                | 0；私有词表已加载；基线 121 提交 / 633 唯一 blob / 0 命中                                                                           |
| `npm install`（项目目录）                                                             | 0；150 包，锁文件已生成；仅 ESLint 9 上游支持结束警告                                                                               |
| `npm audit --audit-level=moderate`                                                    | 0；含开发依赖，0 已知漏洞                                                                                                           |

托管环境状态 connected/running；网络策略文件为 unrestricted、无 VPN，状态接口的 policy state 为 unknown，未据此宣称策略已 enforced。依赖下载及实际 GitHub 调用成功才作为服务可达证据；未打印凭据或私人词表内容。

浏览器运行时独立诊断实际执行如下（退出 0，输出 runtime-ready）：

```sh
node --input-type=module -e 'import {chromium} from "@playwright/test"; const b=await chromium.launch({executablePath:"/usr/bin/chromium"}); const p=await b.newPage(); await p.setContent("<title>runtime-ready</title>"); console.log(await p.title()); await b.close();'
```

## 实际失败、分类与诊断

没有通过修改业务语义、降低断言、忽略审计或关闭 hooks 掩盖环境问题。

| 实际命令                                                       | 退出状态与错误类别                               | 诊断 / 修复                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 首次复制脚手架的 Python 命令（下方原命令），工作目录为项目目录 | Python 子命令 1，FileNotFoundError；命令路径错误 | 独立 pwd/目录检查已成功。脚本错误使用相对仓库根路径；改在仓库根执行成功。该批次随后 `npm install --ignore-scripts` 返回 0，不能用其整体退出状态声称 Python 成功或依赖已安装；正式 `npm install` 单独成功 |
| `npm run typecheck && npm run lint`                            | 1；ESLint no-irregular-whitespace                | JSX 中文文本含全角空格；移除，保留规则                                                                                                                                                                   |
| `npm run typecheck && npm run lint`（新增预算测试后）          | 2；TypeScript TS6133 / TS2345，代码类型错误      | 移除未使用导入；默认预算推断为字面量，显式改为 number，保留运行时预算校验                                                                                                                                |
| `npm test`（首轮 242 项）                                      | 1；240 通过 / 2 断言失败                         | 手工计数的 UTF-16 偏移和错误列期望不正确；逐字符核实为 9 和 65，修正测试；不是词法器或错误定位实现故障                                                                                                   |

首次路径错误的实际脚本：

```sh
python - <<'PY'
from pathlib import Path
import json
p=Path('projects/compilerlab')
for name in ['tsconfig.json','vite.config.ts','eslint.config.js','playwright.config.ts','index.html']:
 s=(Path('projects/calibrationlab')/name).read_text()
 (p/name).write_text(s.replace('CalibrationLab · 概率预测校准实验室','CompilerLab · 微型编译器实验室').replace('4190','4191'))
s=json.loads(Path('projects/calibrationlab/package.json').read_text());s['name']='compilerlab';(p/'package.json').write_text(json.dumps(s,indent=2)+'\n')
PY
npm install --ignore-scripts
```

浏览器测试复查还发现宽松的 AST 按钮匹配可能落入 AST 优化页。收紧阶段选择器并断言抽象语法树标题，重新执行13项生产 E2E、lint和typecheck均退出0；这一修正随验收记录提交，仍须最新完整远程CI通过。

代码复查另修正两个边界：独立解释器的一元负号通过整数运算规范化零，避免 -0 状态；编译失败传入 undefined 时不再触发 reset 默认参数回退旧 VM。后者有生产 E2E 回归，验证先执行成功程序、再加载错误程序时，单步/继续均禁用且输出清空。

## 本地验收

初轮完整执行 `npm run typecheck && npm run lint && npm test && npm run build` 退出 0：242/242 单元、静态检查和生产构建通过；首轮 `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` 退出 0，13/13 真实生产 Chromium E2E 通过（无重试/跳过）。随后补充小整数独立 oracle、生成语料覆盖和错误编译状态清理回归。最终在当前源码完整执行以下串行验收命令，退出 0：247/247 单元、13/13 真实生产 E2E（无重试/跳过）、lint/typecheck/build 和 0 漏洞完整审计通过。

```sh
npm ci
npm audit --audit-level=moderate
npm run lint
npm run typecheck
npm test
npm run build
CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e
```

实际 `npm run dev -- --port 5191 --strictPort` 启动成功；独立 Chromium 打开开发页并执行，输出21/true，无pageerror。开发和预览服务检查后均用Ctrl+C正常停止（进程退出130为主动结束）。

生产构建为42模块，JS约216kB；仅作为体积记录，未声称性能验收。已查看1440px页面截图，并在375px真实浏览器测试文档宽度无溢出；截图未提交。使用固定版本Prettier格式化源代码，不新增生产依赖。

独立正确性依据：手算输出/作用域/错误前状态；解释器不导入 VM、字节码执行或 VM 运算函数；160 固定种子四路径比较（原/优化 AST 与原/优化 VM）；小整数算术用与两条 BigInt 路径不同的精确 Number/Math.trunc oracle。随机失败含种子及源码。默认预算以内比较语言错误和顶层状态；预算耗尽单独报告，绝不冒充等价。

## 远程验收与合并门槛

项目独立 `.github/workflows/compilerlab.yml`：原生 Ubuntu/Windows、Node 22，npm ci、完整审计、lint/typecheck、Vitest、生产构建与 Chromium E2E；根 CI 调用并纳入 CI required。复用仓库固定 Actions SHA，没有部署步骤。

[PR #23](https://github.com/ngwglai/GPT/pull/23) 已创建，初始功能头 `a970ac33524e84bdfd6c1decb1d5b67add069892` 的 [CI 39523075196](https://github.com/ngwglai/GPT/actions/runs/39523075196) 已35/35作业全部成功，包含本项目原生Linux/Windows、四组隐私检查和CI required。功能验收完成，项目更新为Completed。此次追加仅为文档证据与E2E精确阶段选择器，不改功能源码；此补充提交仍须最新完整CI通过后才合并。必须在最新功能头的 CompilerLab Linux/Windows、全部根检查及 CI required 成功后按授权合并；随后核对 PR、main 提交、隐私及 main CI，并在最终交付报告中给出实际链接。此处为验收记录提交时快照，合并后结果不冒充已在提交前执行。最新提交检查可从[PR检查页](https://github.com/ngwglai/GPT/pull/23/checks)核对；合并元数据以PR为准。

## 已知边界 / 未验证

本地为 Linux，Windows 自动化只能由 Actions 结果确认，不等于用户电脑人工操作。Firefox/WebKit、真实手机、人工双击/浏览器检查、性能峰值、离线首次加载未验证。同步主线程且程序有限，无循环/函数/文件/网络。ESLint 9 支持结束但完整漏洞审计当前为 0。隐私扫描不证明未知姓名或编码数据中无秘密，CI 公开规则不代替本地私有词表检查。未部署、未强推、未改写共享历史。

## 本地提交与隐私证据

初始提交前主动检查暂存区与拟提交说明；提交后检查HEAD^..HEAD，推送前检查origin/main..HEAD，hooks同步执行，均退出0。实际功能提交范围1提交/403唯一blob/0命中；后续全历史122提交/662唯一blob/0命中，private_denylist_loaded为true。匿名作者/提交者由检查器核验，不公开私人值或来源路径。词表及备份未提交，没有跳过hooks或改写历史。

## 自动审查修复（最终功能头待远程验收）

补充头c0e9e59的[CI 39523871108](https://github.com/ngwglai/GPT/actions/runs/39523871108)也已35/35成功，随后自动审查指出两个P2边界，故暂缓合并并将状态恢复Testing：

- [VM右操作数校验](https://github.com/ngwglai/GPT/pull/23#discussion_r4331937477)：给出的低层字节码`PUSH true; AND 3; PUSH 1; PRINT; HALT`缺少右值类型检查。新增运行时逻辑续接边界栈，在下一指令消费右值之前检查单一bool；覆盖AND/OR非短路非法值、跳过非法右值、共享嵌套边界和跳过边界。错误事务不提交栈/PC/输出变动。
- [未完成历史回放的继续按钮](https://github.com/ngwglai/GPT/pull/23#discussion_r4331937480)：历史PC与真实机器最新状态不一致时，同时禁用单步与继续，显示回放提示。新增生产E2E先单步3次、回放第1步、确认禁用，再选最后一步继续并核对完整输出。

当前修复源码实际执行`npm run lint && npm run typecheck && npm test && npm run build && CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e && npm audit --audit-level=moderate`，退出0：**253/253核心单元、14/14真实生产Chromium E2E**，类型/lint/build通过、完整审计0漏洞，无重试/跳过。原160固定种子及1156小整数独立oracle仍全通过。此修复头仍需最新Linux/Windows与根CI required全部成功，旧头成功不替代修复验收。
