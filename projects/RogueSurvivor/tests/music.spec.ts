import { test, expect } from "@playwright/test";
test("真实音乐播放、失焦立即暂停与开关保存", async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Audio;
    (window as any).Audio = function(src: string) {
      const a = new Native(src); (window as any).battleAudio = a; return a;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.getByRole("button", { name: "踏入星林" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).battleAudio?.currentTime || 0)).toBeGreaterThan(.1);
  expect(await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    return (window as any).battleAudio.paused;
  })).toBe(true);
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await page.locator("#musicEnabled").uncheck();
  await page.locator("#music").fill("0.47");
  await page.getByRole("button", { name: "保存设置", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("设置已保存");
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.locator("#musicEnabled")).not.toBeChecked();
  await expect(page.locator("#music")).toHaveValue("0.47");
});
