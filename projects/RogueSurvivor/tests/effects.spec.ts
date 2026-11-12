import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { ensureDeck } from "../src/core/deckState";
import { recalculate } from "../src/core/fate";
import { validateRun } from "../src/services/storage";
import { newWave } from "../src/core/waves";
import type { MapId } from "../src/data/maps";
import type { SkillId } from "../src/core/types";
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const state = ((window as any).paintedEffects = {
      counts: {} as Record<string, number>,
      frames: [] as number[],
    });
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (...args: any[]) {
      const src = String(args[0]?.src || "");
      if (src.includes("/v1.9.0/effects/")) {
        const name = src.split("/").pop()!.split(".")[0];
        state.counts[name] = (state.counts[name] || 0) + 1;
        if (name === "impact" && args.length === 9 && state.frames.length < 200)
          state.frames.push(args[1]);
      }
      return (original as any).apply(this, args);
    } as any;
  });
}
async function load(page: Page, map: MapId, skills: SkillId[]) {
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  const w = new World(createRun("endless", "mage", 190, "fire", "ward", map));
  const s = w.s;
  s.time = 120;
  s.nextEvent = 99999;
  s.wave = newWave(2, s.time);
  s.wave.processed = s.wave.budget;
  s.wave.spawned = s.wave.budget;
  s.wave.status = "active";
  const d = ensureDeck(s);
  for (const id of ["bow", "blade", "ember", "orbit", "drone"] as const)
    s.player.upgrades["weapon_" + id] = 3 - (d.baseWeapons[id] || 0);
  recalculate(s);
  s.player.skills = skills;
  s.player.cooldowns = [0, 0, 0];
  s.player.invincible = 999;
  s.player.shield = 50;
  s.player.hp = s.player.maxHp * 0.6;
  for (let i = 0; i < 4; i++) {
    const e = spawn(
      w,
      "guard",
      { x: 1850 + i * 20, y: 1800 + i * 14 },
      i === 0,
    )!;
    e.hp = e.maxHp = 100000;
    e.speed = 0.01;
  }
  validateRun(s);
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
for (const [map, width, height] of [
  ["forest", 1280, 720],
  ["cavern", 1280, 720],
  ["garden", 390, 844],
  ["eclipse", 844, 390],
] as const) {
  test(`正式特效实际绘制、武器命中及技能 ${map} ${width}×${height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: width !== 1280,
    });
    const page = await context.newPage(),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await instrument(page);
    await load(page, map, ["fire", "ice", "storm"]);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).paintedEffects.counts.arrow || 0),
      )
      .toBeGreaterThan(0);
    for (const [i, key] of ["q", "e", "r"].entries()) {
      if (width !== 1280) await page.locator(`[data-skill-slot="${i}"]`).tap();
      else await page.keyboard.press(key);
    }
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).paintedEffects.counts.frost || 0),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(
          () => (window as any).paintedEffects.counts.starfall || 0,
        ),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).paintedEffects.counts.shield || 0),
      )
      .toBeGreaterThan(0);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).paintedEffects.counts.impact || 0),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `validation/v1.9.0/combat-${map}-${width}.jpg`,
      type: "jpeg",
      quality: 85,
    });
    await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
    const counts = await page.evaluate(
      () => (window as any).paintedEffects.counts,
    );
    expect(counts.fireball).toBeGreaterThan(0);
    expect(counts.spirit).toBeGreaterThan(0);
    await page
      .getByRole("button", { name: "保存当前进度", exact: true })
      .click();
    await expect(page.locator("#toast")).toContainText("进度已保存");
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-effect-sprites",
      /\d+/,
    );
    expect(errors).toEqual([]);
    await context.close();
  });
}
test("星贯、复苏、星幕与冲刺接入绘制，新增资源可以在工坊替换", async ({
  page,
}) => {
  await instrument(page);
  await load(page, "forest", ["lance", "bloom", "ward"]);
  for (const key of ["q", "e", "r", "Space"]) await page.keyboard.press(key);
  for (const id of ["lance", "heal", "shield", "dash"])
    await expect
      .poll(() =>
        page.evaluate(
          (id) => (window as any).paintedEffects.counts[id] || 0,
          id,
        ),
      )
      .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
  await page.getByRole("button", { name: "资源工坊", exact: true }).click();
  await page.locator('[data-action="asset-vfx.impact"]').click();
  await expect(page.locator(".asset-editor")).toContainText("命中展开四帧");
  const image = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    return c.toDataURL();
  });
  await page.locator("#asset-file").setInputFiles({
    name: "effect.png",
    mimeType: "image/png",
    buffer: Buffer.from(image.split(",")[1], "base64"),
  });
  await expect(page.locator(".asset-editor")).toContainText(
    "已使用本地自定义图片",
  );
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(page.locator(".asset-editor")).toContainText("原创二次元美术");
});
test("新增特效全部缺失时回退仍可战斗和暂停", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/assets/v1.9.0/effects/**", (r) => r.abort());
  await load(page, "garden", ["fire", "ice", "storm"]);
  await page.keyboard.press("q");
  await page.keyboard.press("Space");
  await expect
    .poll(() => page.locator("#clock").textContent())
    .not.toBe("02:00");
  await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
  await expect(page.getByRole("heading", { name: "远征已暂停" })).toBeVisible();
  expect(errors).toEqual([]);
});
