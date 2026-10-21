# CompilerLab v0.1 · 微型编译器实验室

中文、完全本地的编译原理实验室。输入一个受限的 int/bool 程序，观察**真实**词法、语法、类型检查、优化和字节码结果，单步执行确定性栈式虚拟机。独立 AST 解释器与优化前/后的 VM 自动比较输出、语言错误类别和最终顶层变量状态。

面向学习者与开发者；不追求通用编译器，不执行 JavaScript，不使用 `eval`、`new Function`、后端、付费 API 或外部服务。生产页面 CSP 禁止网络连接和动态宿主代码。

## 本地运行

需要 Node.js **22.12+**、npm。Windows PowerShell、CMD 与 Linux/macOS 都可以运行：

```sh
cd projects/compilerlab
npm ci
npm run dev
```

浏览器打开终端显示的本地地址（默认 `http://127.0.0.1:5173`）。停止服务按 Ctrl+C。安装依赖需要联网，应用加载后计算完全离线；没有 Service Worker，不承诺离线首次打开或断网刷新。

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=moderate
```

E2E 自动启动 **dist 生产预览**（4191 端口须空闲），必须先 build。Linux 缺少系统库时使用 `npx playwright install --with-deps chromium`。也可用 `CHROMIUM_PATH` 指向已安装的 Chromium；PowerShell 设置方式为 `$env:CHROMIUM_PATH='C:\path\to\chrome.exe'`，CMD 为 `set CHROMIUM_PATH=C:\path\to\chrome.exe`。应用本身不需要浏览器自动化运行时。

## 语言

精确定义见先于实现编写的 [LANGUAGE.md](LANGUAGE.md)。主要语法：

```text
let name: int = expression;
let enabled: bool = expression;
name = expression;
if (boolExpression) { statements } else { statements }
print(expression);
```

- int 范围为 **-2147483647 到 2147483647**（有意选择对称边界），bool 为 true/false。每个整数结果用精确运算检查范围；溢出和除零报错；除法向零截断。正字面量超界在编译阶段拒绝。
- 从低到高：`||` → `&&` → `== !=` → `< <= > >=` → `+ -` → `* /` → 一元 `- !` → 括号/字面量/变量。二元左结合、一元右结合。二元先左后右；布尔运算短路。
- 声明必须有显式类型和初值；算术/有序比较仅 int，逻辑仅 bool，相等比较必须同型。赋值/初值必须匹配类型；if 条件必须 bool。所有分支均检查，无隐式转换。
- 顶层与每个 if 分支分别为作用域。同块不能重名，内层可遮蔽；初始化表达式使用声明前环境，赋值更新最近声明。退出块移除局部变量，保留外层修改。
- 支持 ASCII 标识符、空白、`//` 行注释。所有语句按语法加分号；if/else 必须花括号。位置从 1 开始，列/偏移按 UTF-16 代码单元计，CRLF 仅换行一次。
- 不支持循环、函数、数组、对象、字符串、裸块、文件和网络。非法字符、语法/类型错误阻止执行。语言运行错误包括 DivisionByZero、Overflow；ResourceLimit 单独表示预算耗尽。

## 界面与示例

选择示例后点击“加载”；编辑后须重新编译。各阶段取当前编译结果，源码修改会清除旧执行证据。开启/关闭优化会重置机器。执行从头运行；单步执行一条指令；继续执行当前机器；重置回到 PC 0。历史轨迹只能查看，选择最后一步后可继续当前尚未终止的机器，不能回滚执行。

| 示例           | 预期输出 / 诊断                               |
| -------------- | --------------------------------------------- |
| 分支与常量折叠 | `21`、`true`                                  |
| 布尔短路       | `false`、`true`、`-3`，跳过的除零和溢出不发生 |
| 嵌套作用域     | `11`、`6`、`3`                                |
| 运行时除零     | 输出 `8` 后 DivisionByZero；顶层 n 仍为 8     |
| 类型错误定位   | 第 2 行 TypeMismatch，点击诊断选中源码        |

```text
let base: int = 2 + 3 * 4;
let total: int = base;
if (base >= 10) {
  total = total + 7;
} else {
  total = 0;
}
print(total);
print(true && (total == 21));
```

## 内核架构与 API

`src/core/` 不依赖 React、DOM 或 UI，可从 TypeScript 直接导入。

| 模块                    | 职责                                                                           |
| ----------------------- | ------------------------------------------------------------------------------ |
| ast.ts / diagnostics.ts | 判别联合节点、源码范围、错误类别和固定资源上限                                 |
| lexer.ts / parser.ts    | 带位置 Token、优先级爬升、语法与 AST 规模校验                                  |
| semantic.ts             | 独立词法作用域符号表、严格类型检查，复制并为节点分配槽位                       |
| interpreter.ts          | **独立参考实现**：递归求值、按名称查找 Map 环境，不调用 VM、字节码或 VM 运算器 |
| optimizer.ts            | 保留原树，字面量常量折叠及安全左布尔常量简化                                   |
| bytecode.ts             | 类型检查后的树 → 真实分支/作用域/短路指令，保留源码范围                        |
| runtime.ts / vm.ts      | VM 检查运算、事务式单指令、栈/槽位/作用域和确定性预算                          |
| trace.ts / pipeline.ts  | 可复现前后快照，部分编译产物及诊断整合                                         |
| src/main.tsx            | 编辑、真实阶段展示、优化对照、调试与三路径执行比较                             |

```ts
import { compile, interpret, VirtualMachine } from "./src/core";

const result = compile("let x: int = 2 + 3; print(x);");
if (!result.diagnostics.length && result.analysis && result.optimizedCode) {
  const reference = interpret(result.analysis.program);
  const vm = new VirtualMachine(result.optimizedCode);
  vm.step(); // PUSH 5 的真实前后快照
  const actual = vm.run(); // { output: ['5'], globals: {x: 5} }
  const trace = vm.trace; // 调用者隔离的快照副本
  console.log(reference, actual, trace);
}
```

低层 `interpret`、`optimize`、`compileBytecode` API 的输入应来自**成功 analyze** 的有界 AST；不要向其传入伪造或循环对象。编译诊断以返回值提供；低层 API 的规模/预算前置条件抛出 `LabError`。解释和 VM 的运行期错误以 `Outcome.error` 返回，并保留之前输出/顶层状态。最终状态使用数据键安全构建，`__proto__` 不改变对象原型。

## 字节码与轨迹

| 指令                      | 栈 / 控制语义                                       |
| ------------------------- | --------------------------------------------------- |
| PUSH value / LOAD slot    | 压常量 / 已初始化变量值                             |
| DECLARE slot / STORE slot | 弹出值，声明当前块槽位 / 更新已存在槽位，检查类型   |
| UNARY op / BINARY op      | 弹 1 / 2 值，精确计算并压结果；二元右值先弹         |
| PRINT                     | 弹出一个值，追加一行输出                            |
| JUMP target               | 修改 PC                                             |
| JUMP_FALSE target         | 弹 bool，为 false 时跳转                            |
| AND target / OR target    | 弹 bool；决定短路时将值压回并跳转，否则继续右表达式 |
| ENTER / LEAVE             | 建立块环境 / 移除本块声明的槽位                     |
| HALT                      | 要求空操作数栈和仅顶层环境，正常终止                |

正常指令默认 PC+1。错误指令**不提交**栈、变量、输出或 PC 修改，并设置停止状态。每个成功指令与失败尝试均记录 step、instruction、before、after、error；快照含 PC、栈、所有活动槽位、累计输出、停止标记。优化前/后的 trace 属于各自真实字节码，不要求步数相同。创建新 VM 即重置；后续 step 在终止后无操作。低层损坏字节码返回 InvalidBytecode；后向跳转也受步数预算限制。

## 优化与正确性依据

常量折叠只在运算成功时替换；会除零/溢出的表达式保持运行期错误。`false && rhs` / `true || rhs` 可折叠；`true && rhs` / `false || rhs` 可用 rhs 替换；**不简化** `lhs && false` / `lhs || true`，因为 lhs 可能报错。所有优化在类型检查后执行，不删除声明或分支，不把未执行分支中的变量提升到外层。

测试除了各模块单元覆盖，还包括：

- 手算优先级、除法、布尔短路、作用域、输出及错误前状态；小整数 -8…8 全笛卡尔积四则运算（1156 个组合），用小范围精确 Number 算术和 Math.trunc 作为独立于 BigInt 实现的 oracle。
- 固定种子 **1–160** 生成类型合法的小程序，包括成功、除零和溢出；比较原 AST 解释器、优化 AST 解释器、原始 VM、优化 VM 的输出、错误类别/位置及全部顶层变量。失败报告 seed 和完整小源码，不使用时钟随机性。
- 精确指令 golden、跳转目标、短路跳过、单步/继续确定性、真实字节码与 trace 对应、相邻快照、局部槽位移除、失败事务与调用者修改隔离。
- 真实生产 Chromium E2E：所有阶段、示例、优化开关、单步/继续/重置、错误定位/恢复、历史回放、源码/错误编译清除旧证据、离线计算及 375px 窄屏。

这些是有限测试证据，不是任意程序的形式化证明。测试命令、失败及远程证据见 [VALIDATION.md](VALIDATION.md)。独立 Linux/Windows 工作流接入根 `CI required`，无部署步骤。

## 资源与限制

固定最大值：8192 UTF-16 源字符、2048 Token（含 EOF）、512 AST 节点、32 深度、128 声明、2048 指令、4096 VM 指令/解释器节点求值、256 输出行。API 可在最大值内降低执行/输出预算，不能设 NaN、无限值或超大预算。编译和 AST 遍历也有上限。

执行预算统计的是不同引擎的操作单位；低预算下原始/优化/解释器可能在不同位置耗尽，**不作等价结论**。等价断言使用共同资源范围内的程序，比较语言运行错误，不将预算耗尽当成语言语义反例。没有循环的源语言在默认预算内有界；低层 VM 的循环仍会停止。

同步主线程、小程序教学用途；没有持久化、断点、源码级时间回滚、循环、函数或自定义整数位宽。暂未验证 Firefox/WebKit、真实手机或用户电脑人工操作。ESLint 9 的上游支持已结束，当前复用仓库固定工具链并保留完整审计，工具链升级可独立维护。后续可考虑源语句断点、控制流图、SSA/数据流分析和 Worker；扩大语言前须先扩展独立参考与资源模型。
