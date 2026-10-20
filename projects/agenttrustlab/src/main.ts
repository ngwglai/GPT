import "./style.css";
import { getScenarios } from "./scenarios";
import { runExperiment, replayExperiment } from "./experiment";
import {
  defaultConfig,
  MAX_IMPORT_BYTES,
  parseConfig,
  validateConfig,
} from "./validation";
import { exportConfig, exportCsv, exportExperiment } from "./serialization";
import {
  OPERATIONS,
  POLICY_NAMES,
  POLICIES,
  RESOURCES,
  SCOPES,
  TOOLS,
  type Experiment,
  type ExperimentConfig,
  type Trace,
} from "./types";
const trustNames = {
  user: "用户输入",
  document: "不可信文档",
  tool: "不可信工具返回",
};
const riskNames = { low: "低风险", medium: "中风险", high: "高风险" };
const checkNames = {
  parameters: "参数约束",
  tool: "工具白名单",
  resource: "资源范围",
  operation: "操作权限",
  task: "任务范围",
  confirmation: "额外确认",
};
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text = "",
  className = "",
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  n.textContent = text;
  n.className = className;
  return n;
}
const app = document.querySelector<HTMLDivElement>("#app")!;
const aside = el("aside");
aside.append(
  el("div", "AT / LAB", "brand"),
  el("p", "信任从边界开始", "muted"),
);
for (const [id, name] of [
  ["overview", "01 实验概览"],
  ["scenarios", "02 场景选择"],
  ["policies", "03 防御策略"],
  ["results", "04 实验比较"],
  ["traces", "05 执行轨迹"],
  ["data", "06 数据管理"],
]) {
  const a = el("a", name);
  a.href = `#${id}`;
  aside.append(a);
}
const theme = el("button", "切换深浅主题");
theme.onclick = () => document.documentElement.classList.toggle("dark");
aside.append(
  theme,
  el("p", "v0.1 · 完全本地模拟\n无真实工具 · 无付费 API", "aside-foot"),
);
const main = el("main");
app.append(aside, main);
const header = el("header");
header.append(
  el("span", "LOCAL / DETERMINISTIC / AUDITABLE", "eyebrow"),
  el("h1", "AgentTrustLab"),
  el("p", "AI 智能体信任边界与工具授权实验室", "subtitle"),
  el(
    "p",
    "同一组请求，四种授权策略。观察每一次允许、拒绝与模拟执行，理解最小权限的实际作用。",
  ),
);
main.append(header);
function section(id: string, title: string, description: string) {
  const s = el("section");
  s.id = id;
  s.append(el("h2", title), el("p", description, "muted"));
  main.append(s);
  return s;
}
const overview = section(
  "overview",
  "实验概览",
  "这是确定性模拟平台。结果只适用于内置场景与实现策略，不代表真实 LLM 的普遍安全率。",
);
const cards = el("div", "", "cards");
for (const [number, label] of [
  ["18", "可复现场景"],
  ["12 / 6", "恶意 / 正常请求"],
  ["4", "独立策略"],
  ["0", "真实工具调用"],
]) {
  const c = el("div", "", "card");
  c.append(el("strong", number), el("span", label));
  cards.append(c);
}
overview.append(
  cards,
  el(
    "p",
    "请求被提出 → 独立授权检查 → 一次性授权凭证 → 模拟工具执行 → 原始轨迹与指标",
    "flow",
  ),
);
let config = defaultConfig();
let confirmations = new Set<string>();
let result: Experiment | undefined;
let lastRun: Experiment | undefined;
const scenarioSection = section(
  "scenarios",
  "场景选择",
  "输入信任等级与恶意标签用于解释和统计。授权逻辑依据工具、资源、操作和可信任务权限作判断；所有数据均为虚构。",
);
const selectionActions = el("div", "", "actions");
const scenarioList = el("div", "", "scenario-grid");
const scenarioInputs = new Map<string, HTMLInputElement>();
const confirmationInputs = new Map<string, HTMLInputElement>();
function checkbox(
  labelText: string,
  checked: boolean,
  onChange: (checked: boolean) => void,
) {
  const label = el("label", "", "check");
  const input = el("input");
  input.type = "checkbox";
  input.checked = checked;
  input.onchange = () => onChange(input.checked);
  label.append(input, document.createTextNode(labelText));
  return { label, input };
}
for (const [label, predicate] of [
  ["全部场景", () => true],
  ["仅恶意", (s: ReturnType<typeof getScenarios>[number]) => s.malicious],
  ["仅正常", (s: ReturnType<typeof getScenarios>[number]) => !s.malicious],
] as const) {
  const b = el("button", label);
  b.onclick = () => {
    config.scenarioIds = getScenarios()
      .filter(predicate)
      .map((s) => s.id);
    confirmations.clear();
    sync();
    invalidate();
  };
  selectionActions.append(b);
}
scenarioSection.append(selectionActions, scenarioList);
for (const s of getScenarios()) {
  const card = el("article", "", "scenario-card");
  const choice = checkbox(`${s.id} ${s.name}`, true, (checked) => {
    config.scenarioIds = checked
      ? [...config.scenarioIds, s.id]
      : config.scenarioIds.filter((id) => id !== s.id);
    if (!checked) confirmations.delete(s.id);
    sync();
    invalidate();
  });
  scenarioInputs.set(s.id, choice.input);
  const detail = el("details");
  detail.append(el("summary", "查看任务、输入与权限"));
  for (const [label, value] of [
    ["用户任务", s.userTask],
    ["不可信输入", s.untrustedInput],
    ["模拟请求", JSON.stringify(s.request, null, 2)],
    ["任务授权", `${s.taskScope}\n${JSON.stringify(s.grants, null, 2)}`],
    ["预期", s.expected],
  ])
    detail.append(el("h4", label), el("pre", value));
  card.append(
    choice.label,
    el(
      "p",
      `${s.malicious ? "恶意请求" : "正常请求"} · ${s.category} · ${trustNames[s.trust]} · ${riskNames[s.risk]}`,
      s.malicious ? "tag danger" : "tag",
    ),
    detail,
  );
  if (s.risk === "high") {
    const c = checkbox(`模拟确认（非真实授权）：${s.id}`, false, (checked) => {
      if (checked) confirmations.add(s.id);
      else confirmations.delete(s.id);
      invalidate();
    });
    confirmationInputs.set(s.id, c.input);
    card.append(c.label);
  }
  scenarioList.append(card);
}
const policySection = section(
  "policies",
  "防御策略配置",
  "白名单检查工具与操作；最小权限再检查资源及可信任务精确授权；确认策略再要求应用层模拟确认。基线仍执行模拟器参数安全校验。",
);
const policyChoices = el("fieldset");
policyChoices.append(el("legend", "选择参与比较的策略"));
const policyInputs = new Map<string, HTMLInputElement>();
for (const policy of POLICIES) {
  const c = checkbox(POLICY_NAMES[policy], true, (checked) => {
    config.policies = checked
      ? [...config.policies, policy]
      : config.policies.filter((p) => p !== policy);
    invalidate();
  });
  policyInputs.set(policy, c.input);
  policyChoices.append(c.label);
}
policySection.append(policyChoices);
const configGrid = el("div", "", "config-grid");
const settingInputs = new Map<string, HTMLInputElement>();
for (const [key, name, values] of [
  ["tools", "工具白名单", TOOLS],
  ["resources", "资源访问范围", RESOURCES],
  ["operations", "允许的操作", OPERATIONS],
  ["taskScopes", "任务级范围", SCOPES],
] as const) {
  const f = el("fieldset");
  f.append(el("legend", name));
  for (const value of values) {
    const c = checkbox(
      value,
      (config.settings[key] as readonly string[]).includes(value),
      (checked) => {
        const list = config.settings[key] as string[];
        if (checked) list.push(value);
        else list.splice(list.indexOf(value), 1);
        invalidate();
      },
    );
    settingInputs.set(`${key}:${value}`, c.input);
    f.append(c.label);
  }
  configGrid.append(f);
}
const requireConfirm = checkbox(
  "确认策略要求高风险操作显式模拟确认",
  true,
  (checked) => {
    config.settings.requireConfirmation = checked;
    invalidate();
  },
);
policySection.append(
  configGrid,
  requireConfirm.label,
  el(
    "p",
    "关闭确认要求将降低保护。模拟确认绑定单个场景请求，不可信输入中的“已确认”不生效。",
    "notice",
  ),
);
const resultSection = section(
  "results",
  "批量运行与结果比较",
  "每个策略使用相同场景、参数与固定种子顺序。百分比由原始记录计算；无样本分母显示“无样本”。",
);
const runActions = el("div", "", "actions");
const seedLabel = el("label", "固定种子 ");
const seed = el("input");
seed.type = "number";
seed.min = "0";
seed.max = "4294967295";
seed.value = String(config.seed);
seed.setAttribute("aria-label", "固定种子");
seed.oninput = () => {
  config.seed = seed.value === "" ? NaN : Number(seed.value);
  invalidate();
};
seedLabel.append(seed);
const runButton = el("button", "运行批量实验", "primary");
const replay = el("button", "重放上次实验");
replay.disabled = true;
const status = el("p", "尚未运行。默认选中 18 个场景和四种策略。", "status");
status.setAttribute("role", "status");
const output = el("div");
runActions.append(seedLabel, runButton, replay);
resultSection.append(runActions, status, output);
const traceSection = section(
  "traces",
  "执行轨迹",
  "分别记录请求提出、授权决定和执行结果。授权允许并不保证模拟工具成功。点击记录查看六项授权检查。",
);
const filterLabel = el("label", "策略筛选 ");
const traceFilter = el("select");
traceFilter.setAttribute("aria-label", "策略筛选");
traceFilter.append(new Option("全部策略", "all"));
for (const p of POLICIES) traceFilter.append(new Option(POLICY_NAMES[p], p));
filterLabel.append(traceFilter);
traceSection.append(filterLabel);
const traceList = el("div", "", "scroll");
const traceDetail = el("div", "", "trace-detail");
traceSection.append(traceList, traceDetail);
traceFilter.onchange = renderTraces;
const dataSection = section(
  "data",
  "数据导入导出",
  "仅导入有界配置，不导入代码、场景、授权结果或确认凭据。导入后清除旧结果及模拟确认。结果 JSON 含配置、原始轨迹和指标；CSV 每行保留完整轨迹 JSON。数据不上传外部服务。",
);
const dataActions = el("div", "", "actions");
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const configExport = el("button", "导出配置 JSON");
configExport.onclick = () => {
  try {
    download(
      "agenttrustlab-config.json",
      exportConfig(config),
      "application/json",
    );
  } catch (e) {
    reportError(e);
  }
};
const jsonExport = el("button", "导出结果 JSON");
jsonExport.disabled = true;
jsonExport.onclick = () => {
  if (result)
    download(
      "agenttrustlab-results.json",
      exportExperiment(result),
      "application/json",
    );
};
const csvExport = el("button", "导出轨迹 CSV");
csvExport.disabled = true;
csvExport.onclick = () => {
  if (result)
    download(
      "agenttrustlab-traces.csv",
      exportCsv(result),
      "text/csv;charset=utf-8",
    );
};
const importLabel = el("label", "导入配置文件（JSON，≤128 KiB）");
const file = el("input");
file.type = "file";
file.accept = ".json,application/json";
file.setAttribute("aria-label", "导入配置文件");
importLabel.append(file);
file.onchange = async () => {
  const selected = file.files?.[0];
  if (!selected) return;
  try {
    if (selected.size > MAX_IMPORT_BYTES) throw new Error("配置超过 128 KiB");
    applyConfig(parseConfig(await selected.text()));
    status.textContent = "配置导入成功；旧结果与模拟确认已清除。";
  } catch (e) {
    reportError(e);
  } finally {
    file.value = "";
  }
};
const textLabel = el("label", "配置 JSON 文本");
const configText = el("textarea");
configText.rows = 7;
configText.maxLength = MAX_IMPORT_BYTES;
configText.setAttribute("aria-label", "配置 JSON 文本");
configText.placeholder = "粘贴导出的配置 JSON";
textLabel.append(configText);
const importText = el("button", "校验并导入文本");
importText.onclick = () => {
  try {
    applyConfig(parseConfig(configText.value));
    status.textContent = "配置导入成功；旧结果与模拟确认已清除。";
  } catch (e) {
    reportError(e);
  }
};
dataActions.append(configExport, jsonExport, csvExport);
dataSection.append(dataActions, importLabel, textLabel, importText);
function reportError(error: unknown) {
  status.textContent = error instanceof Error ? error.message : "实验失败";
  status.classList.add("error");
}
function invalidate() {
  result = undefined;
  output.replaceChildren();
  traceList.replaceChildren();
  traceDetail.replaceChildren();
  jsonExport.disabled = true;
  csvExport.disabled = true;
  status.classList.remove("error");
  status.textContent =
    "配置已变化，请重新运行；重放按钮使用上次实验的完整快照。";
}
function sync() {
  for (const [id, input] of scenarioInputs)
    input.checked = config.scenarioIds.includes(id);
  for (const [id, input] of confirmationInputs) {
    input.checked = confirmations.has(id);
    input.disabled = !config.scenarioIds.includes(id);
  }
  for (const [id, input] of policyInputs)
    input.checked = config.policies.some((p) => p === id);
  for (const [key, input] of settingInputs) {
    const [group, value] = key.split(":");
    input.checked = (
      config.settings[
        group as "tools" | "resources" | "operations" | "taskScopes"
      ] as readonly string[]
    ).includes(value);
  }
  seed.value = String(config.seed);
  requireConfirm.input.checked = config.settings.requireConfirmation;
}
function applyConfig(value: ExperimentConfig) {
  config = validateConfig(value);
  confirmations.clear();
  sync();
  invalidate();
}
runButton.onclick = () => {
  try {
    display(runExperiment(config, [...confirmations]));
  } catch (e) {
    invalidate();
    reportError(e);
  }
};
replay.onclick = () => {
  if (!lastRun) return;
  const repeated = replayExperiment(lastRun);
  config = repeated.config;
  confirmations = new Set(repeated.simulatedConfirmations);
  sync();
  display(repeated);
  status.textContent += " 已按上次快照重放。";
};
function rate(value: number | null) {
  return value === null ? "无样本" : `${(value * 100).toFixed(1)}%`;
}
function table(headings: string[]) {
  const t = el("table");
  const row = el("tr");
  for (const title of headings) row.append(el("th", title));
  const head = el("thead");
  head.append(row);
  const body = el("tbody");
  t.append(head, body);
  return { t, body };
}
function display(value: Experiment) {
  result = value;
  lastRun = value;
  replay.disabled = false;
  jsonExport.disabled = false;
  csvExport.disabled = false;
  status.classList.remove("error");
  status.textContent = `已完成：${value.config.scenarioIds.length} 场景 × ${value.config.policies.length} 策略 = ${value.records.length} 条请求记录；种子 ${value.config.seed}。模拟确认 ${value.simulatedConfirmations.length} 项（非真实授权）。`;
  output.replaceChildren();
  const wrapper = el("div", "", "scroll");
  const { t, body } = table([
    "策略",
    "总数",
    "恶意 / 正常",
    "允许 / 拒绝",
    "执行成功 / 失败",
    "未授权成功",
    "攻击成功率",
    "恶意阻断率",
    "正常误阻断率",
  ]);
  for (const policy of value.config.policies) {
    const m = value.metrics[policy]!;
    const row = el("tr");
    for (const cell of [
      POLICY_NAMES[policy],
      m.total,
      `${m.malicious} / ${m.normal}`,
      `${m.allowed} / ${m.denied}`,
      `${m.executed} / ${m.executionFailed}`,
      m.unauthorizedSuccess,
      `${rate(m.attackSuccessRate)} (${m.unauthorizedSuccess}/${m.malicious})`,
      `${rate(m.maliciousBlockRate)} (${m.maliciousBlocked}/${m.malicious})`,
      `${rate(m.falseBlockRate)} (${m.normalBlocked}/${m.normal})`,
    ])
      row.append(el("td", String(cell)));
    body.append(row);
  }
  wrapper.append(t);
  output.append(
    wrapper,
    el(
      "p",
      "蓝 = 攻击成功率；绿 = 恶意阻断率；橙 = 正常误阻断率。表中显示真实分子 / 分母。",
      "muted",
    ),
  );
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute(
    "viewBox",
    `0 0 760 ${value.config.policies.length * 94 + 20}`,
  );
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "策略指标比较图");
  value.config.policies.forEach((p, i) => {
    const label = document.createElementNS(ns, "text");
    label.textContent = POLICY_NAMES[p];
    label.setAttribute("x", "5");
    label.setAttribute("y", String(i * 94 + 24));
    svg.append(label);
    [
      value.metrics[p]!.attackSuccessRate,
      value.metrics[p]!.maliciousBlockRate,
      value.metrics[p]!.falseBlockRate,
    ].forEach((v, j) => {
      const y = i * 94 + j * 23 + 8;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", "250");
      rect.setAttribute("y", String(y));
      rect.setAttribute("height", "14");
      rect.setAttribute("width", String((v ?? 0) * 380));
      rect.setAttribute("class", `bar bar-${j}`);
      const text = document.createElementNS(ns, "text");
      text.textContent = rate(v);
      text.setAttribute("x", "650");
      text.setAttribute("y", String(y + 12));
      svg.append(rect, text);
    });
  });
  output.append(svg);
  renderTraces();
}
function executionName(r: Trace) {
  return r.execution.status === "success"
    ? "正常完成"
    : r.execution.status === "failure"
      ? "模拟工具失败"
      : "授权失败 / 未执行";
}
function renderTraces() {
  traceList.replaceChildren();
  traceDetail.replaceChildren();
  if (!result) return;
  const { t, body } = table([
    "场景 / 策略",
    "请求",
    "授权",
    "模拟执行",
    "详情",
  ]);
  const records = result.records.filter(
    (r) => traceFilter.value === "all" || r.policy === traceFilter.value,
  );
  for (const r of records) {
    const row = el("tr");
    row.append(
      el("td", `${r.scenarioId} · ${POLICY_NAMES[r.policy]}`),
      el("td", "已提出"),
      el("td", r.authorization.allowed ? "允许" : "拒绝"),
      el("td", executionName(r)),
    );
    const cell = el("td");
    const b = el("button", `详情 ${r.scenarioId} ${r.policy}`);
    b.onclick = () => showTrace(r);
    cell.append(b);
    row.append(cell);
    body.append(row);
  }
  traceList.append(t);
  if (records[0]) showTrace(records[0]);
}
function showTrace(r: Trace) {
  traceDetail.replaceChildren(
    el("h3", `${r.scenarioName} / ${POLICY_NAMES[r.policy]}`),
    el(
      "p",
      `输入信任等级：${trustNames[r.trust]}；风险：${riskNames[r.risk]}；确认来源：${r.confirmation === "simulated" ? "应用层模拟确认（非真实用户授权）" : "无"}`,
    ),
    el("pre", JSON.stringify(r.request, null, 2)),
  );
  for (const c of r.authorization.checks)
    traceDetail.append(
      el(
        "p",
        `${c.status === "pass" ? "✓" : c.status === "fail" ? "✕" : "—"} ${checkNames[c.name]}：${c.reason}`,
        c.status === "fail" ? "error" : "",
      ),
    );
  traceDetail.append(
    el(
      "p",
      `授权${r.authorization.allowed ? "允许" : "拒绝"}：${r.authorization.reasons.join("；")}`,
    ),
    el("p", `${executionName(r)}：${r.execution.message}`),
  );
}
