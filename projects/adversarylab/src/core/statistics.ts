import type { SearchResult, Strategy } from "./types";
import { strategies } from "./types";
export interface Summary {
  strategy: Strategy;
  runs: number;
  best: number | null;
  mean: number | null;
  standardDeviation: number | null;
  evaluations: number;
  completed: number;
}
export function summarize(results: SearchResult[]): Summary[] {
  return strategies
    .filter((s) => results.some((r) => r.config.strategy === s))
    .map((strategy) => {
      const runs = results.filter((r) => r.config.strategy === strategy),
        costs = runs.flatMap((r) =>
          r.termination !== "budget" || r.bestCost === null ? [] : [r.bestCost],
        );
      const mean = costs.length
        ? costs.reduce((a, b) => a + b, 0) / costs.length
        : null;
      return {
        strategy,
        runs: runs.length,
        best: costs.length ? Math.max(...costs) : null,
        mean,
        standardDeviation:
          mean === null
            ? null
            : Math.sqrt(
                costs.reduce((sum, x) => sum + (x - mean) ** 2, 0) /
                  costs.length,
              ),
        evaluations: runs.reduce((sum, r) => sum + r.evaluations, 0),
        completed: runs.filter((r) => r.termination === "budget").length,
      };
    });
}
