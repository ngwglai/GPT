import { test, expect } from 'vitest';
import { runExperiment } from '../src/core/engine';
import { preset } from '../src/core/cases';
import { NAMES } from '../src/core/config';
import { evaluate } from '../src/core/dsl';
for (const name of NAMES) test(`real synthesis: ${name}`, async () => {
  const c = preset(name); const r = await runExperiment(c, { yield: async () => {} });
  console.log(JSON.stringify({ case: name, status: r.status, generated: r.stats.generated, semantic: r.stats.semantic, elapsedMs: Math.round(r.stats.elapsedMs), rounds: r.iterations.length, expressions: r.iterations.map(i => i.expression) }));
  expect(r.status).toBe('verified'); expect(r.iterations.length).toBeGreaterThan(1);
  expect(r.verification?.complete).toBe(true);
  const xRef = (x: number, y: number) => name === 'Max2' ? (x > y ? x : y) : name === 'Abs' ? (x < 0 ? -x : x) : name === 'Clamp' ? (x < -2 ? -2 : x > 2 ? 2 : x) : x < 0 ? -1 : x > 0 ? 1 : 0;
  for (let x = -3; x <= 3; x++) for (let y = -3; y <= 3; y++) expect(evaluate(r.candidate!, c.variables === 1 ? [x] : [x, y])).toBe(xRef(x, y));
}, 20000);
