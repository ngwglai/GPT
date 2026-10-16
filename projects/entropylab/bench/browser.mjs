// Observational browser benchmark; no FPS pass/fail threshold or cross-device claim.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const url = 'http://127.0.0.1:4180/GPT/entropylab/';
const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4180',
    '--strictPort',
  ],
  { cwd: root, stdio: 'ignore' },
);
let browser;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(url)).ok) {
        ready = true;
        break;
      }
    } catch {
      /* Startup polling only. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error('Preview failed to start on port 4180');
  browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1120 } });
  await page.addInitScript(() => {
    const Original = window.Worker;
    window.Worker = class extends Original {
      constructor(...args) {
        super(...args);
        this.addEventListener('message', ({ data }) => {
          if (data.snapshot?.gas) window.gasObservation = data.snapshot;
        });
      }
    };
  });
  const rows = [];
  const cases = [100, 500, 1000, 2000].flatMap((count) =>
    ['default', 'dense-fast'].map((scenario) => ({ count, scenario, playback: 1 })),
  );
  cases.push({ count: 2000, scenario: 'dense-fast', playback: 4 });
  for (const { count, scenario, playback } of cases) {
    await page.goto(url);
    await page.getByLabel('粒子数量').fill(String(count));
    if (scenario === 'dense-fast') {
      const radius = await page.getByLabel('粒子半径').getAttribute('max');
      await page.getByLabel('粒子半径').fill(String(Math.floor(Number(radius) * 10000) / 10000));
      await page.getByLabel('初始速度尺度').fill('1');
    }
    await page.getByLabel('播放倍率').selectOption(String(playback));
    await page.getByRole('button', { name: '开始模拟', exact: true }).click();
    await page.waitForTimeout(500);
    const result = await page.evaluate(async () => {
      const times = [],
        started = performance.now(),
        initialTime = window.gasObservation.x;
      await new Promise((resolve) => {
        const frame = (t) => {
          times.push(t);
          if (t - started >= 2500) resolve();
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      });
      const elapsed = performance.now() - started;
      const intervals = times
        .slice(1)
        .map((t, i) => t - times[i])
        .sort((a, b) => a - b);
      const current = window.gasObservation;
      return {
        observed_raf_per_s: Number(((times.length / elapsed) * 1000).toFixed(1)),
        p95_frame_interval_ms: Number(intervals[Math.floor(intervals.length * 0.95)].toFixed(2)),
        simulation_s_per_wall_s: Number((((current.x - initialTime) / elapsed) * 1000).toFixed(2)),
        final_worker_batch_ms: Number(current.computeMs.toFixed(3)),
        relative_energy_error: current.gas.energyError,
        fault: current.gas.fault,
      };
    });
    if (result.fault) throw new Error(result.fault);
    rows.push({ count, scenario, playback, ...result });
    await page.getByRole('button', { name: '暂停', exact: true }).click();
    await page.getByRole('status', { name: '模拟状态' }).filter({ hasText: '已暂停' }).waitFor();
  }
  console.log(
    JSON.stringify(
      {
        browser: await browser.version(),
        viewport: '1440x1120',
        playback: 'per-row',
        observation_ms: 2500,
        rows,
      },
      null,
      2,
    ),
  );
} finally {
  await browser?.close();
  server.kill();
}
