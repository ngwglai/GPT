import { ensureDeck } from "../src/core/deckState";
import { recalculate } from "../src/core/fate";
import { heldLayers } from "../src/core/deckState";
import { test, expect, Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import type { Run } from "../src/core/types";
async function put(page: Page, key: string, value: unknown) {
  await page.evaluate(
    async ({ key, value }) => {
      await new Promise<void>((resolve, reject) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("kv", "readwrite");
          tx.objectStore("kv").put(value, key);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      });
    },
    { key, value },
  );
}
async function get(page: Page, key: string) {
  return page.evaluate(
    async (key) =>
      await new Promise<any>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("kv", "readonly"),
            req = tx.objectStore("kv").get(key);
          req.onsuccess = () => {
            resolve(req.result);
            db.close();
          };
        };
      }),
    key,
  );
}
async function resume(page: Page, s: Run) {
  // Fixtures that manually enter an upgrade must declare its v1.2 draw type.
  if (s.phase === "upgrade")
    ensureDeck(s).active = s.choices.every((id) => id.startsWith("hex_"))
      ? "negative"
      : "positive";
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await put(page, "run", s);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
}
async function launch(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.getByRole("button", { name: "踏入星林" }).click();
  await expect(page.locator("#clock")).toBeVisible();
}
test("中文菜单、角色选择及实际 Canvas 渲染无脚本错误", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /于星烬中.*再赴远征/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "开启远征" }).click();
  await expect(page.locator(".character-card")).toHaveCount(3);
  await page.locator('[data-action="character-mage"]').click();
  await page.getByRole("button", { name: "踏入星林" }).click();
  await expect(page.locator(".player-name")).toContainText("月棘术士");
  await expect(page.locator("canvas")).toBeVisible();
  await expect
    .poll(() => page.locator("#clock").textContent(), { timeout: 20000 })
    .not.toBe("00:00");
  expect(errors).toEqual([]);
});
test("WASD 移动、Q 冷却、闪避、暂停冻结与保存恢复", async ({ page }) => {
  await launch(page);
  await page.keyboard.down("d");
  await page.waitForTimeout(1200);
  await page.keyboard.up("d");
  await page.mouse.move(1000, 450);
  await page.keyboard.press("q");
  await expect(page.locator("#cd-0")).not.toBeEmpty();
  await page.keyboard.press("Space");
  await expect(page.locator("#dash-cd")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "远征已暂停" })).toBeVisible();
  await page.getByRole("button", { name: "保存当前进度" }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  const s = await get(page, "run");
  expect(s.player.x).toBeGreaterThan(1800);
  expect(s.player.cooldowns[0]).toBeGreaterThan(0);
  const t = s.time;
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: "保存当前进度" }).click();
  expect((await get(page, "run")).time).toBe(t);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await expect(page.locator("#clock")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { name: "远征已暂停" })).toBeVisible();
});
test("实际自动攻击击杀、星晶拾取与数字键升级", async ({ page }) => {
  const w = new World(createRun("standard", "ranger", 42));
  w.s.player.xp = 40;
  w.s.spawnTimer = 8;
  const e = spawn(w, "crawler", { x: 1850, y: 1800 })!;
  e.hp = 1;
  await resume(page, w.s);
  await expect(
    page.getByRole("heading", { name: "选择一份馈赠" }),
  ).toBeVisible();
  await expect(page.locator(".upgrade-card")).toHaveCount(3);
  await page.keyboard.press("1");
  await expect(page.locator("#level")).toContainText("等级 2");
  await expect(page.locator("#kills")).toContainText("1");
});
test("最终 Boss 实际受击后结算，并继续无尽", async ({ page }) => {
  const w = new World(createRun("standard", "ranger", 47));
  w.s.time = 1201;
  w.s.nextBoss = 1500;
  w.s.nextEvent = 1260;
  w.s.bossIndex = 4;
  // Keep this transition test independent of queued level rewards (covered separately).
  w.s.player.level = 100;
  const e = spawn(w, "titan", { x: 1880, y: 1800 })!;
  e.hp = 1;
  await resume(page, w.s);
  await expect(page.getByRole("heading", { name: "远征告捷" })).toBeVisible();
  await expect(page.locator(".damage-row")).not.toHaveCount(0);
  await page.getByRole("button", { name: "继续无尽星夜" }).click();
  while (await page.locator(".upgrade-card").count()) {
    await page.locator(".upgrade-card").first().click();
    await page.waitForTimeout(100);
  }
  await expect(page.locator(".run-clock")).toContainText("无尽星夜");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度" }).click();
  await expect
    .poll(async () => ((await get(page, "run")) as Run)?.mode)
    .toBe("endless");
});
test("死亡结算、历史记录和重新开始", async ({ page }) => {
  const w = new World(createRun("endless", "knight", 50));
  w.s.player.hp = 1;
  w.s.player.invincible = 0;
  w.s.player.regen = 0;
  spawn(w, "warden", { x: 1800, y: 1800 });
  await resume(page, w.s);
  await expect(page.getByRole("heading", { name: "此行落幕" })).toBeVisible();
  await page.getByRole("button", { name: "远征记录", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "← 返回" }).click();
  await page.getByRole("button", { name: "再启远征" }).click();
  await expect(
    page.getByRole("heading", { name: "选择你的行路人" }),
  ).toBeVisible();
});
test("设置保存且重新打开后保留", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.locator("#quality").selectOption("low");
  await page.locator("#showStats").check();
  await page.locator("#shake").uncheck();
  await page.getByRole("button", { name: "保存设置" }).click();
  await expect(page.locator("#toast")).toContainText("设置已保存");
  await page.reload();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.locator("#quality")).toHaveValue("low");
  await expect(page.locator("#showStats")).toBeChecked();
  await expect(page.locator("#shake")).not.toBeChecked();
});
test("损坏存档显示恢复选项并可恢复有效备份", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  const s = createRun("endless");
  s.time = 3670;
  s.nextBoss = 3900;
  s.nextEvent = 3690;
  await put(page, "backup", s);
  await put(page, "run", { version: 99 });
  await page.reload();
  await expect(page.locator(".error")).toContainText("存档损坏");
  await page.getByRole("button", { name: "恢复上次备份" }).click();
  await expect(page.locator("#clock")).toContainText("61:");
  await expect(page.locator(".run-clock")).toContainText("无尽星夜");
});
test("图片上传、变换、精灵图、导出、恢复默认和导入", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "资源工坊", exact: true }).click();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#f0a050";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#80d0a0";
    ctx.fillRect(64, 0, 64, 64);
    return c.toDataURL();
  });
  await page.locator("#asset-file").setInputFiles({
    name: "sprite.png",
    mimeType: "image/png",
    buffer: Buffer.from(data.split(",")[1], "base64"),
  });
  await expect(page.locator(".asset-editor")).toContainText(
    "已使用本地自定义图片",
  );
  await page.locator("#asset-scale").fill("1.5");
  await page.locator("#asset-x").fill("12");
  await page.locator("summary").click();
  await page.locator("#asset-frames").fill("2");
  await page.getByRole("button", { name: "应用配置" }).click();
  await expect(page.locator("#toast")).toContainText("资源配置已应用");
  const pack = await get(page, "assets");
  expect(pack.assets["player.ranger"].frames).toBe(2);
  expect(pack.assets["player.ranger"].x).toBe(12);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出资源包" }).click();
  expect((await download).suggestedFilename()).toContain("资源包");
  await page.getByRole("button", { name: "恢复默认", exact: true }).click();
  await expect(page.locator(".asset-editor")).toContainText("默认矢量美术");
  await page.locator("#pack-file").setInputFiles({
    name: "pack.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pack)),
  });
  await expect(page.locator(".asset-editor")).toContainText(
    "已使用本地自定义图片",
  );
  await page.reload();
  await page.getByRole("button", { name: "资源工坊", exact: true }).click();
  await expect(page.locator("#asset-scale")).toHaveValue("1.5");
});
test("拒绝脚本图片、超尺寸图片、坏资源包并回退默认", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "资源工坊", exact: true }).click();
  await page.locator("#asset-file").setInputFiles({
    name: "bad.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg onload="alert(1)"/>'),
  });
  await expect(page.locator("#toast")).toContainText("PNG 或 WebP");
  const huge = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 2049;
    c.height = 1;
    return c.toDataURL();
  });
  await page.locator("#asset-file").setInputFiles({
    name: "big.png",
    mimeType: "image/png",
    buffer: Buffer.from(huge.split(",")[1], "base64"),
  });
  await expect(page.locator("#toast")).toContainText("2048");
  await page.locator("#pack-file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":1,"assets":{"unknown":{}}}'),
  });
  await expect(page.locator("#toast")).toContainText("未知资源");
  await put(page, "assets", {
    version: 1,
    assets: {
      "player.ranger": {
        data: "data:image/png;base64,AAAA",
        scale: 1,
        x: 0,
        y: 0,
      },
    },
  });
  await page.reload();
  await expect(page.locator("#toast")).toContainText("回退到默认");
  await expect(page.getByRole("button", { name: "开启远征" })).toBeVisible();
});
// Keep the high-density software-rendering process out of ordinary UI tests.
// Chromium may fail to create the next context after releasing this GPU workload.
const denseTest = test.extend({
  browser: [
    async ({ playwright, launchOptions }, use) => {
      const browser = await playwright.chromium.launch(launchOptions);
      try {
        await use(browser);
      } finally {
        await browser.close();
      }
    },
    { scope: "worker" },
  ],
});
denseTest("密集战斗真实渲染、性能面板、无控制台异常", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const w = new World(createRun("endless", "mage", 77));
  w.s.time = 7201;
  w.s.nextBoss = 7500;
  w.s.nextEvent = 7290;
  w.s.player.invincible = 300;
  for (const id of ["bow", "blade", "ember", "orbit", "drone"] as const)
    w.s.player.upgrades["weapon_" + id] =
      5 - (ensureDeck(w.s).baseWeapons[id] || 0);
  recalculate(w.s);
  for (let i = 0; i < 140; i++) {
    const a = i * 2.4;
    spawn(
      w,
      (["crawler", "archer", "seer", "guard"] as const)[i % 4],
      {
        x: 1800 + Math.cos(a) * (200 + i * 2),
        y: 1800 + Math.sin(a) * (200 + i * 2),
      },
      i % 4 === 0,
    );
  }
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await put(page, "settings", {
    music: 0,
    sfx: 0,
    quality: "high",
    shake: false,
    showStats: true,
  });
  await resume(page, w.s);
  await expect(page.locator("#performance")).toContainText("FPS");
  await page.keyboard.press("r");
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "test-results/dense-combat.png" });
  console.log(
    "Dense combat:",
    await page.locator("#performance").textContent(),
  );
  expect(errors).toEqual([]);
});
test("窄屏菜单无水平溢出，主要入口可用", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "开启远征" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "开启远征" }).click();
  await expect(page.locator(".character-card")).toHaveCount(3);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("暂停中替换角色资源，恢复战斗后纹理有效且碰撞数据不变", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await launch(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "资源工坊", exact: true }).click();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    g.fillStyle = "#f5c36d";
    g.fillRect(8, 8, 48, 48);
    return c.toDataURL();
  });
  await page.locator("#asset-file").setInputFiles({
    name: "hero.png",
    mimeType: "image/png",
    buffer: Buffer.from(data.split(",")[1], "base64"),
  });
  await expect(page.locator(".asset-editor")).toContainText(
    "已使用本地自定义图片",
  );
  await page.locator("#asset-scale").fill("2");
  await page.getByRole("button", { name: "应用配置" }).click();
  await expect(page.locator("#toast")).toContainText("资源配置已应用");
  await page.getByRole("button", { name: "← 返回" }).click();
  await page.getByRole("button", { name: "继续远征", exact: true }).click();
  await page.keyboard.press("e");
  await expect(page.locator("#cd-1")).not.toBeEmpty();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度" }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  const s = await get(page, "run");
  expect(s.player.maxHp).toBe(110);
  expect(s.player.speed).toBe(230);
  expect(errors).toEqual([]);
});

for (const size of [32, 256]) {
  test(`静态 ${size} 像素图片调整缩放偏移后不被裁切`, async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "资源工坊", exact: true }).click();
    const data = await page.evaluate((size) => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const g = c.getContext("2d")!;
      g.fillStyle = "#ec8648";
      g.fillRect(0, 0, size, size);
      g.fillStyle = "#82d8aa";
      g.fillRect(size / 2, size / 2, size / 2, size / 2);
      return c.toDataURL();
    }, size);
    await page.locator("#asset-file").setInputFiles({
      name: "static.png",
      mimeType: "image/png",
      buffer: Buffer.from(data.split(",")[1], "base64"),
    });
    await expect(page.locator(".asset-editor")).toContainText(
      "已使用本地自定义图片",
    );
    await page.locator("#asset-scale").fill("1.5");
    await page.locator("#asset-x").fill("7");
    await page.getByRole("button", { name: "应用配置" }).click();
    await expect(page.locator("#toast")).toContainText("资源配置已应用");
    const a = (await get(page, "assets")).assets["player.ranger"];
    expect(a.frames).toBeUndefined();
    expect(a.frameWidth).toBeUndefined();
    expect(a.scale).toBe(1.5);
    expect(a.x).toBe(7);
    expect(a.data).toBe(data);
  });
}

test("不透明自定义地面保持可见，敌方预警绘制在其上方", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#0000ff";
    g.fillRect(0, 0, 32, 32);
    return c.toDataURL();
  });
  await put(page, "assets", {
    version: 1,
    assets: { "map.ground": { data, scale: 1, x: 0, y: 0 } },
  });
  const w = new World(createRun("standard"));
  w.s.player.weapons = {};
  ensureDeck(w.s).baseWeapons = {};
  w.s.rocks = [];
  w.s.spawnTimer = 9;
  w.zone({ x: 2000, y: 1800 }, 80, 10, "meteor", true, 8, 0.2);
  await resume(page, w.s);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const g = document.querySelector("canvas")!.getContext("2d")!;
        const b = g.getImageData(700, 650, 1, 1).data;
        const pixels = g.getImageData(835, 365, 170, 170).data;
        let red = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] > 160 && pixels[i + 1] < 210 && pixels[i + 2] < 200)
            red++;
        return { blue: b[2] > 200 && b[0] < 80, warning: red > 100 };
      }),
    )
    .toEqual({ blue: true, warning: true });
});

test("结算写入延迟时立即回营地不会复活旧存档", async ({ page }) => {
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      value: unknown,
      key?: IDBValidKey,
    ) {
      const request = original.call(this, value, key);
      if (key === "profile") {
        // Delay the application's completion callback while retaining real IndexedDB writes.
        const tx = this.transaction;
        tx.addEventListener("complete", () => {
          const done = tx.oncomplete;
          tx.oncomplete = null;
          if (done)
            Object.assign(window, {
              __releaseProfile: () => done.call(tx, new Event("complete")),
            });
        });
      }
      return request;
    };
  });
  const w = new World(createRun("endless", "ranger", 55));
  w.s.player.hp = 1;
  w.s.player.invincible = 0;
  w.s.player.regen = 0;
  spawn(w, "warden", { x: 1800, y: 1800 });
  await resume(page, w.s);
  await expect(page.getByRole("heading", { name: "此行落幕" })).toBeVisible();
  await page.waitForFunction(
    () => typeof (window as any).__releaseProfile === "function",
  );
  await page.getByRole("button", { name: "返回营地", exact: true }).click();
  await expect(page.getByRole("button", { name: /继续旅程/ })).toHaveCount(0);
  await expect.poll(async () => (await get(page, "run"))?.phase).toBe("dead");
  await page.evaluate(() => (window as any).__releaseProfile());
  await page.reload();
  await expect(page.getByRole("button", { name: "开启远征" })).toBeVisible();
  await expect(page.getByRole("button", { name: /继续旅程/ })).toHaveCount(0);
  expect((await get(page, "profile")).records).toHaveLength(1);
});

test("v1.1 宝箱、诅咒、净化、重抽、遗忘及五武器存档", async ({ page }) => {
  const { grant } = await import("../src/core/progression");
  const { addCurse } = await import("../src/core/fate");
  const s = createRun("standard", "ranger", 155);
  for (const id of ["blade", "ember", "orbit", "drone"])
    grant(s, "weapon_" + id);
  grant(s, "vigor");
  addCurse(s, "wither");
  s.phase = "upgrade";
  s.choices = ["chest_epic", "cleanse", "reroll"];
  await resume(page, s);
  await page.locator('[data-action="upgrade-chest_epic"]').click();
  await expect(page.locator("#event")).toContainText("星金宝箱");
  await expect(page.locator("#event")).toContainText("枯萎");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度" }).click();
  const saved = await get(page, "run");
  expect(Object.keys(saved.player.weapons)).toHaveLength(5);
  expect(saved.fate.chests).toBe(1);
  saved.phase = "upgrade";
  saved.choices = ["cleanse", "reroll", "forget"];
  await resume(page, saved);
  await page.locator('[data-action="upgrade-cleanse"]').click();
  await expect(page.locator("#event")).toContainText("净化完成");
  await expect(page.locator("#event")).not.toContainText("枯萎");
});
test("v1.1 重抽、遗忘与属性落盘", async ({ page }) => {
  const { grant } = await import("../src/core/progression");
  const s = createRun("standard", "ranger", 155);
  grant(s, "vigor");
  s.phase = "upgrade";
  const reroll = structuredClone(s);
  reroll.choices = ["reroll", "vitality", "power"];
  await resume(page, reroll);
  await page.locator('[data-action="upgrade-reroll"]').click();
  await expect(page.locator(".upgrade-card")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度" }).click();
  await expect
    .poll(async () => (await get(page, "run")).deck.refreshes)
    .toBe(6);
  const forgotten = structuredClone(s);
  forgotten.choices = ["forget", "vitality", "power"];
  await resume(page, forgotten);
  await page.locator('[data-action="upgrade-forget"]').click();
  await expect(page.locator(".upgrade-card")).toHaveCount(3);
  await expect
    .poll(async () => (await get(page, "run")).player.upgrades.vigor)
    .toBe(0);
});

test("v1.2 三类图鉴、当前构筑合并层数及独立刷新", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".version")).toContainText("v1.2");
  await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
  await expect(page.locator(".codex-card")).toHaveCount(70);
  await page.getByRole("button", { name: "技能图鉴", exact: true }).click();
  await expect(page.locator(".codex-card")).toHaveCount(11);
  await page.getByRole("button", { name: "怪物图鉴", exact: true }).click();
  await expect(page.locator(".codex-card")).toHaveCount(10);
  const { grant } = await import("../src/core/progression");
  const s = createRun("standard");
  grant(s, "power");
  grant(s, "power");
  s.phase = "upgrade";
  ensureDeck(s).active = "positive";
  s.choices = ["vitality", "power", "critical"];
  await resume(page, s);
  await page.getByRole("button", { name: /刷新 · 剩余 3/ }).click();
  await expect(
    page.getByRole("button", { name: /刷新 · 剩余 2/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "当前构筑", exact: true }).click();
  await expect(page.getByRole("heading", { name: "星核 ×2" })).toBeVisible();
  await page.getByRole("button", { name: "← 返回", exact: true }).click();
  await expect(page.locator(".upgrade-card")).toHaveCount(3);
  await expect
    .poll(async () => (await get(page, "run")).deck.refreshes)
    .toBe(2);
});
test("v1.2 掉落触发负面抽卡，读取后奖励队列不丢失", async ({ page }) => {
  const { placeDrop } = await import("../src/core/drops");
  const s = createRun("endless");
  ensureDeck(s);
  placeDrop(s, s.player, "negative", 2);
  placeDrop(s, s.player, "positive", 1);
  await resume(page, s);
  await expect(
    page.getByRole("heading", { name: "选择一项负面命运" }),
  ).toBeVisible();
  await expect(page.locator(".upgrade-card.polarity-negative")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: /刷新 · 剩余/ }),
  ).toBeDisabled();
  const saved = await get(page, "run");
  expect(saved.deck.pending).toEqual({ negative: 1, positive: 1 });
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await page.locator(".upgrade-card").first().click();
  await expect
    .poll(async () => (await get(page, "run")).deck.pending.negative)
    .toBe(0);
  await expect(
    page.getByRole("heading", { name: "选择一项负面命运" }),
  ).toBeVisible();
  await page.locator(".upgrade-card").first().click();
  await expect(
    page.getByRole("heading", { name: "选择一份馈赠" }),
  ).toBeVisible();
  await page.locator(".upgrade-card").first().click();
  await expect(page.locator(".upgrade-card")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "保存当前进度" }).click();
  await expect
    .poll(async () => (await get(page, "run")).deck.pending)
    .toEqual({ positive: 0, negative: 0 });
});
test("v1.2 命运洗牌包括自身等量替换，恢复后构筑一致", async ({ page }) => {
  const s = createRun("standard");
  ensureDeck(s);
  s.player.upgrades = { power: 30, hex_damage: 8 };
  recalculate(s);
  s.phase = "upgrade";
  s.deck!.active = "positive";
  s.choices = ["shuffle", "power", "vitality"];
  await resume(page, s);
  await page.locator('[data-action="upgrade-shuffle"]').click();
  await expect
    .poll(async () => (await get(page, "run")).deck.lastShuffle?.added)
    .toBe(39);
  const saved = await get(page, "run");
  expect(heldLayers(saved)).toBe(39);
  expect(
    Object.keys(saved.player.upgrades).some((id) => id.startsWith("hex_")),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "当前构筑", exact: true }).click();
  await expect(page.getByText(/当前持有39层/)).toBeVisible();
  await expect(page.locator(".polarity-negative")).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  await expect(page.locator("#clock")).toBeVisible();
  expect(heldLayers(await get(page, "run"))).toBe(39);
});

test("v1.2 构筑跨设置、资源、记录后保留当前战局并自动保存", async ({
  page,
}) => {
  await launch(page);
  await page.keyboard.down("d");
  await page.waitForTimeout(700);
  await page.keyboard.up("d");
  for (const name of ["设置", "资源工坊", "远征记录"]) {
    await page.getByRole("button", { name: "当前构筑", exact: true }).click();
    await expect
      .poll(async () => (await get(page, "run")).player.x)
      .toBeGreaterThan(1800);
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "← 返回", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "远征已暂停" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "继续远征", exact: true }).click();
    await expect(page.locator("#clock")).toBeVisible();
  }
});
test("v1.2 升级图鉴跨菜单后保留原选择、负面类型和刷新余额", async ({
  page,
}) => {
  const { offer } = await import("../src/core/cardPool");
  const s = createRun("standard");
  offer(s, [], "negative");
  const choices = [...s.choices],
    rng = s.rng;
  await resume(page, s);
  for (const name of ["设置", "资源工坊", "远征记录"]) {
    await page.getByRole("button", { name: "当前构筑", exact: true }).click();
    await page.getByRole("button", { name: "远征图鉴", exact: true }).click();
    await page.getByRole("button", { name, exact: true }).click();
    await page.getByRole("button", { name: "← 返回", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "选择一项负面命运" }),
    ).toBeVisible();
    await expect(page.locator(".upgrade-card.polarity-negative")).toHaveCount(
      3,
    );
  }
  await expect
    .poll(async () => (await get(page, "run")).choices)
    .toEqual(choices);
  const saved = await get(page, "run");
  expect(saved.rng).toBe(rng);
  expect(saved.deck.active).toBe("negative");
  expect(saved.deck.refreshes).toBe(3);
});
