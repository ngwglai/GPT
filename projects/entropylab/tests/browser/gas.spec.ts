import { expect, test, type Page } from '@playwright/test';

async function gasMetric(page: Page, label: string) {
  return page
    .getByLabel('气体碰撞统计')
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
    .innerText();
}
async function paused(page: Page) {
  await expect(page.getByRole('status', { name: '模拟状态' })).toHaveText('已暂停');
}

test('real Worker collisions, speed histogram, conserved energy and pause barrier', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./');
  await expect.poll(() => page.workers().length).toBe(1);
  const energy = await gasMetric(page, '总动能');
  await page.getByRole('switch', { name: '中央隔板' }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect
    .poll(async () => Number((await gasMetric(page, '累计粒子间碰撞')).replaceAll(',', '')))
    .toBeGreaterThan(10);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await paused(page);
  expect(await gasMetric(page, '总动能')).toBe(energy);
  expect(Math.abs(Number(await gasMetric(page, '相对动能偏差')))).toBeLessThan(1e-9);
  const canvas = page.locator('canvas');
  const frame = await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  await page.waitForTimeout(200);
  expect(await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).toBe(frame);
  const bins = await page
    .getByRole('img', { name: /粒子速率分布/ })
    .locator('rect title')
    .allTextContents();
  expect(bins.reduce((sum, text) => sum + Number(text.match(/：([\d]+) 个/)![1]), 0)).toBe(500);
  await page.getByLabel('粒子显示模式').selectOption('speed');
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL())).not.toBe(frame);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('switch', { name: '中央隔板' }).click();
    await expect(page.getByRole('switch', { name: '中央隔板' })).toHaveAttribute(
      'aria-checked',
      i % 2 === 0 ? 'true' : 'false',
    );
  }
  expect(await gasMetric(page, '总动能')).toBe(energy);
  expect(errors).toEqual([]);
});

test('mode, radius and initial speed reset; zero speed and collision-free controls', async ({
  page,
}) => {
  await page.goto('./');
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect.poll(async () => Number((await gasMetric(page, '累计粒子间碰撞')).replaceAll(',', ''))).toBeGreaterThan(0);
  await page.getByRole('switch', { name: '粒子间碰撞' }).click();
  await paused(page);
  expect(await gasMetric(page, '累计粒子间碰撞')).toBe('0');
  await page.getByLabel('初始速度尺度').fill('0');
  await page.getByRole('button', { name: '单步执行' }).click();
  await expect.poll(() => gasMetric(page, '总动能')).toBe('0.000000');
  expect(await gasMetric(page, '平均粒子速度')).toBe('0.0000');
  await page.getByLabel('粒子半径').fill('0.006');
  await paused(page);
  expect(await gasMetric(page, '累计粒子间碰撞')).toBe('0');
  await page.getByRole('button', { name: '恢复默认参数' }).click();
  await expect(page.getByRole('switch', { name: '粒子间碰撞' })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByLabel('粒子数量')).toHaveValue('500');
  await expect.poll(() => gasMetric(page, '总动能')).toBe('15.625000');
});

test('rapid resets and experiment changes discard stale Worker responses', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('粒子数量').fill('2000');
  await page.getByLabel('初始速度尺度').fill('1');
  await page.getByLabel('播放倍率').selectOption('4');
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await expect.poll(() => page.workers().length).toBe(1);
  await page.getByRole('button', { name: '重置模拟' }).click();
  await page.getByLabel('粒子数量').fill('10');
  await page.getByLabel('初始速度尺度').fill('0');
  await page.waitForTimeout(250);
  await expect(page.getByLabel('实时统计')).toContainText('10 / 0');
  expect(await gasMetric(page, '总动能')).toBe('0.000000');
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /二维随机游走/ })
    .click();
  await expect.poll(() => page.workers().length).toBe(0);
  await page
    .getByRole('navigation')
    .getByRole('button', { name: /粒子扩散与熵增/ })
    .click();
  await expect.poll(() => page.workers().length).toBe(1);
  await expect(page.getByLabel('粒子数量')).toHaveValue('500');
  await paused(page);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
