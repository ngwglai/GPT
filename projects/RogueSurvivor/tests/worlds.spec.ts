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
test("v1.4 mimic has a real closed disguise before revealing its creature art", async ({
  page,
}) => {
  await page.addInitScript(() => {
    (window as any).disguiseDraws = 0;
    (window as any).mimicDraws = 0;
    const original = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (
      img: any,
      ...args: any[]
    ) {
      if (img instanceof HTMLImageElement) {
        if (img.src.includes("cards/treasure.webp"))
          (window as any).disguiseDraws++;
        if (img.src.includes("v1.4/enemy/mimic.webp"))
          (window as any).mimicDraws++;
      }
      return (original as any).call(this, img, ...args);
    } as any;
  });
  const w = new World(createRun("endless", "ranger", 12));
  w.s.player.invincible = 30;
  w.s.player.weaponTimers.bow = 1000;
  w.s.spawnTimer = 9;
  spawn(w, "mimic", { x: 2080, y: 1800 });
  await resume(page, w.s);
  await expect
    .poll(() => page.evaluate(() => (window as any).disguiseDraws))
    .toBeGreaterThan(5);
  await page.keyboard.down("d");
  await page.waitForTimeout(850);
  await page.keyboard.up("d");
  await expect
    .poll(() => page.evaluate(() => (window as any).mimicDraws))
    .toBeGreaterThan(3);
  const saved = await save(page);
  expect(
    saved.enemies.find((e: any) => e.kind === "mimic").behavior.awakened,
  ).toBe(true);
});
for (const terminal of ["victory", "dead"] as const)
  test(`v1.4 ${terminal} codex Escape preserves terminal results`, async ({
    page,
  }) => {
    const w = new World(
      createRun(terminal === "victory" ? "standard" : "endless", "ranger", 47),
    );
    if (terminal === "victory") {
      w.s.time = 1201;
      w.s.nextBoss = 1500;
      w.s.nextEvent = 1500;
      w.s.bossIndex = 4;
      w.s.player.level = 100;
      spawn(w, "titan", { x: 1880, y: 1800 })!.hp = 1;
    } else {
      w.s.player.hp = 1;
      w.s.player.invincible = 0;
      spawn(w, "crawler", w.s.player)!.hp = 1e6;
    }
    await resume(page, w.s);
    const title = terminal === "victory" ? "远征告捷" : "此行落幕";
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: terminal === "victory" ? "继续无尽星夜" : "再启远征",
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "远征已暂停" })).toHaveCount(
      0,
    );
  });
test("v1.4 upgrade-settings focus loss returns through explicit pause and restores music", async ({
  page,
}) => {
  await observeAudio(page);
  const s = createRun("endless", "ranger", 51);
  ensureDeck(s).active = "positive";
  s.phase = "upgrade";
  s.choices = ["power", "vitality", "critical"];
  await resume(page, s);
  await expect.poll(() => audioTime(page)).toBeGreaterThan(0.1);
  await page.getByRole("button", { name: "当前构筑", exact: true }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.getByRole("button", { name: "← 返回", exact: true }).click();
  await expect(page.getByRole("heading", { name: "远征已暂停" })).toBeVisible();
  expect(await page.evaluate(() => (window as any).battleAudio.paused)).toBe(
    true,
  );
  await page.getByRole("button", { name: "继续远征", exact: true }).click();
  await expect(page.locator(".upgrade-card")).toHaveCount(3);
  await page.locator('[data-action="upgrade-power"]').click();
  await expect(page.locator(".upgrade-card")).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).battleAudio.paused))
    .toBe(false);
  const t = await audioTime(page);
  await page.waitForTimeout(400);
  expect(await audioTime(page)).toBeGreaterThan(t);
});

for (const map of ["forest", "cavern", "garden", "eclipse"] as const)
  test(`v1.4.1 ${map} seven boss warnings and dense rewards remain visible`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const w = new World(
      createRun("endless", "ranger", 331, undefined, undefined, map),
    );
    w.s.time = 1200;
    w.s.nextBoss = 9999;
    w.s.nextEvent = 9999;
    w.s.spawnTimer = 10;
    w.s.player.invincible = 999;
    w.s.player.level = 100;
    const kinds = [
      "warden",
      "witch",
      "titan",
      "crystalQueen",
      "candyWitch",
      "eclipseSaint",
      "mirrorMaiden",
    ] as const;
    kinds.forEach((kind, i) => {
      const angle = (i * Math.PI * 2) / 7;
      const e = spawn(w, kind, {
        x: 1800 + Math.cos(angle) * 260,
        y: 1800 + Math.sin(angle) * 220,
      })!;
      e.hp = e.maxHp * 0.4;
      e.timer = 0;
      w.zone({ x: e.x, y: e.y }, 75, 10, "meteor", true, 0.8);
    });
    for (let i = 0; i < 100; i++) {
      w.s.gems.push({
        x: 1500 + (i % 20) * 30,
        y: 1650 + Math.floor(i / 20) * 50,
        value: i % 3 ? 5 : 80,
      });
      w.shoot(
        { x: 1450 + (i % 20) * 30, y: 1600 + Math.floor(i / 20) * 70 },
        { x: 1, y: 0 },
        10,
        "enemy",
        "enemy",
        true,
      );
    }
    await resume(page, w.s);
    await expect(page.locator("#clock")).toBeVisible();
    await page.waitForTimeout(700);
    await page.keyboard.press("Escape");
    await expect(page.getByText("极限星潮 · 当前难度")).toBeVisible();
    await page.locator("details summary").click();
    await expect(page.locator("details")).toContainText("800");
    await expect(page.locator("details")).toContainText("1200");
    await page.getByRole("button", { name: "继续远征", exact: true }).click();
    await page.screenshot({
      path: `validation/v1.4.1/${map}.jpg`,
      type: "jpeg",
      quality: 85,
    });
    expect(errors).toEqual([]);
  });

for (const [kind, map] of [
  ["warden", "forest"],
  ["witch", "forest"],
  ["titan", "forest"],
  ["crystalQueen", "cavern"],
  ["candyWitch", "garden"],
  ["eclipseSaint", "eclipse"],
  ["mirrorMaiden", "eclipse"],
] as const)
  test(`v1.4.2 ${kind} distinct phase-two attacks, pause and save`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const w = new World(
      createRun("endless", "ranger", 412, undefined, undefined, map),
    );
    w.s.time = 1200;
    w.s.nextBoss = 9999;
    w.s.nextEvent = 9999;
    w.s.spawnTimer = 10;
    w.s.player.invincible = 999;
    const e = spawn(w, kind, { x: 2100, y: 1800 })!;
    e.hp = e.maxHp * 0.3;
    e.timer = 0;
    e.phase = 1;
    await resume(page, w.s);
    await expect(page.locator("#clock")).toBeVisible();
    await page.waitForTimeout(1000);
    await page.screenshot({
      path: `validation/v1.4.2/${kind}.jpg`,
      type: "jpeg",
      quality: 85,
    });
    await save(page);
    const s = await get(page);
    expect(s.enemies.some((x: any) => x.kind === kind && x.phase >= 3)).toBe(
      true,
    );
    expect(s.bullets.length + s.zones.length).toBeGreaterThan(0);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(page.locator("#clock")).toBeVisible();
    expect(errors).toEqual([]);
  });
for (const count of [50, 150, 300])
  test(`v1.4.2 high quality keeps decorations at ${count} enemies and 230 bullets`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const draw = CanvasRenderingContext2D.prototype.drawImage;
      (window as any).decorDraws = 0;
      CanvasRenderingContext2D.prototype.drawImage = function (
        img: any,
        ...args: any[]
      ) {
        if (
          img?.src?.includes("/maps/flower.webp") ||
          img?.src?.includes("/maps/mushroom.webp")
        )
          (window as any).decorDraws++;
        return (draw as any).call(this, img, ...args);
      };
    });
    const w = new World(createRun("endless"));
    w.s.spawnTimer = 10;
    w.s.player.invincible = 999;
    for (let i = 0; i < count; i++)
      spawn(w, "crawler", {
        x: 2300 + (i % 8) * 10,
        y: 1600 + Math.floor(i / 8) * 10,
      });
    for (let i = 0; i < 230; i++)
      w.shoot({ x: 2300, y: 1700 }, { x: 1, y: 0 }, 1, "enemy", "enemy", true);
    await resume(page, w.s);
    await expect
      .poll(() => page.evaluate(() => (window as any).decorDraws))
      .toBeGreaterThan(0);
  });

for (const [primary, secondary] of [
  ["fire", "ice"],
  ["lance", "ward"],
  ["bloom", "fire"],
] as const)
  test(`v1.4.2 five weapons and ${primary}/${secondary}/storm have independent outlines`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const stroke = CanvasRenderingContext2D.prototype.stroke;
      (window as any).allyOutline = false;
      CanvasRenderingContext2D.prototype.stroke = function (...args: any[]) {
        if (
          String(this.strokeStyle) === "#123b60" ||
          String(this.strokeStyle).includes("18, 59, 96")
        )
          (window as any).allyOutline = true;
        return (stroke as any).apply(this, args);
      };
    });
    const w = new World(createRun("endless", "ranger", 92, primary, secondary));
    w.s.player.level = 100;
    w.s.player.invincible = 999;
    w.s.spawnTimer = 10;
    for (const id of ["bow", "blade", "ember", "orbit", "drone"])
      for (let i = 0; i < 5; i++) grant(w.s, "weapon_" + id);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4,
        e = spawn(w, "crawler", {
          x: 1800 + Math.cos(a) * 110,
          y: 1800 + Math.sin(a) * 110,
        })!;
      e.hp = e.maxHp = 1e7;
    }
    await resume(page, w.s);
    for (const [key, index] of ["q", "e", "r"].entries()) {
      await page.keyboard.press(index);
      await expect(page.locator("#cd-" + key)).not.toBeEmpty();
    }
    await expect
      .poll(() => page.evaluate(() => (window as any).allyOutline))
      .toBe(true);
    const s = await save(page);
    expect(Object.keys(s.player.weapons)).toHaveLength(5);
  });
