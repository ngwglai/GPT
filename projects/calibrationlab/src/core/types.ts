export type Scenario = 'ideal' | 'overconfident' | 'underconfident' | 'uninformative';
export type Method = 'platt' | 'isotonic';
export type Rng = () => number;
export interface Config { scenario: Scenario; sampleSize: number; seed: number; binCount: number }
export interface Observation { id: number; trueProbability: number; probability: number; outcome: 0 | 1 }
export interface Dataset { calibration: Observation[]; test: Observation[] }
export interface Prediction { probability: number; outcome: 0 | 1 }
export interface Bin {
  index: number; lower: number; upper: number; count: number;
  meanProbability: number | null; eventRate: number | null;
  interval: [number, number] | null;
}
export interface Evaluation {
  count: number; brier: number | null; logLoss: number | null;
  meanProbability: number | null; eventRate: number | null;
  ece: number | null; bins: Bin[];
}
export interface PlattModel { method: 'platt'; slope: number; intercept: number; iterations: number }
export interface IsotonicModel { method: 'isotonic'; thresholds: number[]; values: number[] }
export type Model = PlattModel | IsotonicModel;
export type FitResult = { ok: true; model: Model; warnings: string[] } | { ok: false; reason: string };
export interface Comparison {
  fit: FitResult; probabilities: number[] | null; evaluation: Evaluation | null;
}
export interface Experiment {
  version: 'calibrationlab-0.1'; config: Config; dataset: Dataset;
  original: Evaluation; calibrated: Record<Method, Comparison> | null;
}
