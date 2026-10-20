import { createAuthorizer } from "./authorization";
import { executeAuthorized } from "./executor";
import { getScenario } from "./scenarios";
import { calculateMetrics } from "./statistics";
import { validateConfig } from "./validation";
import type { Experiment, ExperimentConfig, Trace } from "./types";
function order(ids: string[], seed: number): string[] {
  const result = [...ids].sort();
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function runExperiment(
  input: ExperimentConfig,
  simulatedConfirmations: readonly string[] = [],
): Experiment {
  const config = validateConfig(input);
  if (
    !Array.isArray(simulatedConfirmations) ||
    simulatedConfirmations.length > 18 ||
    simulatedConfirmations.some((id) => !config.scenarioIds.includes(id))
  )
    throw new Error("模拟确认必须绑定已选择的场景请求");
  const ids = order(config.scenarioIds, config.seed);
  const records: Trace[] = [];
  const metrics: Experiment["metrics"] = {};
  for (const policy of config.policies) {
    const authorize = createAuthorizer(
      policy,
      config.settings,
      simulatedConfirmations,
    );
    const policyRecords = ids.map((id) => {
      const scenario = getScenario(id);
      const { decision, capability } = authorize(id, scenario.request);
      const trace: Trace = {
        scenarioId: id,
        scenarioName: scenario.name,
        policy,
        trust: scenario.trust,
        risk: scenario.risk,
        malicious: scenario.malicious,
        request: scenario.request,
        proposed: true,
        authorization: decision,
        confirmation: simulatedConfirmations.includes(id)
          ? "simulated"
          : "none",
        execution: capability
          ? executeAuthorized(capability)
          : { status: "not-executed", message: "授权拒绝，未调用模拟工具" },
      };
      return trace;
    });
    records.push(...policyRecords);
    metrics[policy] = calculateMetrics(policyRecords);
  }
  return {
    config,
    simulatedConfirmations: [...new Set(simulatedConfirmations)].sort(),
    records,
    metrics,
  };
}
export function replayExperiment(experiment: Experiment): Experiment {
  return runExperiment(experiment.config, experiment.simulatedConfirmations);
}
