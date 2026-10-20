import type { Experiment } from './types';
export function csvCell(value: string | number | null): string {
  let s = value === null ? '' : String(value);
  if (/^[=+\-@\t\r\n]/.test(s)) s = `'${s}`;
  return `"${s.replaceAll('"', '""')}"`;
}
export function toCsv(experiment: Experiment): string {
  const header = ['split', 'id', 'trueProbability', 'originalProbability', 'outcome', 'plattProbability', 'isotonicProbability'];
  const rows = (['calibration', 'test'] as const).flatMap(split => experiment.dataset[split].map((r, i) =>
    [split, r.id, r.trueProbability, r.probability, r.outcome,
      split === 'test' ? experiment.calibrated?.platt.probabilities?.[i] ?? null : null,
      split === 'test' ? experiment.calibrated?.isotonic.probabilities?.[i] ?? null : null].map(csvCell).join(',')));
  return '\uFEFF' + [header.map(csvCell).join(','), ...rows].join('\r\n') + '\r\n';
}
export function toJson(experiment: Experiment): string {
  return JSON.stringify({ ...experiment, conventions: {
    rng: 'Mulberry32', generator: 'q=0.05+0.9*U; y~Bernoulli(q); p=sigmoid(a*logit(q)); a=1,2,0.5,0',
    split: 'first floor(n/2) calibration; remaining test; IID draws',
    logLoss: 'observed-class probability floored at 1e-15',
    bins: '[i/k,(i+1)/k), final bin includes 1; Wilson 95% pointwise',
    platt: 'logit input clipped to [1e-15,1-1e-15]; smoothed targets; mean cross-entropy + 1e-6/2*(a^2+b^2)',
    isotonic: 'weighted PAVA with exact ties; linear interpolation; constant extrapolation',
  } }, null, 2);
}
