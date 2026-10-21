import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  children,
  compile,
  formatInstruction,
  interpret,
  label,
  VirtualMachine,
  type AstNode,
  type Bytecode,
  type Compilation,
  type Diagnostic,
  type Outcome,
  type TraceEntry,
} from "./core";
import { examples } from "./examples";
import "./style.css";

const stages = ["Token", "AST", "类型检查", "AST 优化", "字节码", "执行调试"];
function Tree({ node }: { node: AstNode }) {
  const nested = children(node);
  return (
    <li>
      <span className="node-label">{label(node)}</span>
      <small>
        {" "}
        {node.span.start.line}:{node.span.start.column}
      </small>
      {nested.length > 0 && (
        <ul>
          {node.kind === "if" ? (
            <>
              <li>
                条件
                <ul>
                  <Tree node={node.condition} />
                </ul>
              </li>
              <li>
                then
                <ul>
                  {node.then.map((child, i) => (
                    <Tree key={i} node={child} />
                  ))}
                </ul>
              </li>
              <li>
                else
                <ul>
                  {node.otherwise.map((child, i) => (
                    <Tree key={i} node={child} />
                  ))}
                </ul>
              </li>
            </>
          ) : (
            nested.map((child, i) => <Tree key={i} node={child} />)
          )}
        </ul>
      )}
    </li>
  );
}
function Ast({ node }: { node?: AstNode }) {
  return node ? (
    <ul className="tree">
      <Tree node={node} />
    </ul>
  ) : (
    <p className="empty">语法检查通过后生成 AST。</p>
  );
}
function Code({ code, pc }: { code?: Bytecode; pc?: number }) {
  return code ? (
    <ol className="bytecode" start={0}>
      {code.instructions.map((ins, i) => (
        <li key={i} className={pc === i ? "active-instruction" : ""}>
          <code>{formatInstruction(ins)}</code>
          <small>
            {ins.span.start.line}:{ins.span.start.column}
          </small>
        </li>
      ))}
    </ol>
  ) : (
    <p className="empty">类型检查通过后生成字节码。</p>
  );
}
function normalized(result: Outcome) {
  return JSON.stringify([
    result.output,
    Object.entries(result.globals).sort(),
    result.error?.code,
  ]);
}
function App() {
  const [source, setSource] = useState(examples[0].source);
  const [selected, setSelected] = useState(0);
  const [compilation, setCompilation] = useState<Compilation>(() =>
    compile(examples[0].source),
  );
  const [dirty, setDirty] = useState(false);
  const [stage, setStage] = useState(0);
  const [optimized, setOptimized] = useState(true);
  const [machine, setMachine] = useState<VirtualMachine | undefined>(
    () => new VirtualMachine(compile(examples[0].source).optimizedCode!),
  );
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [cursor, setCursor] = useState(-1);
  const [comparison, setComparison] = useState("尚未比较");
  const [internal, setInternal] = useState("");
  const editor = useRef<HTMLTextAreaElement>(null);
  const code = optimized ? compilation.optimizedCode : compilation.originalCode;
  const snapshot = cursor >= 0 ? trace[cursor].after : machine?.snapshot();
  const runtimeError = cursor >= 0 ? trace[cursor].error : undefined;
  function reset(nextCode: Bytecode | undefined) {
    setMachine(nextCode ? new VirtualMachine(nextCode) : undefined);
    setTrace([]);
    setCursor(-1);
    setComparison("尚未比较");
    setInternal("");
  }
  function compileSource(next = source) {
    try {
      const result = compile(next);
      setCompilation(result);
      setDirty(false);
      reset(optimized ? result.optimizedCode : result.originalCode);
      return result;
    } catch {
      setInternal("编译发生内部错误，请重置后重试。");
      return undefined;
    }
  }
  function edit(next: string) {
    setSource(next);
    setDirty(true);
    setTrace([]);
    setCursor(-1);
    setMachine(undefined);
    setComparison("源码已修改，请重新编译");
  }
  function execute(all: boolean, fresh = false) {
    const vm = fresh && code ? new VirtualMachine(code) : machine;
    if (!vm || dirty) return;
    if (fresh) setMachine(vm);
    try {
      if (all) {
        const actual = vm.run();
        const reference = interpret(compilation.analysis!.program);
        const original = new VirtualMachine(compilation.originalCode!).run();
        const folded = new VirtualMachine(compilation.optimizedCode!).run();
        const exhausted = [reference, original, folded].some(
          (result) => result.error?.code === "ResourceLimit",
        );
        setComparison(
          exhausted
            ? "预算耗尽：不作等价结论"
            : [actual, original, folded].every(
                  (result) => normalized(result) === normalized(reference),
                )
              ? "一致：解释器 / 原始 VM / 优化 VM"
              : "不一致：请保留源码复现",
        );
      } else vm.step();
      const entries = vm.trace;
      setTrace(entries);
      setCursor(entries.length - 1);
      setStage(5);
    } catch {
      setInternal("执行发生内部错误，请重置后重试。");
    }
  }
  function locate(diagnostic: Diagnostic) {
    editor.current?.focus();
    editor.current?.setSelectionRange(
      diagnostic.span.start.offset,
      Math.max(diagnostic.span.start.offset + 1, diagnostic.span.end.offset),
    );
  }
  const diagnostics = dirty
    ? []
    : [...compilation.diagnostics, ...(runtimeError ? [runtimeError] : [])];
  return (
    <>
      <header>
        <a className="brand" href="#main">
          <span className="brand-icon">
            C<span>↦</span>
          </span>
          <span>
            CompilerLab<small>微型编译器实验室 / v0.1</small>
          </span>
        </a>
        <span className="local-badge">● 完全本地 · 无网络执行</span>
      </header>
      <main id="main">
        <section className="intro">
          <div>
            <p className="eyebrow">从一行代码，到一次真实执行</p>
            <h1>看见程序如何被理解。</h1>
            <p>拆解词法、语法、类型与字节码，用独立解释器核对每一次执行。</p>
          </div>
          <div className="pipeline-mark" aria-hidden="true">
            源码 <b>→</b> AST <b>→</b> VM
          </div>
        </section>
        <div className="workspace">
          <section className="source-panel panel" aria-label="源码编辑区">
            <div className="panel-heading">
              <h2>
                <span className="number">01</span> 源码工作台
              </h2>
              <span className="subtle">int / bool</span>
            </div>
            <label className="field-label" htmlFor="example">
              载入示例
            </label>
            <div className="example-row">
              <select
                id="example"
                value={selected}
                onChange={(event) => setSelected(Number(event.target.value))}
              >
                {examples.map((example, i) => (
                  <option key={example.name} value={i}>
                    {example.name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => {
                  const next = examples[selected].source;
                  setSource(next);
                  compileSource(next);
                }}
              >
                加载
              </button>
            </div>
            <label className="field-label" htmlFor="source">
              程序源码 <span>{source.split("\n").length} 行</span>
            </label>
            <textarea
              id="source"
              ref={editor}
              spellCheck={false}
              value={source}
              onChange={(event) => edit(event.target.value)}
              maxLength={10000}
              aria-describedby="syntax-hint"
            />
            <p id="syntax-hint" className="hint">
              显式类型：let x: int = 3; 语句以分号结束。
            </p>
            <div className="toolbar">
              <button className="primary" onClick={() => compileSource()}>
                编译
              </button>
              <button
                disabled={!code || dirty}
                onClick={() => execute(true, true)}
              >
                执行
              </button>
            </div>
            <label className="toggle">
              <input
                type="checkbox"
                checked={optimized}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setOptimized(enabled);
                  reset(
                    enabled
                      ? compilation.optimizedCode
                      : compilation.originalCode,
                  );
                }}
              />
              启用安全局部优化<span>{optimized ? "ON" : "OFF"}</span>
            </label>
            <details className="language-help">
              <summary>语言与资源边界</summary>
              <p>
                支持 let、赋值、if /
                else、print、算术与布尔短路。块级作用域；int 范围
                ±2147483647，溢出/除零报错，除法向零截断。
              </p>
              <p>
                8192 字符、2048 Token、512 AST 节点、32 层、128 声明、2048
                指令、4096 执行步、256 行输出。无循环、函数、文件或网络。
              </p>
            </details>
            <div className="expected">
              <small>当前示例预期</small>
              <pre>{examples[selected].expected}</pre>
            </div>
          </section>
          <section className="stage-panel panel" aria-label="编译流水线">
            <div className="panel-heading">
              <h2>
                <span className="number">02</span> 编译流水线
              </h2>
              <span
                className={
                  dirty
                    ? "status pending"
                    : compilation.diagnostics.length
                      ? "status error"
                      : "status"
                }
              >
                {dirty
                  ? "待重新编译"
                  : compilation.diagnostics.length
                    ? "编译未通过"
                    : "编译就绪"}
              </span>
            </div>
            <nav className="stage-tabs" aria-label="编译阶段">
              {stages.map((name, i) => (
                <button
                  key={name}
                  aria-pressed={stage === i}
                  onClick={() => setStage(i)}
                >
                  <small>0{i + 1}</small>
                  {name}
                </button>
              ))}
            </nav>
            {dirty ? (
              <p className="empty" role="status">
                源码已修改。点击“编译”生成当前阶段结果。
              </p>
            ) : (
              <div className="stage-content">
                {stage === 0 && (
                  <>
                    <h3>
                      词法分析{" "}
                      <small>
                        {compilation.tokens.length} 个 Token（含 EOF）
                      </small>
                    </h3>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>序号</th>
                            <th>类型</th>
                            <th>词素</th>
                            <th>起始行:列</th>
                            <th>结束行:列</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compilation.tokens.map((token, i) => (
                            <tr key={i}>
                              <td>{i}</td>
                              <td>{token.kind}</td>
                              <td>
                                <code>{token.text || "EOF"}</code>
                              </td>
                              <td>
                                {token.span.start.line}:
                                {token.span.start.column}
                              </td>
                              <td>
                                {token.span.end.line}:{token.span.end.column}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {stage === 1 && (
                  <>
                    <h3>
                      抽象语法树 <small>节点来自真实解析结果</small>
                    </h3>
                    <Ast node={compilation.ast} />
                  </>
                )}
                {stage === 2 && (
                  <>
                    <h3>类型检查与符号表</h3>
                    <p>
                      {compilation.analysis
                        ? compilation.diagnostics.length
                          ? "发现语义诊断，禁止生成可执行代码。"
                          : "通过：无隐式类型转换。所有分支已检查。"
                        : "先修复词法或语法错误。"}
                    </p>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>槽位</th>
                            <th>变量名</th>
                            <th>类型</th>
                            <th>作用域深度</th>
                            <th>声明行:列</th>
                          </tr>
                        </thead>
                        <tbody>
                          {compilation.analysis?.symbols.map((symbol) => (
                            <tr key={symbol.id}>
                              <td>#{symbol.id}</td>
                              <td>{symbol.name}</td>
                              <td>{symbol.type}</td>
                              <td>{symbol.depth}</td>
                              <td>
                                {symbol.span.start.line}:
                                {symbol.span.start.column}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {stage === 3 && (
                  <>
                    <h3>
                      安全局部优化 <small>常量折叠 · 保留短路与错误语义</small>
                    </h3>
                    <div className="compare">
                      <div>
                        <h4>优化前</h4>
                        <Ast node={compilation.analysis?.program} />
                      </div>
                      <div>
                        <h4>优化后</h4>
                        <Ast node={compilation.optimized} />
                      </div>
                    </div>
                  </>
                )}
                {stage === 4 && (
                  <>
                    <h3>字节码对照</h3>
                    <p className="hint">
                      AND / OR 指令保留短路值；分支与作用域均由实际跳转控制。
                    </p>
                    <div className="compare">
                      <div>
                        <h4>
                          优化前 ·{" "}
                          {compilation.originalCode?.instructions.length ?? 0}{" "}
                          条
                        </h4>
                        <Code code={compilation.originalCode} />
                      </div>
                      <div>
                        <h4>
                          优化后 ·{" "}
                          {compilation.optimizedCode?.instructions.length ?? 0}{" "}
                          条
                        </h4>
                        <Code code={compilation.optimizedCode} />
                      </div>
                    </div>
                  </>
                )}
                {stage === 5 && (
                  <>
                    <h3>
                      确定性栈式虚拟机{" "}
                      <small>{optimized ? "优化字节码" : "原始字节码"}</small>
                    </h3>
                    <div className="toolbar debugger">
                      <button
                        disabled={
                          !machine ||
                          snapshot?.done ||
                          cursor < trace.length - 1
                        }
                        onClick={() => execute(false)}
                      >
                        单步
                      </button>
                      <button
                        disabled={!machine || machine.snapshot().done}
                        onClick={() => execute(true)}
                      >
                        继续
                      </button>
                      <button disabled={!code} onClick={() => reset(code)}>
                        重置
                      </button>
                      <span role="status">
                        PC {snapshot?.pc ?? "—"} · {cursor + 1} 步 ·{" "}
                        {snapshot?.done ? "已停止" : "就绪"}
                      </span>
                    </div>
                    <p className="comparison" role="status">
                      {comparison}
                    </p>
                    <div className="debug-grid">
                      <div className="instruction-pane">
                        <Code code={code} pc={snapshot?.pc} />
                      </div>
                      <div className="state-pane">
                        <h4>操作数栈（底 → 顶）</h4>
                        <pre data-testid="stack">
                          {JSON.stringify(snapshot?.stack ?? [])}
                        </pre>
                        <h4>变量环境（名称@槽位）</h4>
                        <pre data-testid="variables">
                          {JSON.stringify(snapshot?.variables ?? {}, null, 2)}
                        </pre>
                        <h4>输出</h4>
                        <pre className="output" data-testid="output">
                          {snapshot?.output.join("\n") || "（暂无输出）"}
                        </pre>
                      </div>
                    </div>
                    <label className="field-label" htmlFor="trace">
                      执行轨迹回放 · {trace.length} 次真实指令尝试
                    </label>
                    <select
                      id="trace"
                      disabled={!trace.length}
                      value={cursor}
                      onChange={(event) =>
                        setCursor(Number(event.target.value))
                      }
                    >
                      <option value={-1} disabled>
                        选择已执行步骤
                      </option>
                      {trace.map((entry, i) => (
                        <option key={i} value={i}>
                          {entry.step} · PC {entry.before.pc} ·{" "}
                          {entry.instruction
                            ? formatInstruction(entry.instruction)
                            : "越界"}{" "}
                          → {entry.after.pc}
                          {entry.error ? ` · ${entry.error.code}` : ""}
                        </option>
                      ))}
                    </select>
                    {cursor >= 0 && (
                      <details>
                        <summary>该指令执行前 / 后快照</summary>
                        <pre>{JSON.stringify(trace[cursor], null, 2)}</pre>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
            {diagnostics.length > 0 && (
              <div className="diagnostics" role="alert">
                <h3>诊断</h3>
                {diagnostics.map((diagnostic, i) => (
                  <button key={i} onClick={() => locate(diagnostic)}>
                    <b>{diagnostic.code}</b> · 第 {diagnostic.span.start.line}{" "}
                    行，第 {diagnostic.span.start.column} 列：
                    {diagnostic.message}
                    <small>点击定位源码</small>
                  </button>
                ))}
              </div>
            )}
            {internal && <p role="alert">{internal}</p>}
          </section>
        </div>
        <footer>
          CompilerLab v0.1 <span>真实编译结果 · 独立语义对照 · 有界执行</span>
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
