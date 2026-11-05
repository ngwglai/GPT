import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { validateRun } from "../src/services/storage";
import type { Run } from "../src/core/types";
async function saved(page: Page) {
  return page.evaluate(
    () =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("kv", "readonly").objectStore("kv").get("run");
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
            t = db.transaction("kv", "readwrite");
          t.objectStore("kv").put(s, "run");
          t.oncomplete = () => {
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
for (const character of ["ranger", "knight", "mage"])
  test(`${character}战败完整播放、等待复活可刷新、扣次后重新站起且保留波次`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const w = new World(createRun("endless", character, 1602));
    w.s.player.hp = 1;
    w.s.player.invincible = 0;
    w.s.player.regen = 0;
    w.s.fate!.base.regen = 0;
    w.s.player.level = 100;
    w.s.revival!.remaining = w.s.revival!.earned = 1;
    const enemy = spawn(w, "crawler", { x: 1800, y: 1800 })!;
    enemy.hp = enemy.maxHp = 1_000_000;
    await resume(page, w.s);
    await expect(page.locator(".presentation-caption")).toContainText(
      "星光渐息",
    );
    await expect(page.getByRole("heading", { name: "此行落幕" })).toHaveCount(
      0,
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-character-action",
      "defeat",
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-character-texture",
      new RegExp(`animation.${character}.defeat`),
    );
    // Ignore the initial living checkpoint until the lethal transition is durable.
    await expect.poll(async () => (await saved(page))?.revival.deaths).toBe(1);
    const before = await saved(page);
    await expect(
      page.getByRole("heading", { name: "星火尚未熄灭" }),
    ).toBeVisible();
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-character-frame",
      "7",
    );
    await page.screenshot({
      path: `validation/v1.6/${character}-defeat.jpg`,
      type: "jpeg",
      quality: 82,
    });
    await expect.poll(async () => (await saved(page))?.phase).toBe("revive");
    const offered = await saved(page);
    expect(offered.time).toBe(before.time);
    expect(offered.wave).toEqual(before.wave);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).click();
    await expect(
      page.getByRole("heading", { name: "星火尚未熄灭" }),
    ).toBeVisible();
    expect((await saved(page)).revival.used).toBe(0);
    await page.getByRole("button", { name: "重新点燃星火" }).click();
    await expect(page.locator(".presentation-caption")).toContainText(
      "星火汇聚",
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-character-action",
      "revive",
    );
    await expect(page.locator("canvas")).toHaveAttribute(
      "data-character-texture",
      new RegExp(`animation.${character}.revive`),
    );
    await page.screenshot({
      path: `validation/v1.6/${character}-reviving.jpg`,
      type: "jpeg",
      quality: 82,
    });
    await expect(page.locator(".presentation-caption")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "保存当前进度", exact: true })
      .click();
    await expect(page.locator("#toast")).toContainText("进度已保存");
    const after = await saved(page);
    expect(after.revival.used).toBe(1);
    expect(after.revival.remaining).toBe(0);
    expect(after.player.hp).toBe(after.player.maxHp * 0.5);
    expect(after.wave.number).toBe(before.wave.number);
    expect(after.enemies.some((e: any) => e.id === enemy.id && e.hp > 0)).toBe(
      true,
    );
    expect(errors).toEqual([]);
  });
test("零星火完整战败后结算，刷新或重试不会重复记录", async ({ page }) => {
  const w = new World(createRun("endless", "mage", 1604));
  w.s.player.hp = 1;
  w.s.player.invincible = 0;
  w.s.player.regen = 0;
  w.s.fate!.base.regen = 0;
  spawn(w, "crawler", { x: 1800, y: 1800 });
  await resume(page, w.s);
  await expect(page.locator(".presentation-caption")).toContainText("星光渐息");
  await expect(page.getByRole("heading", { name: "此行落幕" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "此行落幕" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新点燃星火" })).toHaveCount(
    0,
  );
  await expect
    .poll(async () => (await saved(page))?.recorded)
    .toEqual(["endless"]);
  const records = () =>
    page.evaluate(
      () =>
        new Promise<any[]>((resolve) => {
          const r = indexedDB.open("starfall-survivor", 1);
          r.onsuccess = () => {
            const db = r.result,
              q = db.transaction("kv").objectStore("kv").get("profile");
            q.onsuccess = () => {
              resolve(q.result.records);
              db.close();
            };
          };
        }),
    );
  expect(await records()).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("button", { name: "开启远征" })).toBeVisible();
  expect(await records()).toHaveLength(1);
});
test("刷新已扣次的复活动画只完成一次，不重新扣次", async ({ page }) => {
  // Observe rendered frames in-page: the remaining clip is shorter than a slow
  // runner's test-process round trip, so a later current-state query can miss it.
  await page.addInitScript(() => {
    (window as any).reviveFrames = [];
    new MutationObserver((records) => {
      for (const record of records) {
        const el = record.target;
        if (
          el instanceof HTMLCanvasElement &&
          el.dataset.characterAction === "revive"
        ) {
          const frame = Number(el.dataset.characterFrame);
          const frames = (window as any).reviveFrames as number[];
          if (!frames.includes(frame)) frames.push(frame);
        }
      }
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-character-action"],
    });
  });
  const w = new World(createRun("endless", "knight", 1605));
  w.s.revival!.earned = 2;
  w.s.revival!.remaining = 1;
  w.s.revival!.used = 1;
  w.s.revival!.deaths = 1;
  w.s.revival!.elapsed = 0.35;
  w.s.phase = "reviving";
  w.s.player.hp = 0;
  w.s.player.level = 100;
  w.s.player.regen = 0;
  w.s.fate!.base.regen = 0;
  await resume(page, w.s);
  await expect
    .poll(() => page.evaluate(() => (window as any).reviveFrames.length))
    .toBeGreaterThanOrEqual(2);
  await expect(page.locator(".presentation-caption")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  const s = await saved(page);
  expect(s.revival.used).toBe(1);
  expect(s.revival.remaining).toBe(1);
  expect(s.player.hp).toBe(s.player.maxHp * 0.5);
});
test("动作表能循环、主动施法、冲刺与移动切换，暂停不会推进帧", async ({
  page,
}) => {
  // LAN HTTP can expose getRandomValues without the secure-context UUID API.
  await page.addInitScript(() =>
    Object.defineProperty(crypto, "randomUUID", { value: undefined }),
  );
  const w = new World(createRun("endless", "ranger", 1606));
  w.s.player.invincible = 999;
  w.s.player.level = 100;
  await resume(page, w.s);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  await expect
    .poll(async () => (await saved(page)).recordId)
    .toMatch(/^[0-9a-f]{32}$/);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute(
    "data-character-texture",
    /animation.ranger.idle/,
  );
  const first = await canvas.getAttribute("data-character-frame");
  await expect
    .poll(() => canvas.getAttribute("data-character-frame"))
    .not.toBe(first);
  await page.keyboard.down("KeyD");
  await expect(canvas).toHaveAttribute("data-character-action", "run");
  await page.keyboard.press("KeyQ");
  await expect(canvas).toHaveAttribute("data-character-action", "cast");
  await expect(canvas).toHaveAttribute("data-character-action", "run");
  await page.keyboard.press("Space");
  await expect(canvas).toHaveAttribute("data-character-action", "dash");
  await expect(canvas).toHaveAttribute("data-character-action", "run");
  await page.keyboard.up("KeyD");
  await expect(canvas).toHaveAttribute("data-character-action", "idle");
  await page.keyboard.press("Escape");
  const f = await canvas.getAttribute("data-character-frame");
  await page.getByRole("heading", { name: "远征已暂停" }).waitFor();
  expect(await canvas.getAttribute("data-character-frame")).toBe(f);
  await page.screenshot({
    path: "validation/v1.6/paused.jpg",
    type: "jpeg",
    quality: 82,
  });
});
test("七张动作贴图加载失败时回退静态角色，战斗仍运行", async ({ page }) => {
  await page.route("**/assets/v1.6/characters/ranger/*.webp", (route) =>
    /\/(idle|run|dash|cast|hurt|defeat|revive)\.webp/.test(
      route.request().url(),
    )
      ? route.abort()
      : route.continue(),
  );
  const w = new World(createRun("endless", "ranger", 1607));
  w.s.player.invincible = 999;
  await resume(page, w.s);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-character-texture",
    /player.ranger/,
  );
  await page.keyboard.down("KeyD");
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-character-action",
    "run",
  );
  await page.keyboard.up("KeyD");
});
test("正式首领奖励一次星火，放弃复活与旧检查点重放不重复结算", async ({
  page,
}) => {
  const w = new World(createRun("endless", "ranger", 1608));
  w.s.player.level = 100;
  w.s.player.invincible = 999;
  w.s.bossIndex = 1;
  const boss = spawn(w, "warden", { x: 1900, y: 1800 })!;
  boss.bossOrdinal = 1;
  boss.hp = 1;
  await resume(page, w.s);
  await expect(page.locator("#spark-count")).toContainText("1");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  const checkpoint = await saved(page);
  expect(checkpoint.revival.earned).toBe(1);
  expect(checkpoint.stats.bosses).toBe(1);
  checkpoint.phase = "revive";
  checkpoint.player.hp = 0;
  checkpoint.revival.deaths = 1;
  checkpoint.revival.elapsed = 1.59;
  for (let attempt = 0; attempt < 2; attempt++) {
    await resume(page, checkpoint);
    await page.getByRole("button", { name: "结束本次远征" }).click();
    await expect(page.getByRole("heading", { name: "此行落幕" })).toBeVisible();
    await expect
      .poll(async () => (await saved(page))?.recorded)
      .toEqual(["endless"]);
    expect((await saved(page)).revival.used).toBe(0);
  }
  const records = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            q = db.transaction("kv").objectStore("kv").get("profile");
          q.onsuccess = () => {
            resolve(q.result.records.length);
            db.close();
          };
        };
      }),
  );
  expect(records).toBe(1);
});
test("旧静态角色覆盖优先，单动作静态图片也可正常加载", async ({ page }) => {
  const w = new World(createRun("endless", "ranger", 1609));
  w.s.player.invincible = 999;
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ffdd77";
    g.fillRect(0, 0, 32, 32);
    return c.toDataURL();
  });
  const setPack = async (root: boolean) =>
    page.evaluate(
      ({ root, data }) =>
        new Promise<void>((resolve) => {
          const r = indexedDB.open("starfall-survivor", 1);
          r.onsuccess = () => {
            const db = r.result,
              t = db.transaction("kv", "readwrite");
            t.objectStore("kv").put(
              {
                version: 1,
                assets: {
                  [root ? "player.ranger" : "animation.ranger.idle"]: {
                    data,
                    scale: 1,
                    x: 0,
                    y: 0,
                  },
                },
              },
              "assets",
            );
            t.oncomplete = () => {
              db.close();
              resolve();
            };
          };
        }),
      { root, data },
    );
  await setPack(true);
  await resume(page, w.s);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-character-texture",
    "player.ranger",
  );
  await setPack(false);
  await resume(page, w.s);
  await expect(page.locator("canvas")).toHaveAttribute(
    "data-character-texture",
    "animation.ranger.idle",
  );
});
test("结算前刷新留下的终局检查点在启动时补记且只记一次", async ({ page }) => {
  const s = createRun("endless", "mage", 1610);
  s.recordId = "00000000-0000-4000-8000-000000001610";
  s.phase = "dead";
  s.player.hp = 0;
  s.revival!.deaths = 1;
  // resume writes the fixture then reloads; a terminal checkpoint intentionally has no continue button.
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await page.evaluate(
    (s) =>
      new Promise<void>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const d = r.result,
            t = d.transaction("kv", "readwrite");
          t.objectStore("kv").put(s, "run");
          t.oncomplete = () => {
            d.close();
            resolve();
          };
        };
      }),
    s,
  );
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await page.getByRole("button", { name: "开启远征" }).waitFor();
    expect((await saved(page)).recorded).toEqual(["endless"]);
    await page.getByRole("button", { name: "远征记录", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(1);
  }
});
