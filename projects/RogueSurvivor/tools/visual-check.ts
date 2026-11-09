/** Browser visual/performance evidence; synthetic fixtures do not change game rules. */
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { ensureDeck } from "../src/core/deckState";
import { recalculate } from "../src/core/fate";
const out =
  process.env.VISUAL_OUT ||
  fileURLToPath(new URL("../validation/v1.3/", import.meta.url));
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
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors: string[] = [];
const requests: Record<string, number> = {};
page.on("pageerror", (e) => errors.push(e.message));
page.on("request", (r) => {
  if (r.url().includes("/assets/") && r.url().endsWith(".webp"))
    requests[r.url().split("/assets/")[1]] =
      (requests[r.url().split("/assets/")[1]] || 0) + 1;
});
const shot = async (name: string) =>
  page.screenshot({
    path: `${out}/${name}.jpg`,
    type: "jpeg",
    quality: 80,
    fullPage: true,
  });
async function put(key: string, value: unknown) {
  await page.evaluate(
    async ({ key, value }) => {
      await new Promise<void>((resolve, reject) => {
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
      });
    },
    { key, value },
  );
}
async function resume(s: unknown) {
  await put("run", s);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
}
try {
  await page.goto(process.env.VISUAL_BASE_URL || "http://localhost:4176");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await shot("home");
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.waitForTimeout(500);
  await shot("characters");
  await page.locator('[data-action="character-mage"]').click();
  await page.getByRole("button", { name: "踏入星林" }).click();
  await page.waitForTimeout(2000);
  await shot("battle");
  await page.keyboard.press("Escape");
  await shot("pause");
  await page.getByRole("button", { name: "当前构筑", exact: true }).click();
  await shot("build");
  await page.getByRole("button", { name: "← 返回", exact: true }).click();
  await page
    .getByRole("button", { name: "保存并返回营地", exact: true })
    .click();
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
  await shot("cards");
  await page.locator('[data-action="home"]').first().click();
  let samples: unknown[] = [];
  if (!process.env.VISUAL_QUICK) {
    const w = new World(createRun("endless", "mage", 77));
    w.s.time = 7201;
    w.s.nextBoss = 7500;
    w.s.nextEvent = 7500;
    w.s.player.invincible = 300;
    for (const id of ["bow", "blade", "ember", "orbit", "drone"] as const)
      w.s.player.upgrades["weapon_" + id] =
        3 - (ensureDeck(w.s).baseWeapons[id] || 0);
    recalculate(w.s);
    for (let i = 0; i < 160; i++) {
      const a = i * 2.4;
      const e = spawn(
        w,
        (
          [
            "crawler",
            "runner",
            "archer",
            "seer",
            "shaman",
            "guard",
            "bomber",
          ] as const
        )[i % 7],
        {
          x: 1800 + Math.cos(a) * (200 + i * 2),
          y: 1800 + Math.sin(a) * (200 + i * 2),
        },
        i % 4 === 0,
      );
      if (e) e.hp = e.maxHp = 1e7;
    }
    await put("settings", {
      music: 0,
      sfx: 0,
      quality: "high",
      shake: false,
      showStats: true,
    });
    await resume(w.s);
    const wallStart = Date.now();
    samples = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.down("d");
      await page.waitForTimeout(1000);
      await page.keyboard.up("d");
      await page.keyboard.press("r");
      await page.keyboard.press("q");
      await page.waitForTimeout(9000);
      samples.push({
        seconds: (Date.now() - wallStart) / 1000,
        panel: await page.locator("#performance").textContent(),
        heap: await page.evaluate(
          () => (performance as any).memory?.usedJSHeapSize || null,
        ),
      });
    }
    await shot("dense");
    writeFileSync(
      out + "/browser.json",
      JSON.stringify(
        {
          environment:
            "Linux system Chromium, headless SwiftShader, 1440x900, sole benchmark browser",
          requestedEnemies: 160,
          initialEnemies: w.s.enemies.length,
          wallSeconds: (Date.now() - wallStart) / 1000,
          samples,
          imageRequests: requests,
          errors,
        },
        null,
        2,
      ),
    );
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "保存并返回营地", exact: true })
      .click();
    await page.getByRole("button", { name: "开启远征" }).waitFor();
  }
  const end = new World(createRun("standard", "ranger", 47));
  end.s.time = 1201;
  end.s.nextBoss = 1500;
  end.s.nextEvent = 1260;
  end.s.bossIndex = 4;
  end.s.player.level = 100;
  spawn(end, "titan", { x: 1880, y: 1800 })!.hp = 1;
  await resume(end.s);
  await page.getByRole("heading", { name: "远征告捷" }).waitFor();
  await shot("result");
  console.log(JSON.stringify({ samples, errors }));
  if (errors.length) throw new Error("browser errors");
} finally {
  await browser.close();
}
