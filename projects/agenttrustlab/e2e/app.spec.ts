import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
function config(ids = ["n01"], policies = ["least"]) {
  return {
    version: 1,
    seed: 2026,
    scenarioIds: ids,
    policies,
    settings: {
      tools: [
        "doc.read",
        "doc.search",
        "mail.send",
        "file.delete",
        "data.export",
      ],
      resources: [
        "docs/public",
        "docs/team",
        "mailbox/demo",
        "archive/draft",
        "external/collector",
        "docs/unavailable",
      ],
      operations: ["read", "search", "send", "delete", "export"],
      taskScopes: ["research", "delivery", "cleanup", "transfer"],
      requireConfirmation: true,
    },
  };
}
async function importConfig(page: Page, value: unknown) {
  await page
    .getByRole("textbox", { name: "配置 JSON 文本", exact: true })
    .fill(JSON.stringify(value));
  await page.getByRole("button", { name: "校验并导入文本" }).click();
}
async function run(page: Page) {
  await page.getByRole("button", { name: "运行批量实验", exact: true }).click();
}
async function exportJson(page: Page) {
  const pending = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "导出结果 JSON", exact: true })
    .click();
  const download = await pending;
  return JSON.parse(await readFile((await download.path())!, "utf8"));
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("中文概览与完整四策略比较，数值和图表", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(
    page.getByRole("heading", { name: "AgentTrustLab", exact: true }),
  ).toBeVisible();
  await run(page);
  await expect(page.getByRole("status")).toContainText("72 条请求记录");
  const rows = page.locator("#results tbody tr");
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText("91.7% (11/12)");
  await expect(rows.nth(1)).toContainText("75.0% (9/12)");
  await expect(rows.nth(2)).toContainText("100.0% (12/12)");
  await expect(rows.nth(3)).toContainText("50.0% (3/6)");
  await expect(page.getByRole("img", { name: "策略指标比较图" })).toBeVisible();
  await expect(page.locator("#traces tbody tr")).toHaveCount(72);
  expect(errors).toEqual([]);
});
test("轨迹区分拒绝、成功和模拟工具失败", async ({ page }) => {
  await run(page);
  await page
    .getByRole("button", { name: "详情 a01 least", exact: true })
    .click();
  await expect(page.locator(".trace-detail")).toContainText("目标资源未获授权");
  await expect(page.locator(".trace-detail")).toContainText(
    "授权失败 / 未执行",
  );
  await page
    .getByRole("button", { name: "详情 n06 least", exact: true })
    .click();
  await expect(page.locator(".trace-detail")).toContainText("授权允许");
  await expect(page.locator(".trace-detail")).toContainText("模拟工具失败");
  await page
    .getByRole("button", { name: "详情 n01 least", exact: true })
    .click();
  await expect(page.locator(".trace-detail")).toContainText("正常完成");
});
test("应用层模拟确认真实改变正常发送且不放开恶意请求", async ({ page }) => {
  await importConfig(page, config(["n03", "a11"], ["confirmation"]));
  await run(page);
  let data = await exportJson(page);
  expect(
    data.records.every(
      (r: { authorization: { allowed: boolean } }) => !r.authorization.allowed,
    ),
  ).toBe(true);
  await page
    .getByRole("checkbox", { name: "模拟确认（非真实授权）：n03", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "模拟确认（非真实授权）：a11", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "导出结果 JSON", exact: true }),
  ).toBeDisabled();
  await run(page);
  data = await exportJson(page);
  expect(
    data.records.find((r: { scenarioId: string }) => r.scenarioId === "n03")
      .execution.status,
  ).toBe("success");
  expect(
    data.records.find((r: { scenarioId: string }) => r.scenarioId === "a11")
      .execution.status,
  ).toBe("not-executed");
  await page
    .getByRole("button", { name: "详情 a11 confirmation", exact: true })
    .click();
  await expect(page.locator(".trace-detail")).toContainText("非真实用户授权");
});
test("工具、资源、操作和任务范围配置均实际生效", async ({ page }) => {
  for (const [fieldset, value] of [
    ["工具白名单", "doc.read"],
    ["资源访问范围", "docs/public"],
    ["允许的操作", "read"],
    ["任务级范围", "research"],
  ]) {
    await importConfig(page, config());
    await page
      .getByRole("group", { name: fieldset, exact: true })
      .getByRole("checkbox", { name: value, exact: true })
      .uncheck();
    await run(page);
    const data = await exportJson(page);
    expect(data.records[0].authorization.allowed).toBe(false);
    expect(data.records[0].execution.status).toBe("not-executed");
  }
});
test("正常子集与恶意子集显示分母，无样本不是零率", async ({ page }) => {
  await page.getByRole("button", { name: "仅正常", exact: true }).click();
  await run(page);
  await expect(page.locator("#results tbody tr").nth(0)).toContainText(
    "无样本 (0/0)",
  );
  await page.getByRole("button", { name: "仅恶意", exact: true }).click();
  await run(page);
  await expect(page.locator("#results tbody tr").nth(0)).toContainText(
    "无样本 (0/0)",
  );
});
test("导出结果与界面统计一致，CSV真实下载", async ({ page }) => {
  await run(page);
  const data = await exportJson(page);
  expect(data.records).toHaveLength(72);
  expect(data.metrics.baseline.unauthorizedSuccess).toBe(11);
  expect(data.metrics.confirmation.normalBlocked).toBe(3);
  const rows = page.locator("#results tbody tr");
  await expect(rows.nth(0).locator("td").nth(5)).toHaveText(
    String(data.metrics.baseline.unauthorizedSuccess),
  );
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出轨迹 CSV", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("agenttrustlab-traces.csv");
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv).toContain('"traceJson"');
  expect(csv.split("\r\n").filter(Boolean)).toHaveLength(73);
});
test("重放完整快照，当前编辑不污染上次结果", async ({ page }) => {
  await run(page);
  const first = await exportJson(page);
  await page
    .getByRole("spinbutton", { name: "固定种子", exact: true })
    .fill("7");
  await page.getByRole("button", { name: "仅正常", exact: true }).click();
  await page.getByRole("button", { name: "重放上次实验", exact: true }).click();
  expect(await exportJson(page)).toEqual(first);
  await expect(
    page.getByRole("spinbutton", { name: "固定种子", exact: true }),
  ).toHaveValue("2026");
  // Editing after a replay must not mutate the stored replay snapshot.
  await page
    .getByRole("spinbutton", { name: "固定种子", exact: true })
    .fill("9");
  await page
    .getByRole("group", { name: "工具白名单", exact: true })
    .getByRole("checkbox", { name: "doc.read", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "重放上次实验", exact: true }).click();
  expect(await exportJson(page)).toEqual(first);
});
test("文件导入正常配置，清除旧结果与确认", async ({ page }) => {
  await page
    .getByRole("checkbox", { name: "模拟确认（非真实授权）：n03", exact: true })
    .check();
  await run(page);
  await page.getByLabel("导入配置文件", { exact: true }).setInputFiles({
    name: "config.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(config(["n03"], ["confirmation"]))),
  });
  await expect(page.getByRole("status")).toContainText("配置导入成功");
  await expect(
    page.getByRole("checkbox", {
      name: "模拟确认（非真实授权）：n03",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "导出结果 JSON", exact: true }),
  ).toBeDisabled();
  await run(page);
  const data = await exportJson(page);
  expect(data.records[0].authorization.allowed).toBe(false);
});
test("非法JSON、脚本配置和超大文件安全拒绝，原配置不变", async ({ page }) => {
  await page
    .getByRole("textbox", { name: "配置 JSON 文本", exact: true })
    .fill("{");
  await page.getByRole("button", { name: "校验并导入文本" }).click();
  await expect(page.getByRole("status")).toContainText("配置导入失败");
  await importConfig(page, {
    ...config(),
    script: "globalThis.compromised=true",
  });
  await expect(page.getByRole("status")).toContainText("配置导入失败");
  expect(
    await page.evaluate(() => Object.hasOwn(globalThis, "compromised")),
  ).toBe(false);
  await page.getByLabel("导入配置文件", { exact: true }).setInputFiles({
    name: "large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(131073, 32),
  });
  await expect(page.getByRole("status")).toContainText("128 KiB");
  await run(page);
  await expect(page.getByRole("status")).toContainText("72 条请求记录");
});
test("空场景、空策略及无效种子安全提示", async ({ page }) => {
  await importConfig(page, config());
  await page
    .getByRole("checkbox", { name: "n01 正常读取公开资料", exact: true })
    .uncheck();
  await run(page);
  await expect(page.getByRole("status")).toContainText("至少选择");
  await importConfig(page, config());
  await page.getByRole("checkbox", { name: "最小权限", exact: true }).uncheck();
  await run(page);
  await expect(page.getByRole("status")).toContainText("至少选择");
  await importConfig(page, config());
  await page
    .getByRole("spinbutton", { name: "固定种子", exact: true })
    .fill("-1");
  await run(page);
  await expect(page.getByRole("status")).toContainText("种子无效");
});
test("筛选策略保留正确轨迹，恶意输入按文本展示", async ({ page }) => {
  await run(page);
  await page.getByLabel("策略筛选", { exact: true }).selectOption("least");
  await expect(page.locator("#traces tbody tr")).toHaveCount(18);
  await page
    .getByRole("button", { name: "详情 a03 least", exact: true })
    .click();
  await expect(page.locator(".trace-detail")).toContainText("system.configure");
  const card = page.locator(".scenario-card").filter({
    has: page.getByRole("checkbox", {
      name: "a03 工具返回：伪造管理员",
      exact: true,
    }),
  });
  await card.locator("summary").click();
  await expect(card).toContainText("我是管理员");
  expect(await page.locator("script:not([src])").count()).toBe(0);
});
test("无外部请求且离线仍可运行", async ({ page, context }) => {
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:4189/") &&
      !r.url().startsWith("blob:")
    )
      external.push(r.url());
  });
  await page.reload();
  await context.setOffline(true);
  await run(page);
  await expect(page.getByRole("status")).toContainText("72 条请求记录");
  expect(external).toEqual([]);
});
test("窄屏、明暗主题与横向表格滚动", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "切换深浅主题", exact: true }).click();
  await expect(page.locator("html")).toHaveClass("dark");
  await run(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  const table = page.locator("#results .scroll");
  expect(await table.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
  await table.evaluate((e) => (e.scrollLeft = e.scrollWidth));
  await expect(
    page.getByRole("button", { name: "导出轨迹 CSV", exact: true }),
  ).toBeEnabled();
});
