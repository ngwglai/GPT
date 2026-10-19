import type { Config, Name } from './config';
export const lessons: Record<Name, string> = {
  Max2: '从相等输入起步，候选可能过拟合为 x。验证将寻找次序不同的真实反例，学习比较与条件选择。',
  Abs: '从正数样例起步，负数会反驳恒等程序。减法构造相反数；条件只计算所选分支。',
  Clamp: '固定边界为 [-2, 2]，输入仍为单个 x。需要两个条件处理下界、上界与区间内部。',
  Sign: '从正数起步，零与负数驱动 CEGIS 学习三段函数。通过只意味着指定有限输入域内成立。',
};
export function preset(name: Name): Config {
  return { version: 1, variables: name === 'Max2' ? 2 : 1, constants: name === 'Clamp' ? [-2, 0, 2] : [-1, 0, 1],
    operators: name === 'Abs' ? ['sub', 'lt', 'if'] : ['lt', 'if'],
    examples: name === 'Max2' ? [{ input: [1, 1], output: 1 }] : [{ input: [1], output: 1 }],
    domain: { min: -3, max: 3 }, spec: { kind: 'builtin', name },
    budget: { maxNodes: name === 'Max2' ? 6 : name === 'Abs' ? 8 : 11, maxCandidates: 2_000_000, maxStored: 20_000, timeMs: 15000, maxIterations: 16, verifyLimit: 4096 } };
}
