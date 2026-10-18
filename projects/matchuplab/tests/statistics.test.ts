import { expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/core/config';
import { exportCSV, exportJSON } from '../src/core/export';
import { ExperimentTask } from '../src/core/simulation';
import { Accumulator, summarize } from '../src/core/statistics';
import type { RunResult } from '../src/core/types';

it('Welford mean, sample SD, wins, draws and action counts match independent formulas', () => {
  const a = new Accumulator(3);
  expect(a.snapshot().n).toBe(0);
  a.add(-1, 0); expect(a.snapshot().sd).toBe(0);
  a.add(0, 1); a.add(1, 2); a.add(1, 2);
  const m = a.snapshot();
  expect(m).toMatchObject({ n: 4, wins: 2, draws: 1, losses: 1, mean: 0.25, total: 1, winRate: 0.5, actions: [1, 1, 2] });
  expect(m.sd).toBeCloseTo(Math.sqrt(2.75 / 3), 12);
  m.actions[0] = 100; expect(a.snapshot().actions[0]).toBe(1);
});
it('summary SD is across independent seed means, with explicit sample count and range', () => {
  const runs: RunResult[] = [-1, 0, 1].map((value, seed) => {
    const a = new Accumulator(3); a.add(value, 0); a.add(value, 0);
    return { algorithm: 'ucb', seed, policy: [1, 0, 0], phases: { test: { metrics: a.snapshot(), curve: [] } } };
  });
  expect(summarize(runs)).toEqual([{ algorithm: 'ucb', phase: 'test', seeds: 3, rounds: 6, mean: 0, sd: 1, min: -1, max: 1, winRate: 1 / 3 }]);
  expect(summarize(runs.slice(0, 1))[0].sd).toBe(0); expect(summarize([])).toEqual([]);
});
it('JSON and RFC4180 CSV preserve configuration, seed, sample sizes, policy and metrics', () => {
  const task = new ExperimentTask({ ...DEFAULT_CONFIG, trainRounds: 10, testRounds: 5, transfer: true }, ['epsilon', 'exp3'], 2);
  while (!task.done) task.tick();
  const result = task.finish();
  expect(JSON.parse(exportJSON(result))).toEqual(result);
  const csv = exportCSV(result);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  const rows = csv.slice(1).split('\r\n').map(line => [...line.matchAll(/"((?:[^"]|"")*)"(?:,|$)/g)].map(m => m[1].replaceAll('""', '"')));
  expect(rows).toHaveLength(13);
  expect(rows.every(row => row.length === 16)).toBe(true);
  expect(rows[0]).toContain('sd_round');
  expect(JSON.parse(rows[1][15])).toEqual(result.config);
  expect(Number(rows[1][5])).toBe(10); expect(Number(rows[2][5])).toBe(5);
  expect(rows[3][3]).toBe('transfer'); expect(Number(rows[1][4])).toBe(42);
  expect(JSON.parse(rows[1][13]).reduce((a: number, b: number) => a + b)).toBe(10);
  expect(result.summary[0].seeds).toBe(2);
});
