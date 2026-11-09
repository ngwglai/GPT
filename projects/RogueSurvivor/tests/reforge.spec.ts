import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { grant } from "../src/core/rewards";
import { spawn } from "../src/core/director";
import { ensureDeck } from "../src/core/deckState";
import type { Run } from "../src/core/types";
// Multiple real save/menu transitions can be slow under software-rendered Windows CI.
test.setTimeout(90000);
async function stored(page: Page, value?: Run) {
  return page.evaluate(
    (value) =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("kv", value ? "readwrite" : "readonly"),
            store = t.objectStore("kv");
          if (value) {
            store.put(value, "run");
            t.oncomplete = () => {
              db.close();
              resolve(value);
            };
          } else {
            const q = store.get("run");
            q.onsuccess = () => {
              resolve(q.result);
              db.close();
            };
          }
        };
      }),
    value,
  );
}
async function resume(page: Page, s: Run) {
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await stored(page, s);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
}
async function save(page: Page) {
  await page.locator('[data-action="pause"]').click();
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  return stored(page);
}
function make() {
  const w = new World(createRun("endless", "ranger", 1809, "ice", "ward"));
  w.s.rocks = [];
  w.s.player.level = 20;
  w.s.player.invincible = 1000;
  return w;
}
test("二级到三级武器进化、图鉴与新的乘区说明", async ({ page }) => {
  const w = make();
  grant(w.s, "weapon_bow");
  w.s.phase = "upgrade";
  w.s.deck!.active = "positive";
  w.s.choices = ["weapon_bow", "power", "crit_damage"];
  await resume(page, w.s);
  await expect(
    page.locator('[data-action="upgrade-weapon_bow"]'),
  ).toContainText("三级");
  await page.locator('[data-action="upgrade-weapon_bow"]').click();
  await expect(page.locator("#weapons")).toContainText("进化");
  const s = await save(page);
  expect(s.player.weapons.bow).toBe(3);
  expect(s.version).toBe(5);
  await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
  await page.getByRole("button", { name: "技能图鉴", exact: true }).click();
  await expect(page.locator(".codex-card").first()).toContainText("最高3级");
  await page.getByRole("button", { name: "卡牌图鉴", exact: true }).click();
  await expect(page.locator(".damage-rules")).toContainText("条件区");
  await page.locator("#card-search").fill("双生共鸣");
  await expect(page.locator(".codex-card:visible")).toContainText(
    "Boss为0.15秒",
  );
  await expect(page.locator(".codex-card:visible")).toContainText("间隔0.8秒");
  await page.locator("#card-search").fill("冰晶碎裂");
  await expect(page.locator(".codex-card:visible")).toHaveCount(1);
  await expect(page.locator(".codex-card:visible")).toContainText("不递归");
  await page.screenshot({
    path: "validation/v1.8/core-codex.jpg",
    type: "jpeg",
    quality: 85,
  });
});
test("旧v4五级武器读档补偿且刷新后不会重复补偿", async ({ page }) => {
  const w = make(),
    s = w.s;
  s.version = 4;
  s.player.weapons.bow = 5;
  s.player.upgrades.weapon_bow = 4;
  await resume(page, s);
  const v = await save(page);
  expect(v.version).toBe(5);
  expect(v.player.weapons.bow).toBe(3);
  expect(v.player.upgrades.bow_power).toBe(2);
  expect(v.build.compensation).toBe(2);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  const twice = await save(page);
  expect(twice.player.upgrades.bow_power).toBe(2);
  expect(twice.build.compensation).toBe(2);
});
test("真实主动技能触发冻结击杀核心，衍生伤害被统计和保存", async ({ page }) => {
  const w = make();
  grant(w.s, "shatter");
  grant(w.s, "crystal_fracture");
  w.s.player.weaponTimers.bow = 20;
  const a = spawn(w, "crawler", { x: 1900, y: 1800 })!,
    b = spawn(w, "crawler", { x: 1940, y: 1800 })!;
  a.freeze = b.freeze = 10;
  a.hp = 1;
  b.hp = b.maxHp = 120;
  await resume(page, w.s);
  await page.locator('[data-skill-slot="0"]').click();
  await expect(page.locator("#cd-0")).not.toBeEmpty();
  const s = await save(page);
  expect(s.stats.bySource.crystal_fracture).toBeGreaterThan(0);
  expect(s.stats.kills).toBeGreaterThan(0);
  expect(s.build.fractureReady).toBeGreaterThan(0);
});
test.describe("移动端重铸卡牌", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("长说明、核心图标与触摸抽卡保留原摇杆及技能", async ({ page }) => {
    const w = make();
    grant(w.s, "shatter");
    w.s.phase = "upgrade";
    w.s.deck!.active = "positive";
    w.s.choices = ["crystal_fracture", "crit_damage", "boss_hunter"];
    await resume(page, w.s);
    await expect(page.locator(".upgrade-card")).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "validation/v1.8/mobile-core-cards.jpg",
      type: "jpeg",
      quality: 85,
    });
    await page.locator('[data-action="upgrade-crystal_fracture"]').tap();
    await expect(page.locator("[data-joystick]")).toBeVisible();
    await page.locator('[data-skill-slot="1"]').tap();
    await expect(page.locator("#cd-1")).not.toBeEmpty();
    const s = await save(page);
    expect(s.player.upgrades.crystal_fracture).toBe(1);
  });
});
