import { expect, type Page } from "@playwright/test";
export async function start(page: Page, policy = "build", mode = "standard") {
  await page.goto("/ai.html");
  await expect(page.locator("#start")).toBeEnabled();
  await page.locator('[name="policy"]').selectOption(policy);
  await page.locator('[name="mode"]').selectOption(mode);
  await page.locator("#start").click();
}
export async function advance(page: Page) {
  await page.locator("#advance").click();
  await expect
    .poll(
      async () =>
        Number(await page.locator("#status").getAttribute("data-choices")),
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
}
export async function exported(page: Page) {
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const d = await download;
  const stream = await d.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
