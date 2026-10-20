import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseCsv } from '../tests/csv';
import { runExperiment } from '../src/core/experiment';
import type { Experiment } from '../src/core/types';

test.beforeEach(async ({ page }) => { await page.goto('/'); });
async function run(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '运行实验', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('数据已生成，尚未拟合校准器');
}
async function calibrate(page: import('@playwright/test').Page) {
  await page.getByRole('button', { name: '执行校准（两种方法）' }).click();
  await expect(page.getByRole('status')).toContainText('校准完成');
}
async function downloaded(page: import('@playwright/test').Page, type: 'CSV' | 'JSON') {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: `下载 ${type}`, exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe(`calibrationlab.${type.toLowerCase()}`);
  return readFile((await download.path())!, 'utf8');
}

test('production launch, empty state, default experiment, real metrics and reliability', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await expect(page.getByRole('heading', { name: 'CalibrationLab', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '尚无实验数据' })).toBeVisible();
  await expect(page.getByRole('button', { name: '下载 JSON' })).toHaveCount(0);
  await run(page);
  await expect(page.getByTestId('split')).toHaveText('校准集 1000 条 · 独立测试集 1000 条');
  await expect(page.getByRole('img', { name: '可靠性图：平均预测概率与实际发生率' })).toBeVisible();
  expect(await page.getByTestId('raw-bin').count()).toBeGreaterThan(0);
  await expect(page.getByTestId('metrics')).toContainText('Brier Score');
  const expected = runExperiment({ scenario: 'overconfident', sampleSize: 2000, seed: 2026, binCount: 10 });
  await expect(page.getByTestId('metrics')).toContainText(expected.original.brier!.toFixed(5));
  await calibrate(page);
  await expect(page.locator('.fit-status')).toHaveText('Platt Scaling：拟合成功');
  await expect(page.getByTestId('metrics')).toContainText(expected.calibrated!.platt.evaluation!.brier!.toFixed(5));
  await expect(page.getByTestId('cal-bin')).not.toHaveCount(0);
  await page.getByLabel('查看方法').selectOption('isotonic');
  await expect(page.locator('.fit-status')).toHaveText('Isotonic Regression：拟合成功');
  await expect(page.getByTestId('metrics')).toContainText(expected.calibrated!.isotonic.evaluation!.logLoss!.toFixed(5));
  expect(errors).toEqual([]);
});

for (const scenario of ['ideal', 'overconfident', 'underconfident', 'uninformative']) {
  test(`switch and run ${scenario}`, async ({ page }) => {
    await page.getByLabel('实验类型').selectOption(scenario);
    await run(page); await calibrate(page);
    if (scenario === 'uninformative') {
      await expect(page.getByRole('alert')).toContainText('常量');
      await expect(page.getByTestId('cal-bin')).toHaveCount(0);
      await page.getByLabel('查看方法').selectOption('isotonic');
      await expect(page.getByRole('alert')).toContainText('常量');
    } else await expect(page.locator('.fit-status')).toContainText('拟合成功');
  });
}

test('parameters invalidate results, regeneration increments seed, reset restores empty defaults', async ({ page }) => {
  await run(page); await calibrate(page);
  await page.getByLabel('总样本量').fill('121');
  await expect(page.getByRole('heading', { name: '尚无实验数据' })).toBeVisible();
  await page.getByLabel('随机种子').fill('0'); await page.getByLabel('分箱数量').fill('7');
  await run(page);
  await expect(page.getByTestId('split')).toHaveText('校准集 60 条 · 独立测试集 61 条');
  await expect(page.getByRole('table', { name: '分箱明细', exact: true }).locator('tbody tr')).toHaveCount(7);
  await page.getByRole('button', { name: '重新生成（种子 +1）' }).click();
  await expect(page.getByRole('status')).toHaveText('数据已生成，尚未拟合校准器');
  await expect(page.getByLabel('随机种子')).toHaveValue('1');
  await page.getByRole('button', { name: '重置实验' }).click();
  await expect(page.getByLabel('总样本量')).toHaveValue('2000'); await expect(page.getByLabel('随机种子')).toHaveValue('2026');
  await expect(page.getByLabel('分箱数量')).toHaveValue('10'); await expect(page.getByLabel('实验类型')).toHaveValue('overconfident');
  await expect(page.getByRole('heading', { name: '尚无实验数据' })).toBeVisible();
});

test('actual JSON and CSV downloads reproduce scores, rows, split, fit and SVG point coordinates', async ({ page }) => {
  await run(page); await calibrate(page);
  const json = JSON.parse(await downloaded(page, 'JSON')) as Experiment;
  const reference = runExperiment(json.config);
  // Math.exp/log implementations can differ in their last bits across runtimes.
  // Keep same-runtime replay byte-exact; cross-runtime compare at 11 decimals.
  const differences: string[] = [];
  const compare = (actual: unknown, expected: unknown, path = 'experiment'): void => {
    if (typeof expected === 'number') {
      if (typeof actual !== 'number' || !Number.isFinite(actual) || Math.abs(actual - expected) > 5e-12) differences.push(path);
    } else if (expected && typeof expected === 'object') {
      if (!actual || typeof actual !== 'object') { differences.push(path); return; }
      if (Array.isArray(expected) && (!Array.isArray(actual) || actual.length !== expected.length)) differences.push(path + '.length');
      for (const [key, value] of Object.entries(expected)) compare((actual as Record<string, unknown>)[key], value, path + '.' + key);
    } else if (actual !== expected) differences.push(path);
  };
  compare(json, reference);
  expect(differences).toEqual([]);
  const csv = parseCsv(await downloaded(page, 'CSV'));
  expect(csv).toHaveLength(2001); expect(csv[0]).toEqual(['split', 'id', 'trueProbability', 'originalProbability', 'outcome', 'plattProbability', 'isotonicProbability']);
  const testRows = csv.slice(1).filter(r => r[0] === 'test'); expect(testRows).toHaveLength(1000);
  testRows.forEach((r, i) => {
    expect(Number(r[1])).toBe(json.dataset.test[i].id); expect(Number(r[3])).toBe(json.dataset.test[i].probability);
    expect(Number(r[4])).toBe(json.dataset.test[i].outcome); expect(Number(r[5])).toBe(json.calibrated!.platt.probabilities![i]); expect(Number(r[6])).toBe(json.calibrated!.isotonic.probabilities![i]);
  });
  const bins = json.calibrated!.platt.evaluation!.bins.filter(b => b.count > 0);
  await expect(page.getByTestId('cal-bin')).toHaveCount(bins.length);
  for (let i = 0; i < bins.length; i++) {
    const circle = page.getByTestId('cal-bin').nth(i).locator('circle');
    expect(Number(await circle.getAttribute('cx'))).toBeCloseTo(58 + 450 * bins[i].meanProbability!, 8);
    expect(Number(await circle.getAttribute('cy'))).toBeCloseTo(476 - 420 * bins[i].eventRate!, 8);
    await expect(circle.locator('title')).toContainText(`n=${bins[i].count}`);
  }
});

test('fixed seed replays byte-identical data and results via user controls', async ({ page }) => {
  await run(page); await calibrate(page); const first = await downloaded(page, 'JSON');
  await run(page); await calibrate(page); expect(await downloaded(page, 'JSON')).toBe(first);
});

test('invalid numeric inputs, empty field and too few samples report errors', async ({ page }) => {
  for (const [label, value, message] of [['总样本量', '20001', '总样本量'], ['随机种子', '-1', '随机种子'], ['分箱数量', '1', '分箱数量'], ['总样本量', '', '请填写']] as const) {
    await page.getByRole('button', { name: '重置实验' }).click();
    await page.getByLabel(label).fill(value); await page.getByRole('button', { name: '运行实验', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(message);
    await expect(page.getByRole('heading', { name: '尚无实验数据' })).toBeVisible();
  }
  await page.getByLabel('总样本量').fill('2'); await run(page); await calibrate(page);
  await expect(page.getByRole('alert')).toContainText('不足 20 条');
  await expect(page.getByRole('table', { name: '分箱明细', exact: true })).toContainText('空箱');
  await expect(page.getByRole('table', { name: '分箱明细', exact: true })).toContainText('小样本');
});

test('worse held-out scoring is shown honestly', async ({ page }) => {
  await page.getByLabel('实验类型').selectOption('ideal'); await page.getByLabel('总样本量').fill('80');
  await page.getByLabel('随机种子').fill('3'); await run(page); await calibrate(page);
  await page.getByLabel('查看方法').selectOption('isotonic');
  await expect(page.getByTestId('metrics')).toContainText('变差');
  await expect(page.getByText('校准不保证改善测试评分。', { exact: false })).toBeVisible();
});

test('narrow mobile viewport keeps controls, graph and exports reachable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 }); await run(page); await calibrate(page);
  await expect(page.getByRole('img')).toBeVisible();
  const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
  expect(width.scroll).toBeLessThanOrEqual(width.inner);
  await page.getByLabel('查看方法').selectOption('isotonic');
  await expect(page.getByRole('table', { name: '分箱明细', exact: true })).toBeVisible();
  const json = JSON.parse(await downloaded(page, 'JSON')); expect(json.config.sampleSize).toBe(2000);
  await page.getByRole('button', { name: '重置实验' }).click();
  await expect(page.getByRole('heading', { name: '尚无实验数据' })).toBeVisible();
});

test('loaded production app runs with network blocked', async ({ page, context }) => {
  await context.setOffline(true); await run(page); await calibrate(page);
  await expect(page.locator('.fit-status')).toContainText('拟合成功');
  const json = JSON.parse(await downloaded(page, 'JSON')); expect(json.calibrated.platt.fit.ok).toBe(true);
});
