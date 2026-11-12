import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { behavior } from "../src/core/creatureAI";
import { newWave } from "../src/core/waves";
import { validateRun } from "../src/services/storage";
import type { Run } from "../src/core/types";

async function read(page: Page): Promise<Run> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("kv").objectStore("kv").get("run");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
  );
}
async function load(page: Page, s: Run) {
  validateRun(s);
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await page.evaluate(
    (s) =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put(s, "run");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
      }),
    s,
  );
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await expect(page.locator("html")).not.toHaveClass(/touch-input-inactive/);
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  return read(page);
}
function fixture(portrait = false) {
  const c = new World(
    createRun("endless", "ranger", 182, undefined, undefined, "garden"),
  );
  c.s.time = 35;
  c.s.rocks = [];
  c.s.nextEvent = 9999;
  c.s.environment!.nextCandy = 30;
  c.s.wave = newWave(1, 0);
  Object.assign(c.s.wave, {
    processed: c.s.wave.budget,
    spawned: c.s.wave.budget,
    status: "active",
    announced: true,
  });
  c.s.player.weaponTimers.bow = 100;
  const e = spawn(c, "mimic", {
    x: 1800 + (portrait ? 0 : 270),
    y: 1800 + (portrait ? 250 : 0),
  })!;
  behavior(e).escapeRemaining = 1.8;
  return c;
}
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`庭院宝箱怪逃跑、暂停读档、正面糖果及休整 ${viewport.width}×${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width !== 1280,
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const c = fixture(viewport.height > viewport.width),
      e = c.s.enemies[0];
    await load(page, c.s);
    const saved = await save(page);
    expect(saved.enemies).toHaveLength(1);
    expect(saved.enemies[0].behavior!.escapeRemaining).toBeGreaterThan(0);
    expect(saved.enemies[0].behavior!.escapeRemaining).toBeLessThan(1.8);
    await page.waitForTimeout(250);
    await page
      .getByRole("button", { name: "保存当前进度", exact: true })
      .click();
    await expect(page.locator("#toast")).toContainText("进度已保存");
    const paused = await read(page);
    expect(paused.enemies).toEqual(saved.enemies);
    expect(paused.time).toBe(saved.time);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(page.locator("#wave-hud")).toContainText("清场休整", {
      timeout: 15000,
    });
    await page.screenshot({
      path: `validation/v1.8.2/mimic-rest-${viewport.width}x${viewport.height}.jpg`,
      type: "jpeg",
      quality: 85,
    });
    const escaped = await save(page);
    expect(escaped.enemies).toHaveLength(0);
    expect(escaped.stats.kills).toBe(0);
    expect(escaped.player.xp).toBe(0);
    expect(escaped.environment!.candies).toHaveLength(1);
    expect(escaped.environment!.candies[0]).toMatchObject({
      x: e.x,
      y: e.y,
      mimicReward: true,
    });
    expect(["speed", "haste", "heal", "xp"]).toContain(
      escaped.environment!.candies[0].kind,
    );
    expect(escaped.wave!.number).toBe(1);
    expect(escaped.wave!.status).toBe("resting");
    expect(escaped.wave!.restUntil - escaped.time).toBeGreaterThan(0);
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("攻击只拦截一个宝箱怪，另一个逃跑留下糖果", async ({ page }) => {
  const c = fixture();
  const a = c.s.enemies[0],
    b = spawn(c, "mimic", { x: 2200, y: 1800 })!;
  behavior(b).escapeRemaining = 0.9;
  c.shoot({ x: a.x - 30, y: a.y }, { x: 1, y: 0 }, 1, "bow", "bow");
  await load(page, c.s);
  // Wait for enough simulated frames while allowing variable software-rendering speed.
  await expect
    .poll(
      async () => {
        const parts = (await page.locator("#clock").innerText())
          .split(":")
          .map(Number);
        return parts[0] * 60 + parts[1];
      },
      { timeout: 15000 },
    )
    .toBeGreaterThanOrEqual(37);
  const saved = await save(page);
  expect(saved.enemies).toHaveLength(1);
  expect(saved.enemies[0].id).toBe(a.id);
  expect(saved.enemies[0].behavior!.awakened).toBe(true);
  expect(saved.enemies[0].behavior!.escapeRemaining).toBeUndefined();
  expect(saved.environment!.candies).toHaveLength(1);
  expect(saved.stats.kills).toBe(0);
  expect(saved.wave!.status).toBe("active");
});
