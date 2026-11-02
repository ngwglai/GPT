import { test as base, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { ensureDeck } from "../src/core/deckState";
import { grant } from "../src/core/progression";
import {
  addCandy,
  addCrystal,
  addField,
  environment,
} from "../src/core/environment";
import { MAPS, type MapId } from "../src/data/maps";
import { spawn } from "../src/core/director";
import { placeDrop } from "../src/core/drops";
import type { Run } from "../src/core/types";
const test = base.extend({
  browser: [
    async ({ playwright, launchOptions }, use) => {
      const b = await playwright.chromium.launch(launchOptions);
      try {
        await use(b);
      } finally {
        await b.close();
      }
    },
    { scope: "worker" },
  ],
});
async function put(page: Page, s: Run) {
  await page.evaluate(
    async (s) =>
      new Promise<void>((resolve, reject) => {
        const q = indexedDB.open("starfall-survivor", 1);
        q.onsuccess = () => {
          const db = q.result,
            t = db.transaction("kv", "readwrite");
          t.objectStore("kv").put(s, "run");
          t.oncomplete = () => {
            db.close();
            resolve();
          };
          t.onerror = () => reject(t.error);
        };
      }),
    s,
  );
}
async function get(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<any>((resolve) => {
        const q = indexedDB.open("starfall-survivor", 1);
        q.onsuccess = () => {
          const db = q.result,
            t = db.transaction("kv", "readonly"),
            r = t.objectStore("kv").get("run");
          r.onsuccess = () => {
            db.close();
            resolve(r.result);
          };
        };
      }),
  );
}
async function resume(page: Page, s: Run) {
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await put(page, s);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
}
async function save(page: Page) {
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  return get(page);
}
async function observeAudio(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Audio;
    (window as any).musicCount = 0;
    (window as any).Audio = function (src: string) {
      const a = new Native(src);
      (window as any).musicCount++;
      (window as any).battleAudio = a;
      return a;
    };
  });
}
async function audioTime(page: Page) {
  return page.evaluate(
    () => ((window as any).battleAudio?.currentTime || 0) as number,
  );
}
test("v1.4 four map choices, artwork, map-specific HUD and save restore", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await expect(page.locator(".map-card")).toHaveCount(4);
  await expect
    .poll(() =>
      page
        .locator(".map-preview")
        .evaluateAll((es) =>
          es.every(
            (e) =>
              (e as HTMLImageElement).complete &&
              (e as HTMLImageElement).naturalWidth > 200,
          ),
        ),
    )
    .toBe(true);
  await page.locator('[data-action="map-garden"]').click();
  await page.getByRole("button", { name: "前往糖果魔女庭院" }).click();
  await expect(page.locator(".run-clock")).toContainText("糖果魔女庭院");
  const saved = await save(page);
  expect(saved.environment.mapId).toBe("garden");
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await expect(page.locator(".run-clock")).toContainText("糖果魔女庭院");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
  await page.getByRole("button", { name: "地图图鉴" }).click();
  await expect(page.locator(".codex-card")).toHaveCount(4);
  await page.getByRole("button", { name: "怪物图鉴" }).click();
  await expect(page.locator(".codex-card")).toHaveCount(24);
  expect(errors).toEqual([]);
});
for (const map of ["cavern", "garden", "eclipse"] as MapId[])
  test(`v1.4 ${map} environmental interaction and state persists`, async ({
    page,
  }) => {
    const w = new World(
      createRun("endless", "ranger", 41, undefined, undefined, map),
    );
    w.s.player.invincible = 20;
    w.s.nextBoss = w.s.nextEvent = 1e6;
    const env = environment(w.s);
    let crystalId = 0;
    if (map === "cavern") {
      w.s.rocks = [];
      env.crystals = [];
      const x = addCrystal(w.s, { x: 1930, y: 1800 }, "xp")!;
      x.hp = 1;
      crystalId = x.id;
    }
    if (map === "garden") addCandy(w.s, w.s.player, "speed");
    if (map === "eclipse") addField(w.s, w.s.player, "shield", 0);
    await resume(page, w.s);
    await expect
      .poll(() => page.locator("#clock").textContent())
      .not.toBe("00:00");
    const saved = await save(page);
    if (map === "cavern") {
      expect(saved.environment.destroyed).toContain(crystalId);
      expect(saved.rocks.some((r: any) => r.crystalId === crystalId)).toBe(
        false,
      );
    }
    if (map === "garden")
      expect(saved.environment.buffs.some((b: any) => b.kind === "speed")).toBe(
        true,
      );
    if (map === "eclipse") expect(saved.player.shield).toBeGreaterThan(0);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(page.locator(".run-clock")).toContainText(MAPS[map].name);
  });
for (const type of ["positive", "negative", "shuffle"] as const)
  test(`v1.4 ${type} card music continuous, manual pause wins, next track`, async ({
    page,
  }) => {
    await observeAudio(page);
    const s = createRun("endless", "ranger", 81);
    const d = ensureDeck(s);
    s.player.level = 20;
    grant(s, "power");
    grant(s, "hex_damage");
    if (type === "shuffle") {
      s.phase = "upgrade";
      d.active = "positive";
      s.choices = ["shuffle", "power", "vitality"];
    } else placeDrop(s, s.player, type);
    await resume(page, s);
    await expect(page.locator(".upgrade-card")).toHaveCount(3);
    if (type === "negative") {
      await expect(page.locator(".polarity-negative")).toHaveCount(3);
      await expect(page.locator('[data-action="refresh"]')).toBeDisabled();
    }
    await expect.poll(() => audioTime(page)).toBeGreaterThan(0.1);
    const t = await audioTime(page);
    await page.waitForTimeout(500);
    expect(await audioTime(page)).toBeGreaterThan(t);
    await page.getByRole("button", { name: "当前构筑", exact: true }).click();
    const bookTime = await audioTime(page);
    await page.waitForTimeout(350);
    expect(await audioTime(page)).toBeGreaterThan(bookTime);
    await page.getByRole("button", { name: "← 返回", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "远征已暂停" }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).battleAudio.paused)).toBe(
      true,
    );
    await page.getByRole("button", { name: "继续远征", exact: true }).click();
    await expect(page.locator(".upgrade-card")).toHaveCount(3);
    await expect
      .poll(() => page.evaluate(() => (window as any).battleAudio.paused))
      .toBe(false);
    if (type === "shuffle")
      await page.locator('[data-action="upgrade-shuffle"]').click();
    else await page.locator(".upgrade-card").first().click();
    await expect(page.locator(".upgrade-card")).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).musicCount)).toBe(1);
    // Real MP3 seek to the end exercises the native ended event and playlist advancement.
    const src = await page.evaluate(() => (window as any).battleAudio.src);
    await page.evaluate(() => {
      const a = (window as any).battleAudio as HTMLAudioElement;
      a.currentTime = a.duration - 0.15;
    });
    await expect
      .poll(() => page.evaluate(() => (window as any).battleAudio.src))
      .not.toBe(src);
    await expect.poll(() => audioTime(page)).toBeGreaterThan(0.05);
    expect(await page.evaluate(() => (window as any).musicCount)).toBe(1);
    // Visibility handler is also required when card logic is paused (synthetic lifecycle event).
    await page.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        get: () => true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(await page.evaluate(() => (window as any).battleAudio.paused)).toBe(
      true,
    );
  });
test("v1.4 new boss second phase, map state and five weapons resume", async ({
  page,
}) => {
  const w = new World(
    createRun("endless", "mage", 91, "ice", "bloom", "cavern"),
  );
  w.s.time = 1201;
  w.s.nextBoss = 1500;
  w.s.nextEvent = 1500;
  w.s.player.invincible = 30;
  for (const id of ["bow", "blade", "ember", "orbit", "drone"] as const)
    w.s.player.upgrades["weapon_" + id] =
      5 - (ensureDeck(w.s).baseWeapons[id] || 0);
  const { recalculate } = await import("../src/core/fate");
  recalculate(w.s);
  const boss = spawn(w, "crystalQueen", { x: 2100, y: 1800 })!;
  boss.hp = boss.maxHp * 0.3;
  boss.timer = 0.1;
  await resume(page, w.s);
  await expect(page.locator("#boss-hud")).toContainText("水晶女王");
  await expect(page.locator("#boss-hud")).toContainText("狂暴阶段");
  await expect(page.locator(".weapon-hud>div")).toHaveCount(5);
  await expect
    .poll(() => page.locator("#clock").textContent())
    .not.toBe("20:01");
  const saved = await save(page);
  expect(saved.zones.length).toBeGreaterThan(0);
  expect(saved.environment.mapId).toBe("cavern");
  expect(
    saved.enemies.find((e: any) => e.kind === "crystalQueen").phase,
  ).toBeGreaterThan(0);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await expect(page.locator("#boss-hud")).toContainText("水晶女王");
});
