export const MAX_VARIABLES = 12;
export const MAX_SAMPLES = 20_000;
export const MAX_IMPORT_BYTES = 65_536;
export interface Variable {
  id: string;
  label: string;
  kind: "linear" | "bernoulli";
  intercept: number;
  weights: Record<string, number>;
  noiseStd: number;
}
export interface Model {
  schemaVersion: 1;
  name: string;
  variables: Variable[];
}
export interface Compiled {
  model: Model;
  order: readonly Variable[];
}
const forbidden = new Set(["__proto__", "constructor", "prototype"]);
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("需要 JSON 对象");
  return value as Record<string, unknown>;
}
export function keys(obj: Record<string, unknown>, expected: string[]) {
  if (
    Object.keys(obj).length !== expected.length ||
    expected.some((k) => !Object.hasOwn(obj, k))
  )
    throw new Error("字段缺失或存在未知字段");
}
export function finite(value: unknown, label: string, bound = 100): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    Math.abs(value) > bound
  )
    throw new Error(`${label} 必须是有限数字，绝对值不超过 ${bound}`);
  return value;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 80)
    throw new Error(`${label} 必须为 1–80 字符`);
  return value;
}
export function topologicalOrder(model: Model): Variable[] {
  const byId = new Map(model.variables.map((v) => [v.id, v]));
  const done = new Set<string>();
  const visiting = new Set<string>();
  const order: Variable[] = [];
  const visit = (id: string) => {
    if (done.has(id)) return;
    if (visiting.has(id))
      throw new Error("存在有向环或自环，请删除形成循环的边");
    const v = byId.get(id);
    if (!v) throw new Error(`引用了缺失的父变量：${id}`);
    visiting.add(id);
    Object.keys(v.weights).forEach(visit);
    visiting.delete(id);
    done.add(id);
    order.push(v);
  };
  model.variables.forEach((v) => visit(v.id));
  return order;
}
export function validateModel(value: unknown): Model {
  const obj = record(value);
  keys(obj, ["schemaVersion", "name", "variables"]);
  if (obj.schemaVersion !== 1) throw new Error("只支持模型 schemaVersion: 1");
  const name = text(obj.name, "模型名称");
  if (
    !Array.isArray(obj.variables) ||
    obj.variables.length < 1 ||
    obj.variables.length > MAX_VARIABLES
  )
    throw new Error(`模型需要 1–${MAX_VARIABLES} 个变量`);
  const ids = new Set<string>();
  const variables: Variable[] = obj.variables.map((item: unknown) => {
    const v = record(item);
    keys(v, ["id", "label", "kind", "intercept", "weights", "noiseStd"]);
    const id = text(v.id, "变量 ID");
    if (
      !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(id) ||
      forbidden.has(id) ||
      ids.has(id)
    )
      throw new Error(
        "变量 ID 必须唯一，使用字母开头的字母/数字/下划线（最多 24 字符），不能使用保留名称",
      );
    ids.add(id);
    if (v.kind !== "linear" && v.kind !== "bernoulli")
      throw new Error("变量类型只能是 linear 或 bernoulli");
    const weights = record(v.weights);
    const checked: Record<string, number> = {};
    if (Object.keys(weights).length > MAX_VARIABLES - 1)
      throw new Error("父变量过多");
    for (const [parent, weight] of Object.entries(weights)) {
      if (forbidden.has(parent)) throw new Error("父变量使用了保留名称");
      checked[parent] = finite(weight, "边系数");
    }
    const noiseStd = finite(v.noiseStd, "噪声标准差");
    if (noiseStd < 0 || (v.kind === "bernoulli" && noiseStd !== 0))
      throw new Error(
        "标准差必须非负；二元变量使用均匀外生噪声，noiseStd 必须为 0",
      );
    return {
      id,
      label: text(v.label, "变量名称"),
      kind: v.kind,
      intercept: finite(v.intercept, "截距/基础概率"),
      weights: checked,
      noiseStd,
    };
  });
  const model: Model = { schemaVersion: 1, name, variables };
  topologicalOrder(model);
  for (const v of variables.filter((v) => v.kind === "bernoulli")) {
    if (
      Object.keys(v.weights).some(
        (id) => variables.find((p) => p.id === id)?.kind !== "bernoulli",
      )
    )
      throw new Error(
        "二元概率方程只支持二元父变量；连续父变量请使用线性子变量",
      );
    const lo =
      v.intercept +
      Object.values(v.weights).reduce((s, w) => s + Math.min(0, w), 0);
    const hi =
      v.intercept +
      Object.values(v.weights).reduce((s, w) => s + Math.max(0, w), 0);
    if (lo < -1e-12 || hi > 1 + 1e-12)
      throw new Error(
        `${v.id} 的概率必须对所有父变量组合落在 [0,1]；当前范围 [${lo.toFixed(3)}, ${hi.toFixed(3)}]`,
      );
  }
  return model;
}
// A bounded value-keyed cache: callers cannot mutate cached definitions.
const cache = new Map<string, Compiled>();
export function compileModel(value: unknown): Compiled {
  const model = validateModel(value);
  const key = JSON.stringify(model);
  const existing = cache.get(key);
  if (existing) return existing;
  const order = topologicalOrder(model);
  model.variables.forEach((v) => {
    Object.freeze(v.weights);
    Object.freeze(v);
  });
  Object.freeze(model.variables);
  Object.freeze(model);
  const result = Object.freeze({ model, order: Object.freeze(order) });
  if (cache.size >= 16) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}
export function descendants(model: Model, id: string): string[] {
  const found = new Set<string>();
  for (const v of topologicalOrder(model))
    if (Object.keys(v.weights).some((p) => p === id || found.has(p)))
      found.add(v.id);
  return [...found];
}
export function addEdge(
  model: Model,
  parent: string,
  child: string,
  weight: number,
): Model {
  if (parent === child) throw new Error("不能建立自环");
  if (
    !model.variables.some((v) => v.id === parent) ||
    !model.variables.some((v) => v.id === child)
  )
    throw new Error("变量不存在");
  return validateModel({
    ...model,
    variables: model.variables.map((v) =>
      v.id === child
        ? { ...v, weights: { ...v.weights, [parent]: weight } }
        : v,
    ),
  });
}
export function removeVariable(model: Model, id: string): Model {
  return {
    ...model,
    variables: model.variables
      .filter((v) => v.id !== id)
      .map((v) => ({
        ...v,
        weights: Object.fromEntries(
          Object.entries(v.weights).filter(([p]) => p !== id),
        ),
      })),
  };
}
