import { useState } from "react";
import {
  addEdge,
  descendants,
  MAX_IMPORT_BYTES,
  MAX_SAMPLES,
  MAX_VARIABLES,
  removeVariable,
  validateModel,
  type Model,
  type Variable,
} from "./core/model";
import { examples, loadExample } from "./core/examples";
import { generate, trueATE, type Data } from "./core/simulation";
import { interventionAnalysis, observe, type Settings } from "./core/analysis";
import {
  experimentJSON,
  makeReport,
  parseExperiment,
  parseModel,
  reportCSV,
  validateSettings,
} from "./core/serialization";
import type { Estimate } from "./core/statistics";
import { Distribution, format, Graph } from "./Charts";
const initial = loadExample("confounding");
const settingsFor = (e: typeof initial): Settings => ({
  n: 10_000,
  seed: 42,
  treatment: e.treatment,
  outcome: e.outcome,
  group: e.group,
  low: 0,
  high: 1,
});
type Run = {
  data: Data;
  observation: ReturnType<typeof observe>;
  model: Model;
  settings: Settings;
};
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Est({ title, result }: { title: string; result: Estimate }) {
  return (
    <article className="metric">
      <h3>{title}</h3>
      {result.ok ? (
        <>
          <strong>{format(result.value)}</strong>
          <p>
            SE {format(result.se)} · 95% CI [{format(result.ci[0])},{" "}
            {format(result.ci[1])}]
          </p>
          <small>
            {result.note}；n={result.n}
          </small>
        </>
      ) : (
        <p className="muted">
          不适用：{result.reason}（n={result.n}）
        </p>
      )}
    </article>
  );
}
function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        aria-label={label}
        type="number"
        value={Number.isNaN(value) ? "" : value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) =>
          onChange(e.target.value === "" ? NaN : Number(e.target.value))
        }
      />
    </label>
  );
}
export default function App() {
  const [model, setModel] = useState<Model>(initial.model),
    [settings, setSettings] = useState<Settings>(settingsFor(initial));
  const [baseline, setBaseline] = useState({
    model: initial.model,
    settings: settingsFor(initial),
  });
  const [caseId, setCaseId] = useState(initial.id),
    [run, setRun] = useState<Run | null>(null),
    [intervention, setIntervention] = useState<ReturnType<
      typeof interventionAnalysis
    > | null>(null);
  const [error, setError] = useState(""),
    [message, setMessage] = useState("选择案例，检查模型，再生成数据。");
  const [parent, setParent] = useState("U"),
    [child, setChild] = useState("Y"),
    [weight, setWeight] = useState(1);
  const [importText, setImportText] = useState(""),
    [importMode, setImportMode] = useState("model");
  let modelError = "",
    settingsError = "";
  try {
    validateModel(model);
  } catch (e) {
    modelError = (e as Error).message;
  }
  if (!modelError)
    try {
      validateSettings(model, settings);
    } catch (e) {
      settingsError = (e as Error).message;
    }
  const valid = !modelError && !settingsError;
  function clear() {
    setRun(null);
    setIntervention(null);
    setError("");
  }
  function editModel(next: Model) {
    setModel(next);
    clear();
    setMessage("模型已编辑，请重新生成数据。案例理论说明对应原始参数。");
  }
  function editSettings(patch: Partial<Settings>) {
    setSettings((s) => ({ ...s, ...patch }));
    clear();
    setMessage("实验设置已改变，请重新生成数据。");
  }
  function attempt(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败");
    }
  }
  function load(id: string) {
    const e = loadExample(id),
      s = settingsFor(e);
    setModel(e.model);
    setSettings(s);
    setBaseline(structuredClone({ model: e.model, settings: s }));
    setCaseId(id);
    setParent(e.model.variables[0].id);
    setChild(e.outcome);
    clear();
    setMessage("案例已加载；尚未生成样本。");
  }
  function updateVariable(id: string, patch: Partial<Variable>) {
    editModel({
      ...model,
      variables: model.variables.map((v) =>
        v.id === id ? { ...v, ...patch } : v,
      ),
    });
  }
  function importContent(content: string) {
    attempt(() => {
      const loaded =
        importMode === "model"
          ? { model: parseModel(content), settings: null }
          : parseExperiment(content);
      const m = loaded.model;
      const s = loaded.settings ?? {
        ...settings,
        n: 10_000,
        seed: 42,
        treatment: m.variables[0].id,
        outcome: m.variables[1]?.id ?? m.variables[0].id,
        group:
          m.variables.find(
            (v) => v.kind === "bernoulli" && v.id !== m.variables[0].id,
          )?.id ?? "",
        low: 0,
        high: 1,
      };
      setModel(m);
      setSettings(s);
      setBaseline(structuredClone({ model: m, settings: s }));
      setCaseId("");
      setParent(m.variables[0].id);
      setChild(m.variables[1]?.id ?? m.variables[0].id);
      clear();
      setMessage(
        "导入成功。模型导入默认 n=10000、seed=42；实验导入保留全部设置，点击生成数据复现。",
      );
    });
  }
  const report = run
    ? makeReport(
        run.model,
        run.settings,
        run.observation,
        intervention?.result ?? null,
      )
    : null;
  const example = examples.find((e) => e.id === caseId);
  let truth: number | null = null;
  if (valid)
    truth = trueATE(
      model,
      settings.treatment,
      settings.outcome,
      settings.low,
      settings.high,
    );
  return (
    <>
      <header className="topbar">
        <a className="brand" href="#">
          C<span>↗</span>L <b>CausalLab</b>
          <small>因果推断实验室 · v0.1</small>
        </a>
        <span className="local">● 纯本地 · 固定种子 · 无上传</span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">从观察到干预</p>
          <h1>相关性，能告诉我们多少？</h1>
          <p>
            画出生成机制，观察样本偏差，再通过 <code>do(X=x)</code>{" "}
            比较模型中的因果效应。
          </p>
          <p className="caption">
            教学与算法实验工具；不提供未经验证的现实因果结论。
          </p>
        </section>
        <nav className="steps" aria-label="实验步骤">
          <a href="#model">01 模型与参数</a>
          <a href="#sampling">02 生成数据</a>
          <a href="#analysis">03 观察性分析</a>
          <a href="#intervention">04 干预实验</a>
          <a href="#export">05 导入导出</a>
        </nav>
        <div className="workspace">
          <aside>
            <section className="panel">
              <p className="eyebrow">实验案例</p>
              <h2>三个经典问题</h2>
              <div className="case-list">
                {examples.map((e) => (
                  <button
                    key={e.id}
                    className={caseId === e.id ? "selected" : ""}
                    aria-pressed={caseId === e.id}
                    onClick={() => load(e.id)}
                  >
                    {e.title}
                    <span>
                      {e.id === "confounding"
                        ? "遗漏共同原因"
                        : e.id === "collider"
                          ? "选择引入关联"
                          : "构成反转方向"}
                    </span>
                  </button>
                ))}
              </div>
              {example ? (
                <>
                  <p>{example.explanation}</p>
                  <details>
                    <summary>原始案例的数学定义</summary>
                    <p>{example.theory}</p>
                    <small>
                      编辑参数后，以当前模型计算值为准；有限样本不保证复现总体符号。
                    </small>
                  </details>
                </>
              ) : (
                <p>自定义模型：真实效应由当前结构方程解析计算。</p>
              )}
            </section>
            <section className="panel">
              <h2>实验状态</h2>
              <p role="status">{message}</p>
              {(error || modelError || settingsError) && (
                <div role="alert" className="error">
                  {error || modelError || settingsError}
                </div>
              )}
              <div className="stack">
                <button
                  onClick={() => {
                    setModel(structuredClone(baseline.model));
                    setSettings({ ...baseline.settings });
                    clear();
                    setMessage("已恢复最近加载的模型与参数。");
                  }}
                >
                  恢复加载时模型与参数
                </button>
                <button
                  onClick={() => {
                    clear();
                    setMessage("结果已清空，模型与设置可继续编辑。");
                  }}
                >
                  清空实验结果
                </button>
                <button onClick={() => load("confounding")}>
                  重置为默认模型
                </button>
              </div>
            </section>
          </aside>
          <div className="content">
            <section className="panel" id="model">
              <div className="section-title">
                <div>
                  <p className="eyebrow">01 / STRUCTURAL MODEL</p>
                  <h2>模型与参数</h2>
                </div>
                <span className="badge">
                  {model.variables.length} / {MAX_VARIABLES} 个变量
                </span>
              </div>
              <label>
                模型名称
                <input
                  value={model.name}
                  maxLength={80}
                  onChange={(e) =>
                    editModel({ ...model, name: e.target.value })
                  }
                />
              </label>
              <Graph model={model} />
              <div className="variables">
                {model.variables.map((v) => (
                  <details key={v.id} open>
                    <summary>
                      {v.id} · {v.label}{" "}
                      <small>
                        {v.kind === "linear" ? "连续线性" : "二元概率"}
                      </small>
                    </summary>
                    <div className="field-grid">
                      <label>
                        变量名称 {v.id}
                        <input
                          aria-label={`变量名称 ${v.id}`}
                          value={v.label}
                          maxLength={80}
                          onChange={(e) =>
                            updateVariable(v.id, { label: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        变量类型 {v.id}
                        <select
                          aria-label={`变量类型 ${v.id}`}
                          value={v.kind}
                          onChange={(e) =>
                            updateVariable(v.id, {
                              kind: e.target.value as Variable["kind"],
                              noiseStd: e.target.value === "bernoulli" ? 0 : 1,
                            })
                          }
                        >
                          <option value="linear">连续线性</option>
                          <option value="bernoulli">二元概率</option>
                        </select>
                      </label>
                      <NumberField
                        label={`截距 ${v.id}`}
                        value={v.intercept}
                        min={-100}
                        max={100}
                        step={0.1}
                        onChange={(n) => updateVariable(v.id, { intercept: n })}
                      />
                      <NumberField
                        label={`噪声标准差 ${v.id}`}
                        value={v.noiseStd}
                        min={0}
                        max={100}
                        step={0.1}
                        disabled={v.kind === "bernoulli"}
                        onChange={(n) => updateVariable(v.id, { noiseStd: n })}
                      />
                    </div>
                    <p className="equation">
                      {v.kind === "linear"
                        ? `${v.id} = ${format(v.intercept)} + Σ w·父变量 + ${format(v.noiseStd)}·N(0,1)`
                        : `P(${v.id}=1 | 父变量) = ${format(v.intercept)} + Σ w·父变量`}
                    </p>
                    <p className="caption">
                      父节点：{Object.keys(v.weights).join(", ") || "无"} ·
                      后代：
                      {(() => {
                        try {
                          return descendants(model, v.id).join(", ") || "无";
                        } catch {
                          return "模型无效，请修正";
                        }
                      })()}
                    </p>
                    <div className="edges">
                      {Object.entries(v.weights).map(([p, w]) => (
                        <div key={p}>
                          <NumberField
                            label={`系数 ${p} → ${v.id}`}
                            value={w}
                            min={-100}
                            max={100}
                            step={0.1}
                            onChange={(n) =>
                              updateVariable(v.id, {
                                weights: { ...v.weights, [p]: n },
                              })
                            }
                          />
                          <button
                            aria-label={`删除边 ${p} → ${v.id}`}
                            onClick={() =>
                              updateVariable(v.id, {
                                weights: Object.fromEntries(
                                  Object.entries(v.weights).filter(
                                    ([id]) => id !== p,
                                  ),
                                ),
                              })
                            }
                          >
                            删除边
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      className="danger"
                      onClick={() => {
                        editModel(removeVariable(model, v.id));
                        setSettings((s) => ({
                          ...s,
                          treatment: s.treatment === v.id ? "" : s.treatment,
                          outcome: s.outcome === v.id ? "" : s.outcome,
                          group: s.group === v.id ? "" : s.group,
                        }));
                      }}
                    >
                      删除变量 {v.id}
                    </button>
                  </details>
                ))}
              </div>
              <div className="toolbar">
                <button
                  disabled={model.variables.length >= MAX_VARIABLES}
                  onClick={() => {
                    let i = 1;
                    while (model.variables.some((v) => v.id === `V${i}`)) i++;
                    editModel({
                      ...model,
                      variables: [
                        ...model.variables,
                        {
                          id: `V${i}`,
                          label: `变量 ${i}`,
                          kind: "linear",
                          intercept: 0,
                          weights: {},
                          noiseStd: 1,
                        },
                      ],
                    });
                  }}
                >
                  ＋ 创建变量
                </button>
                <label>
                  父节点
                  <select
                    aria-label="父节点"
                    value={parent}
                    onChange={(e) => setParent(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {model.variables.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  子节点
                  <select
                    aria-label="子节点"
                    value={child}
                    onChange={(e) => setChild(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {model.variables.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.id}
                      </option>
                    ))}
                  </select>
                </label>
                <NumberField
                  label="新边系数"
                  value={weight}
                  min={-100}
                  max={100}
                  step={0.1}
                  onChange={setWeight}
                />
                <button
                  onClick={() =>
                    attempt(() =>
                      editModel(addEdge(model, parent, child, weight)),
                    )
                  }
                >
                  建立有向边
                </button>
              </div>
              <p className="caption">
                自环与有向环会被拒绝；二元机制只接收二元父变量，且所有父变量组合下概率须在
                [0,1] 内。参数编辑中的无效草稿会暂停生成。
              </p>
            </section>
            <section className="panel" id="sampling">
              <p className="eyebrow">02 / REPRODUCIBLE DATA</p>
              <h2>合成数据</h2>
              <div className="field-grid">
                <NumberField
                  label="样本量"
                  min={1}
                  max={MAX_SAMPLES}
                  value={settings.n}
                  onChange={(n) => editSettings({ n })}
                />
                <NumberField
                  label="随机种子"
                  min={0}
                  max={0xffffffff}
                  value={settings.seed}
                  onChange={(seed) => editSettings({ seed })}
                />
                {(["treatment", "outcome", "group"] as const).map((key) => (
                  <label key={key}>
                    {key === "treatment"
                      ? "处理变量"
                      : key === "outcome"
                        ? "结果变量"
                        : "条件分组变量"}
                    <select
                      aria-label={
                        key === "treatment"
                          ? "处理变量"
                          : key === "outcome"
                            ? "结果变量"
                            : "条件分组变量"
                      }
                      value={settings[key]}
                      onChange={(e) => editSettings({ [key]: e.target.value })}
                    >
                      <option value="">
                        {key === "group" ? "不分组" : "请选择"}
                      </option>
                      {model.variables
                        .filter(
                          (v) => key !== "group" || v.kind === "bernoulli",
                        )
                        .map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.id} · {v.label}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              <div className="toolbar">
                <button
                  className="primary"
                  disabled={!valid}
                  onClick={() =>
                    attempt(() => {
                      const m = validateModel(model),
                        s = { ...settings },
                        data = generate(m, s),
                        observation = observe(m, data, s);
                      setRun({ model: m, settings: s, data, observation });
                      setIntervention(null);
                      setMessage(
                        `数据已生成：n=${s.n}，seed=${s.seed}。可查看观察性结果并执行干预。`,
                      );
                    })
                  }
                >
                  生成 / 重新生成数据
                </button>
                <span className="caption">
                  上限 {MAX_SAMPLES.toLocaleString()}
                  ；相同模型、参数与种子产生相同样本。
                </span>
              </div>
              {run && (
                <>
                  <div className="table-wrap">
                    <table>
                      <caption>
                        描述性统计 · n={run.data.length} · seed=
                        {run.settings.seed} · 方差分母 n−1
                      </caption>
                      <thead>
                        <tr>
                          <th>变量</th>
                          <th>均值</th>
                          <th>标准差</th>
                          <th>样本方差</th>
                          <th>最小值</th>
                          <th>最大值</th>
                        </tr>
                      </thead>
                      <tbody>
                        {run.observation.summaries.map((s) => (
                          <tr key={s.id}>
                            <th>{s.label}</th>
                            {[s.mean, s.sd, s.variance, s.min, s.max].map(
                              (n, i) => (
                                <td key={i}>{format(n)}</td>
                              ),
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="chart-grid">
                    {model.variables.map((v) => (
                      <Distribution
                        key={v.id}
                        title={`观察 ${v.id}`}
                        values={run.data.map((r) => r[v.id])}
                      />
                    ))}
                  </div>
                  <details>
                    <summary>查看前 8 行样本</summary>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            {model.variables.map((v) => (
                              <th key={v.id}>{v.id}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {run.data.slice(0, 8).map((row, i) => (
                            <tr key={i}>
                              {model.variables.map((v) => (
                                <td key={v.id}>{format(row[v.id])}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </section>
            <section className="panel" id="analysis">
              <p className="eyebrow">03 / OBSERVATION ≠ INTERVENTION</p>
              <h2>观察性分析</h2>
              {!run ? (
                <p className="empty">先生成数据，再比较关联与处理效应估计。</p>
              ) : (
                <>
                  <div className="metric">
                    <h3>描述性 Pearson 相关性</h3>
                    <strong>
                      {run.observation.correlation.ok
                        ? format(run.observation.correlation.value)
                        : "不适用"}
                    </strong>
                    <p>
                      n={run.observation.correlation.n} ·{" "}
                      {run.observation.correlation.ok
                        ? "相关性描述共同变化，不代表因果效应。"
                        : run.observation.correlation.reason}
                    </p>
                  </div>
                  <div className="metric-grid">
                    <Est
                      title="观察性：朴素二元均值差"
                      result={run.observation.naive}
                    />
                    <Est
                      title="观察性：基本线性回归"
                      result={run.observation.regression}
                    />
                    <Est
                      title="观察性：全部处理父变量调整"
                      result={run.observation.adjusted}
                    />
                  </div>
                  <p className="caption">
                    调整集：
                    {run.observation.adjustmentParents.join(", ") ||
                      "空集（无处理父节点）"}
                    。{run.observation.adjustmentNote}
                  </p>
                  <h3>条件筛选与分组统计</h3>
                  <p className="caption">{run.observation.groupNote}</p>
                  {!run.observation.groups.length ? (
                    <p>
                      选择一个二元条件分组变量以查看 0/1 组；连续分组不适用。
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <caption>
                          按 {run.settings.group} 筛选；均值差方向为处理 1
                          减处理 0，不是 do 干预。
                        </caption>
                        <thead>
                          <tr>
                            <th>组</th>
                            <th>组 n</th>
                            <th>X=0 n / 均值</th>
                            <th>X=1 n / 均值</th>
                            <th>均值差</th>
                            <th>条件相关</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.observation.groups.map((g) => (
                            <tr key={g.value}>
                              <th>
                                {run.settings.group}={g.value}
                              </th>
                              <td>{g.n}</td>
                              <td>
                                {g.control.n} / {format(g.control.mean)}
                              </td>
                              <td>
                                {g.treated.n} / {format(g.treated.mean)}
                              </td>
                              <td
                                title={
                                  g.difference.ok
                                    ? `95% CI [${g.difference.ci.join(", ")}]`
                                    : g.difference.reason
                                }
                              >
                                {g.difference.ok
                                  ? format(g.difference.value)
                                  : "不适用"}
                              </td>
                              <td>
                                {g.correlation.ok
                                  ? format(g.correlation.value)
                                  : g.correlation.reason}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </section>
            <section className="panel" id="intervention">
              <p className="eyebrow">04 / DO-OPERATOR</p>
              <h2>替换方程，比较两个世界</h2>
              <p>
                <code>ATE = E[Y | do(X=b)] − E[Y | do(X=a)]</code>
                。固定处理值，删除其入边的作用，保持其他方程和外生噪声；按依赖顺序重算后代。
              </p>
              <div className="toolbar">
                <NumberField
                  label="干预值 a"
                  value={settings.low}
                  step={0.1}
                  min={-100}
                  max={100}
                  onChange={(low) => editSettings({ low })}
                />
                <NumberField
                  label="干预值 b"
                  value={settings.high}
                  step={0.1}
                  min={-100}
                  max={100}
                  onChange={(high) => editSettings({ high })}
                />
                <button
                  className="primary"
                  disabled={!valid || !run}
                  onClick={() =>
                    attempt(() => {
                      if (run) {
                        setIntervention(
                          interventionAnalysis(run.model, run.settings),
                        );
                        setMessage("干预完成：比较共同外生噪声下的两个世界。");
                      }
                    })
                  }
                >
                  执行 do 干预
                </button>
              </div>
              <p className="caption">
                二元处理支持
                a=0、b=1；修改干预值后需重新生成实验。连续处理比较的是指定区间的总效应，而非单位斜率。
              </p>
              <div className="metric truth">
                <h3>当前模型真实 ATE（解析值）</h3>
                <strong data-testid="true-ate">{format(truth)}</strong>
                <p>只适用于当前合成模型的结构假设。</p>
              </div>
              {intervention && (
                <>
                  <div className="metric-grid">
                    <Est
                      title="干预样本估计 ATE"
                      result={intervention.result.ate}
                    />
                    <article className="metric">
                      <h3>估计 − 真实</h3>
                      <strong data-testid="ate-error">
                        {format(intervention.result.error)}
                      </strong>
                      <p>
                        do(a) 均值 {format(intervention.result.lowSummary.mean)}
                        <br />
                        do(b) 均值{" "}
                        {format(intervention.result.highSummary.mean)}
                      </p>
                    </article>
                  </div>
                  <p className="caption">
                    {intervention.result.method}
                    。线性加性结果的个体差可能完全相同，标准误与误差为零是该模型性质。
                  </p>
                  <div className="chart-grid">
                    <Distribution
                      title={`do(${settings.treatment}=${settings.low}) 的 ${settings.outcome}`}
                      values={intervention.worlds.low.map(
                        (r) => r[settings.outcome],
                      )}
                    />
                    <Distribution
                      title={`do(${settings.treatment}=${settings.high}) 的 ${settings.outcome}`}
                      values={intervention.worlds.high.map(
                        (r) => r[settings.outcome],
                      )}
                    />
                  </div>
                </>
              )}
            </section>
            <section className="panel" id="export">
              <p className="eyebrow">05 / SAVE & REPLAY</p>
              <h2>导入、导出与复现</h2>
              <div className="toolbar">
                <button
                  disabled={!!modelError}
                  onClick={() =>
                    attempt(() =>
                      download(
                        "causallab-model.json",
                        JSON.stringify(validateModel(model), null, 2),
                        "application/json",
                      ),
                    )
                  }
                >
                  导出模型 JSON
                </button>
                <button
                  disabled={!valid}
                  onClick={() =>
                    attempt(() =>
                      download(
                        "causallab-experiment.json",
                        experimentJSON(model, settings),
                        "application/json",
                      ),
                    )
                  }
                >
                  导出实验参数 JSON
                </button>
                <button
                  disabled={!report}
                  onClick={() =>
                    attempt(() => {
                      if (report)
                        download(
                          "causallab-results.json",
                          JSON.stringify(report, null, 2),
                          "application/json",
                        );
                    })
                  }
                >
                  导出分析 JSON
                </button>
                <button
                  disabled={!report}
                  onClick={() =>
                    attempt(() => {
                      if (report)
                        download(
                          "causallab-results.csv",
                          reportCSV(report),
                          "text/csv;charset=utf-8",
                        );
                    })
                  }
                >
                  导出分析 CSV
                </button>
              </div>
              <p className="caption">
                实验参数文件保存模型、n、seed、分析变量与干预值；结果文件另含统计口径、真实效应及估计。结果
                JSON 用于阅读；复现请导入实验参数 JSON。
              </p>
              <div className="toolbar">
                <label>
                  导入类型
                  <select
                    aria-label="导入类型"
                    value={importMode}
                    onChange={(e) => setImportMode(e.target.value)}
                  >
                    <option value="model">模型 JSON</option>
                    <option value="experiment">实验参数 JSON</option>
                  </select>
                </label>
                <label>
                  导入文件
                  <input
                    aria-label="导入文件"
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > MAX_IMPORT_BYTES) {
                        setError("导入文件不能超过 64 KiB");
                        return;
                      }
                      void file
                        .text()
                        .then(importContent)
                        .catch(() => setError("文件读取失败"));
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <label>
                JSON 内容
                <textarea
                  aria-label="JSON 内容"
                  rows={6}
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  maxLength={MAX_IMPORT_BYTES}
                  placeholder="粘贴导出的模型或实验 JSON"
                />
              </label>
              <button onClick={() => importContent(importText)}>
                校验并导入 JSON
              </button>
              <p className="caption">
                导入上限 64 KiB、12
                个变量；拒绝未知字段、循环、非法参数和非有限数值。不执行任何输入代码。
              </p>
            </section>
          </div>
        </div>
        <footer>
          所有数据由当前模型生成。统计区间依赖样本与模型假设；教学实验不能替代真实研究中的识别与验证。
        </footer>
      </main>
    </>
  );
}
