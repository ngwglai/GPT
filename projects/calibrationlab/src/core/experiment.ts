import { generateData, seededRng, validateConfig } from './data';
import { evaluate } from './metrics';
import { fitCalibrator, predict } from './calibration';
import type { Comparison, Config, Experiment, Method } from './types';
export function generateExperiment(config: Config): Experiment {
  validateConfig(config);
  const dataset = generateData(config, seededRng(config.seed));
  return { version: 'calibrationlab-0.1', config: { ...config }, dataset, original: evaluate(dataset.test, config.binCount), calibrated: null };
}
export function calibrateExperiment(experiment: Experiment): Experiment {
  const compare = (method: Method): Comparison => {
    const fit = fitCalibrator(experiment.dataset.calibration, method);
    if (!fit.ok) return { fit, probabilities: null, evaluation: null };
    const probabilities = experiment.dataset.test.map(r => predict(fit.model, r.probability));
    const evaluation = evaluate(experiment.dataset.test.map((r, i) => ({ probability: probabilities[i], outcome: r.outcome })), experiment.config.binCount);
    return { fit, probabilities, evaluation };
  };
  return { ...experiment, calibrated: { platt: compare('platt'), isotonic: compare('isotonic') } };
}
export function runExperiment(config: Config): Experiment { return calibrateExperiment(generateExperiment(config)); }
