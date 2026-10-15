import { test, expect, type Page } from '@playwright/test';

async function choose(page: Page, name: string) {
  await page
    .getByRole('navigation', { name: '实验选择' })
    .getByRole('button', { name: new RegExp(name) })
    .click();
}
async function metric(page: Page, label: string) {
  return page
    .getByLabel('实时统计')
    .locator('.metric')
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator('strong')
    .innerText();
}

test('four real canvas simulations, transport and parameter controls', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('粒子扩散与熵增');
  const canvas = page.getByLabel('粒子扩散与熵增模拟画布');
  await expect
    .poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.width))
    .toBeGreaterThan(0);
  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL());
  await page.getByRole('switch', { name: '中央隔板' }).click();
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect.poll(() => metric(page, '模拟时间')).not.toBe('0.0');
  await expect
    .poll(() => canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL()))
    .not.toBe(before);
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await metric(page, '模拟时间');
  await page.waitForTimeout(250);
  expect(await metric(page, '模拟时间')).toBe(paused);
  await page.getByRole('button', { name: '开始模拟', exact: true }).click();
  await expect.poll(() => metric(page, '模拟时间')).not.toBe(paused);
  await page.getByRole('button', { name: '重置模拟' }).click();
  expect(await metric(page, '模拟时间')).toBe('0.0');
  await expect(page.getByRole('status', { name: '模拟状态' })).toHaveText('已暂停');
  await choose(page, '二维随机游走');
  await page.getByRole('button', { name: '+100 步' }).click();
  expect(await metric(page, '累计步数')).toBe('100');
  expect(await metric(page, '理论期望 nℓ²')).toBe('100.00');
  await page.getByLabel('轨迹观察窗口').selectOption('128');
  await page.getByLabel('步长 ℓ').fill('5');
  expect(await metric(page, '累计步数')).toBe('0');
  await choose(page, '康威生命游戏');
  await page.getByLabel('经典预设').selectOption('blinker');
  await page.getByLabel('边界条件').selectOption('finite');
  await page.getByRole('button', { name: '单步执行' }).click();
  expect(await metric(page, '当前代数')).toBe('1');
  expect(await metric(page, '活细胞数量')).toBe('3');
  await choose(page, '二维伊辛模型');
  await page.getByLabel('初始状态').selectOption('ordered');
  await page.getByLabel('温度 T').fill('0');
  await page.getByRole('button', { name: '单步执行' }).click();
  expect(await metric(page, '每自旋平均能量')).toBe('-2.000');
  expect(await metric(page, '每自旋磁化 m')).toBe('1.000');
  await page.getByRole('button', { name: '恢复默认参数' }).click();
  expect(await metric(page, 'Monte Carlo 步数')).toBe('0');
  await page.getByRole('button', { name: '切换浅色主题' }).click();
  await expect(page.locator('.app')).toHaveClass('app light');
  expect(errors).toEqual([]);
});

test('Life supports dragging, erasing and responsive pixel coordinates', async ({ page }) => {
  await page.goto('./');
  await choose(page, '康威生命游戏');
  await page.getByLabel('经典预设').selectOption('empty');
  const canvas = page.getByLabel('康威生命游戏模拟画布');
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 12 });
  await page.mouse.up();
  expect(Number(await metric(page, '活细胞数量'))).toBeGreaterThan(4);
  await page.getByRole('button', { name: '擦除细胞' }).click();
  const eraseBox = (await canvas.boundingBox())!;
  await page.mouse.move(eraseBox.x + eraseBox.width / 2, eraseBox.y + eraseBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(eraseBox.x + eraseBox.width / 2 + 60, eraseBox.y + eraseBox.height / 2, {
    steps: 12,
  });
  await page.mouse.up();
  expect(await metric(page, '活细胞数量')).toBe('0');
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      canvas.evaluate(
        (node: HTMLCanvasElement) =>
          node.width / Math.min(devicePixelRatio, 2) - node.getBoundingClientRect().width,
      ),
    )
    .toBeLessThan(1);
  await page.getByRole('button', { name: '绘制细胞' }).click();
  await canvas.click({ position: { x: 100, y: 150 } });
  expect(await metric(page, '活细胞数量')).toBe('1');
});

test('desktop, tablet and phone layouts remain within viewport', async ({ page }) => {
  await page.goto('./');
  for (const width of [1440, 1024, 768, 740, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of ['粒子扩散与熵增', '二维随机游走', '康威生命游戏', '二维伊辛模型']) {
      await choose(page, name);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
      const canvas = page.locator('canvas');
      await expect(canvas).toBeVisible();
      const box = (await canvas.boundingBox())!;
      expect(box.width).toBeGreaterThan(200);
      expect(box.height).toBeGreaterThan(200);
    }
  }
});

test('maximum parameters still advance all four simulations without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  const experiments = [
    { name: '粒子扩散与熵增', metric: '模拟时间' },
    { name: '二维随机游走', metric: '累计步数' },
    { name: '康威生命游戏', metric: '当前代数' },
    { name: '二维伊辛模型', metric: 'Monte Carlo 步数' },
  ];
  for (const experiment of experiments) {
    await choose(page, experiment.name);
    if (experiment.name === '粒子扩散与熵增') {
      await page.getByLabel('粒子数量').fill('2000');
      await page.getByLabel('运动速度').fill('1');
      await page.getByRole('switch').click();
    } else if (experiment.name === '二维随机游走') {
      await page.getByLabel('粒子数量').fill('512');
      await page.getByLabel('步长 ℓ').fill('5');
      await page.getByLabel('轨迹观察窗口').selectOption('128');
      await page.getByLabel('步进频率').fill('30');
    } else {
      await page.getByLabel('网格大小').selectOption('96');
      if (experiment.name === '康威生命游戏') {
        await page.getByLabel('经典预设').selectOption('random');
        await page.getByLabel('演化频率').fill('30');
      } else {
        await page.getByLabel('温度 T').fill('5');
        await page.getByLabel('采样频率').fill('30');
      }
    }
    await page.getByLabel('播放倍率').selectOption('4');
    const before = await page.locator('canvas').evaluate((node: HTMLCanvasElement) => node.toDataURL());
    const initialTime = await metric(page, experiment.metric);
    await page.getByRole('button', { name: '开始模拟', exact: true }).click();
    await expect.poll(() => metric(page, experiment.metric)).not.toBe(initialTime);
    await expect.poll(() => page.locator('canvas').evaluate((node: HTMLCanvasElement) => node.toDataURL())).not.toBe(before);
    await page.getByRole('button', { name: '暂停', exact: true }).click();
  }
  expect(errors).toEqual([]);
});

test('touch users can paint and erase on the mobile lattice', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/GPT/entropylab/');
  await choose(page, '康威生命游戏');
  await page.getByLabel('经典预设').selectOption('empty');
  const canvas = page.getByLabel('康威生命游戏模拟画布');
  await canvas.tap({ position: { x: 140, y: 150 } });
  expect(await metric(page, '活细胞数量')).toBe('1');
  await page.getByRole('button', { name: '擦除细胞' }).tap();
  await canvas.tap({ position: { x: 140, y: 150 } });
  expect(await metric(page, '活细胞数量')).toBe('0');
  await context.close();
});
