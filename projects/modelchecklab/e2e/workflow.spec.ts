import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { examples } from "../src/examples";
import type { Model } from "../src/core/types";

for (const item of examples) {
  test(`真实 Worker 案例：${item.id}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await page.getByLabel("内置案例").selectOption(item.id);
    await page.getByRole("button", { name: "校验模型", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("校验通过");
    await page.getByRole("button", { name: "运行检验", exact: true }).click();
    await expect(page.getByTestId("result")).toContainText(
      item.good ? "verified" : "counterexample",
    );
    await page.getByText("小规模状态图", { exact: false }).click();
    await expect(page.getByRole("img", { name: "可达状态图" })).toBeVisible();
    if (item.good)
      await expect(page.getByText("reachable", { exact: true })).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test("导入导出模型，真实最短反例回放、高亮与结果导出", async ({ page }) => {
  await page.goto("/");
  const m = examples.find((e) => e.id === "bank-bad")!.model;
  await page.getByLabel("导入模型", { exact: true }).setInputFiles({
    name: "synthetic-model.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(m)),
  });
  await expect(page.getByLabel("JSON 模型编辑器")).toHaveValue(
    JSON.stringify(m),
  );
  const [modelDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出模型", exact: true }).click(),
  ]);
  expect(
    JSON.parse(await readFile((await modelDownload.path())!, "utf8")),
  ).toEqual(m);
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("counterexample");
  await expect(page.getByTestId("replay-step")).toHaveText("0 / 1");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  await expect(page.getByTestId("variable-a")).toHaveClass("changed");
  await expect(page.getByTestId("replay-action")).toContainText("a 转给 b");
  const [traceDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出反例轨迹", exact: true }).click(),
  ]);
  const trace = JSON.parse(
    await readFile((await traceDownload.path())!, "utf8"),
  );
  expect(trace.trace.map((s: { state: unknown }) => s.state)).toEqual([
    { a: 2, b: 1 },
    { a: 1, b: 1 },
  ]);
  expect(trace.violation.kind).toBe("invariant");
  const [resultDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "导出检验结果", exact: true }).click(),
  ]);
  const exported = JSON.parse(
    await readFile((await resultDownload.path())!, "utf8"),
  );
  expect(exported.result.status).toBe("counterexample");
  expect(exported.result.model).toEqual(m);
  await page.getByRole("button", { name: "上一步", exact: true }).click();
  await page.getByRole("button", { name: "自动回放", exact: true }).click();
  await expect(page.getByTestId("replay-step")).toHaveText("1 / 1");
  await expect(
    page.getByRole("button", { name: "自动回放", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.getByTestId("result")).toHaveCount(0);
});

test("非法JSON和表达式、超限输入有中文反馈", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("JSON 模型编辑器").fill("{");
  await page.getByRole("button", { name: "校验模型", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("JSON 格式错误");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("invalid_model");
  const m = structuredClone(examples[0].model);
  m.terminal = { op: "eval", args: [] } as never;
  await page.getByLabel("JSON 模型编辑器").fill(JSON.stringify(m));
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText(
    "不支持的表达式运算符",
  );
  await page.getByLabel("导入模型", { exact: true }).setInputFiles({
    name: "too-large.json",
    mimeType: "application/json",
    buffer: Buffer.alloc(65537, 32),
  });
  await expect(page.getByRole("status")).toContainText("64 KiB");
  await expect(page.getByTestId("result")).toContainText("inconclusive");
});

test("预算耗尽与目标 unknown，编辑后清除旧结果", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("状态上限", { exact: true }).fill("1");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("inconclusive");
  await expect(page.getByText("unknown", { exact: true })).toBeVisible();
  await page.getByLabel("JSON 模型编辑器").fill("{}");
  await expect(page.getByTestId("result")).toHaveCount(0);
});

function largeModel(): Model {
  return {
    name: "大状态空间",
    variables: { x: { type: "int", min: 0, max: 49999 }, y: { type: "bool" } },
    initial: [{ x: 0, y: false }],
    actions: [
      {
        name: "step",
        guard: { op: "<", args: [{ var: "x" }, 49999] },
        set: { x: { op: "+", args: [{ var: "x" }, 1] } },
      },
      {
        name: "toggle",
        guard: true,
        set: { y: { op: "not", args: [{ var: "y" }] } },
      },
    ],
    invariants: [],
    terminal: false,
    goals: [{ name: "目标", expr: { op: "==", args: [{ var: "x" }, 49999] } }],
  };
}
test("真实长任务取消、运行期间主题响应、重置及再次运行", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("JSON 模型编辑器").fill(JSON.stringify(largeModel()));
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "取消", exact: true }),
  ).toBeEnabled();
  await page.getByLabel("切换深浅主题").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("inconclusive");
  await expect(page.getByTestId("result")).toContainText("取消");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await page.getByLabel("内置案例").selectOption("bank-good");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("verified");
});

test("窄屏、主题持久化及无横向页面溢出", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page.getByLabel("切换深浅主题").click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByLabel("内置案例").selectOption("mutex-bad");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("counterexample");
  await page.getByRole("button", { name: "下一步", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("Worker 无法创建时明确返回未确定", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", {
      value: class {
        constructor() {
          throw new Error("不可用");
        }
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("inconclusive");
  await expect(page.getByTestId("result")).toContainText("Web Worker");
});

test("Worker运行错误返回未确定，不伪造反例", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "Worker", {
      value: class {
        onerror: ((e: ErrorEvent) => void) | null = null;
        postMessage() {
          setTimeout(() => this.onerror?.(new ErrorEvent("error")), 0);
        }
        terminate() {}
      },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "运行检验", exact: true }).click();
  await expect(page.getByTestId("result")).toContainText("inconclusive");
  await expect(page.getByTestId("result")).toContainText("异常退出");
});
