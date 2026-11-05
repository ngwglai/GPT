import { test as base, expect } from "@playwright/test";
// Release this artwork suite's browser before legacy combat/collection workers.
const test = base.extend({
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
test("v1.3 original background, three consistent portraits and card art actually decode", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    (window as any).fallbackCanvases = 0;
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      kind: any,
      ...args: any[]
    ) {
      if (kind === "2d" && this.width === 128 && this.height === 128)
        (window as any).fallbackCanvases++;
      return (original as any).call(this, kind, ...args);
    } as any;
  });
  await page.goto("/");
  await expect(page.locator(".version")).toContainText("v1.6");
  expect(
    await page.evaluate(() => (window as any).fallbackCanvases),
  ).toBeLessThan(15);
  const bg = await page
    .locator(".shell")
    .evaluate((el) => getComputedStyle(el).backgroundImage);
  expect(bg).toContain("assets/ui/world.webp");
  expect(bg).not.toContain("assets/assets");
  expect(
    await page.evaluate(async () => {
      const im = new Image();
      im.src = new URL("assets/ui/world.webp", document.baseURI).href;
      await im.decode();
      return im.naturalWidth;
    }),
  ).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "开启远征" }).click();
  await expect(page.locator(".portrait-img")).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator(".portrait-img")
        .evaluateAll((es) =>
          es.every(
            (e) =>
              (e as HTMLImageElement).complete &&
              (e as HTMLImageElement).naturalWidth > 200,
          ),
        ),
    )
    .toBe(true);
  const srcs = await page
    .locator(".portrait-img")
    .evaluateAll((es) => es.map((e) => (e as HTMLImageElement).src));
  expect(new Set(srcs).size).toBe(3);
  await expect(page.locator(".character-preview .idle-sheet")).toHaveCount(3);
  await page.screenshot({
    path: "validation/v1.6/selection.jpg",
    type: "jpeg",
    quality: 85,
  });
  await page.getByRole("button", { name: "踏入星林" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "当前构筑", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "当前构筑", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("missing generated portrait falls back and combat remains playable", async ({
  page,
}) => {
  await page.route("**/assets/v1.6/characters/ranger/portrait.webp", (r) =>
    r.abort(),
  );
  await page.route("**/assets/v1.6/characters/ranger/fallback.webp", (r) =>
    r.abort(),
  );
  await page.goto("/");
  await expect
    .poll(() => page.locator(".hero-ranger").getAttribute("src"))
    .toMatch(/^data:image\/png/);
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.getByRole("button", { name: "踏入星林" }).click();
  await expect
    .poll(() => page.locator("#clock").textContent())
    .not.toBe("00:00");
  await page.keyboard.press("q");
  await expect(page.locator("#cd-0")).not.toBeEmpty();
});
test("暂停中重复更换地表再恢复，生成纹理只解码一次", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const d = Object.getOwnPropertyDescriptor(
      HTMLImageElement.prototype,
      "src",
    )!;
    (window as any).imageDecodes = {};
    Object.defineProperty(HTMLImageElement.prototype, "src", {
      get: d.get,
      set(value: string) {
        if (value.includes(".webp")) {
          const counts = (window as any).imageDecodes;
          counts[value] = (counts[value] || 0) + 1;
        }
        d.set!.call(this, value);
      },
      configurable: true,
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开启远征" }).click();
  await page.getByRole("button", { name: "踏入星林" }).click();
  await expect(page.locator("#clock")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "资源工坊", exact: true }).click();
  await page.locator('[data-action="asset-map.ground"]').click();
  const data = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d")!;
    g.fillStyle = "#ead5ee";
    g.fillRect(0, 0, 32, 32);
    return c.toDataURL();
  });
  for (let i = 0; i < 3; i++) {
    await page.locator("#asset-file").setInputFiles({
      name: "ground.png",
      mimeType: "image/png",
      buffer: Buffer.from(data.split(",")[1], "base64"),
    });
    await expect(page.locator(".asset-editor")).toContainText(
      "已使用本地自定义图片",
    );
    await page.getByRole("button", { name: "恢复默认", exact: true }).click();
    await expect(page.locator(".asset-editor")).toContainText("原创二次元美术");
  }
  const counts = await page.evaluate(() => (window as any).imageDecodes);
  expect(
    Object.entries(counts)
      .filter(([url]) => url.endsWith("maps/grass.webp"))
      .map(([, n]) => n),
  ).toEqual([1]);
  await page.getByRole("button", { name: "← 返回", exact: true }).click();
  await page.getByRole("button", { name: "继续远征", exact: true }).click();
  await expect
    .poll(() => page.locator("#clock").textContent())
    .not.toBe("00:00");
  expect(errors).toEqual([]);
});
