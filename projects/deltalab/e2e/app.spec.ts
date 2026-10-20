import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const upload = (data: unknown) => ({ name: 'experiment.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(data)) });
test.beforeEach(async ({ page }) => { await page.goto('/'); await expect(page.getByRole('heading', { name: /需要重算多少/ })).toBeVisible(); });
test('loads the Chinese offline UI without external requests or console errors', async ({ page }) => {
  const errors: string[] = [], remote: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1:4188/')) remote.push(r.url()); });
  await page.reload(); await expect(page.locator('#graph svg')).toBeVisible();
  await expect(page.locator('#node-count')).toHaveText('6 节点');
  expect(errors).toEqual([]); expect(remote).toEqual([]);
});
test('switches all four presets using actual graph data', async ({ page }) => {
  for (const [name, count] of [['chain', 6], ['branch', 8], ['stable', 6], ['large', 80]] as const) {
    await page.locator('#preset').selectOption(name); await page.locator('#load').click();
    await expect(page.locator('#node-count')).toHaveText(`${count} 节点`);
    await expect(page.locator('#graph .node')).toHaveCount(count);
  }
});
test('batch updates compare full=4 dirty=3 change=1 and display cache reasons', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('2');
  await page.locator('#run').click();
  await expect(page.locator('#verification')).toContainText('✓ 通过');
  await expect(page.locator('#comparison tbody tr').nth(0)).toHaveText('full40');
  await expect(page.locator('#comparison tbody tr').nth(1)).toHaveText('dirty31');
  await expect(page.locator('#comparison tbody tr').nth(2)).toHaveText('change13');
  for (const [strategy, count] of [['full', '4'], ['dirty', '3'], ['change', '1']]) {
    await page.locator('#strategy').selectOption(strategy);
    await expect(page.locator('#metrics strong').first()).toHaveText(count);
  }
  await page.locator('#speed').selectOption('100'); await page.locator('#play').click();
  await expect(page.locator('#progress')).toHaveText('6 / 6 条');
  await expect(page.locator('#trace')).toContainText('传播截断 · 缓存');
  await expect(page.locator('#trace')).toContainText('已执行 · 输出稳定');
  await expect(page.locator('#graph')).toContainText('截断 · 缓存');
});
test('single step reveals exact real trace values in order', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('2');
  await page.locator('#step').click();
  await expect(page.locator('#progress')).toHaveText('1 / 6 条');
  await expect(page.locator('#trace tr')).toHaveCount(1);
  await expect(page.locator('#trace')).toContainText('-2 → 2');
  await page.locator('#step').click(); await page.locator('#step').click();
  await expect(page.locator('#trace tr').last()).toContainText('a');
  await expect(page.locator('#trace tr').last()).toContainText('已执行 · 输出稳定');
});
test('play, pause, strategy switch and reset cancel pending callbacks', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('2');
  await page.locator('#speed').selectOption('100'); await page.locator('#play').click();
  await expect(page.locator('#pause')).toBeEnabled(); await page.locator('#pause').click();
  const paused = await page.locator('#progress').textContent(); await page.waitForTimeout(250);
  await expect(page.locator('#progress')).toHaveText(paused!);
  await page.locator('#play').click(); await page.locator('#strategy').selectOption('dirty');
  await page.waitForTimeout(250); await expect(page.locator('#progress')).toHaveText('0 / 6 条');
  await page.locator('#play').click(); await page.locator('#reset').click();
  await page.waitForTimeout(250); await expect(page.locator('#progress')).toHaveText('0 / 0 条');
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toHaveValue('-2');
  await expect(page.locator('#verification')).toContainText('尚未运行');
});
test('simultaneously changed inputs and subsequent repeated updates remain correct', async ({ page }) => {
  await page.locator('#preset').selectOption('branch'); await page.locator('#load').click();
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('6');
  await page.getByRole('spinbutton', { name: '输入 y', exact: true }).fill('7');
  await page.locator('#run').click(); await expect(page.locator('#verification')).toContainText('✓ 通过');
  await expect(page.locator('#metrics strong').first()).toHaveText('3');
  await page.locator('#run').click(); await expect(page.locator('#metrics strong').first()).toHaveText('0');
  await expect(page.locator('#verification')).toContainText('✓ 通过');
});
test('explicit validation checks all three strategies against reference', async ({ page }) => {
  await page.locator('#validate').click();
  await expect(page.locator('#verification')).toContainText('全部节点数值、缓存及依赖');
  await expect(page.locator('#comparison tbody tr')).toHaveCount(3);
});
test('exports current inputs and safely imports with complete cache rebuild', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('7'); await page.locator('#run').click();
  const event = page.waitForEvent('download'); await page.locator('#export').click(); const download = await event;
  const data = JSON.parse(await readFile((await download.path())!, 'utf8'));
  expect(data.version).toBe(1); expect(data.inputs.x).toBe(7); expect(data.seed).toBe(2026);
  data.cache = { a: { value: 999 } }; data.results = { a: 999 };
  await page.locator('#reset').click(); await page.locator('#import').setInputFiles(upload(data));
  await expect(page.locator('#message')).toContainText('全部缓存');
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toHaveValue('7');
  await page.locator('#validate').click(); await expect(page.locator('#verification')).toContainText('✓ 通过');
});
test('invalid JSON and dangerous IDs show errors and retain the existing graph', async ({ page }) => {
  await page.locator('#import').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{bad') });
  await expect(page.locator('#message')).toBeVisible();
  await page.locator('#import').setInputFiles(upload({ version: 1, graph: { nodes: [{ id: '<script>', kind: 'input', value: 0 }] } }));
  await expect(page.locator('#message')).toContainText('节点 ID');
  await expect(page.locator('#node-count')).toHaveText('6 节点');
  await page.locator('#import').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(524289, 32) });
  await expect(page.locator('#message')).toContainText('512 KiB');
});
test('edits, adds and deletes nodes with cycle and dependency validation', async ({ page }) => {
  await page.locator('#node-id').fill('extra'); await page.locator('#node-value').fill('9'); await page.locator('#save-node').click();
  await expect(page.locator('#node-count')).toHaveText('7 节点');
  await page.locator('#node-select').selectOption('extra'); await page.locator('#delete-node').click();
  await expect(page.locator('#node-count')).toHaveText('6 节点');
  await page.locator('#node-select').selectOption('a'); await page.locator('#node-deps').fill('b'); await page.locator('#save-node').click();
  await expect(page.locator('#message')).toContainText('环');
  await page.locator('#node-select').selectOption('x'); await page.locator('#delete-node').click();
  await expect(page.locator('#message')).toContainText('不存在的依赖');
  await page.locator('#node-value').fill('5'); await page.locator('#save-node').click(); await page.locator('#validate').click();
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toHaveValue('5');
  await expect(page.locator('#verification')).toContainText('✓ 通过');
});
test('editing an input back to its original value preserves the requested value', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('2'); await page.locator('#run').click();
  await page.locator('#node-select').selectOption('x'); await page.locator('#node-value').fill('-2'); await page.locator('#save-node').click();
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toHaveValue('-2');
});
test('invalid input and arithmetic overflow keep the last valid state', async ({ page }) => {
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill(''); await page.locator('#run').click();
  await expect(page.locator('#message')).toContainText('不得为空');
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('1e308'); await page.locator('#run').click();
  await expect(page.locator('#message')).toContainText('溢出');
  await page.locator('#reset').click(); await page.locator('#validate').click();
  await expect(page.locator('#verification')).toContainText('✓ 通过');
});
test('theme persists across reload and graph nodes support keyboard editing', async ({ page }) => {
  await page.locator('#theme').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const node = page.getByRole('button', { name: '编辑节点 a', exact: true }); await node.focus(); await node.press('Enter');
  await expect(page.locator('#node-select')).toHaveValue('a');
  await page.locator('#theme').click(); await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
test('narrow layout supports editing and horizontal graph scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#preset').selectOption('chain'); await page.locator('#load').click();
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.locator('#graph').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  await page.locator('#graph').scrollIntoViewIfNeeded();
  await page.locator('#graph').evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(page.getByRole('button', { name: '编辑节点 d', exact: true })).toBeInViewport();
  await page.locator('#run').click(); await expect(page.locator('#verification')).toContainText('✓ 通过');
});
test('1000-node fixed-seed graph renders and validates without changing semantics', async ({ page }) => {
  await page.locator('#preset').selectOption('large'); await page.locator('#size').fill('1000'); await page.locator('#seed').fill('42'); await page.locator('#load').click();
  await expect(page.locator('#graph .node')).toHaveCount(1000);
  await page.getByRole('spinbutton', { name: '输入 i0', exact: true }).fill('6'); await page.locator('#run').click();
  await expect(page.locator('#verification')).toContainText('✓ 通过');
  await page.locator('#step').click(); await expect(page.locator('#progress')).toContainText('1 /');
});

test('editing a verified input invalidates old evidence and validation consumes the new draft', async ({ page }) => {
  await page.locator('#run').click(); await expect(page.locator('#verification')).toContainText('✓ 通过');
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('9');
  await expect(page.locator('#verification')).toContainText('尚未运行');
  await expect(page.locator('#comparison tbody tr')).toHaveCount(0);
  await page.locator('#validate').click(); await expect(page.locator('#verification')).toContainText('✓ 通过');
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toHaveValue('9');
  await page.locator('#step').click(); await expect(page.locator('#trace')).toContainText('-2 → 9');
});
test('selected input editor refreshes after a batch and saving keeps the committed value', async ({ page }) => {
  await page.locator('#node-select').selectOption('x'); await expect(page.locator('#node-value')).toHaveValue('-2');
  await page.getByRole('spinbutton', { name: '输入 x', exact: true }).fill('2'); await page.locator('#run').click();
  await expect(page.locator('#node-value')).toHaveValue('2'); await page.locator('#save-node').click();
  await expect(page.getByRole('spinbutton', { name: '输入 x', exact: true })).toHaveValue('2');
  await page.locator('#validate').click(); await expect(page.locator('#verification')).toContainText('✓ 通过');
});
test('import rejects preset parameters that cannot be reloaded', async ({ page }) => {
  const data = { version: 1, graph: { nodes: [{ id: 'x', kind: 'input', value: 1 }] }, inputs: { x: 1 }, parameters: { strategy: 'change', preset: 'large', size: 1 }, seed: 42 };
  await page.locator('#import').setInputFiles(upload(data));
  await expect(page.locator('#message')).toContainText('实验参数无效'); await expect(page.locator('#node-count')).toHaveText('6 节点');
});
