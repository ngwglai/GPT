import type { Config, Spec } from './config';
import { interpret } from './dsl';
export function reference(spec: Spec, input: number[]): number | null {
  if (spec.kind === 'expression') return interpret(spec.ast, input) as number | null;
  const x = input[0];
  switch (spec.name) {
    case 'Max2': return Math.max(x, input[1]);
    case 'Abs': return Math.abs(x);
    case 'Clamp': return Math.min(2, Math.max(-2, x));
    case 'Sign': return Math.sign(x) || 0;
  }
}
export function* domainInputs(c: Pick<Config, 'variables' | 'domain'>): Generator<number[]> {
  for (let x = c.domain.min; x <= c.domain.max; x++) {
    if (c.variables === 1) yield [x];
    else for (let y = c.domain.min; y <= c.domain.max; y++) yield [x, y];
  }
}
