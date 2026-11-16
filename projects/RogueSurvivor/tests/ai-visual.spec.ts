import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
async function start(page: Page, policy = "build", mode = "standard") {
  await page.goto("/ai.html");
  await expect(page.locator("#start")).toBeEnabled();
  await page.locator('[name="policy"]').selectOption(policy);
  await page.locator('[name="mode"]').selectOption(mode);
  await page.locator("#start").click();
}
async function advance(page: Page) {
  await page.locator("#advance").click();
  await expect
    .poll(
      async () =>
        Number(await page.locator("#status").getAttribute("data-choices")),
      { timeout: 60000 },
    )
    .toBeGreaterThan(0);
}
async function exported(page: Page) {
  const download = page.waitForEvent("download");
  await page.locator("#export").click();
  const d = await download;
  const stream = await d.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString());
}
test("真实评分、技能、图层、暂停与重开，以及AI专用历史导出", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1440, height: 900 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await page.locator("#show-routes").check();
  await advance(page);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  const t = await page.locator("#status").getAttribute("data-time");
  await page.waitForTimeout(250);
  expect(await page.locator("#status").getAttribute("data-time")).toBe(t);
  await expect(page.locator("#debug-layer")).toBeVisible();
  expect(
    Number(await page.locator("#debug-layer").getAttribute("data-candidates")),
  ).toBeGreaterThanOrEqual(22);
  const record = await exported(page);
  expect(record.totals.skills).toBeGreaterThan(0);
  expect(record.cards.length).toBeGreaterThan(0);
  const sequence = Number(
    await page.locator("#card-scores tbody").getAttribute("data-sequence"),
  );
  const choice = record.cards.find((c: any) => c.sequence === sequence);
  for (const row of await page.locator("#card-scores tbody tr").all()) {
    const id = await row.getAttribute("data-card");
    expect(Number(await row.getAttribute("data-score"))).toBe(
      choice.scores.find((s: any) => s.id === id).score,
    );
  }
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect
    .poll(async () =>
      Number(await page.locator("#status").getAttribute("data-time")),
    )
    .toBeGreaterThan(record.time + 0.1);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await page.screenshot({ path: "../../work/ai-visual/lab-desktop.png" });
  await page.locator("#show-routes").uncheck();
  await expect(page.locator("#debug-layer")).toBeHidden();
  await page.locator("#start").click();
  await expect
    .poll(async () =>
      Number(await page.locator("#status").getAttribute("data-time")),
    )
    .toBeLessThan(5);
  await expect(page.locator("#card-scores tbody tr")).toHaveCount(0);
  await expect(page.locator("#choice-result")).toHaveText(
    "升级时自动展示真实评分",
  );
  await page.locator("#history-open").click();
  await expect(page.locator(".history-card")).toHaveCount(2);
  await expect(page.locator("#history-list")).toContainText("用户重新开始");
  await page.screenshot({ path: "../../work/ai-visual/lab-history.png" });
  expect(errors).toEqual([]);
});
test("三策略、五档倍速和无尽入口可运行，页面刷新保留AI记录", async ({
  page,
}) => {
  test.setTimeout(120000);
  for (const policy of ["legacy", "combat", "build"]) {
    await start(page, policy, "endless");
    for (const speed of ["0.5", "1", "2", "4", "8"]) {
      await page.locator("#speed").selectOption(speed);
      await expect(page.locator("#speed")).toHaveValue(speed);
    }
    await page.locator("#advance").click();
    await expect
      .poll(
        async () =>
          Number(await page.locator("#status").getAttribute("data-time")),
        { timeout: 60000 },
      )
      .toBeGreaterThan(5);
    await page.getByRole("button", { name: "暂停", exact: true }).click();
    const r = await exported(page);
    expect(r.config.policy).toBe(policy);
    expect(r.config.mode).toBe("endless");
    expect(r.totals.decisions).toBeGreaterThan(0);
  }
  await page.reload();
  await page.locator("#history-open").click();
  expect(await page.locator(".history-card").count()).toBeGreaterThan(0);
});
test("子路径下正常入口、AI资源与独立存档保持一致", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(90000);
  const prefix = "/GPT/RogueSurvivor";
  await page.route(`**${prefix}/**`, async (route) => {
    const u = new URL(route.request().url());
    u.pathname = u.pathname.slice(prefix.length);
    const response = await route.fetch({ url: u.href });
    await route.fulfill({ response });
  });
  await page.goto(`${baseURL}${prefix}/index.html`);
  await expect(page.getByRole("link", { name: "AI 实验室 ↗" })).toBeVisible();
  const manual = new World(createRun("standard", "knight", 52)).s;
  await page.evaluate(async (manual) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("starfall-survivor", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("kv");
      req.onsuccess = () => {
        const tx = req.result.transaction("kv", "readwrite");
        tx.objectStore("kv").put(manual, "run");
        tx.oncomplete = () => {
          req.result.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });
  }, manual);
  const failed: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  await page.getByRole("link", { name: "AI 实验室 ↗" }).click();
  await expect(page).toHaveURL(new RegExp(`${prefix}/ai.html`));
  await page.locator("#start").click();
  await page.locator("#advance").click();
  await expect
    .poll(async () =>
      Number(await page.locator("#status").getAttribute("data-time")),
    )
    .toBeGreaterThan(2);
  const value = await page.evaluate(
    async () =>
      new Promise((resolve) => {
        const r = indexedDB.open("starfall-survivor", 1);
        r.onsuccess = () => {
          const q = r.result.transaction("kv").objectStore("kv").get("run");
          q.onsuccess = () => {
            r.result.close();
            resolve(q.result);
          };
        };
      }),
  );
  expect(value).toEqual(manual);
  await expect(
    page.getByRole("link", { name: "返回手动游戏 ↗" }),
  ).toHaveAttribute("href", "./index.html");
  await page.getByRole("link", { name: "返回手动游戏 ↗" }).click();
  await expect(page.getByRole("button", { name: /继续旅程/ })).toBeVisible();
  expect(failed).toEqual([]);
});

test("可视化标准模式从初始状态自动完成最终首领并保存结算", async ({ page }) => {
  test.setTimeout(480000);
  await page.setViewportSize({ width: 800, height: 600 });
  await start(page);
  await page.locator("#decision-details > summary").click();
  for (let batch = 0; batch < 45; batch++) {
    if (
      (await page.locator("#status").getAttribute("data-phase")) === "victory"
    )
      break;
    await page.locator("#advance").click();
    await expect
      .poll(() => page.locator("#status").getAttribute("data-fast-ticks"), {
        timeout: 60000,
      })
      .toBe("0");
    expect(await page.locator("#status").getAttribute("data-phase")).not.toBe(
      "dead",
    );
  }
  await expect(page.locator("#status")).toHaveAttribute(
    "data-phase",
    "victory",
  );
  const record = await exported(page);
  console.info(
    "Visual standard finish",
    JSON.stringify({
      time: record.time,
      wave: record.wave,
      bosses: record.bosses,
      level: record.level,
      kills: record.kills,
      choices: record.totals.choices,
      damage: record.damage,
      taken: record.taken,
    }),
  );
  expect(record.result).toBe("victory");
  // Same seed/config through LabSession.step without rendering; no end-state injection.
  expect(record.time).toBeCloseTo(981, 6);
  expect(record.kills).toBe(2752);
  expect(record.level).toBe(42);
  expect(record.damage).toBeCloseTo(617202.8687128052, 6);
  expect(record.taken).toBeCloseTo(256.73870222213856, 6);
  expect(record.totals.choices).toBe(48);
  expect(record.bosses).toBe(4);
  expect(record.wave).toBe(20);
  expect(record.totals.choices).toBeGreaterThan(20);
  await page.locator("#history-open").click();
  await expect(page.locator("#history-list")).toContainText("击败最终首领");
});
