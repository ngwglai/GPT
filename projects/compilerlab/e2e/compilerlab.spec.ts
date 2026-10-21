import { expect, test, type Page } from "@playwright/test";

async function load(page: Page, name: string) {
  await page.getByLabel("载入示例").selectOption({ label: name });
  await page.getByRole("button", { name: "加载", exact: true }).click();
}
async function tab(page: Page, name: string) {
  await page
    .getByRole("button", { name: new RegExp(`^0[1-6]\\s*${name}$`) })
    .click();
}
async function source(page: Page, code: string) {
  await page.getByLabel("程序源码").fill(code);
  await page.getByRole("button", { name: "编译", exact: true }).click();
}
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("loads real tokens, AST, symbols, optimized trees and bytecode", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "看见程序如何被理解。" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "let", exact: true }).first(),
  ).toBeVisible();
  await tab(page, "AST");
  await expect(page.getByRole("heading", { name: /抽象语法树/ })).toBeVisible();
  await expect(page.locator(".tree").first()).toContainText("Program");
  await expect(page.locator(".tree").first()).toContainText("binary *");
  await tab(page, "类型检查");
  await expect(
    page.getByRole("cell", { name: "base", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "int", exact: true }).first(),
  ).toBeVisible();
  await tab(page, "AST 优化");
  await expect(page.locator(".compare > div").nth(0)).toContainText("binary *");
  await expect(page.locator(".compare > div").nth(1)).toContainText(
    "Literal 14",
  );
  await tab(page, "字节码");
  await expect(page.locator(".compare > div").nth(0)).toContainText("BINARY *");
  await expect(page.locator(".compare > div").nth(1)).toContainText("PUSH 14");
});

test("example execution uses VM and independent reference agreement", async ({
  page,
}) => {
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("21\ntrue");
  await expect(page.locator(".comparison")).toHaveText(
    "一致：解释器 / 原始 VM / 优化 VM",
  );
  await expect(page.getByTestId("variables")).toContainText('"total@1": 21');
});

test("single step exposes PC and stack; continue and reset use actual machine state", async ({
  page,
}) => {
  await source(page, "let x: int = 2 + 3; print(x);");
  await tab(page, "执行调试");
  await page.getByRole("button", { name: "单步", exact: true }).click();
  await expect(page.getByTestId("stack")).toHaveText("[5]");
  await expect(page.locator(".debugger")).toContainText("PC 1 · 1 步");
  await expect(page.getByTestId("output")).toHaveText("（暂无输出）");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("5");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.getByTestId("stack")).toHaveText("[]");
  await expect(page.getByTestId("variables")).toHaveText("{}");
  await expect(page.getByTestId("output")).toHaveText("（暂无输出）");
  await expect(page.locator(".debugger")).toContainText("PC 0 · 0 步");
});

test("optimization toggle changes actual instruction stepping and clears old evidence", async ({
  page,
}) => {
  await source(page, "print(2 + 3 * 4);");
  await page.getByLabel("启用安全局部优化").uncheck();
  await tab(page, "执行调试");
  await page.getByRole("button", { name: "单步", exact: true }).click();
  await expect(page.getByTestId("stack")).toHaveText("[2]");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("14");
  const unoptimizedSteps = await page.locator("#trace option").count();
  await page.getByLabel("启用安全局部优化").check();
  await expect(page.getByTestId("output")).toHaveText("（暂无输出）");
  await page.getByRole("button", { name: "单步", exact: true }).click();
  await expect(page.getByTestId("stack")).toHaveText("[14]");
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("14");
  expect(await page.locator("#trace option").count()).toBeLessThan(
    unoptimizedSteps,
  );
});

test("loads boolean short-circuit example without observing skipped runtime errors", async ({
  page,
}) => {
  await load(page, "布尔短路");
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("false\ntrue\n-3");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByLabel("启用安全局部优化").uncheck();
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("false\ntrue\n-3");
});

test("nested scopes print their actual values then remove locals", async ({
  page,
}) => {
  await load(page, "嵌套作用域");
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("11\n6\n3");
  await expect(page.getByTestId("variables")).toHaveText('{\n  "x@0": 3\n}');
});

test("compile errors block execution and clicking diagnostics selects exact source", async ({
  page,
}) => {
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await load(page, "类型错误定位");
  await expect(page.getByRole("alert")).toContainText("TypeMismatch");
  await expect(page.getByRole("alert")).toContainText("第 2 行");
  await expect(
    page.getByRole("button", { name: "执行", exact: true }),
  ).toBeDisabled();
  await page.getByRole("alert").getByRole("button").first().click();
  const selected = await page
    .getByLabel("程序源码")
    .evaluate((element: HTMLTextAreaElement) =>
      element.value.slice(element.selectionStart, element.selectionEnd),
    );
  expect(selected).toBe("enabled");
  await tab(page, "执行调试");
  await expect(
    page.getByRole("button", { name: "单步", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "继续", exact: true }),
  ).toBeDisabled();
  await expect(page.getByTestId("output")).toHaveText("（暂无输出）");
});

test("runtime errors preserve previous output and variable environment", async ({
  page,
}) => {
  await load(page, "运行时除零");
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("DivisionByZero");
  await expect(page.getByTestId("output")).toHaveText("8");
  await expect(page.getByTestId("variables")).toContainText('"n@0": 8');
  await expect(
    page.getByRole("button", { name: "单步", exact: true }),
  ).toBeDisabled();
  await expect(page.locator(".comparison")).toContainText("一致");
});

test("syntax, lexical, range and resource errors are understandable and recoverable", async ({
  page,
}) => {
  for (const [code, expected] of [
    ["print(@);", "LexicalError"],
    ["print(1)", "SyntaxError"],
    ["print(2147483648);", "IntegerRange"],
    [`print(${Array(60).fill("1").join("+")});`, "ResourceLimit"],
  ]) {
    await source(page, code);
    await expect(page.getByRole("alert")).toContainText(expected);
    await expect(
      page.getByRole("button", { name: "执行", exact: true }),
    ).toBeDisabled();
  }
  await source(page, "print(42);");
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("42");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("source edits clear previous runtime evidence until recompiled", async ({
  page,
}) => {
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await page.getByLabel("程序源码").fill("print(99);");
  await expect(
    page.getByText("源码已修改。点击“编译”生成当前阶段结果。"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "执行", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "编译", exact: true }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("99");
});

test("trace replay shows historical stack and blocks stepping from a past snapshot", async ({
  page,
}) => {
  await source(page, "print(2 + 3);");
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await page.getByLabel("执行轨迹回放").selectOption("0");
  await expect(page.getByTestId("stack")).toHaveText("[5]");
  await expect(page.getByTestId("output")).toHaveText("（暂无输出）");
  await expect(
    page.getByRole("button", { name: "单步", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("执行轨迹回放").selectOption("2");
  await expect(page.getByTestId("output")).toHaveText("5");
});

test("production application works offline without external requests or page errors", async ({
  page,
  context,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4191/"))
      external.push(request.url());
  });
  await context.setOffline(true);
  await load(page, "嵌套作用域");
  await page.getByRole("button", { name: "执行", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("11\n6\n3");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("375px layout keeps all stages, editing and debugging usable without page overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await load(page, "嵌套作用域");
  for (const stage of ["Token", "AST 优化", "字节码", "执行调试"]) {
    await tab(page, stage);
    await expect(page.locator(".stage-content")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "单步", exact: true }).click();
  await page.getByRole("button", { name: "继续", exact: true }).click();
  await expect(page.getByTestId("output")).toHaveText("11\n6\n3");
  await page.getByRole("button", { name: "重置", exact: true }).click();
  await expect(page.getByTestId("variables")).toHaveText("{}");
});
