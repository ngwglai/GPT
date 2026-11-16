import { test, expect } from "@playwright/test";
test("独立 AI 入口使用真实渲染、自动选牌、暂停且不写手动存档", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 800, height: 600 });
  await page.goto("/ai.html");
  await expect(
    page.getByRole("heading", { name: "AI 自动玩家实验室" }),
  ).toBeVisible();
  // The lab does not even open the game's IndexedDB database.
  await page.locator('select[name="policy"]').selectOption("build");
  await page.getByRole("button", { name: "开始新对局" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.getByRole("button", { name: "快速模拟 30 秒" }).click();
  await expect
    .poll(
      async () =>
        Number(await page.locator("#status").getAttribute("data-level")),
      { timeout: 60000 },
    )
    .toBeGreaterThan(1);
  await expect
    .poll(() => page.locator("#choices li").count())
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const time = await page.locator("#status").getAttribute("data-time");
  await page.waitForTimeout(300);
  expect(await page.locator("#status").getAttribute("data-time")).toBe(time);
  const names = await page.evaluate(async () =>
    (await indexedDB.databases()).map((d) => d.name),
  );
  expect(names).not.toContain("starfall-survivor");
  await expect(page.locator("#status")).toHaveAttribute(
    "data-policy",
    "combat-build-v4",
  );
  expect(errors).toEqual([]);
});
