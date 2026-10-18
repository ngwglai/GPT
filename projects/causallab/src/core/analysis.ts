import { compileModel, descendants, type Model } from "./model";
import {
  condition,
  intervene,
  trueATE,
  type Data,
  type SampleConfig,
} from "./simulation";
import {
  correlation,
  meanEstimate,
  naive,
  regression,
  standardized,
  summarize,
  unavailable,
  values,
} from "./statistics";
export interface Settings extends SampleConfig {
  treatment: string;
  outcome: string;
  group: string;
  low: number;
  high: number;
}
export function checkSettings(model: Model, s: Settings) {
  if (s.treatment === s.outcome)
    throw new Error("请选择不同的处理变量和结果变量");
  for (const id of [s.treatment, s.outcome, ...(s.group ? [s.group] : [])])
    if (!model.variables.some((v) => v.id === id))
      throw new Error("分析变量不存在");
}
export function observe(model: Model, data: Data, s: Settings) {
  const checked = compileModel(model).model;
  checkSettings(checked, s);
  const x = checked.variables.find((v) => v.id === s.treatment)!,
    parents = Object.keys(x.weights);
  const adjustment = parents.includes(s.outcome)
    ? unavailable("结果变量是处理的父变量，该调整估计不适用", data.length)
    : x.kind === "bernoulli" &&
        parents.every(
          (id) =>
            checked.variables.find((v) => v.id === id)?.kind === "bernoulli",
        )
      ? standardized(data, s.treatment, s.outcome, parents)
      : regression(data, s.treatment, s.outcome, parents);
  const groupVariable = checked.variables.find((v) => v.id === s.group);
  const groups =
    groupVariable?.kind === "bernoulli"
      ? [0, 1].map((value) => {
          const selected = condition(data, s.group, value);
          return {
            value,
            n: selected.length,
            control: summarize(
              selected
                .filter((r) => r[s.treatment] === 0)
                .map((r) => r[s.outcome]),
            ),
            treated: summarize(
              selected
                .filter((r) => r[s.treatment] === 1)
                .map((r) => r[s.outcome]),
            ),
            difference: naive(selected, s.treatment, s.outcome),
            correlation: correlation(
              values(selected, s.treatment),
              values(selected, s.outcome),
            ),
          };
        })
      : [];
  return {
    n: data.length,
    summaries: checked.variables.map((v) => ({
      id: v.id,
      label: v.label,
      ...summarize(values(data, v.id)),
    })),
    correlation: correlation(
      values(data, s.treatment),
      values(data, s.outcome),
    ),
    naive:
      x.kind === "bernoulli"
        ? naive(data, s.treatment, s.outcome)
        : unavailable(
            "朴素均值差只适用于二元处理；请查看连续处理的 OLS",
            data.length,
          ),
    regression: regression(data, s.treatment, s.outcome),
    adjusted: adjustment,
    adjustmentParents: parents,
    adjustmentNote:
      "全部变量可观测、结构方程正确、无隐藏混杂且有处理重叠时，处理的全部父变量满足后门调整；否则仅为模型内观察性估计。",
    groupNote:
      descendants(checked, s.treatment).includes(s.group) ||
      descendants(checked, s.outcome).includes(s.group)
        ? "当前分组变量是后代；这里只做条件关联展示，不作混杂调整。"
        : "分组展示采用观察性条件筛选，不替换任何结构方程。",
    groups,
  };
}
export function interventionAnalysis(model: Model, s: Settings) {
  checkSettings(model, s);
  const worlds = intervene(model, s, s.treatment, s.low, s.high);
  const differences = worlds.high.map(
    (row, i) => row[s.outcome] - worlds.low[i][s.outcome],
  );
  const truth = trueATE(model, s.treatment, s.outcome, s.low, s.high),
    ate = meanEstimate(differences);
  return {
    worlds,
    result: {
      n: s.n,
      low: s.low,
      high: s.high,
      lowSummary: summarize(values(worlds.low, s.outcome)),
      highSummary: summarize(values(worlds.high, s.outcome)),
      trueATE: truth,
      ate,
      error: ate.ok ? ate.value - truth : null,
      method:
        "共同外生噪声的配对 Monte Carlo；ATE=E[Y|do(X=high)]−E[Y|do(X=low)]；区间使用个体配对差的标准误",
    },
  };
}
