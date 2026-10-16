import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const source = (page: Page) => page.getByRole('textbox', { name: '实验文本' });
const status = (page: Page) => page.getByTestId('playback-status');
async function runToEnd(page: Page) {
  await page.getByLabel('步进间隔').selectOption('100');
  const play = page.getByRole('button', { name: '自动运行', exact: true });
  if (await play.isEnabled()) await play.click();
  await expect(status(page)).toContainText('完成', { timeout: 20000 });
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  await page.goto('/');
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('entropy scans real frequencies, pauses, resumes and resets', async ({ page }) => {
  await source(page).fill('aaabbc🙂');
  await expect(status(page)).toContainText('步骤 0 / 7');
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(page.getByRole('table', { name: '字符频率与概率 · 已扫描 1 个符号' })).toBeVisible();
  await page.getByLabel('步进间隔').selectOption('700');
  await page.getByRole('button', { name: '自动运行', exact: true }).click();
  await expect(status(page)).toContainText('运行中');
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  const paused = await status(page).innerText();
  await page.waitForTimeout(850);
  expect(await status(page).innerText()).toBe(paused);
  await runToEnd(page);
  await expect(page.getByRole('table', { name: '字符频率与概率 · 已扫描 7 个符号' })).toBeVisible();
  await expect(page.getByRole('row').filter({ hasText: '🙂' }).first()).toContainText('14.29%');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(status(page)).toContainText('步骤 0 / 7 · 已暂停');
});

test('Huffman displays actual merge, final tree, prefix-free codes and bits', async ({ page }) => {
  await source(page).fill('abcd');
  await page.getByRole('button', { name: '02Huffman Coding' }).click();
  await expect(status(page)).toContainText('步骤 0 / 3');
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(page.getByText('合并 #0 (1) + #1 (1) → #4 (2)', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: '当前真实 Huffman Tree' })).toBeVisible();
  await page.getByLabel('步进间隔').selectOption('700');
  await page.getByRole('button', { name: '自动运行', exact: true }).click();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(status(page)).toContainText('已暂停');
  await runToEnd(page);
  await expect(page.getByText('Prefix-free：通过 · 解码回环：通过')).toBeVisible();
  await expect(page.getByLabel('Huffman bit stream')).toHaveText('00011011');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.getByLabel('Huffman bit stream')).toHaveCount(0);
});

test('Huffman handles single-symbol Unicode and empty input', async ({ page }) => {
  await page.getByRole('button', { name: '02Huffman Coding' }).click();
  await source(page).fill('🙂🙂🙂');
  await expect(status(page)).toContainText('完成');
  await expect(page.getByLabel('Huffman bit stream')).toHaveText('000');
  await page.getByRole('button', { name: '清空输入', exact: true }).click();
  await expect(page.getByLabel('Huffman bit stream')).toHaveText('∅');
  await expect(page.getByText('空树', { exact: true })).toBeVisible();
  await expect(page.getByText('Prefix-free：通过 · 解码回环：通过')).toBeVisible();
});

test('RLE scans a current run and flushes final tokens', async ({ page }) => {
  await source(page).fill('aaabb');
  await page.getByRole('button', { name: '03RLE + LZ77' }).click();
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(page.getByText('扫描位置 0 · 当前 run：a × 1', { exact: true })).toBeVisible();
  await expect(page.getByTestId('rle-tokens')).toHaveText('[]');
  await runToEnd(page);
  expect(JSON.parse(await page.getByTestId('rle-tokens').innerText())).toEqual([{ symbol: 'a', count: 3 }, { symbol: 'b', count: 2 }]);
  await expect(page.getByText('完整结果 encode → decode 回环：通过')).toBeVisible();
});

test('LZ77 shows overlapping match and resets on configuration change', async ({ page }) => {
  await source(page).fill('aaaaaaaa');
  await page.getByRole('button', { name: '03RLE + LZ77' }).click();
  await page.getByRole('button', { name: 'LZ77', exact: true }).click();
  await page.getByLabel('窗口大小', { exact: true }).selectOption('4');
  await page.getByLabel('Lookahead 大小', { exact: true }).selectOption('16');
  await runToEnd(page);
  await expect(page.getByTestId('lz-tokens')).toHaveText('(0, 0, "a")\n(1, 7, null)');
  await page.getByRole('button', { name: '重置', exact: true }).click();
  await expect(page.getByTestId('lz-tokens')).toHaveText('∅');
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(page.getByText('当前匹配：distance=1, length=7')).toBeVisible();
  await page.getByLabel('窗口大小', { exact: true }).selectOption('8');
  await expect(status(page)).toContainText('步骤 0 /');
  await expect(status(page)).toContainText('已暂停');
});

test('BWT builds rotations, sorts, extracts last column and runs MTF', async ({ page }) => {
  await source(page).fill('banana');
  await page.getByRole('button', { name: '04BWT + Move-to-Front' }).click();
  await page.getByRole('button', { name: '单步', exact: true }).click();
  await expect(page.locator('.matrix tbody tr')).toHaveCount(1);
  await expect(page.locator('.matrix tbody tr')).toContainText('banana');
  await runToEnd(page);
  await expect(page.getByTestId('last-column')).toHaveText('nnbaaa');
  await expect(page.getByText('Primary index：3（排序后原始行的 0-based 索引）')).toBeVisible();
  await expect(page.getByTestId('mtf-output')).toHaveText('2, 0, 2, 2, 0, 0');
  await expect(page.getByText('inverse MTF → inverse BWT 回环：通过')).toBeVisible();
});

test('BWT limit does not truncate text and other experiments remain usable', async ({ page }) => {
  const input = 'a'.repeat(97);
  await source(page).fill(input);
  await page.getByRole('button', { name: '04BWT + Move-to-Front' }).click();
  await expect(page.getByRole('alert')).toContainText('BWT 上限为 96');
  await expect(page.getByRole('button', { name: '单步', exact: true })).toBeDisabled();
  await expect(source(page)).toHaveValue(input);
  await page.getByRole('button', { name: '02Huffman Coding' }).click();
  await expect(page.getByLabel('Huffman bit stream')).toHaveText('0'.repeat(97));
  await source(page).fill('banana');
  await page.getByRole('button', { name: '04BWT + Move-to-Front' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(status(page)).toContainText('步骤 0 /');
});

test('bounded traces recover from over-limit input without losing text', async ({ page }) => {
  await source(page).fill('中'.repeat(513));
  await expect(page.getByRole('alert')).toContainText('输入超过 512');
  await expect(page.getByRole('button', { name: '单步', exact: true })).toHaveCount(0);
  await source(page).fill('中🙂');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(status(page)).toContainText('步骤 0 / 2');
});

test('all five datasets update and reset the actual experiment', async ({ page }) => {
  for (const name of ['English-like text', 'Highly repetitive text', 'Periodic text', 'Random text', 'DNA-like sequence']) {
    await page.getByLabel('内置数据集', { exact: true }).selectOption(name);
    await expect(source(page)).not.toBeEmpty();
    await expect(status(page)).toContainText('步骤 0 /');
    await page.getByRole('button', { name: '单步', exact: true }).click();
    await expect(status(page)).toContainText('步骤 1 /');
  }
});

test('editing or switching experiments pauses and clears prior playback', async ({ page }) => {
  await source(page).fill('ab'.repeat(30));
  await page.getByRole('button', { name: '自动运行', exact: true }).click();
  await expect(status(page)).toContainText('运行中');
  await source(page).fill('xyz');
  await expect(status(page)).toContainText('步骤 0 / 3 · 已暂停');
  await page.getByRole('button', { name: '自动运行', exact: true }).click();
  await page.getByRole('button', { name: '02Huffman Coding' }).click();
  await expect(status(page)).toContainText('步骤 0 / 2 · 已暂停');
});

test('empty input works across every experiment', async ({ page }) => {
  await page.getByRole('button', { name: '清空输入', exact: true }).click();
  await expect(status(page)).toContainText('完成');
  await page.getByRole('button', { name: '03RLE + LZ77' }).click();
  await runToEnd(page);
  await expect(page.getByTestId('rle-tokens')).toHaveText('[]');
  await page.getByRole('button', { name: 'LZ77', exact: true }).click();
  await runToEnd(page);
  await expect(page.getByTestId('lz-tokens')).toHaveText('∅');
  await page.getByRole('button', { name: '04BWT + Move-to-Front' }).click();
  await runToEnd(page);
  await expect(page.getByTestId('mtf-output')).toHaveText('∅');
});

test('theme persists, narrow screen stays bounded, reduced-motion is usable', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const oldTheme = await page.locator('html').getAttribute('data-theme');
  await page.getByRole('button', { name: '切换主题' }).click();
  const theme = await page.locator('html').getAttribute('data-theme');
  expect(theme).not.toBe(oldTheme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme!);
  for (const name of ['01Information Entropy', '02Huffman Coding', '03RLE + LZ77', '04BWT + Move-to-Front']) {
    await page.getByRole('button', { name }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await source(page).fill('banana');
  await runToEnd(page);
});

test('input is local, safely rendered, not persisted, and works offline after load', async ({ page, context }) => {
  const external: string[] = [];
  page.on('request', request => { if (new URL(request.url()).hostname !== '127.0.0.1') external.push(request.url()); });
  await context.setOffline(true);
  const text = '<script>alert("test")</script>🙂';
  await source(page).fill(text);
  await page.getByRole('button', { name: '02Huffman Coding' }).click();
  await runToEnd(page);
  await expect(page.getByText('Prefix-free：通过 · 解码回环：通过')).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(['compressionlab-theme']);
  expect(external).toEqual([]);
  await context.setOffline(false);
  await page.reload();
  await expect(source(page)).not.toHaveValue(text);
});
