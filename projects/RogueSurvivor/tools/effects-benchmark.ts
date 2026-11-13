/** Run against Vite dev: production entry deliberately excludes this harness. */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
const out = process.env.VFX_OUT || "validation/v1.9.0/benchmark";
const base = process.env.VFX_BASE_URL || "http://127.0.0.1:4176";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
    : { channel: "chromium" }),
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const result: unknown[] = [];
try {
  for (const [map, dense, width, height] of [
    ["forest", false, 1280, 720],
    ["forest", true, 1280, 720],
    ["garden", true, 390, 844],
  ] as const) {
    const page = await browser.newPage({ viewport: { width, height } }),
      errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(
      `${base}/tools/effects-harness.html?map=${map}${dense ? "&dense" : ""}`,
    );
    await page.waitForFunction(() => (window as any).vfxHarness?.scene.ready);
    await page.evaluate(async () => {
      const scene = (window as any).vfxHarness.scene;
      await scene.builtins;
      await Promise.all(scene.characterSheets.values());
      await scene.effectArt;
    });
    await page.waitForTimeout(750);
    const samples = [];
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => (window as any).vfxHarness.start());
      await page.waitForTimeout(4000);
      samples.push(
        await page.evaluate(() => (window as any).vfxHarness.stop()),
      );
    }
    await page.screenshot({
      path: `${out}/${map}-${width}-${dense ? "dense" : "normal"}.jpg`,
      type: "jpeg",
      quality: 85,
    });
    const r = { map, dense, width, height, samples, errors };
    result.push(r);
    console.log(JSON.stringify(r));
    writeFileSync(
      `${out}/performance.json`,
      JSON.stringify(
        {
          label: process.env.VFX_LABEL || "current",
          environment: `Linux Chromium ${browser.version()}, headless SwiftShader, Phaser Canvas; synthetic render-only snapshots; 3 × 4-second samples, no balance adjustment`,
          result,
        },
        null,
        2,
      ) + "\n",
    );
    if (errors.length) throw new Error("Render harness errors");
    await page.close();
  }
} finally {
  await browser.close();
}
