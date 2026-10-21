import type { Value } from "./ast";
import type { Bytecode, Instruction } from "./bytecode";
import {
  budget,
  fail,
  LabError,
  LIMITS,
  origin,
  type Diagnostic,
} from "./diagnostics";
import { binary, isValue, unary, type Outcome } from "./runtime";
import type { Snapshot, TraceEntry } from "./trace";
export class VirtualMachine {
  private readonly bytecode: Bytecode;
  private pc = 0;
  private stack: Value[] = [];
  private variables = new Map<number, Value>();
  private frames: number[][] = [[]];
  private logicalBoundaries: { target: number; depth: number }[] = [];
  private output: string[] = [];
  private steps = 0;
  private done = false;
  private error?: Diagnostic;
  private readonly maxSteps: number;
  private readonly maxOutput: number;
  private entries: TraceEntry[] = [];
  constructor(
    code: Bytecode,
    maxSteps: number = LIMITS.steps,
    maxOutput: number = LIMITS.output,
  ) {
    this.maxSteps = budget(maxSteps, LIMITS.steps);
    this.maxOutput = budget(maxOutput, LIMITS.output);
    if (
      code.instructions.length > LIMITS.instructions ||
      code.symbols.length > LIMITS.symbols
    )
      fail("ResourceLimit", "字节码规模超限");
    this.bytecode = structuredClone(code);
  }
  snapshot(): Snapshot {
    return {
      pc: this.pc,
      stack: [...this.stack],
      variables: Object.fromEntries(
        [...this.variables].map(([slot, value]) => [
          `${this.bytecode.symbols[slot].name}@${slot}`,
          value,
        ]),
      ),
      output: [...this.output],
      done: this.done,
    };
  }
  get trace(): TraceEntry[] {
    return structuredClone(this.entries);
  }
  outcome(): Outcome {
    return {
      output: [...this.output],
      globals: Object.fromEntries(
        [...this.variables]
          .filter(([slot]) => this.bytecode.symbols[slot].depth === 0)
          .map(([slot, value]) => [this.bytecode.symbols[slot].name, value]),
      ),
      ...(this.error ? { error: structuredClone(this.error) } : {}),
    };
  }
  step(): TraceEntry | undefined {
    if (this.done) return;
    const before = this.snapshot();
    const instruction: Instruction | undefined =
      this.bytecode.instructions[this.pc];
    // A failed instruction commits no stack, environment, frame, output, or PC changes.
    const stack = [...this.stack],
      variables = new Map(this.variables),
      frames = this.frames.map((frame) => [...frame]),
      boundaries = this.logicalBoundaries.map((boundary) => ({ ...boundary })),
      output = [...this.output];
    let next = this.pc + 1;
    const span = instruction?.span ?? origin;
    const invalid = (message: string): never =>
      fail("InvalidBytecode", message, span);
    function pop(): Value {
      if (!stack.length) return invalid("操作数栈下溢");
      return stack.pop()!;
    }
    function jump(target: number) {
      if (!Number.isInteger(target) || target < 0 || target >= codeLength)
        invalid("跳转目标无效");
      next = target;
    }
    const codeLength = this.bytecode.instructions.length;
    try {
      if (this.steps >= this.maxSteps)
        fail("ResourceLimit", "虚拟机指令预算耗尽", span);
      this.steps++;
      // A non-short-circuited AND/OR must produce exactly one boolean at its
      // continuation. Validate before executing that instruction (e.g. PRINT),
      // so malformed RHS bytecode cannot consume or publish a non-boolean.
      while (boundaries.at(-1)?.target === this.pc) {
        const boundary = boundaries.pop()!;
        if (
          stack.length !== boundary.depth + 1 ||
          typeof stack.at(-1) !== "boolean"
        )
          invalid("逻辑右操作数必须产生一个 bool");
      }
      if (boundaries.some((boundary) => boundary.target <= this.pc))
        invalid("逻辑右操作数的校验边界被跳过或交叉");
      if (!instruction) invalid("PC 超出字节码");
      const ins = instruction!;
      switch (ins.op) {
        case "PUSH":
          if (!isValue(ins.value)) invalid("常量无效");
          stack.push(ins.value);
          break;
        case "LOAD":
          if (!variables.has(ins.slot)) invalid("读取未初始化槽位");
          stack.push(variables.get(ins.slot)!);
          break;
        case "DECLARE":
        case "STORE": {
          const symbol = this.bytecode.symbols[ins.slot];
          if (!symbol || symbol.id !== ins.slot) invalid("符号槽位无效");
          const value = pop();
          if ((typeof value === "boolean" ? "bool" : "int") !== symbol.type)
            invalid("存储类型不匹配");
          if (ins.op === "DECLARE") {
            if (variables.has(ins.slot) || symbol.depth !== frames.length - 1)
              invalid("声明槽位或作用域无效");
            frames.at(-1)!.push(ins.slot);
          } else if (!variables.has(ins.slot)) invalid("赋值目标未初始化");
          variables.set(ins.slot, value);
          break;
        }
        case "UNARY":
          stack.push(unary(ins.operator, pop(), span));
          break;
        case "BINARY": {
          const right = pop(),
            left = pop();
          stack.push(binary(ins.operator, left, right, span));
          break;
        }
        case "PRINT": {
          const value = pop();
          if (output.length >= this.maxOutput)
            fail("ResourceLimit", "输出行数超限", span);
          output.push(String(value));
          break;
        }
        case "JUMP":
          jump(ins.target);
          break;
        case "JUMP_FALSE": {
          const value = pop();
          if (typeof value !== "boolean") invalid("分支条件必须为 bool");
          if (!value) jump(ins.target);
          break;
        }
        case "AND":
        case "OR": {
          if (
            !Number.isInteger(ins.target) ||
            ins.target <= this.pc ||
            ins.target >= codeLength
          )
            invalid("短路指令必须指向有效的前向边界");
          const value = pop();
          if (typeof value !== "boolean") invalid("短路条件必须为 bool");
          if (
            (ins.op === "AND" && value === false) ||
            (ins.op === "OR" && value === true)
          ) {
            stack.push(value);
            jump(ins.target);
          } else {
            if (boundaries.length >= LIMITS.depth)
              invalid("逻辑表达式嵌套超限");
            boundaries.push({ target: ins.target, depth: stack.length });
          }
          break;
        }
        case "ENTER":
          if (frames.length >= LIMITS.depth) invalid("作用域深度超限");
          frames.push([]);
          break;
        case "LEAVE":
          if (frames.length === 1) invalid("不能离开顶层作用域");
          for (const slot of frames.pop()!) variables.delete(slot);
          break;
        case "HALT":
          if (stack.length || frames.length !== 1 || boundaries.length)
            invalid("终止状态不平衡");
          this.done = true;
          break;
        default:
          invalid("未知指令");
      }
      this.pc = next;
      this.stack = stack;
      this.variables = variables;
      this.frames = frames;
      this.logicalBoundaries = boundaries;
      this.output = output;
    } catch (error) {
      if (!(error instanceof LabError)) throw error;
      this.error = error.diagnostic;
      this.done = true;
    }
    const entry: TraceEntry = {
      step: this.entries.length + 1,
      instruction,
      before,
      after: this.snapshot(),
      ...(this.error ? { error: this.error } : {}),
    };
    this.entries.push(structuredClone(entry));
    return structuredClone(entry);
  }
  run(): Outcome {
    while (!this.done) this.step();
    return this.outcome();
  }
}
