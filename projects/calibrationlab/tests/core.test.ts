import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, forecast, generateData, seededRng, sigmoid, validateConfig } from '../src/core/data';
import { brierScore, evaluate, LOG_EPSILON, logLoss, reliabilityBins, wilson } from '../src/core/metrics';
import { fitIsotonic, fitPlatt, predict } from '../src/core/calibration';
import { calibrateExperiment, generateExperiment, runExperiment } from '../src/core/experiment';
import { csvCell, toCsv, toJson } from '../src/core/export';
import type { Prediction, Scenario } from '../src/core/types';
import { parseCsv } from './csv';
const grid = (a = 2): Prediction[] => Array.from({ length: 9 }, (_, j) => {
  const q = (j + 1) / 10;
  return Array.from({ length: 100 }, (_, i) => ({ probability: sigmoid(a * Math.log(q / (1 - q))), outcome: (i < (j + 1) * 10 ? 1 : 0) as 0 | 1 }));
}).flat();
const scenarios: Scenario[] = ['ideal', 'overconfident', 'underconfident', 'uninformative'];

describe('defined generators and reproducibility', () => {
  it('pins uint32 PRNG sequence independently', () => {
    const rng = seededRng(1);
    expect([rng(), rng(), rng()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });
  it.each(scenarios)('%s exactly repeats data and full results', scenario => {
    const config = { ...DEFAULT_CONFIG, scenario };
    expect(toJson(runExperiment(config))).toBe(toJson(runExperiment(config)));
    expect(runExperiment({ ...config, seed: 2027 }).dataset).not.toEqual(runExperiment(config).dataset);
  });
  it('injects exactly two RNG draws per row and distinguishes q,p,y', () => {
    const values = [0, 0.01, 0.5, 0.8, 0.9, 0.8]; let i = 0;
    const d = generateData({ ...DEFAULT_CONFIG, sampleSize: 3 }, () => values[i++]);
    expect(i).toBe(6); expect(d.calibration).toHaveLength(1); expect(d.test).toHaveLength(2);
    expect(d.calibration[0]).toMatchObject({ id: 0, trueProbability: 0.05, outcome: 1 });
    expect(d.test[0]).toMatchObject({ id: 1, trueProbability: 0.5, probability: 0.5, outcome: 0 });
    expect(d.test[1].trueProbability).toBeCloseTo(0.86); expect(d.test[1].outcome).toBe(1);
  });
  it.each([0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95])('probability transforms at q=%s', q => {
    expect(forecast(q, 'ideal')).toBeCloseTo(q, 14);
    expect(forecast(q, 'uninformative')).toBe(0.5);
    expect(Math.abs(forecast(q, 'overconfident') - 0.5)).toBeGreaterThanOrEqual(Math.abs(q - 0.5) - 1e-15);
    expect(Math.abs(forecast(q, 'underconfident') - 0.5)).toBeLessThanOrEqual(Math.abs(q - 0.5) + 1e-15);
  });
  it('observations approach q with fixed seed and explicit tolerance', () => {
    const discrepancy = (n: number) => {
      const d = generateData({ ...DEFAULT_CONFIG, scenario: 'ideal', sampleSize: n }, seededRng(912));
      const rows = [...d.calibration, ...d.test];
      return Math.abs(rows.reduce((s, r) => s + r.outcome - r.trueProbability, 0) / n);
    };
    expect(discrepancy(20000)).toBeLessThan(0.01);
    expect(discrepancy(20000)).toBeLessThan(discrepancy(100));
    const d = generateData({ ...DEFAULT_CONFIG, scenario: 'ideal', sampleSize: 20000 }, seededRng(912));
    for (const bin of reliabilityBins([...d.calibration, ...d.test], 5)) {
      expect(bin.count).toBeGreaterThan(3000);
      expect(Math.abs(bin.meanProbability! - bin.eventRate!)).toBeLessThan(0.035);
    }
  });
  it('same latent draws and outcomes across all scenarios', () => {
    const all = scenarios.map(scenario => generateData({ ...DEFAULT_CONFIG, scenario }, seededRng(42)));
    for (const data of all) expect(data.test.map(r => [r.id, r.trueProbability, r.outcome])).toEqual(all[0].test.map(r => [r.id, r.trueProbability, r.outcome]));
    expect(new Set(all[3].test.map(r => r.probability))).toEqual(new Set([0.5]));
  });
  it.each([NaN, Infinity, -1, 1, 1.1])('rejects invalid RNG draw %s', v => {
    expect(() => generateData(DEFAULT_CONFIG, () => v)).toThrow();
  });
  it.each([-1, 0, 1, NaN, Infinity])('rejects invalid latent q %s', q => expect(() => forecast(q, 'ideal')).toThrow());
  it.each([
    { sampleSize: 1 }, { sampleSize: 20001 }, { sampleSize: 2.1 }, { sampleSize: NaN },
    { seed: -1 }, { seed: 4294967296 }, { seed: 1.1 }, { binCount: 1 }, { binCount: 31 }, { binCount: 2.5 }, { scenario: 'bad' },
  ])('rejects bad config %j', override => expect(() => validateConfig({ ...DEFAULT_CONFIG, ...override } as typeof DEFAULT_CONFIG)).toThrow());
  it('does not mutate input configuration', () => { const c = Object.freeze({ ...DEFAULT_CONFIG }); runExperiment(c); expect(c).toEqual(DEFAULT_CONFIG); });
});

describe('scores and reliability', () => {
  it('matches independent hand calculation', () => {
    const rows: Prediction[] = [{ probability: 0.1, outcome: 0 }, { probability: 0.4, outcome: 1 }, { probability: 0.8, outcome: 1 }, { probability: 0.9, outcome: 0 }];
    expect(brierScore(rows)).toBeCloseTo(0.305, 14);
    expect(logLoss(rows)).toBeCloseTo(-(Math.log(0.9) + Math.log(0.4) + Math.log(0.8) + Math.log(0.1)) / 4, 14);
    expect(evaluate(rows, 2)).toMatchObject({ meanProbability: 0.55, eventRate: 0.5 });
    expect(evaluate(rows, 2).ece).toBeCloseTo(0.3, 14);
  });
  it('handles exact 0/1 consistently without NaN or Infinity', () => {
    expect(brierScore([{ probability: 0, outcome: 0 }, { probability: 1, outcome: 1 }])).toBe(0);
    expect(logLoss([{ probability: 0, outcome: 0 }, { probability: 1, outcome: 1 }])).toBe(0);
    expect(logLoss([{ probability: 0, outcome: 1 }, { probability: 1, outcome: 0 }])).toBe(-Math.log(LOG_EPSILON));
    expect(brierScore([{ probability: 0, outcome: 1 }, { probability: 1, outcome: 0 }])).toBe(1);
    expect(logLoss([{ probability: 1e-300, outcome: 1 }])).toBe(-Math.log(LOG_EPSILON));
  });
  it('null scores and null empty-bin data', () => {
    const e = evaluate([], 5);
    expect(e).toMatchObject({ count: 0, brier: null, logLoss: null, meanProbability: null, eventRate: null, ece: null });
    expect(e.bins.every(b => b.count === 0 && b.meanProbability === null && b.eventRate === null && b.interval === null)).toBe(true);
  });
  it('boundaries use [i/k,(i+1)/k), with 1 in final bin', () => {
    const bins = reliabilityBins([0, 0.25 - Number.EPSILON, 0.25, 0.5, 0.75, 1].map(probability => ({ probability, outcome: 1 })), 4);
    expect(bins.map(b => b.count)).toEqual([2, 1, 1, 2]);
    expect(bins.map(b => [b.lower, b.upper])).toEqual([[0, .25], [.25, .5], [.5, .75], [.75, 1]]);
  });
  it('Wilson reference and small-sample uncertainty', () => {
    const [lo, hi] = wilson(5, 10);
    expect(lo).toBeCloseTo(0.236593, 5); expect(hi).toBeCloseTo(0.763407, 5);
    expect(wilson(0, 1)[1]).toBeGreaterThan(.79);
    expect(wilson(1, 1)[0]).toBeLessThan(.21);
    expect(wilson(0, 20)[0]).toBeGreaterThanOrEqual(0);
    expect(wilson(20, 20)[1]).toBeLessThanOrEqual(1);
  });
  it.each([NaN, Infinity, -0.001, 1.001])('rejects invalid probability %s', p => {
    const r: Prediction[] = [{ probability: p, outcome: 0 }];
    expect(() => brierScore(r)).toThrow(); expect(() => logLoss(r)).toThrow(); expect(() => evaluate(r, 5)).toThrow();
  });
  it('rejects invalid labels, bins, counts and excess samples', () => {
    expect(() => evaluate([{ probability: .5, outcome: 2 }] as unknown as Prediction[], 5)).toThrow();
    for (const n of [0, 1, 31, 2.1, NaN]) expect(() => reliabilityBins([], n)).toThrow();
    expect(() => wilson(2, 1)).toThrow(); expect(() => wilson(0, 0)).toThrow();
    expect(() => evaluate(new Array<Prediction>(20001).fill({ probability: .5, outcome: 1 }), 5)).toThrow();
  });
  it('equal averages do not imply good calibration', () => {
    const e = evaluate([{ probability: .1, outcome: 1 }, { probability: .9, outcome: 0 }], 2);
    expect(e.meanProbability).toBe(e.eventRate); expect(e.ece).toBeCloseTo(.9); expect(e.brier).toBeCloseTo(.81);
  });
});

describe('standard calibrators', () => {
  it('Platt recovers inverse logistic distortion on balanced frequency grid', () => {
    const fit = fitPlatt(grid()); expect(fit.ok).toBe(true);
    if (!fit.ok || fit.model.method !== 'platt') throw new Error('fit failed');
    expect(fit.model.slope).toBeCloseTo(.5, 2); expect(fit.model.intercept).toBeCloseTo(0, 7);
    for (const q of [.1, .3, .7, .9]) expect(predict(fit.model, forecast(q, 'overconfident'))).toBeCloseTo(q, 2);
    expect(evaluate(grid().map(r => ({ ...r, probability: predict(fit.model, r.probability) })), 10).brier!).toBeLessThan(brierScore(grid())!);
  });
  it.each([0, 1e-300, 1e-15, .5, 1 - 1e-15, 1])('Platt extreme prediction %s remains finite', p => {
    const fit = fitPlatt(grid()); if (!fit.ok) throw new Error('fit failed');
    const v = predict(fit.model, p); expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1);
  });
  it('Platt target smoothing makes perfectly separated endpoints finite', () => {
    const fit = fitPlatt(Array.from({ length: 40 }, (_, i) => ({ probability: i < 20 ? 0 : 1, outcome: i < 20 ? 0 : 1 })));
    expect(fit.ok).toBe(true); if (!fit.ok) return;
    expect(predict(fit.model, 0)).toBeCloseTo(1 / 22, 3); expect(predict(fit.model, 1)).toBeCloseTo(21 / 22, 3);
  });
  it('Platt permits negative slope for negatively associated scores', () => {
    const fit = fitPlatt(grid(-2)); if (!fit.ok || fit.model.method !== 'platt') throw new Error('fit failed');
    expect(fit.model.slope).toBeLessThan(0);
  });
  it('PAVA ties, weighted pooling, interpolation and constant extrapolation', () => {
    // Four score groups of weight 10 with event rates .2,.8,.4,.9.
    const rows = [.2, .8, .4, .9].flatMap((q, j) => Array.from({ length: 10 }, (_, i) => ({ probability: (j + 1) / 5, outcome: (i < q * 10 ? 1 : 0) as 0 | 1 })));
    const fit = fitIsotonic(rows); if (!fit.ok || fit.model.method !== 'isotonic') throw new Error('fit failed');
    expect(fit.model.values).toEqual([.2, .6, .6, .9]);
    expect(predict(fit.model, 0)).toBe(.2); expect(predict(fit.model, 1)).toBe(.9); expect(predict(fit.model, .3)).toBeCloseTo(.4);
  });
  it.each(Array.from({ length: 30 }, (_, i) => i + 1))('PAVA matches independent exhaustive partition least squares seed %s', seed => {
    const rng = seededRng(seed); const successes = Array.from({ length: 5 }, () => 1 + Math.floor(rng() * 8));
    const rows: Prediction[] = successes.flatMap((n, j) => Array.from({ length: 10 }, (_, i) => ({ probability: (j + 1) / 6, outcome: i < n ? 1 : 0 })));
    let bestLoss = Infinity, best: number[] = [];
    for (let mask = 0; mask < 16; mask++) {
      const candidate: number[] = []; let start = 0;
      for (let end = 0; end < 5; end++) if (end === 4 || (mask & (1 << end))) {
        const value = successes.slice(start, end + 1).reduce((s, n) => s + n, 0) / (10 * (end - start + 1));
        for (let i = start; i <= end; i++) candidate.push(value); start = end + 1;
      }
      if (candidate.some((v, i) => i > 0 && v < candidate[i - 1])) continue;
      const loss = rows.reduce((s, r, i) => s + (r.outcome - candidate[Math.floor(i / 10)]) ** 2, 0);
      if (loss < bestLoss) { bestLoss = loss; best = candidate; }
    }
    const fit = fitIsotonic(rows); if (!fit.ok || fit.model.method !== 'isotonic') throw new Error('fit failed');
    fit.model.values.forEach((v, i) => expect(v).toBeCloseTo(best[i], 12));
    let previous = -1;
    for (let i = 0; i <= 1000; i++) { const v = predict(fit.model, i / 1000); expect(v).toBeGreaterThanOrEqual(previous - 1e-15); previous = v; }
  });
  it.each([fitPlatt, fitIsotonic])('rejects insufficient, single-class and constant-score fitting', fit => {
    expect(fit([]).ok).toBe(false); expect(fit(grid().slice(0, 19)).ok).toBe(false);
    expect(fit(grid().map(r => ({ ...r, outcome: 1 }))).ok).toBe(false);
    expect(fit(grid().map(r => ({ ...r, probability: .5 }))).ok).toBe(false);
    expect(fit(grid().map((r, i) => ({ ...r, outcome: i === 0 ? 1 : 0 }))).ok).toBe(false);
    expect(() => fit([{ probability: NaN, outcome: 1 }])).toThrow();
  });
  it('fitting never mutates frozen rows', () => {
    const rows = Object.freeze(grid().map(r => Object.freeze(r)));
    expect(fitPlatt(rows).ok).toBe(true); expect(fitIsotonic(rows).ok).toBe(true);
  });
});

describe('leakage prevention and exports', () => {
  it('calibration and test IDs are disjoint and same IDs score both predictions', () => {
    const e = runExperiment(DEFAULT_CONFIG); const ids = new Set(e.dataset.calibration.map(r => r.id));
    expect(e.dataset.test.every(r => !ids.has(r.id))).toBe(true);
    for (const comparison of Object.values(e.calibrated!)) {
      expect(comparison.evaluation!.count).toBe(e.original.count);
      expect(comparison.probabilities).toHaveLength(e.dataset.test.length);
      expect(comparison.evaluation!.eventRate).toBe(e.original.eventRate);
      expect(comparison.evaluation).toEqual(evaluate(e.dataset.test.map((r, i) => ({ probability: comparison.probabilities![i], outcome: r.outcome })), e.config.binCount));
    }
  });
  it('flipping test labels cannot change fitted parameters or predictions', () => {
    const e = generateExperiment(DEFAULT_CONFIG);
    const changed = { ...e, dataset: { ...e.dataset, test: e.dataset.test.map(r => ({ ...r, outcome: (1 - r.outcome) as 0 | 1 })) } };
    const original = calibrateExperiment(e), flipped = calibrateExperiment(changed);
    for (const method of ['platt', 'isotonic'] as const) {
      expect(flipped.calibrated![method].fit).toEqual(original.calibrated![method].fit);
      expect(flipped.calibrated![method].probabilities).toEqual(original.calibrated![method].probabilities);
      expect(flipped.calibrated![method].evaluation!.brier).not.toBe(original.calibrated![method].evaluation!.brier);
    }
  });
  it('calibration can worsen held-out scores, with real fixed-seed experiments', () => {
    const deltas = [1, 2, 3, 4, 5].flatMap(seed => {
      const e = runExperiment({ ...DEFAULT_CONFIG, scenario: 'ideal', sampleSize: 80, seed });
      return Object.values(e.calibrated!).filter(c => c.evaluation).map(c => c.evaluation!.brier! - e.original.brier!);
    });
    expect(deltas.some(d => d > .001)).toBe(true);
  });
  it('failures exported as explicit reasons without fictional calibrated scores', () => {
    for (const e of [runExperiment({ ...DEFAULT_CONFIG, sampleSize: 2 }), runExperiment({ ...DEFAULT_CONFIG, scenario: 'uninformative' })]) {
      expect(e.calibrated!.platt.fit.ok).toBe(false); expect(e.calibrated!.isotonic.evaluation).toBeNull();
      expect(JSON.parse(toJson(e)).calibrated.platt.fit.reason).toBeTruthy();
      expect(parseCsv(toCsv(e)).slice(1).every(r => r[5] === '' && r[6] === '')).toBe(true);
    }
  });
  it('CSV independently parses exact numeric rows and calibrated test-only fields', () => {
    const e = runExperiment({ ...DEFAULT_CONFIG, sampleSize: 100 });
    const rows = parseCsv(toCsv(e)); expect(rows).toHaveLength(101);
    rows.slice(1).forEach((row, i) => {
      const source = [...e.dataset.calibration, ...e.dataset.test][i];
      expect(Number(row[1])).toBe(source.id); expect(Number(row[2])).toBe(source.trueProbability); expect(Number(row[3])).toBe(source.probability); expect(Number(row[4])).toBe(source.outcome);
      expect(row[0]).toBe(i < 50 ? 'calibration' : 'test');
      if (i < 50) expect(row.slice(5)).toEqual(['', '']);
      else expect(Number(row[5])).toBe(e.calibrated!.platt.probabilities![i - 50]);
    });
  });
  it.each(['plain', '中文', 'a,b', 'a"b', 'line1\r\nline2', '', '=1+2', '+SUM(A1)', '-x', '@a', '\tformula'])('CSV escaping and formula protection %j', text => {
    const expected = /^[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
    expect(parseCsv(csvCell(text) + '\r\n')).toEqual([[expected]]);
  });
  it('JSON includes conventions, exact bins, fit and reproducible config', () => {
    const e = runExperiment(DEFAULT_CONFIG); const j = JSON.parse(toJson(e));
    expect(j.original.bins).toEqual(e.original.bins); expect(j.calibrated).toEqual(e.calibrated);
    expect(j.version).toBe('calibrationlab-0.1'); expect(j.conventions.rng).toBe('Mulberry32');
    expect(runExperiment(j.config)).toEqual(e);
    const c = { ...e, version: 'calibrationlab-0.1' as const };
    expect(toJson(c)).not.toContain('NaN'); expect(toJson(c)).not.toContain('Infinity');
  });
});

describe('optimizer and resource boundary regressions', () => {
  it.each([-.5, -2, .5, 1, 2, 4])('Platt output has small independent objective gradient at distortion %s', distortion => {
    const rows = grid(distortion), fit = fitPlatt(rows);
    if (!fit.ok || fit.model.method !== 'platt') throw new Error('fit failed');
    const { slope: a, intercept: b } = fit.model;
    // Independent finite-difference reference: direct exp/log is stable on this grid.
    const objective = (slope: number, intercept: number) => rows.reduce((total, r) => {
      const p = 1 / (1 + Math.exp(-(slope * Math.log(r.probability / (1 - r.probability)) + intercept)));
      const target = r.outcome ? 451 / 452 : 1 / 452;
      return total - target * Math.log(p) - (1 - target) * Math.log(1 - p);
    }, 0) / rows.length + 0.0000005 * (slope * slope + intercept * intercept);
    const h = 1e-5;
    expect(Math.abs((objective(a + h, b) - objective(a - h, b)) / (2 * h))).toBeLessThan(2e-7);
    expect(Math.abs((objective(a, b + h) - objective(a, b - h)) / (2 * h))).toBeLessThan(2e-7);
  });
  it('max supported experiment produces bounded finite scores, all labels and bins', () => {
    const e = runExperiment({ ...DEFAULT_CONFIG, sampleSize: 20000, binCount: 30, seed: 4294967295 });
    expect(e.dataset.calibration).toHaveLength(10000); expect(e.dataset.test).toHaveLength(10000);
    for (const c of Object.values(e.calibrated!)) {
      expect(c.fit.ok).toBe(true); expect(Number.isFinite(c.evaluation!.logLoss)).toBe(true);
      expect(c.evaluation!.bins).toHaveLength(30); expect(c.evaluation!.bins.reduce((s, b) => s + b.count, 0)).toBe(10000);
    }
  });
});
