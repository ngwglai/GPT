import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
async function choose(page: Page, name: string) { await page.goto('/'); await page.getByLabel('内置案例').selectOption(name); }
async function run(page: Page) { await page.getByRole('button', { name: '开始合成', exact: true }).click(); }
for (const name of ['Max2', 'Abs', 'Clamp', 'Sign']) test(`real production Worker synthesizes ${name} with counterexamples`, async ({ page }) => {
  const workers: string[] = []; page.on('worker', w => workers.push(w.url()));
  await choose(page, name); await run(page);
  await expect(page.getByRole('status')).toHaveText('有限域验证通过', { timeout: 20000 });
  expect(workers.some(w => /synth.worker.*\.js/.test(w))).toBe(true);
  await expect(page.getByText(/真实反例：/).first()).toBeVisible();
  await expect(page.getByText(/完整通过（仅有限域）/)).toBeVisible();
  await expect(page.getByTestId('candidate')).not.toHaveText('从一个样例开始，寻找一个程序。');
});
test('edits invalidate verified conclusions; reset restores preset', async ({ page }) => {
  await choose(page, 'Abs'); await run(page); await expect(page.getByRole('status')).toHaveText('有限域验证通过');
  await page.getByLabel('输入输出样例', { exact: true }).fill('[{"input":[2],"output":2}]');
  await expect(page.getByRole('status')).toHaveText('等待实验'); await expect(page.getByText(/完整通过（仅有限域）/)).toHaveCount(0);
  await page.getByRole('button', { name: '重置', exact: true }).click(); await expect(page.getByLabel('输入输出样例', { exact: true })).toContainText('1');
});
test('invalid input and contradictory target samples show errors', async ({ page }) => {
  await choose(page, 'Abs'); await page.getByLabel('输入输出样例', { exact: true }).fill('{broken'); await run(page);
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('输入输出样例', { exact: true }).fill('[{"input":[1],"output":2}]'); await run(page);
  await expect(page.getByRole('status')).toHaveText('非法输入'); await expect(page.getByText('初始样例与目标规格冲突')).toBeVisible();
});
test('bounded no-solution differs from resource exhaustion', async ({ page }) => {
  await choose(page, 'Abs'); for (const op of ['sub', 'lt', 'if']) await page.getByLabel(op, { exact: true }).uncheck();
  await run(page); await expect(page.getByRole('status')).toHaveText('有界范围无解');
  await page.getByRole('button', { name: '重置', exact: true }).click(); await page.getByLabel('总候选预算', { exact: true }).fill('1');
  await run(page); await expect(page.getByRole('status')).toHaveText('资源预算耗尽');
});
test('cancel immediately terminates real Worker without claiming success', async ({ page }) => {
  await choose(page, 'Sign'); await run(page); await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('已取消'); await expect(page.getByText(/完整通过（仅有限域）/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始合成', exact: true })).toBeEnabled();
});
test('verification budget cannot be reported as passed', async ({ page }) => {
  await choose(page, 'Abs'); await page.getByLabel('每轮验证数量上限').fill('1'); await run(page);
  await expect(page.getByRole('status')).toHaveText('资源预算耗尽'); await expect(page.getByText(/验证未完成/).first()).toBeVisible();
});
test('export download and import restore config without trusting historical results', async ({ page }) => {
  await choose(page, 'Sign'); await run(page); await expect(page.getByRole('status')).toHaveText('有限域验证通过');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  expect((await download).suggestedFilename()).toBe('synthlab-experiment.json');
  const text = await page.getByLabel('实验 JSON', { exact: true }).inputValue(); const data = JSON.parse(text);
  expect(data.result.status).toBe('verified'); expect(data.result.stats.generated).toBeGreaterThan(0);
  await page.getByRole('button', { name: '导入 JSON', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('等待实验'); await expect(page.getByText(/完整通过（仅有限域）/)).toHaveCount(0);
  await run(page); await expect(page.getByRole('status')).toHaveText('有限域验证通过');
});
test('invalid file import clears prior verification', async ({ page }) => {
  await choose(page, 'Max2'); await run(page); await expect(page.getByRole('status')).toHaveText('有限域验证通过');
  await page.getByLabel('导入文件').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.getByRole('alert')).toBeVisible(); await expect(page.getByRole('status')).toHaveText('等待实验');
});
test('production Worker loading failure is distinct from search outcomes', async ({ page }) => {
  await page.route('**/assets/synth.worker-*.js', route => route.abort());
  await choose(page, 'Abs'); await run(page); await expect(page.getByRole('status')).toHaveText('Worker 故障');
});
test('restricted custom AST specification and narrow dark/light UI', async ({ page }) => {
  await choose(page, 'Abs'); await page.getByLabel('目标规格').selectOption('expression');
  await page.getByLabel('规格 AST').fill('{"op":"add","args":[{"op":"var","index":0},{"op":"int","value":1}]}');
  await page.getByLabel('输入输出样例', { exact: true }).fill('[{"input":[0],"output":1}]'); await page.getByLabel('add', { exact: true }).check();
  await run(page); await expect(page.getByRole('status')).toHaveText('有限域验证通过');
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByRole('button', { name: '切换主题' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '开始合成', exact: true })).toBeVisible();
  await page.getByLabel('规格 AST').fill('{"op":"int","value":7}'); await expect(page.getByRole('status')).toHaveText('等待实验');
});
