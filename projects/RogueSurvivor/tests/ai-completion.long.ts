import { test, expect } from "@playwright/test";
import { start, exported } from "./ai-lab-helpers";

test("可视化标准模式从初始状态自动完成最终首领并保存结算", async ({ page }) => {
  test.setTimeout(30 * 60 * 1000);
  await page.setViewportSize({ width: 800, height: 600 });
  await start(page);
  await page.locator("#decision-details > summary").click();
  await page.locator("#speed").selectOption("8");
  let checkpoint = -1;
  await expect
    .poll(
      async () => {
        const state = await page
          .locator("#status")
          .evaluate((el) => ({ ...el.dataset }));
        const minute = Math.floor(Number(state.time) / 120);
        if (minute > checkpoint) {
          checkpoint = minute;
          console.info("Visual progress", JSON.stringify(state));
        }
        return ["victory", "dead"].includes(state.phase || "");
      },
      { timeout: 28 * 60 * 1000, intervals: [1000] },
    )
    .toBe(true);
  await expect(page.locator("#status")).toHaveAttribute(
    "data-phase",
    "victory",
  );
  const record = await exported(page);
  console.info(
    "Visual standard finish",
    JSON.stringify({
      time: record.time,
      wave: record.wave,
      bosses: record.bosses,
      level: record.level,
      kills: record.kills,
      choices: record.totals.choices,
      damage: record.damage,
      taken: record.taken,
    }),
  );
  expect(record.result).toBe("victory");
  // Same seed/config through LabSession.step without rendering; no end-state injection.
  expect(record.time).toBeCloseTo(981, 6);
  expect(record.kills).toBe(2752);
  expect(record.level).toBe(42);
  expect(record.damage).toBeCloseTo(617202.8687128052, 6);
  expect(record.taken).toBeCloseTo(256.73870222213856, 6);
  expect(record.totals.choices).toBe(48);
  expect(record.bosses).toBe(4);
  expect(record.wave).toBe(20);
  expect(record.totals.choices).toBeGreaterThan(20);
  await page.locator("#history-open").click();
  await expect(page.locator("#history-list")).toContainText("击败最终首领");
});
