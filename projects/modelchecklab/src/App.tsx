import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_LIMITS,
  GRAPH_NODES,
  INPUT_BYTES,
  type Limits,
  type Result,
} from "./core/types";
import { parseModel, ResourceError } from "./core/validation";
import { examples } from "./examples";
import { downloadJson } from "./export";
import { Graph } from "./Graph";
import {
  interruptedResult,
  type Request,
  type Response,
} from "./worker-protocol";
const pretty = (value: unknown) => JSON.stringify(value, null, 2);
const statusText = {
  verified: "验证通过",
  counterexample: "发现反例",
  inconclusive: "结果未确定",
  invalid_model: "模型无效",
};
const goalText = { reachable: "可达", unreachable: "不可达", unknown: "未知" };
const kindText = {
  invariant: "不变量违反",
  deadlock: "非终止死锁",
  action_error: "动作更新错误",
  evaluation_error: "表达式求值错误",
};
function initialTheme() {
  try {
    return localStorage.getItem("modelchecklab-theme") === "dark";
  } catch {
    return false;
  }
}
export default function App() {
  const [selected, setSelected] = useState(examples[0].id);
  const [text, setText] = useState(pretty(examples[0].model));
  const [feedback, setFeedback] = useState("选择案例，或导入自己的有限模型。");
  const [running, setRunning] = useState(false),
    [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<Result | null>(null),
    [progress, setProgress] = useState<Result["stats"] | null>(null);
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false),
    [showGraph, setShowGraph] = useState(false);
  const [dark, setDark] = useState(initialTheme),
    [limits, setLimits] = useState<Limits>({ ...DEFAULT_LIMITS });
  const worker = useRef<Worker | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastProgress = useRef<Result["stats"] | undefined>(undefined);
  const importVersion = useRef(0);
  const trace = result?.trace ?? [];
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("modelchecklab-theme", dark ? "dark" : "light");
    } catch {
      /* Optional preference persistence. */
    }
  }, [dark]);
  useEffect(() => {
    if (!playing || trace.length < 2) return;
    const t = setInterval(
      () =>
        setStep((s) => {
          if (s >= trace.length - 1) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        }),
      700,
    );
    return () => clearInterval(t);
  }, [playing, trace.length]);
  function clearEvidence() {
    setResult(null);
    setStep(0);
    setPlaying(false);
    setShowGraph(false);
    setProgress(null);
  }
  function edit(next: string) {
    importVersion.current++;
    setText(next);
    clearEvidence();
  }
  function complete(r: Result) {
    stop();
    setResult(r);
    setRunning(false);
    setCancelling(false);
    setStep(0);
    setProgress(r.stats);
  }
  function run() {
    stop();
    importVersion.current++;
    setResult(null);
    setStep(0);
    setPlaying(false);
    setShowGraph(false);
    setRunning(true);
    setCancelling(false);
    setProgress(null);
    lastProgress.current = undefined;
    try {
      const w = new Worker(new URL("./check.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.current = w;
      w.onmessage = (event: MessageEvent<Response>) => {
        if (worker.current !== w) return;
        if (event.data.type === "result") complete(event.data.result);
        else {
          setProgress(event.data.stats);
          lastProgress.current = event.data.stats;
        }
      };
      w.onerror = (event) => {
        event.preventDefault();
        if (worker.current === w)
          complete(
            interruptedResult(
              "Worker 无法运行或异常退出",
              lastProgress.current,
              limits,
            ),
          );
      };
      w.onmessageerror = () => {
        if (worker.current === w)
          complete(
            interruptedResult(
              "Worker 消息无法读取",
              lastProgress.current,
              limits,
            ),
          );
      };
      w.postMessage({ type: "run", text, limits } satisfies Request);
      timer.current = setTimeout(() => {
        if (worker.current === w)
          complete(
            interruptedResult(
              "Worker 超过响应时间，已停止；目标状态未知",
              lastProgress.current,
              limits,
            ),
          );
      }, DEFAULT_LIMITS.timeMs + 3000);
    } catch {
      complete(
        interruptedResult(
          "浏览器无法创建 Web Worker，请使用本地 HTTP 启动方式",
          undefined,
          limits,
        ),
      );
    }
  }
  function cancel() {
    setCancelling(true);
    worker.current?.postMessage({ type: "cancel" } satisfies Request);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(
      () =>
        complete(
          interruptedResult(
            "检验已取消（Worker 强制停止，部分结果不可用）",
            lastProgress.current,
            limits,
          ),
        ),
      1500,
    );
  }
  async function importFile(file: File | undefined) {
    if (!file) return;
    const version = ++importVersion.current;
    if (file.size > INPUT_BYTES) {
      clearEvidence();
      setFeedback("导入未完成：文件超过 64 KiB 资源上限，结果未确定");
      setResult(
        interruptedResult("输入文件超过 64 KiB 资源上限", undefined, limits),
      );
      setStep(0);
      setPlaying(false);
      return;
    }
    try {
      const content = await file.text();
      if (version !== importVersion.current || worker.current) return;
      // Keep invalid JSON editable; validation gives the specific reason.
      edit(content);
      setSelected("custom");
      setFeedback(`已导入 ${file.size} 字节，请校验或运行。`);
    } catch {
      setFeedback("无法读取模型文件");
    }
  }
  function validate() {
    try {
      const m = parseModel(text);
      setFeedback(
        `校验通过：${Object.keys(m.variables).length} 个变量，${m.actions.length} 个动作。静态校验不代表性质通过。`,
      );
    } catch (e) {
      setFeedback(
        `${e instanceof ResourceError ? "资源超限，结果未确定" : "模型无效"}：${(e as Error).message}`,
      );
    }
  }
  return (
    <>
      <header>
        <div>
          <p className="eyebrow">FINITE STATE EXPLORER / v0.1</p>
          <h1>
            ModelCheck<span>Lab</span>
          </h1>
          <p>穷举可达状态，让反例给出证据。</p>
        </div>
        <button onClick={() => setDark(!dark)} aria-label="切换深浅主题">
          {dark ? "浅色主题" : "深色主题"}
        </button>
      </header>
      <main>
        <aside className="intro">
          <strong>有限模型 · 真实 BFS · 本地计算</strong>
          <span>
            给定有限模型及指定性质通过检查，不代表实际程序绝对正确。所有检验在
            Web Worker 中执行。
          </span>
        </aside>
        <div className="workspace">
          <section
            className="panel editor-panel"
            aria-labelledby="editor-heading"
          >
            <div className="section-title">
              <h2 id="editor-heading">01 / 定义模型</h2>
              <span>安全 JSON 表达式</span>
            </div>
            <label className="field">
              内置案例
              <select
                aria-label="内置案例"
                value={selected}
                disabled={running}
                onChange={(e) => {
                  const item = examples.find((x) => x.id === e.target.value);
                  if (item) {
                    setSelected(item.id);
                    edit(pretty(item.model));
                    setFeedback("案例已载入，使用通用模型检验内核。");
                  }
                }}
              >
                <option value="custom" disabled>
                  自定义模型
                </option>
                {examples.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.model.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="tools">
              <label className={`file-button ${running ? "disabled" : ""}`}>
                导入模型
                <input
                  aria-label="导入模型"
                  type="file"
                  accept=".json,application/json"
                  disabled={running}
                  onChange={(e) => {
                    void importFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              <button
                disabled={running}
                onClick={() => {
                  try {
                    downloadJson(parseModel(text), "modelchecklab-model.json");
                  } catch (e) {
                    setFeedback(`导出失败：${(e as Error).message}`);
                  }
                }}
              >
                导出模型
              </button>
              <button disabled={running} onClick={validate}>
                校验模型
              </button>
            </div>
            <label className="sr-only" htmlFor="model-editor">
              JSON 模型编辑器
            </label>
            <textarea
              id="model-editor"
              spellCheck={false}
              value={text}
              disabled={running}
              onChange={(e) => edit(e.target.value)}
            />
            <p className="feedback" role="status">
              {feedback}
            </p>
            <details>
              <summary>表达式与模型约定</summary>
              <p>
                变量引用 <code>{'{"var":"x"}'}</code>，运算{" "}
                <code>{'{"op":"+","args":[{"var":"x"},1]}'}</code>。只解释封闭
                AST，不执行
                JavaScript。合法终止状态停止扩展，但仍检查性质。同一动作全部赋值读取旧状态。
              </p>
              <p>
                静态错误返回 invalid_model；已启用动作的域外更新返回
                action_error 反例。
              </p>
            </details>
          </section>
          <div className="results-column">
            <section className="panel" aria-labelledby="run-heading">
              <div className="section-title">
                <h2 id="run-heading">02 / 检验与预算</h2>
                <span>确定性广度优先搜索</span>
              </div>
              <div className="budgets">
                {(
                  [
                    ["states", "状态上限"],
                    ["transitions", "转移上限"],
                    ["timeMs", "时间上限（毫秒）"],
                  ] as const
                ).map(([key, name]) => (
                  <label key={key}>
                    {name}
                    <input
                      aria-label={name}
                      type="number"
                      min="0"
                      max={DEFAULT_LIMITS[key]}
                      disabled={running}
                      value={Number.isNaN(limits[key]) ? "" : limits[key]}
                      onChange={(e) => {
                        clearEvidence();
                        setLimits({
                          ...limits,
                          [key]:
                            e.target.value === ""
                              ? NaN
                              : Number(e.target.value),
                        });
                      }}
                    />
                  </label>
                ))}
              </div>
              <div className="run-tools">
                <button className="primary" disabled={running} onClick={run}>
                  {running ? "检验中…" : "运行检验"}
                </button>
                <button disabled={!running || cancelling} onClick={cancel}>
                  {cancelling ? "正在取消…" : "取消"}
                </button>
                <button
                  onClick={() => {
                    stop();
                    importVersion.current++;
                    setRunning(false);
                    setCancelling(false);
                    setResult(null);
                    setProgress(null);
                    setStep(0);
                    setPlaying(false);
                    setShowGraph(false);
                    setFeedback("检验已重置，保留当前模型。");
                  }}
                >
                  重置
                </button>
              </div>
              {running && (
                <p role="status">正在探索可达状态，主界面仍可响应…</p>
              )}
              {progress && (
                <div className="stats" data-testid="statistics">
                  <div>
                    <b>{progress.states.toLocaleString()}</b>
                    <span>已发现状态</span>
                  </div>
                  <div>
                    <b>{progress.transitions.toLocaleString()}</b>
                    <span>合法转移</span>
                  </div>
                  <div>
                    <b>{progress.expanded.toLocaleString()}</b>
                    <span>完整展开</span>
                  </div>
                  <div>
                    <b>{Math.round(progress.elapsedMs)} ms</b>
                    <span>计算耗时</span>
                  </div>
                </div>
              )}
            </section>
            <section className="panel" aria-labelledby="result-heading">
              <div className="section-title">
                <h2 id="result-heading">03 / 结果与证据</h2>
                <span>安全性质 ≠ 目标可达性</span>
              </div>
              {result ? (
                <>
                  <div
                    className={`result-banner ${result.status}`}
                    data-testid="result"
                  >
                    <strong>
                      {statusText[result.status]} <code>{result.status}</code>
                    </strong>
                    <p>{result.reason}</p>
                    <p>
                      {result.complete ? "完整探索已结束" : "未完成全部探索"}
                      {result.violation
                        ? ` · ${kindText[result.violation.kind]}`
                        : ""}
                    </p>
                  </div>
                  <p className="scope">
                    结论仅适用于本次导出中的有限模型、指定不变量和非终止死锁检查。
                  </p>
                  {result.goals.length > 0 && (
                    <ul className="goals">
                      {result.goals.map((g) => (
                        <li key={g.name}>
                          <span>{g.name}</span>
                          <strong>
                            {goalText[g.status]} <code>{g.status}</code>
                          </strong>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!result.goals.length && result.status === "inconclusive" && (
                    <p>目标可达性：未知（unknown）</p>
                  )}
                  <div className="tools">
                    <button
                      onClick={() =>
                        downloadJson(
                          { format: "modelchecklab-result-v1", result },
                          "modelchecklab-result.json",
                        )
                      }
                    >
                      导出检验结果
                    </button>
                    <button
                      disabled={!trace.length}
                      onClick={() =>
                        downloadJson(
                          {
                            format: "modelchecklab-trace-v1",
                            model: result.model,
                            limits: result.limits,
                            violation: result.violation,
                            trace,
                          },
                          "modelchecklab-trace.json",
                        )
                      }
                    >
                      导出反例轨迹
                    </button>
                  </div>
                  <details
                    open={showGraph}
                    onToggle={(e) => setShowGraph(e.currentTarget.open)}
                  >
                    <summary>
                      小规模状态图 · 最多 {GRAPH_NODES} 节点 / 2,000 边
                    </summary>
                    <p>
                      节点悬停显示变量，边悬停显示动作。
                      {result.graph.truncated
                        ? "图已截断；不代表完整状态空间。"
                        : "仅展示本次实际探索到的状态与转移。"}
                    </p>
                    {showGraph && <Graph graph={result.graph} />}
                  </details>
                </>
              ) : (
                <div className="empty">
                  <span>∅</span>
                  <p>运行后查看安全结果、目标可达性和可复现的轨迹。</p>
                </div>
              )}
            </section>
          </div>
        </div>
        <section className="panel replay" aria-labelledby="replay-heading">
          <div className="section-title">
            <h2 id="replay-heading">04 / 反例回放</h2>
            <span>最短路径 · 每步一个原子动作</span>
          </div>
          {trace.length ? (
            <>
              <div className="run-tools">
                <button
                  disabled={step === 0}
                  onClick={() => {
                    setPlaying(false);
                    setStep(step - 1);
                  }}
                >
                  上一步
                </button>
                <button
                  onClick={() => {
                    if (step === trace.length - 1) setStep(0);
                    setPlaying(!playing);
                  }}
                >
                  {playing ? "暂停回放" : "自动回放"}
                </button>
                <button
                  disabled={step === trace.length - 1}
                  onClick={() => {
                    setPlaying(false);
                    setStep(step + 1);
                  }}
                >
                  下一步
                </button>
                <label>
                  步数{" "}
                  <input
                    aria-label="回放步数"
                    type="range"
                    min="0"
                    max={trace.length - 1}
                    value={step}
                    onChange={(e) => {
                      setPlaying(false);
                      setStep(Number(e.target.value));
                    }}
                  />
                </label>
                <strong data-testid="replay-step">
                  {step} / {trace.length - 1}
                </strong>
              </div>
              <p data-testid="replay-action">
                {trace[step].action ?? "初始状态"}
              </p>
              <div className="state-values">
                {Object.entries(trace[step].state).map(([name, value]) => {
                  const changed =
                    step > 0 && trace[step - 1].state[name] !== value;
                  return (
                    <div
                      key={name}
                      className={changed ? "changed" : ""}
                      data-testid={`variable-${name}`}
                    >
                      <span>{name}</span>
                      <b>{String(value)}</b>
                      <small>{changed ? "本步变化" : "—"}</small>
                    </div>
                  );
                })}
              </div>
              {result?.violation?.kind === "action_error" &&
                step === trace.length - 1 && (
                  <p className="feedback">
                    轨迹停在合法前置状态。失败动作：
                    {result.violation.action ?? "性质计算"}
                    ；没有将非法后继当作合法状态加入图中。
                  </p>
                )}
            </>
          ) : (
            <p className="muted">
              发现反例后，可从初始状态逐步检查变量和动作。
            </p>
          )}
        </section>
        <footer>
          ModelCheckLab · 显式有限状态检验教学工具 · 无服务器、数据库或付费 API
          · 终止不等于活性证明
        </footer>
      </main>
    </>
  );
}
