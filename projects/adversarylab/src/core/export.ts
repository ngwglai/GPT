import type { BatchConfig, Snapshot } from "./types";
import { labels, metricDefinitions } from "./types";
import { summarize } from "./statistics";
export function report(config: BatchConfig, snapshot: Snapshot) {
  const records = [
    ...snapshot.results,
    ...(snapshot.current ? [snapshot.current] : []),
  ];
  return {
    schema: "adversarylab/v0.1",
    config,
    status: snapshot.status,
    error: snapshot.error ?? null,
    costDefinition: labels[config.experiment.metric],
    metricSemantics: metricDefinitions[config.experiment.metric],
    allMetricDefinitions: metricDefinitions,
    budgetRule:
      "合法候选均真实执行并消耗一次评价，包括重复候选；非法候选仅计生成和拒绝；评价异常消耗评价并终止；生成异常不消耗评价并终止",
    graphRule:
      "简单有向图，固定节点/边数，邻接升序，起点0/终点n-1；BFS/DFS路径距离为边数，Dijkstra为权重和",
    records,
    statisticsPopulation:
      "only evaluation-budget-completed runs; all started runs remain in records",
    statistics: summarize(records),
    exact: snapshot.exact,
  };
}
function cell(value: unknown): string {
  const text = String(value ?? "");
  return '"' + text.replaceAll('"', '""') + '"';
}
export function csv(config: BatchConfig, snapshot: Snapshot): string {
  const data = report(config, snapshot);
  const columns = [
    "schema",
    "batchStatus",
    "algorithm",
    "space",
    "metric",
    "costDefinition",
    "strategy",
    "seed",
    "budget",
    "initialTemperature",
    "finalTemperature",
    "timeoutMs",
    "generated",
    "rejected",
    "duplicates",
    "evaluations",
    "failures",
    "bestCost",
    "termination",
    "bestInput",
    "execution",
    "history",
    "exact",
    "batchConfig",
    "statistics",
    "budgetRule",
    "error",
    "metricSemantics",
    "statisticsPopulation",
    "graphRule",
  ];
  const rows = data.records.map((r) => [
    data.schema,
    data.status,
    r.config.algorithm,
    JSON.stringify(r.config.space),
    r.config.metric,
    data.costDefinition,
    r.config.strategy,
    r.config.seed,
    r.config.budget,
    r.config.initialTemperature,
    r.config.finalTemperature,
    config.timeoutMs,
    r.generated,
    r.rejected,
    r.duplicates,
    r.evaluations,
    r.failures,
    r.bestCost,
    r.termination,
    JSON.stringify(r.best),
    JSON.stringify(r.execution),
    JSON.stringify(r.history),
    JSON.stringify(data.exact),
    JSON.stringify(config),
    JSON.stringify(data.statistics),
    data.budgetRule,
    r.error ?? data.error,
    data.metricSemantics,
    data.statisticsPopulation,
    data.graphRule,
  ]);
  // Even a configuration/Worker failure before the first evaluation has a truthful export row.
  if (!rows.length)
    rows.push([
      data.schema,
      data.status,
      config.experiment.algorithm,
      JSON.stringify(config.experiment.space),
      config.experiment.metric,
      data.costDefinition,
      config.experiment.strategy,
      config.experiment.seed,
      config.experiment.budget,
      config.experiment.initialTemperature,
      config.experiment.finalTemperature,
      config.timeoutMs,
      0,
      0,
      0,
      0,
      0,
      null,
      null,
      "null",
      "null",
      "[]",
      JSON.stringify(data.exact),
      JSON.stringify(config),
      "[]",
      data.budgetRule,
      data.error,
      data.metricSemantics,
      data.statisticsPopulation,
      data.graphRule,
    ]);
  return (
    "\uFEFF" +
    [columns, ...rows].map((row) => row.map(cell).join(",")).join("\r\n")
  );
}
