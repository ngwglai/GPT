import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRun } from "../src/core/create";
import { newWave } from "../src/core/waves";
import { validateRun } from "../src/services/storage";
import { MAPS } from "../src/data/maps";
import { ENEMIES } from "../src/data/content";
import type { Run } from "../src/core/types";
const { version } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);
async function load(page: Page, s: Run) {
  validateRun(s);
  await page.goto("/");
  await expect(page.locator(".version")).toContainText(`v${version}`);
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
async function saved(page: Page): Promise<Run> {
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
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
for (const [viewport, t] of [
  [{ width: 1280, height: 720 }, 20],
  [{ width: 390, height: 844 }, 60],
  [{ width: 844, height: 390 }, 90],
] as const) {
  test(`${t}分钟线性难度面板、实际Boss出生和读档 ${viewport.width}×${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width !== 1280,
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const s = createRun("standard", "ranger", 183);
    s.time = t * 60;
    s.nextEvent = 99999;
    s.wave = newWave(20, s.time);
    s.bossIndex = 3;
    Object.assign(s.wave, {
      processed: s.wave.budget,
      spawned: s.wave.budget,
      status: "active",
      announced: true,
    });
    s.player.invincible = 999;
    s.player.weaponTimers.bow = 100;
    // No Boss is embedded in this save. The production wave director must create it.
    await load(page, s);
    await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
    await page.locator("#difficulty-info summary").click();
    const first = await saved(page);
    const at = first.time / 60,
      afterFive = Math.max(0, at - 5);
    await expect(page.locator("#difficulty-info")).toContainText(
      `生命 ×${(1 + 0.2 * at).toFixed(2)} · 伤害 ×${(1 + 0.16 * at).toFixed(2)} · 攻击频率 ×${(1 + 0.1 * at).toFixed(2)}`,
    );
    await expect(page.locator("#difficulty-info")).toContainText(
      `Boss生命 ×${(3 + 0.6 * afterFive).toFixed(2)} · 伤害 ×${(2 + 0.32 * afterFive).toFixed(2)}`,
    );
    await expect(page.locator("#difficulty-info")).toContainText(
      `${(1.5 / (1 + 0.1 * afterFive)).toFixed(2)}秒 / 二阶段 ${(1.2 / (1 + 0.1 * afterFive)).toFixed(2)}秒`,
    );
    const e = first.enemies.find((e) => e.bossOrdinal === 4)!;
    expect(e).toBeDefined();
    expect(e.kind).toBe(MAPS.forest.bosses[3]);
    const base = ENEMIES[e.kind];
    expect(e.maxHp).toBeGreaterThanOrEqual(base.hp * (3 + 0.6 * (t - 5)));
    expect(e.maxHp).toBeLessThanOrEqual(
      base.hp * (3 + 0.6 * (t + 0.05 / 60 - 5)) + 1e-6,
    );
    const birthMinutes = (e.maxHp / base.hp - 3) / 0.6 + 5;
    expect(e.damage).toBeCloseTo(
      base.damage * (2 + 0.32 * (birthMinutes - 5)),
      7,
    );
    expect(first.bossIndex).toBe(4);
    expect(first.wave!.number).toBe(20);
    await page.screenshot({
      path: `validation/v1.8.3/difficulty-${viewport.width}x${viewport.height}.jpg`,
      type: "jpeg",
      quality: 85,
    });
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(page.locator("html")).not.toHaveClass(/touch-input-inactive/);
    await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
    const second = await saved(page);
    expect(second.bossIndex).toBe(4);
    expect(second.enemies.filter((x) => x.bossOrdinal === 4)).toHaveLength(1);
    expect(second.enemies.find((x) => x.id === e.id)!.maxHp).toBe(e.maxHp);
    expect(second.enemies.find((x) => x.id === e.id)!.damage).toBe(e.damage);
    expect(errors).toEqual([]);
    await context.close();
  });
}
