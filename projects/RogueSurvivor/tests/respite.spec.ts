import { test, expect, type Page } from "@playwright/test";
import { version } from "../package.json";
import { createRun } from "../src/core/create";
import { newWave } from "../src/core/waves";
import { MAP_PLAYLISTS } from "../src/data/audio";
import { validateRun } from "../src/services/storage";
import type { Run } from "../src/core/types";
async function readRun(page: Page): Promise<Run> {
  return page.evaluate(
    () =>
      new Promise((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result;
          const q = db.transaction("kv").objectStore("kv").get("run");
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
  if (s.phase === "playing")
    await expect(page.locator("html")).not.toHaveClass(/touch-input-inactive/);
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  return readRun(page);
}
for (const viewport of [
  { width: 1280, height: 720 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`休整HUD、移动拾取、暂停读档及Boss预告 ${viewport.width}×${viewport.height}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport,
      hasTouch: viewport.width !== 1280,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const s = createRun("endless", "ranger", 181);
    s.time = 40;
    s.wave = newWave(4, 0);
    Object.assign(s.wave, {
      status: "resting",
      restUntil: 45,
      processed: s.wave.budget,
      spawned: s.wave.budget,
      announced: true,
    });
    s.nextEvent = 9999;
    s.player.invincible = 999;
    s.gems = [{ x: s.player.x, y: s.player.y, value: 1 }];
    await load(page, s);
    await expect(page.locator(".version")).toHaveCount(0); // battle replaces the main header
    await expect(page.locator("#wave-hud")).toContainText("清场休整");
    await expect(page.locator("#wave-hud")).toContainText("下一波首领战");
    await expect(page.locator("#wave-hud")).toHaveClass(/boss-next/);
    const box = await page.locator("#wave-hud").boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
    await page.keyboard.down("d");
    await page.waitForTimeout(150);
    await page.keyboard.up("d");
    const saved = await save(page);
    expect(saved.player.x).toBeGreaterThan(s.player.x);
    expect(saved.player.xp).toBe(1);
    expect(saved.gems).toHaveLength(0);
    expect(saved.enemies).toHaveLength(0);
    expect(saved.wave!.status).toBe("resting");
    const left = saved.wave!.restUntil - saved.time;
    expect(left).toBeGreaterThan(0);
    expect(left).toBeLessThan(5);
    await page.waitForTimeout(300);
    await page
      .getByRole("button", { name: "保存当前进度", exact: true })
      .click();
    await expect(page.locator("#toast")).toContainText("进度已保存");
    const paused = await readRun(page);
    expect(paused.time).toBe(saved.time);
    expect(paused.wave).toEqual(saved.wave);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(page.locator("#wave-hud")).toContainText("清场休整");
    await page.screenshot({
      path: `validation/v1.8.1/rest-${viewport.width}x${viewport.height}.jpg`,
      type: "jpeg",
      quality: 80,
    });
    await expect(page.locator("#wave-hud")).toContainText("第 5 波", {
      timeout: 15000,
    });
    const after = await save(page);
    expect(after.wave!.duration).toBe(90);
    expect(after.wave!.status).toBe("entering");
    expect(after.bossIndex).toBe(1);
    expect(after.enemies.filter((e) => e.bossOrdinal === 1)).toHaveLength(1);
    expect(errors).toEqual([]);
    await context.close();
  });
}
test("十二首真实本地MP3均可解码播放，首页不预载整套音乐", async ({ page }) => {
  const requested = new Set<string>();
  page.on("request", (r) => {
    if (/battle-\d+\.mp3/.test(r.url())) requested.add(r.url());
  });
  await page.goto("/");
  await expect(page.locator(".version")).toContainText(`v${version}`);
  expect(requested.size).toBe(0);
  const decoded = await page.evaluate(async () => {
    const base = new URL("audio/", location.href);
    const result = [];
    for (let id = 1; id <= 12; id++) {
      const a = new Audio(new URL(`battle-${id}.mp3`, base).href);
      a.preload = "metadata";
      a.muted = true;
      const duration = await new Promise<number>((resolve, reject) => {
        a.onloadedmetadata = () => resolve(a.duration);
        a.onerror = () => reject(new Error(`failed:${id}`));
      });
      await a.play();
      await new Promise<void>((resolve, reject) => {
        a.ontimeupdate = () => {
          if (a.currentTime > 0.05) resolve();
        };
        a.onerror = () => reject(new Error(`decode:${id}`));
      });
      result.push({ id, duration });
      a.pause();
      a.removeAttribute("src");
      a.load();
    }
    return result;
  });
  expect(decoded).toHaveLength(12);
  for (const track of decoded) expect(track.duration).toBeGreaterThan(140);
});
test("仅按需加载当前地图音乐，加载失败跳过且可在抽卡时继续轮播", async ({
  page,
}) => {
  const requested = new Set<number>();
  page.on("request", (r) => {
    const m = r.url().match(/battle-(\d+)\.mp3/);
    if (m) requested.add(Number(m[1]));
  });
  await page.addInitScript(() => {
    const Native = window.Audio;
    (window as any).Audio = function (src: string) {
      const a = new Native(src);
      (window as any).battleAudio = a;
      return a;
    };
  });
  await page.route("**/audio/battle-11.mp3", (r) => r.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.locator('[data-action="launch"]').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).battleAudio?.src || ""))
    .toContain("battle-10.mp3");
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).battleAudio?.currentTime || 0),
    )
    .toBeGreaterThan(0.1);
  expect([...requested].sort((a, b) => a - b)).toEqual([10, 11]);
  const saved = await save(page);
  saved.phase = "upgrade";
  saved.choices = ["power", "critical", "stride"];
  saved.deck!.active = "positive";
  await page.reload();
  await load(page, saved);
  await expect(page.locator('[data-action="upgrade-power"]')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).battleAudio?.currentTime || 0),
    )
    .toBeGreaterThan(0.1);
  await page.evaluate(() =>
    (window as any).battleAudio.dispatchEvent(new Event("ended")),
  );
  await expect
    .poll(() => page.evaluate(() => (window as any).battleAudio.src))
    .toContain(`battle-${MAP_PLAYLISTS.forest[2]}.mp3`);
  await expect
    .poll(() => page.evaluate(() => (window as any).battleAudio.paused))
    .toBe(false);
});
