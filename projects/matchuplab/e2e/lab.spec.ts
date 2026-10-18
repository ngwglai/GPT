import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test.beforeEach(async ({ page }) => { await page.goto('/'); });

test('configure tactical game, run, inspect both stages and export reproducible JSON/CSV', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.getByLabel('博弈环境').selectOption('tactics');
  await page.getByLabel('演示算法').selectOption('exp3');
  await page.getByLabel('训练回合', { exact: true }).fill('40');
  await page.getByLabel('测试回合 / 阶段').fill('20');
  await page.getByLabel('随机种子', { exact: true }).fill('17');
  await page.getByLabel('批量种子数').fill('2');
  await page.getByRole('button', { name: '运行批量比较', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('完整完成');
  await expect(page.getByRole('img', { name: '训练平均收益学习曲线', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '独立测试', exact: true }).click();
  await expect(page.getByRole('img', { name: '独立测试平均收益学习曲线' })).toBeVisible();
  await page.getByLabel('显示累计收益').check();
  await expect(page.getByRole('img', { name: '独立测试累计收益学习曲线' })).toBeVisible();
  const [jsonDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '↓ JSON' }).click()]);
  const data = JSON.parse(await readFile((await jsonDownload.path())!, 'utf8'));
  expect(data.config.game).toBe('tactics'); expect(data.seedValues).toEqual([17, 18]);
  expect(data.runs).toHaveLength(8); expect(data.summary).toHaveLength(8);
  expect(data.runs[0].phases.test.metrics.n).toBe(20);
  const [csvDownload] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '↓ CSV' }).click()]);
  const csv = await readFile((await csvDownload.path())!, 'utf8'); expect(csv).toContain('schemaVersion'); expect(csv.split('\r\n')).toHaveLength(17);
  expect(errors).toEqual([]);
});

test('single round, pause, resume and reset preserve control state', async ({ page }) => {
  await page.getByRole('button', { name: '单局演示', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已暂停');
  await expect(page.getByText('1 / 1,500 回合', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '单局演示', exact: true }).click();
  await expect(page.getByText('2 / 1,500 回合', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已暂停');
  await page.waitForTimeout(180);
  const progress = await page.getByRole('progressbar').getAttribute('value');
  await page.waitForTimeout(180);
  expect(await page.getByRole('progressbar').getAttribute('value')).toBe(progress);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('等待配置');
  await expect(page.getByRole('button', { name: '↓ JSON' })).toBeDisabled();
  await expect(page.getByLabel('训练回合', { exact: true })).toBeEnabled();
});

test('transfer template compares frozen source and target and switching template exposes threshold', async ({ page }) => {
  await page.getByRole('button', { name: /03.*训练后迁移至新对手/ }).click();
  await expect(page.getByLabel('冻结后对比迁移至新对手')).toBeChecked();
  await page.getByLabel('训练回合', { exact: true }).fill('30');
  await page.getByLabel('测试回合 / 阶段').fill('10');
  await page.getByLabel('批量种子数').fill('2');
  await page.getByRole('button', { name: '运行批量比较' }).click();
  await expect(page.getByRole('status')).toHaveText('完整完成');
  await page.getByRole('button', { name: '迁移测试', exact: true }).click();
  await expect(page.getByRole('img', { name: '迁移测试平均收益学习曲线' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(17); // 12 result rows + result header + 4 matrix rows.
  await page.getByRole('button', { name: /02.*对手中途改变策略/ }).click();
  await expect(page.getByLabel('切换前回合数')).toHaveValue('500');
  await expect(page.getByRole('status')).toHaveText('等待配置');
  await expect(page.getByRole('button', { name: '↓ JSON' })).toBeDisabled();
});

test('budget and invalid numbers show clear errors without starting simulations', async ({ page }) => {
  await page.getByLabel('训练回合', { exact: true }).fill('20000');
  await page.getByLabel('测试回合 / 阶段').fill('20000');
  await page.getByLabel('批量种子数').fill('32');
  await page.getByRole('button', { name: '运行批量比较' }).click();
  await expect(page.getByRole('alert')).toContainText('预算');
  await page.getByLabel('随机种子', { exact: true }).fill('');
  await page.getByRole('button', { name: '连续演示' }).click();
  await expect(page.getByRole('alert')).toContainText('种子');
});

test('cancel a large batch, discard incomplete data and start another run', async ({ page }) => {
  await page.getByLabel('训练回合', { exact: true }).fill('10000');
  await page.getByLabel('测试回合 / 阶段').fill('5000');
  await page.getByLabel('批量种子数').fill('32');
  await page.getByRole('button', { name: '运行批量比较' }).click();
  await page.getByRole('button', { name: '取消任务' }).click();
  await expect(page.getByRole('status')).toHaveText('已取消');
  await expect(page.getByRole('button', { name: '↓ CSV' })).toBeDisabled();
  await page.getByRole('button', { name: /01.*固定对手学习/ }).click();
  await page.getByRole('button', { name: '单局演示', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已暂停');
});

test('editing a completed configuration clears stale exports', async ({ page }) => {
  await page.getByLabel('训练回合', { exact: true }).fill('5');
  await page.getByLabel('测试回合 / 阶段').fill('5');
  await page.getByRole('button', { name: '连续演示' }).click();
  await expect(page.getByRole('status')).toHaveText('完整完成');
  await expect(page.getByRole('button', { name: '↓ JSON' })).toBeEnabled();
  await page.getByLabel('探索率 ε').fill('0.2');
  await expect(page.getByRole('button', { name: '↓ JSON' })).toBeDisabled();
  await expect(page.getByRole('status')).toHaveText('等待配置');
});

test('small mobile viewport and keyboard access remain usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: /对手未知，\s*策略如何生长？/ })).toBeVisible();
  await page.getByRole('button', { name: '单局演示', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toHaveText('已暂停');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
});

test('opponent parameter controls run bias and reactive configurations', async ({ page }) => {
  const strategy = page.getByRole('group', { name: '训练 / 原对手测试', exact: true }).getByRole('combobox', { name: '策略', exact: true });
  await strategy.selectOption('biased'); await page.getByLabel('偏好概率').fill('0.9');
  await page.getByLabel('训练回合', { exact: true }).fill('10'); await page.getByLabel('测试回合 / 阶段').fill('5');
  await page.getByRole('button', { name: '连续演示' }).click();
  await expect(page.getByRole('status')).toHaveText('完整完成');
  await strategy.selectOption('reactive');
  await page.getByRole('button', { name: '连续演示' }).click();
  await expect(page.getByRole('status')).toHaveText('完整完成');
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
});
