import { expect, test } from 'vitest';
import { performance } from 'node:perf_hooks';
import { createDiffusion, maximumRadius, FIXED_DT } from '../src/experiments/diffusion/model';
import { mechanics } from '../src/experiments/diffusion/gas';
import { seededRandom } from '../src/utils/numbers';

// Explicit benchmark command, separate from normal tests. Timings are observations, never CI thresholds.
test('hard-disk computation throughput, independent of rendering and browser FPS', () => {
  const rows = [];
  for (const count of [100, 500, 1000, 2000]) {
    for (const scenario of ['default', 'dense', 'dense-fast'] as const) {
      const elapsed: number[] = [];
      let candidates = 0,
        events = 0,
        energyError = 0,
        impulseError = 0,
        overlap = 0;
      for (let run = 0; run < 3; run++) {
        const gas = createDiffusion(count, seededRandom(42 + run), {
          radius: scenario === 'default' ? 0.004 : maximumRadius(count),
          velocity: scenario === 'dense-fast' ? 1 : 0.25,
        });
        const initial = mechanics(gas.particles);
        for (let i = 0; i < 30; i++) gas.step(FIXED_DT);
        for (let i = 0; i < 180; i++) {
          const start = performance.now();
          gas.step(FIXED_DT);
          elapsed.push(performance.now() - start);
          candidates += gas.lastCandidates;
          events += gas.lastEvents;
        }
        expect(gas.fault).toBeNull();
        const final = mechanics(gas.particles);
        energyError = Math.max(energyError, Math.abs(final.energy / initial.energy - 1));
        impulseError = Math.max(
          impulseError,
          Math.hypot(
            final.px - initial.px - gas.wallImpulseX,
            final.py - initial.py - gas.wallImpulseY,
          ),
        );
        expect(energyError).toBeLessThan(1e-9);
        for (let i = 0; i < gas.particles.length; i++)
          for (let j = i + 1; j < gas.particles.length; j++) {
            const a = gas.particles[i],
              b = gas.particles[j];
            overlap = Math.max(overlap, a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y));
          }
        expect(overlap).toBeLessThanOrEqual(1e-10);
      }
      elapsed.sort((a, b) => a - b);
      const total = elapsed.reduce((a, b) => a + b, 0);
      rows.push({
        count,
        scenario,
        radius: scenario === 'default' ? 0.004 : Number(maximumRadius(count).toFixed(6)),
        median_ms: Number(elapsed[Math.floor(elapsed.length / 2)].toFixed(3)),
        p95_ms: Number(elapsed[Math.floor(elapsed.length * 0.95)].toFixed(3)),
        max_ms: Number(elapsed.at(-1)!.toFixed(3)),
        simulated_s_per_wall_s: Number(((elapsed.length * FIXED_DT * 1000) / total).toFixed(2)),
        mean_candidates: Math.round(candidates / elapsed.length),
        mean_events: Math.round(events / elapsed.length),
        energyError,
        impulseError,
        maximum_final_overlap: overlap,
      });
    }
  }
  console.log(JSON.stringify(rows, null, 2));
});
