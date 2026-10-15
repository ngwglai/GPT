import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

type Problem = {
  name: string;
  variables: Record<string, number[]>;
  constraints: unknown[];
  metadata: Record<string, any>;
};
type Config = {
  algorithm: string;
  variable: string;
  value: string;
  seed: number;
  max_solutions: number;
  timeout: number;
  max_nodes: number;
  trace_limit: number;
};
type Snapshot = {
  type: string;
  assignment: Record<string, number>;
  domains: Record<string, number[]>;
  depth: number;
  variable?: string;
  value?: number;
};
type Result = {
  status: string;
  reason: string;
  complete: boolean;
  solutions: Record<string, number>[];
  events: Snapshot[];
  trace_truncated: boolean;
  stats: Record<string, number | null>;
};
type Row = {
  problem_id: string;
  config: Config;
  repeat: number;
  status: string;
  reason: string;
  complete: boolean;
  solutions: number;
  stats: Record<string, number | null>;
  environment: unknown;
};
const initial: Config = {
  algorithm: "MAC",
  variable: "MRV",
  value: "natural",
  seed: 0,
  max_solutions: 1,
  timeout: 10,
  max_nodes: 100000,
  trace_limit: 2000,
};
async function api(path: string, body?: unknown) {
  const r = await fetch(
    "/api/" + path,
    body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.detail || r.statusText);
  return data;
}
function download(name: string, text: string, type = "application/json") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
function Visual({ p, a }: { p: Problem; a: Record<string, number> }) {
  const kind = p.metadata.kind,
    n = Number(p.metadata.size) || 8,
    keys = Object.keys(p.variables);
  if (kind === "queens" || kind === "sudoku")
    return (
      <div
        className="board"
        style={{ gridTemplateColumns: `repeat(${n},1fr)` }}
      >
        {Array.from({ length: n * n }, (_, i) => {
          const r = Math.floor(i / n),
            c = i % n;
          return (
            <div key={i} className={(r + c) % 2 ? "dark" : "light"}>
              {kind === "queens"
                ? a["Q" + r] === c
                  ? "♛"
                  : ""
                : (a[`r${r}c${c}`] ??
                  (p.variables[`r${r}c${c}`]?.length === 1
                    ? p.variables[`r${r}c${c}`][0]
                    : ""))}
            </div>
          );
        })}
      </div>
    );
  if (kind === "graph" || kind === "map") {
    const pos = (v: string) => {
      const i = keys.indexOf(v),
        t = (2 * Math.PI * i) / keys.length;
      return [200 + 145 * Math.cos(t), 180 + 140 * Math.sin(t)];
    };
    return (
      <svg viewBox="0 0 400 360" role="img" aria-label="着色图">
        {(p.metadata.edges || []).map(([x, y]: string[], i: number) => (
          <line
            key={i}
            x1={pos(x)[0]}
            y1={pos(x)[1]}
            x2={pos(y)[0]}
            y2={pos(y)[1]}
            stroke="#53677d"
            strokeWidth="2"
          />
        ))}
        {keys.map((v) => (
          <g key={v}>
            <circle
              cx={pos(v)[0]}
              cy={pos(v)[1]}
              r="22"
              fill={
                a[v] === undefined ? "#243247" : `hsl(${a[v] * 137.5} 65% 55%)`
              }
            />
            <text
              x={pos(v)[0]}
              y={pos(v)[1] + 5}
              textAnchor="middle"
              fill="white"
            >
              {v}
            </text>
          </g>
        ))}
      </svg>
    );
  }
  return (
    <table>
      <thead>
        <tr>
          <th>变量 / 课程</th>
          <th>取值 / 时段</th>
          <th>资源</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((v) => (
          <tr key={v}>
            <td>{v}</td>
            <td>{p.metadata.slots?.[a[v]] ?? a[v] ?? "—"}</td>
            <td>
              {p.metadata.courses
                ?.find((x: string[]) => x[0] === v)
                ?.slice(1)
                .join(" / ")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
function App() {
  const [tab, setTab] = useState("solve"),
    [kind, setKind] = useState("queens"),
    [size, setSize] = useState(8),
    [colors, setColors] = useState(3),
    [puzzle, setPuzzle] = useState(""),
    [edges, setEdges] = useState("");
  const [text, setText] = useState(""),
    [problem, setProblem] = useState<Problem | null>(null),
    [cfg, setCfg] = useState(initial),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [job, setJob] = useState(""),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<Result | null>(null),
    [resultProblem, setResultProblem] = useState<Problem | null>(null);
  const [index, setIndex] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(200),
    [solutionIndex, setSolutionIndex] = useState(0),
    [view, setView] = useState("solution");
  const [configs, setConfigs] = useState<Config[]>(
      ["BT", "FC", "MAC"].map((algorithm) => ({ ...initial, algorithm })),
    ),
    [repeats, setRepeats] = useState(3),
    [instances, setInstances] = useState<Problem[]>([]),
    [rows, setRows] = useState<Row[]>([]),
    [problemIndex, setProblemIndex] = useState<Record<string, Problem>>({}),
    [experimentId, setExperimentId] = useState("");
  const problemRequest = useRef(0);
  const fail = (e: unknown) =>
    setError(String(e instanceof Error ? e.message : e));
  async function load() {
    const request = ++problemRequest.current;
    setLoading(true);
    try {
      setError("");
      const p = await api("builtin", {
        kind,
        size,
        colors,
        ...(kind === "sudoku" && puzzle ? { puzzle } : {}),
        ...(kind === "graph" && edges ? { edges: JSON.parse(edges) } : {}),
      });
      if (request !== problemRequest.current) return;
      setProblem(p);
      setText(JSON.stringify(p, null, 2));
      setMessage("已载入问题，可编辑 JSON 或网格。");
    } catch (e) {
      if (request === problemRequest.current) fail(e);
    } finally {
      if (request === problemRequest.current) setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setIndex((i) => {
          if (i >= (result?.events.length || 1) - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      speed,
    );
    return () => clearInterval(timer);
  }, [playing, speed, result]);
  async function validated() {
    const p = JSON.parse(text);
    await api("validate", { problem: p });
    setProblem(p);
    setError("");
    return p as Problem;
  }
  async function run(experiment = false) {
    try {
      const p = await validated();
      setJob("");
      setBusy(true);
      setPlaying(false);
      setMessage("正在计算…");
      const body = experiment
        ? {
            mode: "experiment",
            problems: instances.length ? instances : [p],
            configs,
            repeats,
            seed: cfg.seed,
          }
        : { problem: p, config: cfg };
      const { id } = await api("jobs", body);
      setJob(id);
      if (experiment) setExperimentId(id);
      else {
        setResult(null);
        setResultProblem(p);
      }
      const poll = async () => {
        try {
          const j = await api("jobs/" + id);
          if (j.state !== "done") {
            setTimeout(poll, 150);
            return;
          }
          setBusy(false);
          if (j.result.status === "ERROR") {
            setError(j.result.reason);
            return;
          }
          if (experiment) {
            setRows(j.result.rows);
            setProblemIndex(j.result.problems);
            setMessage(
              j.result.cancelled ? "实验已取消，保留已完成记录" : "实验完成",
            );
          } else {
            setResult(j.result);
            setIndex(0);
            setSolutionIndex(0);
            setView("solution");
            setMessage(
              "求解结束：" + j.result.status + " / " + j.result.reason,
            );
          }
        } catch (e) {
          setBusy(false);
          fail(e);
        }
      };
      poll();
    } catch (e) {
      setBusy(false);
      fail(e);
    }
  }
  function editCell(v: string, value: string) {
    try {
      const p = JSON.parse(text);
      const n = Number(p.metadata.size);
      if (!/^\d?$/.test(value) || Number(value) > n) return;
      p.variables[v] =
        value && value !== "0"
          ? [Number(value)]
          : Array.from({ length: n }, (_, i) => i + 1);
      setText(JSON.stringify(p, null, 2));
      setProblem(p);
    } catch (e) {
      fail(e);
    }
  }
  const event = result?.events[index],
    shown =
      view === "trace"
        ? event?.assignment || {}
        : result?.solutions[solutionIndex] || {};
  const field = (key: keyof Config, label: string, options?: string[]) => (
    <label>
      {label}
      {options ? (
        <select
          value={cfg[key]}
          onChange={(e) => setCfg({ ...cfg, [key]: e.target.value })}
        >
          {options.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type="number"
          value={cfg[key]}
          onChange={(e) => setCfg({ ...cfg, [key]: Number(e.target.value) })}
        />
      )}
    </label>
  );
  return (
    <>
      <header>
        <div className="brand">
          ◈ <b>ConstraintLab</b>
          <span>v0.1.0</span>
        </div>
        <span className="local">● LOCAL · 离线算法实验室</span>
      </header>
      <main>
        <div className="heading">
          <div>
            <div className="eyebrow">CONSTRAINT SATISFACTION / 算法研究</div>
            <h1>探索约束，观察搜索。</h1>
            <p>构建问题 · 回放决策 · 比较算法</p>
          </div>
          <nav>
            <button
              className={tab === "solve" ? "active" : ""}
              onClick={() => setTab("solve")}
            >
              求解工作区
            </button>
            <button
              className={tab === "experiment" ? "active" : ""}
              onClick={() => setTab("experiment")}
            >
              性能实验
            </button>
          </nav>
        </div>
        {error && (
          <div role="alert" className="error">
            {error}
          </div>
        )}
        <div role="status" className="message">
          {loading ? "正在载入问题…" : message || "准备就绪"}
          {busy && job !== "" && (
            <button
              onClick={() =>
                api(`jobs/${job}/cancel`, {})
                  .then(() => setMessage("已请求取消计算"))
                  .catch(fail)
              }
            >
              取消后端计算
            </button>
          )}
        </div>
        <div className="layout">
          <aside>
            <section>
              <h2>
                <span>01</span> 问题工作区
              </h2>
              <label>
                问题类型
                <select
                  aria-label="问题类型"
                  value={kind}
                  onChange={(e) => {
                    const k = e.target.value;
                    setKind(k);
                    setSize(k === "sudoku" ? 4 : 8);
                    setPuzzle("");
                  }}
                >
                  {[
                    ["queens", "N 皇后"],
                    ["sudoku", "数独"],
                    ["graph", "图着色"],
                    ["map", "地图着色 · 澳大利亚"],
                    ["schedule", "简单排课"],
                  ].map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <div className="fields">
                <label>
                  规模 N
                  <input
                    aria-label="规模 N"
                    type="number"
                    value={size}
                    onChange={(e) => setSize(+e.target.value)}
                  />
                </label>
                {["graph", "map"].includes(kind) && (
                  <label>
                    颜色数
                    <input
                      type="number"
                      value={colors}
                      onChange={(e) => setColors(+e.target.value)}
                    />
                  </label>
                )}
              </div>
              {kind === "sudoku" && (
                <label>
                  初始数字（0 为空，可留空）
                  <input
                    value={puzzle}
                    onChange={(e) => setPuzzle(e.target.value)}
                  />
                </label>
              )}
              {kind === "graph" && (
                <label>
                  边列表 JSON（留空为环图）
                  <input
                    placeholder={'[["0","1"],["1","2"]]'}
                    value={edges}
                    onChange={(e) => setEdges(e.target.value)}
                  />
                </label>
              )}
              <button onClick={load}>载入预设</button>
              {problem?.metadata.kind === "sudoku" && (
                <div
                  className="sudoku-editor"
                  style={{
                    gridTemplateColumns: `repeat(${problem.metadata.size},1fr)`,
                  }}
                >
                  {Object.entries(problem.variables).map(([v, d]) => (
                    <input
                      key={v}
                      aria-label={v}
                      value={d.length === 1 ? d[0] : ""}
                      onChange={(e) => editCell(v, e.target.value)}
                    />
                  ))}
                </div>
              )}
              <details>
                <summary>编辑变量与约束 · JSON</summary>
                <textarea
                  aria-label="问题 JSON"
                  spellCheck={false}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </details>
              <div className="actions">
                <button
                  onClick={() =>
                    validated()
                      .then(() => setMessage("输入验证通过"))
                      .catch(fail)
                  }
                >
                  验证输入
                </button>
                <button
                  onClick={() => {
                    try {
                      download(
                        "problem.json",
                        JSON.stringify(JSON.parse(text), null, 2),
                      );
                    } catch (e) {
                      fail(e);
                    }
                  }}
                >
                  保存 JSON
                </button>
                <label className="upload">
                  导入 JSON
                  <input
                    aria-label="导入 JSON"
                    type="file"
                    accept=".json"
                    onChange={async (e) => {
                      const request = ++problemRequest.current;
                      setLoading(true);
                      try {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 1000000) throw Error("文件超过 1 MB");
                        const p = JSON.parse(await f.text());
                        await api("validate", { problem: p });
                        if (request !== problemRequest.current) return;
                        setText(JSON.stringify(p, null, 2));
                        setProblem(p);
                        setMessage("导入成功");
                        setError("");
                      } catch (e) {
                        if (request === problemRequest.current) fail(e);
                      } finally {
                        if (request === problemRequest.current) setLoading(false);
                      }
                    }}
                  />
                </label>
              </div>
            </section>
            <section>
              <h2>
                <span>02</span> 搜索配置
              </h2>
              <div className="fields">
                {field("algorithm", "搜索算法", ["BT", "FC", "MAC"])}
                {field("variable", "变量选择", [
                  "fixed",
                  "MRV",
                  "Degree",
                  "Dom/Ddeg",
                ])}
                {field("value", "取值顺序", ["natural", "LCV", "random"])}
                {field("seed", "随机种子")}
                {field("timeout", "超时 / 秒")}
                {field("max_nodes", "节点上限")}
                {field("max_solutions", "最大解数")}
                {field("trace_limit", "轨迹事件上限")}
              </div>
              <button className="primary" disabled={busy || loading || !problem} onClick={() => run()}>
                ▶ 开始求解
              </button>
            </section>
          </aside>
          <div className="content">
            {tab === "solve" ? (
              <>
                <section>
                  <div className="section-top">
                    <h2>
                      <span>03</span> 解与搜索状态
                    </h2>
                    <b className="badge">{result?.status || "READY"}</b>
                  </div>
                  {result && (
                    <>
                      <div className="metrics">
                        {[
                          ["节点", result.stats.nodes],
                          ["回溯", result.stats.backtracks],
                          [
                            "求解 / ms",
                            ((result.stats.seconds || 0) * 1000).toFixed(2),
                          ],
                          ["已发现解", result.solutions.length],
                        ].map(([k, v]) => (
                          <div key={k}>
                            <strong>{v}</strong>
                            <small>{k}</small>
                          </div>
                        ))}
                      </div>
                      <p>
                        {result.complete ? "枚举已完成" : "枚举未完成"} ·
                        停止原因：{result.reason}
                      </p>
                      <div className="actions">
                        <button onClick={() => setView("solution")}>
                          最终解
                        </button>
                        <button onClick={() => setView("trace")}>
                          轨迹状态
                        </button>
                        <label>
                          选择解
                          <select
                            value={solutionIndex}
                            onChange={(e) => setSolutionIndex(+e.target.value)}
                          >
                            {result.solutions.map((_, i) => (
                              <option key={i} value={i}>
                                解 {i + 1}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          onClick={() =>
                            download(
                              "solution.json",
                              JSON.stringify(result, null, 2),
                            )
                          }
                        >
                          导出结果
                        </button>
                        <button
                          disabled={!result.solutions.length}
                          onClick={() =>
                            api("validate", {
                              problem: resultProblem,
                              assignment: result.solutions[solutionIndex],
                            })
                              .then((r) =>
                                setMessage(
                                  r.solution_valid
                                    ? "解独立验证通过"
                                    : "解验证失败",
                                ),
                              )
                              .catch(fail)
                          }
                        >
                          验证解
                        </button>
                      </div>
                    </>
                  )}
                  {(resultProblem || problem) && (
                    <Visual p={(resultProblem || problem)!} a={shown} />
                  )}
                  <details>
                    <summary>赋值与全部统计</summary>
                    <pre>
                      {JSON.stringify(
                        { assignment: shown, stats: result?.stats },
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </section>
                <section>
                  <h2>
                    <span>04</span> 搜索轨迹回放
                  </h2>
                  <p>
                    回放暂停只影响显示，不暂停后端计算。事件采用完整状态快照。
                  </p>
                  {result?.trace_truncated && (
                    <div className="warning">
                      轨迹已截断：仅显示搜索前缀，不代表完整过程。
                    </div>
                  )}
                  <div className="actions">
                    <button
                      disabled={!result?.events.length}
                      onClick={() => {
                        setView("trace");
                        setIndex((i) => Math.max(0, i - 1));
                      }}
                    >
                      上一步
                    </button>
                    <button
                      disabled={!result?.events.length}
                      onClick={() => {
                        setView("trace");
                        setPlaying(!playing);
                      }}
                    >
                      {playing ? "暂停回放" : "播放"}
                    </button>
                    <button
                      disabled={!result?.events.length}
                      onClick={() => {
                        setView("trace");
                        setIndex((i) =>
                          Math.min((result?.events.length || 1) - 1, i + 1),
                        );
                      }}
                    >
                      下一步
                    </button>
                    <label>
                      速度
                      <select
                        value={speed}
                        onChange={(e) => setSpeed(+e.target.value)}
                      >
                        <option value={800}>慢</option>
                        <option value={200}>正常</option>
                        <option value={40}>快</option>
                      </select>
                    </label>
                  </div>
                  <input
                    aria-label="轨迹位置"
                    className="range"
                    type="range"
                    min="0"
                    max={Math.max(0, (result?.events.length || 1) - 1)}
                    value={index}
                    onChange={(e) => {
                      setView("trace");
                      setIndex(+e.target.value);
                    }}
                  />
                  <div className="event">
                    {event
                      ? `${index + 1} / ${result?.events.length} · ${event.type} · 深度 ${event.depth}`
                      : "求解后可查看轨迹"}
                  </div>
                  <p className="path">
                    {Object.entries(event?.assignment || {})
                      .map(([v, x]) => `${v} = ${x}`)
                      .join(" → ") || "根节点"}
                  </p>
                  <details open>
                    <summary>当前变量域</summary>
                    <div className="domains">
                      {Object.entries(event?.domains || {}).map(([v, d]) => (
                        <div key={v}>
                          <b>{v}</b>
                          <span>{d.join(", ") || "∅"}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </section>
              </>
            ) : (
              <>
                <section>
                  <h2>
                    <span>03</span> 可复现实验
                  </h2>
                  <p>
                    每组配置共享相同实例；重复实验使用 种子 +
                    重复编号。计时不含前端渲染，实验关闭轨迹记录。
                  </p>
                  <div className="actions">
                    <button
                      onClick={() =>
                        validated()
                          .then((p) => setInstances((xs) => [...xs, p]))
                          .catch(fail)
                      }
                    >
                      将当前问题加入规模实验
                    </button>
                    <button onClick={() => setInstances([])}>清空实例</button>
                    <button
                      onClick={() => setConfigs((cs) => [...cs, { ...cfg }])}
                    >
                      添加当前搜索配置
                    </button>
                  </div>
                  <p>
                    {instances.length
                      ? instances
                          .map(
                            (p) =>
                              `${p.name} (${Object.keys(p.variables).length} 变量)`,
                          )
                          .join(" / ")
                      : "使用当前问题（可添加不同规模的多个实例）"}
                  </p>
                  <div className="chips">
                    {configs.map((c, i) => (
                      <button
                        key={i}
                        onClick={() =>
                          setConfigs((cs) => cs.filter((_, j) => j !== i))
                        }
                      >
                        {c.algorithm} / {c.variable} / {c.value} ×
                      </button>
                    ))}
                  </div>
                  <label>
                    重复次数
                    <input
                      type="number"
                      min="1"
                      max="10"
                      value={repeats}
                      onChange={(e) => setRepeats(+e.target.value)}
                    />
                  </label>
                  <button
                    className="primary"
                    disabled={busy || loading || !problem || !configs.length}
                    onClick={() => run(true)}
                  >
                    运行对比实验
                  </button>
                </section>
                <section>
                  <div className="section-top">
                    <h2>
                      <span>04</span> 实验结果
                    </h2>
                    <div className="actions">
                      {["json", "csv"].map((f) => (
                        <button
                          key={f}
                          disabled={!rows.length}
                          onClick={async () => {
                            try {
                              const r = await fetch(
                                `/api/jobs/${experimentId}/export?format=${f}`,
                              );
                              if (!r.ok)
                                throw Error("导出失败，任务可能已过期");
                              download(
                                "experiment." + f,
                                await r.text(),
                                f === "csv" ? "text/csv" : "application/json",
                              );
                            } catch (e) {
                              fail(e);
                            }
                          }}
                        >
                          导出 {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>
                  {["seconds", "nodes"].map((metric) => (
                    <div key={metric}>
                      <h3>
                        {metric === "seconds"
                          ? "求解时间 / 秒"
                          : "搜索节点数量"}{" "}
                        · 每次运行
                      </h3>
                      {rows.map((r, i) => (
                        <div className="bar-row" key={i}>
                          <span>
                            {(problemIndex[r.problem_id]?.name ?? "未知问题")}{" "}
                            {Object.keys(problemIndex[r.problem_id]?.variables ?? {}).length} /{" "}
                            {r.config.algorithm} #{r.repeat + 1}
                          </span>
                          <div>
                            <i
                              style={{
                                width: `${Math.max(1, (100 * (r.stats[metric] || 0)) / Math.max(0.000001, ...rows.map((x) => x.stats[metric] || 0)))}%`,
                              }}
                            />
                          </div>
                          <b>
                            {Number(r.stats[metric]).toPrecision(3)} ·{" "}
                            {r.status}
                          </b>
                        </div>
                      ))}
                    </div>
                  ))}
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "实例 / 变量数",
                            "算法",
                            "重复",
                            "状态 / 原因",
                            "秒",
                            "节点",
                            "回溯",
                            "检查",
                            "传播",
                            "删值",
                            "深度",
                            "解数",
                          ].map((t) => (
                            <th key={t}>{t}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={i}>
                            <td>
                              {(problemIndex[r.problem_id]?.name ?? "未知问题")} /{" "}
                              {Object.keys(problemIndex[r.problem_id]?.variables ?? {}).length}
                            </td>
                            <td>{r.config.algorithm}</td>
                            <td>{r.repeat + 1}</td>
                            <td>
                              {r.status} / {r.reason}
                            </td>
                            {[
                              "seconds",
                              "nodes",
                              "backtracks",
                              "constraint_checks",
                              "propagations",
                              "deleted_values",
                              "max_depth",
                            ].map((k) => (
                              <td key={k}>
                                {k === "seconds"
                                  ? r.stats[k]?.toFixed(4)
                                  : r.stats[k]}
                              </td>
                            ))}
                            <td>{r.solutions}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <details>
                    <summary>完整配置、环境与结果</summary>
                    <pre>{JSON.stringify({ problems: problemIndex, rows }, null, 2)}</pre>
                  </details>
                </section>
              </>
            )}
          </div>
        </div>
        <footer>
          ConstraintLab · BT / FC / MAC · 本地计算，独立验证 · 峰值内存未测量
        </footer>
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
