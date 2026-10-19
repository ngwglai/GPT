import { INPUT_BYTES, type Domain, type Model } from "./types";
import { inDomain } from "./state";

export class ResourceError extends Error {}
type Obj = Record<string, unknown>;
type ExprType = "number" | "boolean" | "string";
function fail(path: string, text: string): never {
  throw new Error(`${path}：${text}`);
}
function object(value: unknown, path: string): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(path, "应为对象");
  return value as Obj;
}
function keys(value: Obj, expected: string[], path: string) {
  if (
    Object.keys(value).some((k) => !expected.includes(k)) ||
    expected.some((k) => !Object.hasOwn(value, k))
  )
    fail(path, `字段必须为 ${expected.join("、")}`);
}
function list(value: unknown, path: string, max: number, min = 0): unknown[] {
  if (!Array.isArray(value) || value.length < min)
    fail(path, `应为数组，至少 ${min} 项`);
  if (value.length > max)
    throw new ResourceError(`${path} 超过 ${max} 项资源上限`);
  return value;
}
function label(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 80)
    fail(path, "应为 1–80 字符的名称");
  return value;
}
function identifier(value: string, path: string) {
  if (
    !/^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(value) ||
    ["constructor", "prototype"].includes(value)
  )
    fail(
      path,
      "变量名须以英文字母开头，仅含字母、数字、下划线，最长 32 字符，且不能是保留名",
    );
}
export function exprType(
  value: unknown,
  variables: Record<string, Domain>,
  path: string,
  depth = 0,
): ExprType {
  if (depth > 24) throw new ResourceError(`${path} 表达式超过 24 层资源上限`);
  if (typeof value === "boolean" || typeof value === "string") {
    if (typeof value === "string" && value.length > 80)
      fail(path, "字符串最长 80 字符");
    return typeof value as ExprType;
  }
  if (typeof value === "number" && Number.isSafeInteger(value)) return "number";
  const e = object(value, path);
  if (Object.hasOwn(e, "var")) {
    keys(e, ["var"], path);
    if (typeof e.var !== "string" || !Object.hasOwn(variables, e.var))
      fail(path, "引用了未定义变量");
    const d = variables[e.var];
    return d.type === "int"
      ? "number"
      : d.type === "bool"
        ? "boolean"
        : "string";
  }
  keys(e, ["op", "args"], path);
  const op = e.op;
  if (
    typeof op !== "string" ||
    ![
      "+",
      "-",
      "*",
      "==",
      "!=",
      "<",
      "<=",
      ">",
      ">=",
      "and",
      "or",
      "not",
    ].includes(op)
  )
    fail(path, "不支持的表达式运算符");
  const args = list(e.args, `${path}.args`, 16, 1);
  const types = args.map((x, i) =>
    exprType(x, variables, `${path}.args[${i}]`, depth + 1),
  );
  if (op === "not") {
    if (types.length !== 1 || types[0] !== "boolean")
      fail(path, "not 需要一个布尔参数");
    return "boolean";
  }
  if (op === "and" || op === "or") {
    if (types.length < 2 || types.some((x) => x !== "boolean"))
      fail(path, "and/or 需要至少两个布尔参数");
    return "boolean";
  }
  if (types.length !== 2) fail(path, "此运算符需要两个参数");
  if (op === "==" || op === "!=") {
    if (types[0] !== types[1]) fail(path, "相等比较两侧类型必须一致");
    return "boolean";
  }
  if (types.some((x) => x !== "number")) fail(path, "算术与大小比较仅支持整数");
  return ["+", "-", "*"].includes(op) ? "number" : "boolean";
}
export function validateModel(value: unknown): Model {
  const m = object(value, "模型");
  keys(
    m,
    [
      "name",
      "variables",
      "initial",
      "actions",
      "invariants",
      "terminal",
      "goals",
    ],
    "模型",
  );
  label(m.name, "name");
  const vars = object(m.variables, "variables");
  const names = Object.keys(vars);
  if (!names.length) fail("variables", "至少需要一个变量");
  if (names.length > 12) throw new ResourceError("变量超过 12 个资源上限");
  for (const name of names) {
    identifier(name, `variables.${name}`);
    const d = object(vars[name], `variables.${name}`);
    if (d.type === "int") {
      keys(d, ["type", "min", "max"], name);
      if (
        !Number.isSafeInteger(d.min) ||
        !Number.isSafeInteger(d.max) ||
        (d.min as number) > (d.max as number)
      )
        fail(name, "整数域需要安全整数 min ≤ max");
    } else if (d.type === "bool") keys(d, ["type"], name);
    else if (d.type === "enum") {
      keys(d, ["type", "values"], name);
      const values = list(d.values, `${name}.values`, 64, 1);
      values.forEach((x) => label(x, name));
      if (new Set(values).size !== values.length) fail(name, "枚举值不能重复");
    } else fail(name, "域类型仅支持 int、bool、enum");
  }
  const variables = vars as Record<string, Domain>;
  list(m.initial, "initial", 1024, 1).forEach((s, i) => {
    const state = object(s, `initial[${i}]`);
    keys(state, names, `initial[${i}]`);
    names.forEach((name) => {
      if (!inDomain(state[name], variables[name]))
        fail(`initial[${i}].${name}`, "状态值类型错误或超出变量域");
    });
  });
  const checkBool = (e: unknown, path: string) => {
    if (exprType(e, variables, path) !== "boolean")
      fail(path, "性质与守卫必须是布尔表达式");
  };
  const actionNames = new Set<string>();
  list(m.actions, "actions", 128).forEach((a, i) => {
    const path = `actions[${i}]`,
      act = object(a, path);
    keys(act, ["name", "guard", "set"], path);
    const name = label(act.name, `${path}.name`);
    if (actionNames.has(name)) fail(path, "动作名称不能重复");
    actionNames.add(name);
    checkBool(act.guard, `${path}.guard`);
    const set = object(act.set, `${path}.set`);
    if (!Object.keys(set).length)
      fail(path, "赋值不能为空（自循环可赋值为原值）");
    for (const [k, e] of Object.entries(set)) {
      if (!Object.hasOwn(variables, k))
        fail(`${path}.set`, "赋值引用了未定义变量");
      const expected =
        variables[k].type === "int"
          ? "number"
          : variables[k].type === "bool"
            ? "boolean"
            : "string";
      if (exprType(e, variables, `${path}.set.${k}`) !== expected)
        fail(`${path}.set.${k}`, "赋值表达式类型与变量域不符");
    }
  });
  for (const field of ["invariants", "goals"]) {
    const used = new Set<string>();
    list(m[field], field, 32).forEach((p, i) => {
      const path = `${field}[${i}]`,
        prop = object(p, path);
      keys(prop, ["name", "expr"], path);
      const name = label(prop.name, `${path}.name`);
      if (used.has(name)) fail(path, "性质名称不能重复");
      used.add(name);
      checkBool(prop.expr, `${path}.expr`);
    });
  }
  checkBool(m.terminal, "terminal");
  return m as unknown as Model;
}
export function parseModel(text: string): Model {
  if (new TextEncoder().encode(text).byteLength > INPUT_BYTES)
    throw new ResourceError("输入超过 64 KiB 资源上限");
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("JSON 格式错误：请检查引号、逗号和括号");
  }
  return validateModel(value);
}
