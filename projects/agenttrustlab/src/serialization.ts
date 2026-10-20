import type { Experiment, ExperimentConfig } from "./types";
import { validateConfig } from "./validation";
export function exportConfig(config: ExperimentConfig): string {
  return JSON.stringify(validateConfig(config), null, 2);
}
export function exportExperiment(experiment: Experiment): string {
  return JSON.stringify(experiment, null, 2);
}
export function csvCell(value: unknown): string {
  let text = String(value);
  // Prefix spreadsheet formula triggers (including leading control/space), then RFC 4180 quoting.
  const first = [...text].find((c) => c.charCodeAt(0) > 32 && c.trim() !== "");
  if (first && "=+@-".includes(first)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function exportCsv(experiment: Experiment): string {
  const rows: unknown[][] = [
    [
      "scenarioId",
      "policy",
      "malicious",
      "proposed",
      "allowed",
      "execution",
      "reason",
      "traceJson",
    ],
  ];
  for (const record of experiment.records)
    rows.push([
      record.scenarioId,
      record.policy,
      record.malicious,
      record.proposed,
      record.authorization.allowed,
      record.execution.status,
      record.authorization.reasons.join("；"),
      JSON.stringify(record),
    ]);
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
