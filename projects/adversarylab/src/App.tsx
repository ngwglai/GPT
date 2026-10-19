import { useEffect, useRef, useState } from "react";
import type {
  Algorithm,
  BatchConfig,
  Config,
  Metric,
  Snapshot,
  Status,
  Strategy,
} from "./core/types";
import {
  defaultConfig,
  graphAlgorithms,
  labels,
  metricsFor,
  sortingAlgorithms,
  strategies,
} from "./core/types";
import { validateBatch } from "./core/space";
import { summarize } from "./core/statistics";
import { optimalityRatio } from "./core/exact";
import { csv, report } from "./core/export";
import type { Command, Reply } from "./runtime/protocol";
import { Curve, InputView } from "./components/Visuals";
const statusLabels: Record<Status, string> = {
  idle: "等待实验",
  running: "运行中",
  paused: "已暂停",
  budget: "评价预算耗尽",
  cancelled: "已取消",
  timeout: "时间预算耗尽",
  error: "执行异常",
  "proposal-limit": "候选生成上限",
};
const initial: Snapshot = {
  status: "idle",
  results: [],
  current: null,
  exact: null,
};
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
function download(text: string, extension: string) {
  const url = URL.createObjectURL(
    new Blob([text], {
      type:
        extension === "json"
          ? "application/json;charset=utf-8"
          : "text/csv;charset=utf-8",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `adversarylab.${extension}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function App() {
  const [config, setConfig] = useState<BatchConfig>(
    structuredClone(defaultConfig),
  );
  const [seedText, setSeedText] = useState("42");
  const [snapshot, setSnapshot] = useState<Snapshot>(initial);
  const [usedConfig, setUsedConfig] = useState<BatchConfig | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState("");
  const [selected, setSelected] = useState(-1);
  const [dark, setDark] = useState(
    () => localStorage.getItem("adversarylab-theme") !== "light",
  );
  const worker = useRef<Worker | null>(null),
    taskId = useRef(""),
    watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = snapshot.status === "running" || snapshot.status === "paused";
  const records = [
    ...snapshot.results,
    ...(snapshot.current ? [snapshot.current] : []),
  ];
  const record = selected >= 0 ? records[selected] : records.at(-1);
  const c = config.experiment,
    s = c.space;
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("adversarylab-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(
    () => () => {
      worker.current?.terminate();
      if (watchdog.current) clearTimeout(watchdog.current);
    },
    [],
  );
  function edit(patch: Partial<Config>) {
    setConfig((v) => ({ ...v, experiment: { ...v.experiment, ...patch } }));
  }
  function chooseAlgorithm(algorithm: Algorithm) {
    const graph = graphAlgorithms.includes(
      algorithm as (typeof graphAlgorithms)[number],
    );
    setConfig((v) => ({
      ...v,
      exact: !graph,
      experiment: {
        ...v.experiment,
        algorithm,
        metric: metricsFor(algorithm)[0],
        space: graph
          ? { kind: "graph", nodes: 8, edges: 14, maxWeight: 9 }
          : { kind: "sort", size: 8, mode: "permutation", range: 5 },
      },
    }));
  }
  function clearWatchdog() {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
  }
  function fail(id: string, message: string, status: Status = "error") {
    if (taskId.current !== id) return;
    // Invalidate queued messages before terminating a failed/unresponsive worker.
    taskId.current = "";
    clearWatchdog();
    worker.current?.terminate();
    worker.current = null;
    setPending("");
    setSnapshot((prev) => ({
      ...prev,
      status,
      error: message,
      current: prev.current
        ? {
            ...prev.current,
            termination: status === "cancelled" ? "cancelled" : "error",
            error: message,
          }
        : null,
      exact:
        prev.exact && !prev.exact.complete
          ? {
              ...prev.exact,
              reason: status === "cancelled" ? "cancelled" : "error",
            }
          : prev.exact,
    }));
  }
  function start() {
    const seeds = seedText
      .split(",")
      .map((v) => v.trim())
      .map((v) => (v === "" ? NaN : Number(v)));
    const next = {
      ...config,
      seeds,
      experiment: { ...config.experiment, seed: seeds[0] },
    };
    try {
      validateBatch(next);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    worker.current?.terminate();
    clearWatchdog();
    const id = crypto.randomUUID();
    taskId.current = id;
    setSnapshot({ ...initial, status: "running" });
    setPending("");
    setSelected(-1);
    setError("");
    setUsedConfig(structuredClone(next));
    try {
      const instance = new Worker(
        new URL("./runtime/worker.ts", import.meta.url),
        { type: "module" },
      );
      worker.current = instance;
      instance.onmessage = (event: MessageEvent<Reply>) => {
        if (event.data.id !== taskId.current) return;
        setSnapshot(event.data.snapshot);
        const state = event.data.snapshot.status;
        setPending((value) =>
          !["running", "paused"].includes(state) ||
          (value === "暂停中…" && state === "paused") ||
          (value === "恢复中…" && state === "running")
            ? ""
            : value,
        );
        if (!["running", "paused"].includes(state)) {
          clearWatchdog();
        }
        if (!["running", "paused"].includes(event.data.snapshot.status)) {
          instance.terminate();
          if (worker.current === instance) worker.current = null;
        }
      };
      instance.onerror = () =>
        fail(
          id,
          "Worker 故障；下方数据为最后确认的检查点，故障前未确认的操作数未知。",
        );
      instance.onmessageerror = () =>
        fail(id, "Worker 消息无法解码；数据仅代表最后确认的检查点。");
      instance.postMessage({
        type: "start",
        id,
        config: next,
      } satisfies Command);
    } catch {
      fail(id, "无法启动 Web Worker；实验未完成。");
    }
  }
  function control(type: "pause" | "resume" | "cancel") {
    if (!worker.current) return;
    const id = taskId.current;
    setPending(
      type === "cancel" ? "取消中…" : type === "pause" ? "暂停中…" : "恢复中…",
    );
    worker.current.postMessage({ type, id } satisfies Command);
    if (type === "cancel")
      watchdog.current = setTimeout(
        () =>
          fail(
            id,
            "取消确认超时，已终止 Worker；数据仅代表最后确认的检查点，未确认的操作数未知。",
            "cancelled",
          ),
        1000,
      );
  }
  function reset() {
    taskId.current = "";
    worker.current?.terminate();
    worker.current = null;
    clearWatchdog();
    setSnapshot(initial);
    setUsedConfig(null);
    setPending("");
    setError("");
    setSelected(-1);
  }
  const summary = summarize(records),
    ratio = optimalityRatio(record?.bestCost ?? null, snapshot.exact);
  const total =
    (usedConfig?.experiment.budget ?? c.budget) *
    (usedConfig?.seeds.length ?? 1) *
    (usedConfig?.compare ? 3 : 1);
  const evaluations = records.reduce((sum, r) => sum + r.evaluations, 0);
  return (
    <div className="app-shell">
      <header>
        <a href="#main" className="brand">
          <span className="brand-icon">
            A<span>↗</span>
          </span>
          <span>
            Adversary<span className="accent">Lab</span>
            <small>对抗输入实验室 / v0.1</small>
          </span>
        </a>
        <div className="header-actions">
          <span className="local-badge">
            <i />
            本地计算 · 无数据上传
          </span>
          <button
            className="theme"
            onClick={() => setDark((v) => !v)}
            aria-label="切换主题"
          >
            {dark ? "☀ 浅色" : "☾ 深色"}
          </button>
        </div>
      </header>
      <main id="main">
        <section className="intro">
          <span className="eyebrow">ALGORITHM ADVERSARIAL SEARCH</span>
          <h1>让算法，遇见难题。</h1>
          <p>在固定输入空间中寻找高成本案例，观察搜索如何逼近边界。</p>
          <div className="intro-tags">
            <span>6 种真实算法</span>
            <span>3 种搜索策略</span>
            <span>固定种子复现</span>
            <span>小规模精确验证</span>
          </div>
        </section>
        <div className="workspace">
          <aside>
            <section className="panel configuration">
              <div className="panel-title">
                <h2>
                  <span>01</span> 实验配置
                </h2>
                <span className="muted">固定问题空间</span>
              </div>
              <fieldset disabled={active}>
                <label>
                  目标算法
                  <select
                    value={c.algorithm}
                    onChange={(e) =>
                      chooseAlgorithm(e.target.value as Algorithm)
                    }
                  >
                    <optgroup label="排序算法">
                      {sortingAlgorithms.map((a) => (
                        <option key={a} value={a}>
                          {labels[a]}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="图搜索算法">
                      {graphAlgorithms.map((a) => (
                        <option key={a} value={a}>
                          {labels[a]}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                {s.kind === "sort" ? (
                  <>
                    <label>
                      输入类型
                      <select
                        value={s.mode}
                        onChange={(e) => {
                          edit({
                            space: {
                              ...s,
                              mode: e.target.value as
                                | "permutation"
                                | "repeated",
                            },
                          });
                          setConfig((v) => ({
                            ...v,
                            exact:
                              e.target.value === "permutation" && s.size <= 8,
                          }));
                        }}
                      >
                        <option value="permutation">
                          互异元素排列 [0, n−1]
                        </option>
                        <option value="repeated">允许重复的整数数组</option>
                      </select>
                    </label>
                    <div className="field-row">
                      <NumberField
                        label="数组长度"
                        value={s.size}
                        min={0}
                        max={64}
                        onChange={(size) => {
                          edit({ space: { ...s, size } });
                          if (size > 8)
                            setConfig((v) => ({ ...v, exact: false }));
                        }}
                      />
                      {s.mode === "repeated" && (
                        <NumberField
                          label="数值范围 ±"
                          value={s.range}
                          min={0}
                          max={100}
                          onChange={(range) => edit({ space: { ...s, range } })}
                        />
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="field-row">
                      <NumberField
                        label="节点数"
                        value={s.nodes}
                        min={2}
                        max={20}
                        onChange={(nodes) => edit({ space: { ...s, nodes } })}
                      />
                      <NumberField
                        label="固定边数"
                        value={s.edges}
                        min={0}
                        max={Math.min(100, s.nodes * (s.nodes - 1))}
                        onChange={(edges) => edit({ space: { ...s, edges } })}
                      />
                    </div>
                    <NumberField
                      label="最大非负权重"
                      value={s.maxWeight}
                      min={0}
                      max={20}
                      onChange={(maxWeight) =>
                        edit({ space: { ...s, maxWeight } })
                      }
                    />
                    <p className="note">
                      简单有向图，起点 0，终点
                      n−1；邻接升序。搜索中节点数、边数与权重边界固定。
                    </p>
                  </>
                )}
                <label>
                  优化目标
                  <select
                    value={c.metric}
                    onChange={(e) => edit({ metric: e.target.value as Metric })}
                  >
                    {metricsFor(c.algorithm).map((m) => (
                      <option key={m} value={m}>
                        {labels[m]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="divider" />
                <label>
                  搜索策略
                  <select
                    value={c.strategy}
                    onChange={(e) =>
                      edit({ strategy: e.target.value as Strategy })
                    }
                  >
                    {strategies.map((a) => (
                      <option key={a} value={a}>
                        {labels[a]}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="field-row">
                  <NumberField
                    label="每次评价预算"
                    value={c.budget}
                    min={1}
                    max={20000}
                    onChange={(budget) => edit({ budget })}
                  />
                  <NumberField
                    label="总时间预算 ms"
                    value={config.timeoutMs}
                    min={1}
                    max={30000}
                    onChange={(timeoutMs) =>
                      setConfig((v) => ({ ...v, timeoutMs }))
                    }
                  />
                </div>
                <label>
                  随机种子（逗号分隔，最多 8 个）
                  <input
                    value={seedText}
                    onChange={(e) => setSeedText(e.target.value)}
                    placeholder="42, 43, 44"
                  />
                </label>
                <div className="field-row">
                  <NumberField
                    label="退火初温"
                    value={c.initialTemperature}
                    min={0.001}
                    max={1000000}
                    step={0.01}
                    onChange={(initialTemperature) =>
                      edit({ initialTemperature })
                    }
                  />
                  <NumberField
                    label="退火终温"
                    value={c.finalTemperature}
                    min={0.001}
                    max={1000000}
                    step={0.01}
                    onChange={(finalTemperature) => edit({ finalTemperature })}
                  />
                </div>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={config.compare}
                    onChange={(e) =>
                      setConfig((v) => ({ ...v, compare: e.target.checked }))
                    }
                  />
                  对比全部三种策略
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={config.exact}
                    disabled={
                      s.kind !== "sort" ||
                      s.mode !== "permutation" ||
                      s.size > 8
                    }
                    onChange={(e) =>
                      setConfig((v) => ({ ...v, exact: e.target.checked }))
                    }
                  />
                  独立精确穷举（互异排列 n ≤ 8）
                </label>
              </fieldset>
              {error && (
                <p role="alert" className="error">
                  {error}
                </p>
              )}
              <button className="primary" onClick={start} disabled={active}>
                ▶ 开始实验
              </button>
              <div className="control-row">
                <button
                  onClick={() =>
                    control(snapshot.status === "paused" ? "resume" : "pause")
                  }
                  disabled={!active || !!pending}
                >
                  {snapshot.status === "paused" ? "恢复" : "暂停"}
                </button>
                <button
                  onClick={() => control("cancel")}
                  disabled={!active || !!pending}
                >
                  取消
                </button>
                <button onClick={reset}>重置</button>
              </div>
              <p className="note">
                合法重复候选会重新执行并计评价；非法候选仅计生成/拒绝。暂停确认后停止计算，时间预算不含暂停。
              </p>
            </section>
          </aside>
          <div className="results">
            <section className="panel progress-panel">
              <div className="panel-title">
                <h2>
                  <span className={`status-dot ${active ? "live" : ""}`} />
                  <span role="status">
                    {pending || statusLabels[snapshot.status]}
                  </span>
                </h2>
                <span className="muted">Web Worker</span>
              </div>
              <progress
                max={total}
                value={evaluations}
                aria-label="总评价进度"
              />
              <div className="progress-detail">
                <span>
                  评价 {evaluations.toLocaleString()} / {total.toLocaleString()}
                </span>
                <span>
                已记录 {records.length} 次 ·{" "}
                  {usedConfig && usedConfig.seeds.length > 1
                    ? "多种子实验"
                    : "单种子实验"}
                </span>
              </div>
              {snapshot.error && (
                <p role="alert" className="error">
                  {snapshot.error}
                </p>
              )}
            </section>
            <div className="stat-grid">
              <div className="stat">
                <span>当前记录最佳成本</span>
                <strong data-testid="best-cost">
                  {record?.bestCost ?? "—"}
                </strong>
                <small>
                  {labels[(usedConfig ?? config).experiment.metric]}
                </small>
              </div>
              <div className="stat">
                <span>已证明的精确最优</span>
                <strong>
                  {snapshot.exact?.complete ? snapshot.exact.optimum : "未确定"}
                </strong>
                <small>
                  {snapshot.exact
                    ? `${snapshot.exact.evaluated} / ${snapshot.exact.total} 个排列 · ${snapshot.exact.reason}`
                    : "需启用完整穷举"}
                </small>
              </div>
              <div className="stat">
                <span>启发式 / 精确最优</span>
                <strong>
                  {ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`}
                </strong>
                <small>
                  {snapshot.exact?.optimum === 0 && snapshot.exact.complete
                    ? "零成本约定：0 / 0 = 100%"
                    : "仅在完整枚举后计算"}
                </small>
              </div>
            </div>
            <section className="panel">
              <div className="panel-title">
                <h2>
                  <span>02</span> 最佳成本轨迹
                </h2>
                <span className="muted">越高越困难 · 单一量纲</span>
              </div>
              <Curve records={records} />
            </section>
            <div className="detail-grid">
              <section className="panel">
                <div className="panel-title">
                  <h2>
                    <span>03</span> 最佳输入
                  </h2>
                </div>
                {records.length > 0 && (
                  <label>
                    查看实验记录
                    <select
                      aria-label="查看实验记录"
                      value={selected}
                      onChange={(e) => setSelected(Number(e.target.value))}
                    >
                      <option value={-1}>最新记录</option>
                      {records.map((r, i) => (
                        <option value={i} key={i}>
                          {labels[r.config.strategy]} · seed {r.config.seed}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <InputView
                  candidate={record?.best ?? null}
                  path={record?.execution?.path}
                />
                {record?.best && (
                  <details>
                    <summary>查看完整输入 JSON</summary>
                    <pre>{JSON.stringify(record.best, null, 2)}</pre>
                  </details>
                )}
              </section>
              <section className="panel">
                <div className="panel-title">
                  <h2>
                    <span>04</span> 真实执行统计
                  </h2>
                  <span className="muted">最佳输入的一次执行</span>
                </div>
                {record ? (
                  <>
                    <dl className="metrics">
                      {metricsFor(record.config.algorithm).map((m) => (
                        <div key={m}>
                          <dt>{labels[m]}</dt>
                          <dd>{record.execution?.metrics[m] ?? "—"}</dd>
                        </div>
                      ))}
                    </dl>
                    {record.execution?.path && (
                      <p className="note">
                        路径：
                        {record.execution.path.length
                          ? record.execution.path.join(" → ")
                          : "终点不可达"}
                        <br />
                        距离：{record.execution.distance ?? "不可达"}（
                        {record.config.algorithm === "dijkstra"
                          ? "权重和"
                          : "边数"}
                        ）<br />
                        扩展顺序：{record.execution.order?.join(" → ")}
                      </p>
                    )}
                    <div className="divider" />
                    <dl className="metrics">
                      {(
                        [
                          ["候选生成", record.generated],
                          ["非法拒绝", record.rejected],
                          ["重复候选", record.duplicates],
                          ["算法评价", record.evaluations],
                          ["异常", record.failures],
                        ] as const
                      ).map(([k, v]) => (
                        <div key={k}>
                          <dt>{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                    <p className="note">
                      终止：
                      {record.termination
                        ? statusLabels[record.termination]
                        : "尚未终止"}
                    </p>
                  </>
                ) : (
                  <div className="empty">算法运行后显示实际计数。</div>
                )}
              </section>
            </div>
            <section className="panel">
              <div className="panel-title">
                <h2>
                  <span>05</span> 策略对比与导出
                </h2>
                <div className="export-actions">
                  <button
                    disabled={!usedConfig || active}
                    onClick={() =>
                      download(
                        JSON.stringify(report(usedConfig!, snapshot), null, 2),
                        "json",
                      )
                    }
                  >
                    导出 JSON
                  </button>
                  <button
                    disabled={!usedConfig || active}
                    onClick={() => download(csv(usedConfig!, snapshot), "csv")}
                  >
                    导出 CSV
                  </button>
                </div>
              </div>
              <p className="note">
                {usedConfig && usedConfig.seeds.length > 1
                  ? "多种子统计：按策略汇总，标准差采用总体标准差。"
                  : "单种子结果：标准差为 0 不代表跨种子稳定性。"}{" "}
                最高成本、均值和标准差仅统计完整用尽评价预算的记录；部分运行保留真实计数，不能视为完整的等预算比较。
              </p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>策略</th>
                      <th>记录 / 预算完成</th>
                      <th>最高成本</th>
                      <th>均值</th>
                      <th>标准差</th>
                      <th>实际评价数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((r) => (
                      <tr key={r.strategy}>
                        <td>{labels[r.strategy]}</td>
                        <td>
                          {r.runs} / {r.completed}
                        </td>
                        <td>{r.best ?? "—"}</td>
                        <td>{r.mean?.toFixed(2) ?? "—"}</td>
                        <td>{r.standardDeviation?.toFixed(2) ?? "—"}</td>
                        <td>{r.evaluations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!summary.length && (
                <div className="empty compact">
                  启用三策略对比，探索同一预算下的搜索差异。
                </div>
              )}
            </section>
            <details className="panel methodology">
              <summary>实验规则与解释</summary>
              <p>
                Random Search 独立采样；Hill Climbing
                接受不降成本的局部变异；Simulated Annealing
                使用几何降温，对降成本候选按 exp(Δ/T)
                接受。退火仅优化选中的一个指标。
              </p>
              <p>
                排序长度与值域、图节点数与边数固定。插入/归并默认比较次数，BFS/DFS/Dijkstra
                默认节点扩展数。图搜索均在终点首次扩展时停止；BFS/DFS
                忽略权重，Dijkstra
                仅严格更短时更新，堆按距离、节点编号、插入序打破平局，过期条目不扩展。
              </p>
              <p>
                精确验证与搜索预算分离，仅支持 n≤8
                的完整互异排列枚举。未完成枚举时最优值为未确定。时间耗尽或异常不代表找到最优；墙钟超时可能因设备产生不同的部分结果，正常评价预算结束可复现。
              </p>
            </details>
          </div>
        </div>
      </main>
      <footer>
        <span>AdversaryLab · 有约束，可复现，可验证。</span>
        <span>所有成本来自真实算法执行</span>
      </footer>
    </div>
  );
}
