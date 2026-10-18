import {
  finite,
  keys,
  MAX_IMPORT_BYTES,
  record,
  validateModel,
  type Model,
} from "./model";
import { checkIntervention, checkSample, trueATE } from "./simulation";
import {
  checkSettings,
  type Settings,
  type observe,
  type interventionAnalysis,
} from "./analysis";
export interface Experiment {
  format: "causallab-experiment-v1";
  model: Model;
  settings: Settings;
}
export interface Report extends Experiment {
  semantics: string;
  trueATE: number;
  observation: ReturnType<typeof observe>;
  intervention: ReturnType<typeof interventionAnalysis>["result"] | null;
}
function parse(text: string): unknown {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error("导入文件不能超过 64 KiB");
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("JSON 格式不合法");
  }
}
export function parseModel(text: string): Model {
  return validateModel(parse(text));
}
export function validateSettings(model: Model, input: unknown): Settings {
  const s = record(input);
  keys(s, ["n", "seed", "treatment", "outcome", "group", "low", "high"]);
  if (
    typeof s.treatment !== "string" ||
    typeof s.outcome !== "string" ||
    typeof s.group !== "string"
  )
    throw new Error("分析变量必须是字符串 ID");
  const checked: Settings = {
    n: finite(s.n, "样本量", 20_000),
    seed: finite(s.seed, "种子", 0xffffffff),
    treatment: s.treatment,
    outcome: s.outcome,
    group: s.group,
    low: finite(s.low, "低干预值"),
    high: finite(s.high, "高干预值"),
  };
  checkSample(checked);
  checkSettings(model, checked);
  checkIntervention(model, checked.treatment, checked.low);
  checkIntervention(model, checked.treatment, checked.high);
  return checked;
}
export function parseExperiment(text: string): Experiment {
  const obj = record(parse(text));
  keys(obj, ["format", "model", "settings"]);
  if (obj.format !== "causallab-experiment-v1")
    throw new Error("实验格式不支持");
  const model = validateModel(obj.model);
  return {
    format: obj.format,
    model,
    settings: validateSettings(model, obj.settings),
  };
}
export function experimentJSON(model: Model, settings: Settings): string {
  return JSON.stringify(
    {
      format: "causallab-experiment-v1",
      model: validateModel(model),
      settings: validateSettings(model, settings),
    },
    null,
    2,
  );
}
export function makeReport(
  model: Model,
  settings: Settings,
  observation: Report["observation"],
  intervention: Report["intervention"],
): Report {
  const validated = validateModel(model);
  validateSettings(validated, settings);
  return {
    format: "causallab-experiment-v1",
    model: validated,
    settings,
    semantics:
      "描述性统计与观察性关联不是现实因果结论；真实效应仅属于当前合成 SCM。方差为 n−1 样本方差；区间为模型假设下 95% 区间。",
    trueATE: trueATE(
      model,
      settings.treatment,
      settings.outcome,
      settings.low,
      settings.high,
    ),
    observation,
    intervention,
  };
}
function csvCell(value: unknown) {
  let s =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function reportCSV(report: Report): string {
  const rows: unknown[][] = [
    [
      "scope",
      "metric",
      "group",
      "n",
      "estimate",
      "se",
      "ci_low",
      "ci_high",
      "reason_or_method",
      "seed",
      "true_ATE",
      "model_JSON",
      "settings_JSON",
    ],
    [
      "metadata",
      "semantics",
      "",
      report.settings.n,
      "",
      "",
      "",
      "",
      report.semantics,
      report.settings.seed,
      report.trueATE,
      JSON.stringify(report.model),
      JSON.stringify(report.settings),
    ],
  ];
  function add(
    scope: string,
    metric: string,
    group: string,
    result: Report["observation"]["naive"],
  ) {
    rows.push([
      scope,
      metric,
      group,
      result.n,
      result.ok ? result.value : "",
      result.ok ? result.se : "",
      result.ok ? result.ci[0] : "",
      result.ok ? result.ci[1] : "",
      result.ok ? result.note : result.reason,
      report.settings.seed,
      report.trueATE,
      "",
      "",
    ]);
  }
  for (const s of report.observation.summaries)
    for (const metric of ["mean", "variance", "sd", "min", "max"] as const)
      rows.push([
        "descriptive",
        s.id + "." + metric,
        "",
        s.n,
        s[metric],
        "",
        "",
        "",
        "n−1 sample variance",
        report.settings.seed,
        report.trueATE,
        "",
        "",
      ]);
  const corr = report.observation.correlation;
  rows.push([
    "descriptive",
    "correlation",
    "",
    corr.n,
    corr.ok ? corr.value : "",
    "",
    "",
    "",
    corr.ok ? "Pearson" : corr.reason,
    report.settings.seed,
    report.trueATE,
    "",
    "",
  ]);
  add("observational", "naive", "all", report.observation.naive);
  add("observational", "OLS", "all", report.observation.regression);
  add("observational", "adjusted", "all", report.observation.adjusted);
  for (const group of report.observation.groups) {
    const name = report.settings.group + "=" + group.value;
    add("conditional", "difference", name, group.difference);
    for (const [label, s] of [
      ["control", group.control],
      ["treated", group.treated],
    ] as const)
      rows.push([
        "conditional",
        label + ".mean",
        name,
        s.n,
        s.mean,
        "",
        "",
        "",
        "observational selection",
        report.settings.seed,
        report.trueATE,
        "",
        "",
      ]);
    rows.push([
      "conditional",
      "correlation",
      name,
      group.correlation.n,
      group.correlation.ok ? group.correlation.value : "",
      "",
      "",
      "",
      group.correlation.ok ? "Pearson" : group.correlation.reason,
      report.settings.seed,
      report.trueATE,
      "",
      "",
    ]);
  }
  if (report.intervention) {
    add("interventional", "paired_ATE", "do", report.intervention.ate);
    for (const [label, s] of [
      ["low", report.intervention.lowSummary],
      ["high", report.intervention.highSummary],
    ] as const)
      rows.push([
        "interventional",
        label + ".mean",
        "do",
        s.n,
        s.mean,
        "",
        "",
        "",
        report.intervention.method,
        report.settings.seed,
        report.trueATE,
        "",
        "",
      ]);
    rows.push([
      "interventional",
      "estimate_minus_truth",
      "do",
      report.settings.n,
      report.intervention.error,
      "",
      "",
      "",
      report.intervention.method,
      report.settings.seed,
      report.trueATE,
      "",
      "",
    ]);
  }
  return "\ufeff" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
