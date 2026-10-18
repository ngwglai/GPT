import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Report } from "../src/core/serialization";
async function save(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return await readFile(path!, "utf8");
}
async function generate(page: Page) {
  await page
    .getByRole("button", { name: "生成 / 重新生成数据", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("数据已生成");
}
async function intervene(page: Page) {
  await page.getByRole("button", { name: "执行 do 干预", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("干预完成");
}
async function jsonReport(page: Page): Promise<Report> {
  return JSON.parse(await save(page, "导出分析 JSON")) as Report;
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "相关性，能告诉我们多少？" }),
  ).toBeVisible();
});
test("edit, observe, intervene, export all formats, import and exactly replay", async ({
  page,
}) => {
  await page.getByLabel("系数 X → Y", { exact: true }).fill("3");
  await generate(page);
  await intervene(page);
  const report = await jsonReport(page);
  expect(report.trueATE).toBe(3);
  expect(
    report.observation.naive.ok && report.observation.naive.value,
  ).toBeGreaterThan(7.5);
  expect(
    report.intervention?.ate.ok && report.intervention.ate.value,
  ).toBeCloseTo(3, 10);
  const model = JSON.parse(
    await save(page, "导出模型 JSON"),
  ) as Report["model"];
  expect(model.variables.find((v) => v.id === "Y")?.weights.X).toBe(3);
  const csv = await save(page, "导出分析 CSV");
  expect(csv).toContain("paired_ATE");
  expect(csv).toContain("model_JSON");
  const experiment = await save(page, "导出实验参数 JSON");
  await page.getByRole("button", { name: /B · 碰撞变量/ }).click();
  await page.getByLabel("导入类型").selectOption("experiment");
  await page.getByLabel("导入文件").setInputFiles({
    name: "experiment.json",
    mimeType: "application/json",
    buffer: Buffer.from(experiment),
  });
  await expect(page.getByRole("status")).toContainText("导入成功");
  await generate(page);
  await intervene(page);
  expect(await jsonReport(page)).toEqual(report);
});
for (const [name, truth] of [
  ["A · 混杂因素", 2],
  ["B · 碰撞变量", 0],
  ["C · 辛普森悖论", 2],
] as const)
  test(`load and explain ${name}`, async ({ page }) => {
    await page.getByRole("button", { name: new RegExp(name) }).click();
    await generate(page);
    await intervene(page);
    const r = await jsonReport(page);
    expect(r.trueATE).toBe(truth);
    expect(r.settings.seed).toBe(42);
    if (name.startsWith("B")) {
      const group = r.observation.groups.find((g) => g.value === 1)!;
      expect(group.correlation.ok && group.correlation.value).toBeLessThan(
        -0.2,
      );
      expect(r.observation.groupNote).toContain("后代");
    }
    if (name.startsWith("C")) {
      expect(r.observation.naive.ok && r.observation.naive.value).toBeLessThan(
        0,
      );
      for (const g of r.observation.groups) {
        expect(g.difference.ok && g.difference.value).toBeGreaterThan(0);
        expect(g.control.n + g.treated.n).toBe(g.n);
      }
    }
  });
test("create, rename, link, unlink and delete variables; reject self loops and cycles", async ({
  page,
}) => {
  await page.getByRole("button", { name: "＋ 创建变量" }).click();
  await page.getByLabel("变量名称 V1", { exact: true }).fill("新结果");
  await page.getByLabel("父节点", { exact: true }).selectOption("Y");
  await page.getByLabel("子节点", { exact: true }).selectOption("V1");
  await page.getByRole("button", { name: "建立有向边" }).click();
  await expect(page.getByLabel("系数 Y → V1", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "删除边 Y → V1", exact: true })
    .click();
  await expect(page.getByLabel("系数 Y → V1", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "删除变量 V1", exact: true }).click();
  await expect(page.getByLabel("变量名称 V1", { exact: true })).toHaveCount(0);
  await page.getByLabel("父节点", { exact: true }).selectOption("X");
  await page.getByLabel("子节点", { exact: true }).selectOption("X");
  await page.getByRole("button", { name: "建立有向边" }).click();
  await expect(page.getByRole("alert")).toContainText("自环");
  await page.getByLabel("父节点", { exact: true }).selectOption("Y");
  await page.getByLabel("子节点", { exact: true }).selectOption("U");
  await page.getByRole("button", { name: "建立有向边" }).click();
  await expect(page.getByRole("alert")).toContainText("有向环");
  await generate(page);
});
test("invalid imports and parameters show errors without crashing or replacing model", async ({
  page,
}) => {
  const invalid = {
    schemaVersion: 1,
    name: "cycle",
    variables: [
      {
        id: "X",
        label: "X",
        kind: "linear",
        intercept: 0,
        weights: { Y: 1 },
        noiseStd: 1,
      },
      {
        id: "Y",
        label: "Y",
        kind: "linear",
        intercept: 0,
        weights: { X: 1 },
        noiseStd: 1,
      },
    ],
  };
  await page.getByLabel("JSON 内容").fill(JSON.stringify(invalid));
  await page.getByRole("button", { name: "校验并导入 JSON" }).click();
  await expect(page.getByRole("alert")).toContainText("有向环");
  await expect(page.getByLabel("系数 X → Y", { exact: true })).toHaveValue("2");
  await page.getByLabel("样本量", { exact: true }).fill("20001");
  await expect(
    page.getByRole("button", { name: "生成 / 重新生成数据" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("样本量");
  await page.getByRole("button", { name: "恢复加载时模型与参数" }).click();
  await page.getByLabel("截距 X", { exact: true }).fill("0.9");
  await expect(page.getByRole("alert")).toContainText("概率");
  await expect(
    page.getByRole("button", { name: "生成 / 重新生成数据" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "恢复加载时模型与参数" }).click();
  await generate(page);
});
test("one sample shows unavailable intervals and never misleading NaN", async ({
  page,
}) => {
  await page.getByLabel("样本量", { exact: true }).fill("1");
  await generate(page);
  await intervene(page);
  const r = await jsonReport(page);
  expect(r.observation.regression.ok).toBe(false);
  expect(r.intervention?.ate.ok).toBe(false);
  expect(r.trueATE).toBe(2);
  await expect(page.locator("#analysis")).toContainText("不适用");
  await expect(page.locator("#intervention")).not.toContainText("NaN");
});
test("model file import supports continuous regression and arbitrary do contrast", async ({
  page,
}) => {
  const model = {
    schemaVersion: 1,
    name: "Continuous model",
    variables: [
      {
        id: "X",
        label: "X",
        kind: "linear",
        intercept: 0,
        weights: {},
        noiseStd: 1,
      },
      {
        id: "Y",
        label: "Y",
        kind: "linear",
        intercept: 0,
        weights: { X: 2 },
        noiseStd: 1,
      },
    ],
  };
  await page.getByLabel("导入文件").setInputFiles({
    name: "model.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(model)),
  });
  await expect(page.getByRole("status")).toContainText("导入成功");
  await page.getByLabel("干预值 a").fill("-1");
  await page.getByLabel("干预值 b").fill("2");
  await generate(page);
  await intervene(page);
  const r = await jsonReport(page);
  expect(r.observation.naive.ok).toBe(false);
  expect(
    r.observation.regression.ok && r.observation.regression.value,
  ).toBeCloseTo(2, 1);
  expect(r.trueATE).toBe(6);
});
test("narrow desktop actions, resets and stale-result invalidation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await generate(page);
  await intervene(page);
  await expect(
    page.getByRole("button", { name: "导出分析 JSON", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("随机种子", { exact: true }).fill("7");
  await expect(
    page.getByRole("button", { name: "导出分析 JSON", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "执行 do 干预", exact: true }),
  ).toBeDisabled();
  await generate(page);
  await intervene(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "重置为默认模型" }).click();
  await expect(page.getByLabel("随机种子", { exact: true })).toHaveValue("42");
  await expect(
    page.getByRole("button", { name: "导出分析 JSON", exact: true }),
  ).toBeDisabled();
});
test("production page stays offline and handles maximum sample budget", async ({
  page,
}) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (!r.url().startsWith("http://127.0.0.1:4178")) external.push(r.url());
  });
  await page.reload();
  await page.getByLabel("样本量", { exact: true }).fill("20000");
  await generate(page);
  await intervene(page);
  expect(external).toEqual([]);
  const r = await jsonReport(page);
  expect(r.settings.n).toBe(20000);
  expect(r.intervention?.ate.ok && r.intervention.ate.value).toBeCloseTo(2, 10);
});
