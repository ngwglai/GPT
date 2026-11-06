import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";
import { ensureDeck } from "../src/core/deckState";
import type { Run } from "../src/core/types";
async function slot(page: Page, value?: Run) {
  return page.evaluate(
    (value) =>
      new Promise<any>((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const db = r.result,
            t = db.transaction("kv", value ? "readwrite" : "readonly"),
            s = t.objectStore("kv");
          if (value) {
            s.put(value, "run");
            t.oncomplete = () => {
              db.close();
              resolve(value);
            };
          } else {
            const q = s.get("run");
            q.onsuccess = () => {
              db.close();
              resolve(q.result);
            };
          }
        };
      }),
    value,
  );
}
async function resume(page: Page, s = createRun("endless", "ranger", 1707)) {
  new World(s);
  s.rocks = [];
  s.player.invincible = 1000;
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).waitFor();
  await slot(page, s);
  await page.reload();
  await page.getByRole("button", { name: /继续旅程/ }).click();
  if (
    ["victory", "dead"].includes(s.phase) ||
    (s.mode === "standard" && s.bossIndex === 4)
  ) {
    await expect(
      page.getByRole("heading", {
        name: s.phase !== "dead" ? "远征告捷" : "此行落幕",
      }),
    ).toBeVisible();
    return;
  }
  await expect(page.locator("#clock")).toBeVisible();
  if (s.phase === "playing")
    await expect(page.locator("html")).not.toHaveClass(/touch-input-inactive/);
}
async function save(page: Page) {
  await page.locator('[data-action="pause"]').click();
  await page.getByRole("button", { name: "保存当前进度", exact: true }).click();
  await expect(page.locator("#toast")).toContainText("进度已保存");
  return slot(page);
}
async function pointer(
  page: Page,
  selector: string,
  type: string,
  id: number,
  dx = 0,
  dy = 0,
) {
  await page.locator(selector).evaluate(
    (el, v) => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(
        new PointerEvent(v.type, {
          bubbles: true,
          cancelable: true,
          pointerId: v.id,
          pointerType: "touch",
          isPrimary: v.id === 1,
          clientX: r.left + r.width / 2 + v.dx,
          clientY: r.top + r.height / 2 + v.dy,
          buttons: v.type === "pointerup" ? 0 : 1,
        }),
      );
    },
    { type, id, dx, dy },
  );
}
for (const [width, height, touch] of [
  [390, 844, true],
  [844, 390, true],
  [393, 873, true],
  [873, 393, true],
  [768, 1024, true],
  [1280, 720, false],
] as const) {
  test.describe(`视口 ${width}×${height}`, () => {
    test.use({ viewport: { width, height }, hasTouch: touch, isMobile: touch });
    test("启动、菜单、控件边界、旋转与截图", async ({ page, browserName }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto("/");
      await page.getByRole("button", { name: "开启远征" }).click();
      await expect(page.locator(".character-card")).toHaveCount(3);
      await page.getByRole("button", { name: "踏入星林" }).click();
      await expect(page.locator("#clock")).toBeVisible();
      for (const selector of [
        '[data-action="pause"]',
        '[data-skill-slot="0"]',
        '[data-skill-slot="1"]',
        '[data-skill-slot="2"]',
        "[data-dash]",
        ...(touch ? ["[data-joystick]"] : []),
      ]) {
        await expect(page.locator(selector)).toBeVisible();
        const b = await page.locator(selector).boundingBox();
        expect(b!.x).toBeGreaterThanOrEqual(0);
        expect(b!.y).toBeGreaterThanOrEqual(0);
        expect(b!.x + b!.width).toBeLessThanOrEqual(width + 1);
        expect(b!.y + b!.height).toBeLessThanOrEqual(height + 1);
      }
      if (!touch) {
        await expect(page.locator("[data-joystick]")).toBeHidden();
        await page.locator('[data-skill-slot="0"]').focus();
        await page.keyboard.press("Space");
        await expect(page.locator("#dash-cd")).not.toBeEmpty();
        await expect(page.locator("#cd-0")).toBeEmpty();
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `validation/v1.7/${browserName === "webkit" ? "webkit/" : ""}${width}x${height}.jpg`,
        type: "jpeg",
        quality: 85,
      });
      await page.locator('[data-action="pause"]').click();
      await expect(
        page.getByRole("heading", { name: "远征已暂停" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "游戏设置", exact: true }).click();
      await expect(page.locator("#touch-controls")).toBeVisible();
      await page.getByRole("button", { name: "保存设置" }).click();
      await page.getByRole("button", { name: "← 返回" }).click();
      await page.getByRole("button", { name: "继续远征", exact: true }).click();
      if (touch) {
        await page.setViewportSize({ width: height, height: width });
        await expect(page.locator("[data-joystick]")).toBeVisible();
        await page.setViewportSize({ width, height });
      }
      expect(errors).toEqual([]);
    });
  });
}
test.describe("触屏战斗", () => {
  test.use({
    viewport: { width: 844, height: 390 },
    hasTouch: true,
    isMobile: true,
  });
  test("装备说明按钮跨HUD刷新保留焦点并可轻触打开", async ({ page }) => {
    await resume(page);
    const weapon = await page.locator(".weapon-mini").first().elementHandle();
    await weapon!.focus();
    await page.waitForTimeout(350);
    expect(
      await weapon!.evaluate(
        (el) => el.isConnected && document.activeElement === el,
      ),
    ).toBe(true);
    await weapon!.tap();
    await expect(
      page.getByRole("heading", { name: "远征已暂停" }),
    ).toBeVisible();
    await expect(page.locator("#combat-help")).toHaveAttribute("open", "");
    await expect(page.locator("#combat-help")).toContainText("追星弓");
  });
  test("独立指针：斜向移动与技能、冷却防重复、取消和暂停清理", async ({
    page,
  }) => {
    await resume(page);
    await pointer(page, "[data-joystick]", "pointerdown", 1, 35, -35);
    await page.waitForTimeout(250);
    await pointer(page, '[data-skill-slot="0"]', "pointerdown", 2);
    await pointer(page, '[data-skill-slot="0"]', "pointerup", 2);
    await expect(page.locator("#cd-0")).not.toBeEmpty();
    expect(
      await page
        .locator("[data-joystick]")
        .evaluate((el) => el.style.getPropertyValue("--stick-x")),
    ).not.toBe("0px");
    await pointer(page, '[data-skill-slot="0"]', "pointerdown", 2);
    await pointer(page, '[data-skill-slot="0"]', "pointerup", 2);
    await pointer(page, "[data-dash]", "pointerdown", 3);
    await pointer(page, "[data-dash]", "pointerup", 3);
    await expect(page.locator("#dash-cd")).not.toBeEmpty();
    await page.waitForTimeout(250);
    await pointer(page, "[data-joystick]", "pointercancel", 1);
    await expect
      .poll(() =>
        page
          .locator("[data-joystick]")
          .evaluate((el) => el.style.getPropertyValue("--stick-x")),
      )
      .toBe("0px");
    const s = await save(page);
    expect(s.player.x).toBeGreaterThan(1800);
    expect(s.player.y).toBeLessThan(1800);
    expect(s.player.cooldowns[0]).toBeGreaterThan(0);
    await page.getByRole("button", { name: "继续远征", exact: true }).click();
    await page.waitForTimeout(300);
    const stopped = await save(page);
    expect(stopped.player.x).toBeCloseTo(s.player.x);
    expect(stopped.player.y).toBeCloseTo(s.player.y);
  });
  test("原生双触点：右手松开不打断左手移动", async ({ page, browserName }) => {
    test.skip(
      browserName !== "chromium",
      "CDP多触点仅适用于Chromium；WebKit另测独立Pointer Events",
    );
    await resume(page);
    const cdp = await page.context().newCDPSession(page);
    const j = (await page.locator("[data-joystick]").boundingBox())!,
      b = (await page.locator('[data-skill-slot="1"]').boundingBox())!;
    const left = { x: j.x + j.width / 2 + 32, y: j.y + j.height / 2, id: 1 },
      right = { x: b.x + b.width / 2, y: b.y + b.height / 2, id: 2 };
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [left],
    });
    left.x += 140;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [left],
    });
    await page.waitForTimeout(200);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [left, right],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [right],
    });
    await expect(page.locator("#cd-1")).not.toBeEmpty();
    expect(
      await page
        .locator("[data-joystick]")
        .evaluate((el) => parseFloat(el.style.getPropertyValue("--stick-x"))),
    ).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    const s = await save(page);
    expect(s.player.x - 1800).toBeGreaterThan(30);
    expect(s.player.shield).toBeGreaterThan(0);
  });
  test("定点瞄准、全部六技能可触发，菜单与读档不残留摇杆", async ({ page }) => {
    for (const [primary, secondary] of [
      ["fire", "ward"],
      ["ice", "bloom"],
      ["lance", "ward"],
    ] as const) {
      await resume(
        page,
        createRun("endless", "ranger", 1707, primary, secondary),
      );
      await page.touchscreen.tap(500, 190);
      await expect(page.locator("[data-clear-aim]")).toContainText("定点");
      for (const i of [0, 1, 2]) {
        await page.locator(`[data-skill-slot="${i}"]`).tap();
        await expect(page.locator(`#cd-${i}`)).not.toBeEmpty();
      }
      await page.locator("[data-clear-aim]").tap();
      await expect(page.locator("[data-clear-aim]")).toContainText("自动");
      await pointer(page, "[data-joystick]", "pointerdown", 1, 35, 0);
      await page.locator('[data-action="pause"]').tap();
      await page
        .getByRole("button", { name: "保存当前进度", exact: true })
        .tap();
      await page.reload();
      await page.getByRole("button", { name: /继续旅程/ }).tap();
      expect(
        await page
          .locator("[data-joystick]")
          .evaluate((el) =>
            parseFloat(el.style.getPropertyValue("--stick-x") || "0"),
          ),
      ).toBe(0);
    }
  });
});
test.describe("移动端完整菜单流程", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  test("正负抽卡、刷新、卡册、图鉴、复活与结算均可触摸完成", async ({
    page,
  }) => {
    test.setTimeout(90000);
    const s = createRun("endless", "ranger", 1708);
    ensureDeck(s);
    s.phase = "upgrade";
    s.deck!.active = "positive";
    s.choices = ["vitality", "power", "critical"];
    await resume(page, s);
    await page.getByRole("button", { name: /刷新 · 剩余 3/ }).tap();
    await expect(
      page.getByRole("button", { name: /刷新 · 剩余 2/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "当前构筑", exact: true }).tap();
    await page.getByRole("button", { name: "← 返回", exact: true }).tap();
    await page.locator(".upgrade-card").first().tap();
    await expect(page.locator(".upgrade-card")).toHaveCount(0);
    await page.locator('[data-action="pause"]').tap();
    await page.getByRole("button", { name: "远征图鉴", exact: true }).tap();
    for (const name of ["技能图鉴", "怪物图鉴", "地图图鉴", "卡牌图鉴"]) {
      await page.getByRole("button", { name, exact: true }).tap();
      await expect(page.locator(".codex-card").first()).toBeVisible();
    }
    await page.getByRole("button", { name: "← 返回", exact: true }).tap();
    await page.getByRole("button", { name: "继续远征", exact: true }).tap();
    const n = createRun("endless", "mage", 1709);
    ensureDeck(n);
    n.phase = "upgrade";
    n.deck!.active = "negative";
    n.choices = ["hex_damage", "hex_slow", "hex_frail"];
    // Use real eligibility generation instead of invented negative IDs.
    const { offer } = await import("../src/core/cardPool");
    offer(n, [], "negative");
    await resume(page, n);
    await expect(page.locator(".upgrade-card.polarity-negative")).toHaveCount(
      3,
    );
    await page.locator(".upgrade-card").first().tap();
    await expect(page.locator(".upgrade-card")).toHaveCount(0);
    const w = new World(createRun("endless", "ranger", 1710));
    w.s.revival!.remaining = w.s.revival!.earned = 1;
    w.s.player.invincible = 0;
    w.hurt(1e9);
    await resume(page, w.s);
    await expect(
      page.getByRole("heading", { name: "星火尚未熄灭" }),
    ).toBeVisible();
    await expect(page.locator("[data-joystick]")).toBeHidden();
    await page.screenshot({
      path: "validation/v1.7/revive-portrait.jpg",
      type: "jpeg",
      quality: 85,
    });
    await page.getByRole("button", { name: "重新点燃星火" }).tap();
    await expect(page.locator("[data-joystick]")).toBeVisible();
    const v = createRun("standard", "ranger", 1711);
    v.time = 1201;
    v.bossIndex = 4;
    v.nextEvent = 1260;
    v.player.level = 100;
    const finalWorld = new World(v);
    const finalBoss = spawn(finalWorld, "titan", { x: 1880, y: 1800 })!;
    finalBoss.hp = 1;
    await resume(page, v);
    await page.getByRole("button", { name: /无尽/ }).tap();
    await expect(page.locator("#clock")).toBeVisible();
  });
  test("设置覆盖、失焦清理与音频不重建", async ({ page }) => {
    await page.addInitScript(() => {
      const Native = window.Audio;
      (window as any).audioCount = 0;
      (window as any).Audio = function (src: string) {
        (window as any).audioCount++;
        const a = new Native(src);
        (window as any).battleAudio = a;
        return a;
      };
    });
    await resume(page);
    await expect
      .poll(() =>
        page.evaluate(() => (window as any).battleAudio?.currentTime || 0),
      )
      .toBeGreaterThan(0.1);
    const count = await page.evaluate(() => (window as any).audioCount);
    await page.locator('[data-skill-slot="0"]').tap();
    await page.locator('[data-skill-slot="1"]').tap();
    expect(await page.evaluate(() => (window as any).audioCount)).toBe(count);
    await pointer(page, "[data-joystick]", "pointerdown", 1, 35, 0);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await expect(
      page.getByRole("heading", { name: "远征已暂停" }),
    ).toBeVisible();
    await expect(page.locator("[data-joystick]")).toBeHidden();
    await page.getByRole("button", { name: "游戏设置", exact: true }).tap();
    await page.locator("#touch-controls").selectOption("off");
    await page.getByRole("button", { name: "保存设置" }).tap();
    await expect(page.locator("#toast")).toContainText("设置已保存");
    await expect(page.locator("html")).not.toHaveClass(/touch-controls/);
    await page.reload();
    await page.getByRole("button", { name: /继续旅程/ }).tap();
    await expect(page.locator("[data-joystick]")).toBeHidden();
    await page.locator('[data-action="pause"]').tap();
    await page.getByRole("button", { name: "游戏设置", exact: true }).tap();
    await page.locator("#touch-controls").selectOption("on");
    await page.getByRole("button", { name: "保存设置" }).tap();
    await expect(page.locator("#toast")).toContainText("设置已保存");
    await page.getByRole("button", { name: "← 返回" }).tap();
    await page.getByRole("button", { name: "继续远征", exact: true }).tap();
    await expect(page.locator("[data-joystick]")).toBeVisible();
  });
});
