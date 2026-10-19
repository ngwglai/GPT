import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
async function setup(page: Page) {
  await page.goto("/");
  await page.getByLabel("每次评价预算", { exact: true }).fill("64");
  await page.getByLabel("数组长度", { exact: true }).fill("5");
}
async function start(page: Page) {
  await page.getByRole("button", { name: "开始实验" }).click();
}
async function complete(page: Page) {
  await expect(page.getByRole("status")).toHaveText("评价预算耗尽");
}
async function exportJSON(page: Page) {
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON" }).click();
  const download = await promise;
  return JSON.parse(await readFile((await download.path())!, "utf-8"));
}
for (const algorithm of ["insertion", "merge", "quick"])
  test(`real sorting run and exact optimum: ${algorithm}`, async ({ page }) => {
    await setup(page);
    await page
      .getByRole("combobox", { name: "目标算法", exact: true })
      .selectOption(algorithm);
    await page.getByLabel("数组长度", { exact: true }).fill("5");
    await start(page);
    await complete(page);
    const data = await exportJSON(page),
      r = data.records[0];
    expect(r.evaluations).toBe(64);
    expect(r.termination).toBe("budget");
    expect(r.bestCost).toBeLessThanOrEqual(data.exact.optimum);
    expect(data.exact.complete).toBe(true);
    expect(data.exact.evaluated).toBe(120);
    expect(r.execution.sorted).toEqual([0, 1, 2, 3, 4]);
    await expect(page.getByLabel("最佳数组可视化")).toBeVisible();
    await expect(page.getByTestId("best-cost")).toHaveText(String(r.bestCost));
  });
for (const algorithm of ["bfs", "dfs", "dijkstra"])
  test(`real graph run: ${algorithm}`, async ({ page }) => {
    await setup(page);
    await page
      .getByRole("combobox", { name: "目标算法", exact: true })
      .selectOption(algorithm);
    await page.getByLabel("节点数", { exact: true }).fill("6");
    await page.getByLabel("固定边数", { exact: true }).fill("10");
    await start(page);
    await complete(page);
    const data = await exportJSON(page),
      r = data.records[0];
    expect(r.best.nodes).toBe(6);
    expect(r.best.edges.length).toBe(10);
    expect(r.bestCost).toBe(r.execution.metrics.expanded);
    expect(r.evaluations).toBe(64);
    expect(data.exact).toBeNull();
    await expect(
      page.getByRole("img", { name: "最佳有向图，起点0，终点为最后一个节点" }),
    ).toBeVisible();
  });
test("strategy switches and same seed reproducibility", async ({ page }) => {
  await setup(page);
  let first;
  for (const strategy of ["random", "hill", "annealing", "random"]) {
    await page
      .getByRole("combobox", { name: "搜索策略", exact: true })
      .selectOption(strategy);
    await start(page);
    await complete(page);
    const data = await exportJSON(page);
    expect(data.records[0].config.strategy).toBe(strategy);
    if (strategy === "random") {
      if (first) expect(data.records).toEqual(first);
      else first = data.records;
    }
  }
});
test("two seeds x three strategies and both exports", async ({ page }) => {
  await setup(page);
  await page.getByLabel("随机种子（逗号分隔，最多 8 个）").fill("42,43");
  await page.getByLabel("对比全部三种策略").check();
  await start(page);
  await complete(page);
  const data = await exportJSON(page);
  expect(data.records).toHaveLength(6);
  for (const r of data.records) expect(r.evaluations).toBe(64);
  expect(data.statistics).toHaveLength(3);
  for (const s of data.statistics) {
    expect(s.runs).toBe(2);
    expect(s.evaluations).toBe(128);
  }
  const promise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  const text = await readFile((await (await promise).path())!, "utf-8");
  expect(text).toContain('"evaluations"');
  expect(text).toContain('"hill"');
  expect(text).toContain('"annealing"');
  expect(text).toContain('"64"');
});
test("pause freezes real evaluation, resume, cancellation and restart", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("每次评价预算", { exact: true }).fill("20000");
  await page.getByLabel("数组长度", { exact: true }).fill("64");
  await start(page);
  await page.getByRole("button", { name: "暂停", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已暂停");
  const checkpoint = await page
    .getByText(/^评价 [\d,]+ \/ [\d,]+$/)
    .textContent();
  await page.waitForTimeout(250);
  await expect(page.getByText(/^评价 [\d,]+ \/ [\d,]+$/)).toHaveText(
    checkpoint!,
  );
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("运行中");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已取消");
  const data = await exportJSON(page);
  expect(data.records[0].termination).toBe("cancelled");
  expect(data.records[0].evaluations).toBeLessThan(20000);
  await page.getByLabel("每次评价预算", { exact: true }).fill("32");
  await start(page);
  await complete(page);
  expect((await exportJSON(page)).records[0].evaluations).toBe(32);
});
test("reset isolates old task and zero optimum is safe", async ({ page }) => {
  await setup(page);
  await page.getByLabel("每次评价预算", { exact: true }).fill("20000");
  await start(page);
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("等待实验");
  await expect(page.getByTestId("best-cost")).toHaveText("—");
  await page.getByLabel("每次评价预算", { exact: true }).fill("1");
  await page.getByLabel("数组长度", { exact: true }).fill("0");
  await start(page);
  await complete(page);
  const data = await exportJSON(page);
  expect(data.records).toHaveLength(1);
  expect(data.records[0].evaluations).toBe(1);
  expect(data.records[0].bestCost).toBe(0);
  expect(data.exact.optimum).toBe(0);
  await expect(page.getByText("100.0%", { exact: true })).toBeVisible();
});
test("timeout is a distinct real termination", async ({ page }) => {
  await setup(page);
  await page.getByLabel("每次评价预算", { exact: true }).fill("20000");
  await page.getByLabel("数组长度", { exact: true }).fill("64");
  await page.getByLabel("总时间预算 ms", { exact: true }).fill("1");
  await start(page);
  await expect(page.getByRole("status")).toHaveText("时间预算耗尽");
  const data = await exportJSON(page);
  expect(data.status).toBe("timeout");
  expect(data.records[0].termination).toBe("timeout");
  expect(data.records[0].evaluations).toBeLessThan(20000);
});
test("uncaught worker exception is visible and exportable", async ({
  page,
}) => {
  await page.route("**/assets/worker-*.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'throw new Error("synthetic worker crash");',
    }),
  );
  await setup(page);
  await start(page);
  await expect(page.getByRole("status")).toHaveText("执行异常");
  await expect(page.getByRole("alert")).toContainText("最后确认的检查点");
  const data = await exportJSON(page);
  expect(data.status).toBe("error");
  expect(data.records).toHaveLength(0);
  expect(data.exact).toBeNull();
});
test("unresponsive cancellation terminates worker via watchdog", async ({
  page,
}) => {
  await page.route("**/assets/worker-*.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: 'self.onmessage=(e)=>{if(e.data.type==="start")self.postMessage({id:e.data.id,snapshot:{status:"running",results:[],current:null,exact:null}});};',
    }),
  );
  await setup(page);
  await start(page);
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("已取消");
  await expect(page.getByRole("alert")).toContainText("已终止 Worker");
  expect((await exportJSON(page)).status).toBe("cancelled");
});
test("repeated bounded values disable exact", async ({ page }) => {
  await setup(page);
  await page
    .getByRole("combobox", { name: "输入类型", exact: true })
    .selectOption("repeated");
  await page.getByLabel("数值范围 ±", { exact: true }).fill("2");
  await expect(
    page.getByLabel("独立精确穷举（互异排列 n ≤ 8）"),
  ).toBeDisabled();
  await start(page);
  await complete(page);
  const data = await exportJSON(page);
  expect(
    data.records[0].best.values.every((n: number) => n >= -2 && n <= 2),
  ).toBe(true);
  expect(data.exact).toBeNull();
});
test("invalid configuration rejected before worker execution", async ({
  page,
}) => {
  await setup(page);
  await page.getByLabel("随机种子（逗号分隔，最多 8 个）").fill("1,1");
  await start(page);
  await expect(page.getByRole("alert")).toContainText("互异");
  await expect(page.getByRole("status")).toHaveText("等待实验");
});
test("mobile layout and persistent light theme run real experiment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("button", { name: "切换主题" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByLabel("每次评价预算", { exact: true }).fill("64");
  await page.getByLabel("数组长度", { exact: true }).fill("5");
  await start(page);
  await complete(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
