import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { newWave } from "../src/core/waves";
import { spawn } from "../src/core/director";
import { MAPS, type MapId } from "../src/data/maps";
import { MAP_PLAYLISTS } from "../src/data/audio";
import { validateRun } from "../src/services/storage";
import type { Run } from "../src/core/types";
async function runValue(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("kv", "readonly");
          const q = tx.objectStore("kv").get("run");
          q.onsuccess = () => {
            resolve(q.result);
            db.close();
          };
        };
      }),
  );
}
async function resume(page: Page, s: Run) {
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
}
async function save(page: Page) {
  await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  return (await runValue(page)) as Run;
}
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Native = window.Audio;
    (window as any).Audio = function (src: string) {
      const a = new Native(src);
      (window as any).battleAudio = a;
      return a;
    };
  });
});
for (const map of Object.keys(MAPS) as MapId[]) {
  test(`${MAPS[map].name}使用独立歌单，曲末轮播，读档仍选择当前地图`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(page.locator(".version")).toContainText("v1.6");
    await page.getByRole("button", { name: "开启远征" }).click();
    await page.locator(`[data-action="map-${map}"]`).click();
    await page.locator('[data-action="launch"]').click();
    await expect(page.locator("#wave-hud")).toContainText("第 1 波");
    const first = MAP_PLAYLISTS[map][0],
      second = MAP_PLAYLISTS[map][1];
    await expect
      .poll(() => page.evaluate(() => (window as any).battleAudio?.src || ""))
      .toContain(`battle-${first}.mp3`);
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
      .toContain(`battle-${second}.mp3`);
    const s = await save(page);
    expect(s.wave!.number).toBe(1);
    const before = s.wave;
    await page.waitForTimeout(250);
    expect((await runValue(page)).wave).toEqual(before);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect
      .poll(() => page.evaluate(() => (window as any).battleAudio?.src || ""))
      .toContain(`battle-${first}.mp3`);
    await expect(page.locator(".run-clock")).toContainText(MAPS[map].name);
    expect(errors).toEqual([]);
    if (map === "garden")
      await page.screenshot({
        path: "validation/v1.5/garden-wave.jpg",
        type: "jpeg",
        quality: 78,
      });
  });
}
test("清空已入场波次立即推进，超时推进保留旧怪物", async ({ page }) => {
  const w = new World(createRun("endless", "ranger", 320));
  w.s.wave!.processed = w.s.wave!.spawned = w.s.wave!.budget;
  w.s.wave!.status = "active";
  w.s.player.invincible = 999;
  await resume(page, w.s);
  await expect(page.locator("#wave-hud")).toContainText("第 2 波");
  const s = await save(page);
  expect(s.wave!.number).toBe(2);
  // Fresh document prevents a prior world's autosave from racing the fixture.
  await page.reload();
  const t = new World(createRun("endless", "ranger", 321));
  t.s.time = 54.95;
  t.s.player.invincible = 999;
  const old = spawn(t, "guard", { x: 2400, y: 1800 })!;
  await resume(page, t.s);
  await expect(page.locator("#wave-hud")).toContainText("第 2 波");
  const after = await save(page);
  expect(after.enemies.some((e) => e.id === old.id && e.hp > 0)).toBe(true);
});
test("首领按波次排队、暂停读档不重复生成", async ({ page }) => {
  const w = new World(createRun("endless", "ranger", 385));
  w.s.wave = newWave(10, 0);
  w.s.bossIndex = 1;
  w.s.player.invincible = 999;
  const e = spawn(w, "warden", { x: 2400, y: 1800 })!;
  e.bossOrdinal = 1;
  await resume(page, w.s);
  await expect(page.locator("#wave-hud")).toContainText("待出场首领 1");
  await page.screenshot({
    path: "validation/v1.5/boss-queue.jpg",
    type: "jpeg",
    quality: 78,
  });
  const s = await save(page);
  expect(s.bossIndex).toBe(1);
  expect(s.enemies.filter((e) => e.bossOrdinal !== undefined)).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  const after = await save(page);
  expect(after.bossIndex).toBe(1);
  expect(
    after.enemies.filter((e) => e.bossOrdinal !== undefined).map((e) => e.id),
  ).toEqual([e.id]);
});
test("真实采样成功解码播放，静音即时作用且不会重复下载", async ({ page }) => {
  const requests = new Map<string, number>();
  page.on("request", (r) => {
    if (r.url().includes("/audio/sfx/"))
      requests.set(r.url(), (requests.get(r.url()) || 0) + 1);
  });
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start;
    (window as any).sampleStarts = 0;
    AudioBufferSourceNode.prototype.start = function (
      ...args: Parameters<typeof start>
    ) {
      if (this.buffer) (window as any).sampleStarts++;
      return start.apply(this, args);
    };
    const gain = AudioContext.prototype.createGain;
    (window as any).gains = [];
    AudioContext.prototype.createGain = function () {
      const g = gain.call(this);
      (window as any).gains.push(g);
      return g;
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await expect.poll(() => requests.size).toBe(23);
  await page.locator('[data-action="launch"]').click();
  await expect
    .poll(() => page.evaluate(() => (window as any).sampleStarts))
    .toBeGreaterThan(0);
  await page.keyboard.press("q");
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: "Ⅱ 暂停" }).click();
  await page.getByRole("button", { name: "游戏设置", exact: true }).click();
  await page.locator("#sfx").fill("0");
  await expect
    .poll(() => page.evaluate(() => (window as any).gains[0]?.gain.value))
    .toBe(0);
  expect([...requests.values()].every((n) => n === 1)).toBe(true);
});
test("音效文件失效仍可开始波次远征", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/audio/sfx/**", (route) => route.abort());
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.locator('[data-action="launch"]').click();
  await expect
    .poll(() => page.locator("#clock").textContent())
    .not.toBe("00:00");
  await expect(page.locator("#wave-hud")).toContainText("第 1 波");
  expect(errors).toEqual([]);
});
