import { test, expect } from "@playwright/test";
test("create, solve, replay, validate, benchmark and export", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("规模 N", { exact: true }).fill("4");
  await page.getByRole("button", { name: "载入预设" }).click();
  await page.getByLabel("最大解数", { exact: true }).fill("10");
  await page.getByRole("button", { name: "开始求解" }).click();
  await expect(page.locator(".badge")).toHaveText("SAT");
  await expect(page.getByText("枚举已完成")).toBeVisible();
  await page.getByRole("button", { name: "验证解", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("解独立验证通过");
  await page.getByRole("button", { name: "下一步" }).click();
  await expect(page.locator(".event")).toContainText("2 /");
  await page.getByRole("button", { name: "上一步" }).click();
  await expect(page.locator(".event")).toContainText("1 /");
  await page.getByRole("button", { name: "播放", exact: true }).click();
  await page.getByRole("button", { name: "暂停回放" }).click();
  const save = page.waitForEvent("download");
  await page.getByRole("button", { name: "保存 JSON" }).click();
  expect((await save).suggestedFilename()).toBe("problem.json");
  await page.getByRole("button", { name: "性能实验", exact: true }).click();
  await page.getByRole("button", { name: "运行对比实验" }).click();
  await expect(page.getByRole("status")).toContainText("实验完成");
  await expect(page.locator("tbody tr")).toHaveCount(9);
  const csv = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 CSV" }).click();
  expect((await csv).suggestedFilename()).toBe("experiment.csv");
});
test("JSON import errors and Sudoku editing", async ({ page }) => {
  await page.goto("/");
  await page
    .getByLabel("导入 JSON", { exact: true })
    .setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from("{"),
    });
  await expect(page.getByRole("alert")).toBeVisible();
  const p = {
    name: "Imported",
    variables: { x: [1, 2] },
    constraints: [],
    metadata: {},
  };
  await page
    .getByLabel("导入 JSON", { exact: true })
    .setInputFiles({
      name: "p.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(p)),
    });
  await expect(page.getByRole("status")).toContainText("导入成功");
  await page.getByRole("button", { name: "开始求解" }).click();
  await expect(page.locator(".badge")).toHaveText("SAT");
  await page.getByLabel("问题类型", { exact: true }).selectOption("sudoku");
  await page.getByRole("button", { name: "载入预设" }).click();
  await page.getByLabel("r0c0", { exact: true }).fill("1");
  await page.getByRole("button", { name: "开始求解" }).click();
  await expect(page.locator(".badge")).toHaveText("SAT");
});
test("resource status and trace truncation are visible", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("超时 / 秒", { exact: true }).fill("0");
  await page.getByRole("button", { name: "开始求解" }).click();
  await expect(page.locator(".badge")).toHaveText("UNKNOWN");
  await expect(page.getByRole("status")).toContainText("timeout");
  await page.getByLabel("超时 / 秒", { exact: true }).fill("10");
  await page.getByLabel("轨迹事件上限", { exact: true }).fill("2");
  await page.getByRole("button", { name: "开始求解" }).click();
  await expect(page.locator(".badge")).toHaveText("SAT");
  await expect(page.locator(".warning")).toContainText("轨迹已截断");
});

test("cancel button waits for the current job ID", async ({ page }) => {
  let signalRequest!: () => void;
  let releaseRequest!: () => void;
  const requested = new Promise<void>((resolve) => { signalRequest = resolve; });
  const hold = new Promise<void>((resolve) => { releaseRequest = resolve; });
  await page.route("**/api/jobs", async (route) => {
    signalRequest();
    await hold;
    await route.continue();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始求解" }).click();
  await requested;
  await expect(page.getByRole("status")).toContainText("正在计算");
  await expect(page.getByRole("button", { name: "取消后端计算" })).toHaveCount(0);
  releaseRequest();
  await expect(page.locator(".badge")).toHaveText("SAT");
});

test("late initial preset cannot overwrite a newer selection", async ({ page }) => {
  let releaseInitial!: () => void;
  let releaseSelected!: () => void;
  let initialRequested!: () => void;
  let selectedRequested!: () => void;
  const initialHeld = new Promise<void>((resolve) => { releaseInitial = resolve; });
  const selectedHeld = new Promise<void>((resolve) => { releaseSelected = resolve; });
  const initialSeen = new Promise<void>((resolve) => { initialRequested = resolve; });
  const selectedSeen = new Promise<void>((resolve) => { selectedRequested = resolve; });
  await page.route("**/api/builtin", async (route) => {
    const response = await route.fetch();
    if (route.request().postDataJSON().size === 8) {
      initialRequested();
      await initialHeld;
    } else {
      selectedRequested();
      await selectedHeld;
    }
    await route.fulfill({ response });
  });
  try {
    await page.goto("/");
    await initialSeen;
    await page.getByLabel("规模 N", { exact: true }).fill("4");
    await page.getByRole("button", { name: "载入预设" }).click();
    await selectedSeen;
    await expect(page.getByRole("button", { name: "开始求解" })).toBeDisabled();
    releaseSelected();
    const json = page.getByLabel("问题 JSON", { exact: true });
    await expect.poll(async () => JSON.parse((await json.inputValue()) || "{}").metadata?.size).toBe(4);
    const initialResponse = page.waitForResponse((response) =>
      response.url().endsWith("/api/builtin") && response.request().postDataJSON().size === 8,
    );
    releaseInitial();
    await initialResponse;
    // Let response handlers and React rendering finish before inspecting the document.
    await page.evaluate(() => new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    ));
    expect(JSON.parse(await json.inputValue()).metadata.size).toBe(4);
    await page.getByLabel("最大解数", { exact: true }).fill("10");
    await page.getByRole("button", { name: "开始求解" }).click();
    await expect(page.getByText("枚举已完成")).toBeVisible();
    await expect(page.locator(".badge")).toHaveText("SAT");
  } finally {
    releaseInitial();
    releaseSelected();
  }
});

