import type { Model, Variable } from "./model";
const binary = (
  id: string,
  label: string,
  intercept: number,
  weights: Record<string, number> = {},
): Variable => ({
  id,
  label,
  kind: "bernoulli",
  intercept,
  weights,
  noiseStd: 0,
});
const linear = (
  id: string,
  label: string,
  weights: Record<string, number>,
  noiseStd = 1,
): Variable => ({ id, label, kind: "linear", intercept: 0, weights, noiseStd });
export interface Example {
  id: string;
  title: string;
  model: Model;
  treatment: string;
  outcome: string;
  group: string;
  explanation: string;
  theory: string;
}
export const examples: Example[] = [
  {
    id: "confounding",
    title: "A · 混杂因素",
    treatment: "X",
    outcome: "Y",
    group: "U",
    model: {
      schemaVersion: 1,
      name: "混杂因素",
      variables: [
        binary("U", "混杂 U", 0.5),
        binary("X", "处理 X", 0.1, { U: 0.8 }),
        linear("Y", "结果 Y", { X: 2, U: 6 }),
      ],
    },
    explanation:
      "U 同时影响 X 与 Y。处理组有更多高 U 样本，因此朴素均值差包含混杂。按全部处理父变量 U 分层并按总体构成加权，在此完全观测且有重叠的模型中可以识别因果效应。",
    theory:
      "U ~ Bernoulli(0.5)；P(X=1|U)=0.1+0.8U；Y=2X+6U+ε，ε~N(0,1)。总体朴素差=6.8；调整差=真实 ATE=2。",
  },
  {
    id: "collider",
    title: "B · 碰撞变量",
    treatment: "A",
    outcome: "B",
    group: "C",
    model: {
      schemaVersion: 1,
      name: "碰撞变量",
      variables: [
        binary("A", "原因 A", 0.5),
        binary("B", "原因 B", 0.5),
        binary("C", "碰撞 C", 0.05, { A: 0.45, B: 0.45 }),
      ],
    },
    explanation:
      "A → C ← B，A 与 B 在总体中独立。条件筛选 C=1 后，两者可出现负关联。这是选择偏差；筛选没有替换结构方程。C 是后代，不能作为本模型的混杂调整变量。",
    theory:
      "A、B 独立 Bernoulli(0.5)；P(C=1|A,B)=0.05+0.45A+0.45B。总体相关=0；C=1 时相关≈−0.254；do(A) 对 B 的真实 ATE=0。",
  },
  {
    id: "simpson",
    title: "C · 辛普森悖论",
    treatment: "X",
    outcome: "Y",
    group: "G",
    model: {
      schemaVersion: 1,
      name: "辛普森悖论",
      variables: [
        binary("G", "子群 G", 0.5),
        binary("X", "处理 X", 0.9, { G: -0.8 }),
        linear("Y", "结果 Y", { G: 10, X: 2 }),
      ],
    },
    explanation:
      "在 G=0 与 G=1 内，处理均值差都为 +2；汇总差为 −6。高基线的 G=1 在处理组中占比较低，构成变化反转了汇总方向。模型参数保证总体反转；很小的随机样本未必呈现该现象。",
    theory:
      "G ~ Bernoulli(0.5)；P(X=1|G)=0.9−0.8G；Y=10G+2X+ε。组内差=2，汇总差=−6，真实 ATE=2。",
  },
];
export function loadExample(id: string): Example {
  const example = examples.find((e) => e.id === id);
  if (!example) throw new Error("案例不存在");
  return structuredClone(example);
}
