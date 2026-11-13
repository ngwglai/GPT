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
      loaded: {} as Record<string, boolean>,
      images: {} as Record<string, HTMLImageElement>,
      dashSeen: false,
    });
    // Observe the very Image objects loaded by GameScene, rather than preloading
    // a second copy which could hide a missing/late runtime texture.
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    )!;
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      ...descriptor,
      set(this: HTMLImageElement, value: string) {
        if (value.includes("/v1.9.0/effects/")) {
          const name = value.split("/").pop()!.split(".")[0];
          state.images[name] = this;
          this.addEventListener(
            "load",
            () => {
              if (this.naturalWidth > 0) state.loaded[name] = true;
            },
            { once: true },
          );
        }
        descriptor.set!.call(this, value);
      },
    });
    new MutationObserver(() => {
      if (document.querySelector("canvas")?.dataset.characterAction === "dash")
        state.dashSeen = true;
    }).observe(document, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-character-action"],
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
async function effectReady(page: Page, id: string) {
  await expect
    .poll(
      () =>
        page.evaluate((id) => !!(window as any).paintedEffects.loaded[id], id),
      { message: `${id}运行时贴图必须成功加载后再验证绘制` },
    )
    .toBe(true);
}
test.afterEach(async ({ page }, info) => {
  if (info.status === info.expectedStatus || page.isClosed()) return;
  const images = await page.evaluate(() => {
    const s = (window as any).paintedEffects;
    if (!s) return {};
    return Object.fromEntries(
      Object.entries(s.images as Record<string, HTMLImageElement>).map(
        ([id, image]) => [
          id,
          {
            loaded: !!s.loaded[id],
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            hasSource: !!image.getAttribute("src"),
            draws: s.counts[id] || 0,
          },
        ],
      ),
    );
  });
  await info.attach("实际特效图片状态", {
    body: JSON.stringify(images, null, 2),
    contentType: "application/json",
  });
});
async function load(
  page: Page,
  map: MapId,
  skills: SkillId[],
  ready: string[] = [],
) {
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
  // GameScene loads its real default textures in the paused camp too. Establish
  // the art precondition before starting the software-rendered battle, rather
  // than racing image decode against an already advancing combat simulation.
  for (const id of ready) await effectReady(page, id);
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
async function keyEffect(
  page: Page,
  key: string,
  id: string,
  cooldown: string,
) {
  await test.step(`${key}：贴图就绪、实际释放与${id}绘制`, async () => {
    await effectReady(page, id);
    await expect(page.locator(cooldown)).toHaveText("");
    const before = await page.evaluate(
      (id) => (window as any).paintedEffects.counts[id] || 0,
      id,
    );
    await page.keyboard.press(key);
    // A dispatched key alone does not prove that a simulation step consumed it.
    await expect(
      page.locator(cooldown),
      `${key}必须被战斗逻辑消费并启动冷却`,
    ).toHaveText(/\d/);
    await expect
      .poll(
        () =>
          page.evaluate(
            (id) => (window as any).paintedEffects.counts[id] || 0,
            id,
          ),
        { message: `${key}释放后${id}必须实际执行Canvas绘制` },
      )
      .toBeGreaterThan(before);
  });
}
test("星贯、复苏、星幕与冲刺接入绘制，新增资源可以在工坊替换", async ({
  page,
}) => {
  await instrument(page);
  await load(
    page,
    "forest",
    ["lance", "bloom", "ward"],
    ["lance", "heal", "shield", "dash"],
  );
  for (const [key, id, cooldown] of [
    ["q", "lance", "#cd-0"],
    ["e", "heal", "#cd-1"],
    ["r", "shield", "#cd-2"],
    ["Space", "dash", "#dash-cd"],
  ])
    await keyEffect(page, key, id, cooldown);
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

test("冲刺贴图晚到时保留正常冲刺，加载后下一次Space绘制正式特效", async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/v1.9.0/effects/dash.webp", async (route) => {
    await gate;
    await route.continue();
  });
  await instrument(page);
  try {
    await load(page, "forest", ["lance", "bloom", "ward"]);
    await page.keyboard.press("Space");
    await expect(page.locator("#dash-cd")).toHaveText(/\d/);
    await expect
      .poll(() => page.evaluate(() => (window as any).paintedEffects.dashSeen))
      .toBe(true);
    await expect(page.locator("canvas")).not.toHaveAttribute(
      "data-character-action",
      "dash",
    );
    const before = await page.evaluate(() => (window as any).paintedEffects);
    expect(before.loaded.dash).toBeUndefined();
    expect(before.counts.dash || 0).toBe(0);
    release();
    // Keep the original cooldown; do not reset state or replay missed effects.
    await keyEffect(page, "Space", "dash", "#dash-cd");
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});
