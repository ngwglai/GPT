import { execFileSync } from "node:child_process";
/** Production-browser screenshots and bounded rendering stress; not a gameplay win-rate test. */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { recalculate } from "../src/core/fate";
import { ensureDeck } from "../src/core/deckState";
import { MAPS, type MapId } from "../src/data/maps";
import {
  addCandy,
  addCrystal,
  addField,
  environment,
} from "../src/core/environment";
// Always capture the current production source, including late regression fixes.
execFileSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build"],
  { stdio: "pipe" },
);
const out = "validation/v1.4";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : {}),
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }),
  errors: string[] = [],
  badResources: string[] = [],
  requests: Record<string, number> = {};
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().includes("/assets/") && r.status() >= 400)
    badResources.push(new URL(r.url()).pathname);
});
page.on("request", (r) => {
  if (r.url().includes("/assets/") && r.url().endsWith(".webp")) {
    const key = r.url().split("/assets/")[1];
    requests[key] = (requests[key] || 0) + 1;
  }
});
async function put(key: string, value: unknown) {
  await page.evaluate(
    async ({ key, value }) =>
      new Promise<void>((resolve, reject) => {
        const q = indexedDB.open("starfall-survivor", 1);
        q.onsuccess = () => {
          const db = q.result,
            t = db.transaction("kv", "readwrite");
          t.objectStore("kv").put(value, key);
          t.oncomplete = () => {
            db.close();
            resolve();
          };
          t.onerror = () => reject(t.error);
        };
      }),
    { key, value },
  );
}
const shot = (name: string) =>
  page.screenshot({
    path: `${out}/${name}.jpg`,
    type: "jpeg",
    quality: 88,
    fullPage: true,
  });
async function resume(w: World) {
  await put("run", w.s);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await page.waitForTimeout(1600);
}
const kinds = [
  "fairy",
  "protector",
  "ghost",
  "splitter",
  "mirror",
  "mimic",
  "summoner",
  "hexer",
  "butterfly",
  "crab",
] as const;
const bossKinds = [
  "crystalQueen",
  "candyWitch",
  "eclipseSaint",
  "mirrorMaiden",
] as const;
function fixture(map: MapId, dense = false) {
  const w = new World(createRun("endless", "mage", 77, "ice", "bloom", map));
  w.s.time = 1201;
  w.s.nextBoss = 1500;
  w.s.nextEvent = 1500;
  w.s.player.invincible = 300;
  for (const id of ["bow", "blade", "ember", "orbit", "drone"] as const)
    w.s.player.upgrades["weapon_" + id] =
      3 - (ensureDeck(w.s).baseWeapons[id] || 0);
  recalculate(w.s);
  for (const id of dense ? bossKinds : [MAPS[map].bosses[3]]) {
    const e = spawn(w, id, {
      x: 2080 + Math.cos(w.s.enemies.length) * 120,
      y: 1700 + Math.sin(w.s.enemies.length) * 180,
    })!;
    e.hp = e.maxHp * 0.35;
    e.timer = 0.1;
  }
  for (
    let i = 0;
    i < (dense ? 300 : 18) && w.s.enemies.length < (dense ? 147 : 19);
    i++
  ) {
    const a = i * 2.4,
      r = dense ? 160 + (i % 5) * 60 : 180 + (i % 4) * 70;
    spawn(
      w,
      kinds[i % kinds.length],
      { x: 1800 + Math.cos(a) * r, y: 1800 + Math.sin(a) * r },
      i % 6 === 0,
    );
  }
  if (dense)
    for (const e of w.s.enemies) {
      const ratio = e.hp / e.maxHp;
      e.hp = 1e7 * ratio;
      e.maxHp = 1e7;
    }
  if (map === "cavern")
    for (let i = 0; i < 4; i++) addCrystal(w.s, { x: 1580 + i * 140, y: 1900 });
  if (map === "garden") {
    addCandy(w.s, { x: 1740, y: 1890 }, "haste");
    addCandy(w.s, { x: 1870, y: 1890 }, "slow");
  }
  if (map === "eclipse") {
    addField(w.s, { x: 1620, y: 1900 }, "shield");
    addField(w.s, { x: 1900, y: 1920 }, "eclipse");
  }
  return w;
}
try {
  await page.goto(process.env.VISUAL_BASE_URL || "http://127.0.0.1:4174/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await shot("home");
  await put("settings", {
    musicEnabled: true,
    music: 0.15,
    sfx: 0.25,
    quality: "high",
    shake: false,
    showStats: true,
  });
  await page.getByRole("button", { name: "开启远征" }).click();
  await page
    .locator(".map-preview")
    .first()
    .evaluate(async (el) => {
      await (el as HTMLImageElement).decode();
    });
  await shot("map-selection");
  const performanceSamples: unknown[] = [];
  for (const map of ["cavern", "garden", "eclipse"] as MapId[]) {
    await resume(fixture(map));
    await page.mouse.move(1040, 470);
    await page.keyboard.press("q");
    await page.waitForTimeout(800);
    await shot(map);
    await page.keyboard.press("Escape");
    await shot(map + "-pause");
    if (!process.env.VISUAL_QUICK) {
      await resume(fixture(map, true));
      const samples = [];
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(5000);
        samples.push(
          await page.evaluate(() => ({
            hud: document.querySelector("#performance")?.textContent,
            clock: document.querySelector("#clock")?.textContent,
            heapMiB: (performance as any).memory
              ? Math.round((performance as any).memory.usedJSHeapSize / 1048576)
              : null,
          })),
        );
      }
      await shot(map + "-dense");
      performanceSamples.push({
        map,
        wallSeconds: 30,
        fixture:
          "147 enemies including four new bosses, five max weapons, invulnerable player and enemy health 1e7",
        samples,
      });
    }
  }
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
  await page.getByRole("button", { name: "地图图鉴" }).click();
  await shot("map-codex");
  await page.getByRole("button", { name: "怪物图鉴" }).click();
  await shot("enemy-codex");
  writeFileSync(
    `${out}/browser.json`,
    JSON.stringify(
      {
        browser: browser.version(),
        renderer: "Phaser CANVAS",
        viewport: { width: 1440, height: 900 },
        errors,
        badResources,
        requests,
        performanceSamples,
      },
      null,
      2,
    ) + "\n",
  );
  if (errors.length || badResources.length)
    throw Error("Browser validation errors");
  console.log(
    JSON.stringify({
      screenshots: true,
      samples: performanceSamples.length,
      errors,
      badResources,
    }),
  );
} finally {
  await browser.close();
}
