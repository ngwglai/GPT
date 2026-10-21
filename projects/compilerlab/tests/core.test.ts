import { describe, expect, it } from "vitest";
import {
  analyze,
  checkAst,
  children,
  compile,
  compileBytecode,
  formatInstruction,
  interpret,
  LabError,
  lex,
  LIMITS,
  MAX_INT,
  optimize,
  origin,
  parse,
  VirtualMachine,
  type BinaryOp,
  type Bytecode,
  type Outcome,
  type Program,
} from "../src/core";
import { examples } from "../src/examples";

function ready(source: string) {
  const result = compile(source);
  expect(result.diagnostics, source).toEqual([]);
  expect(result.originalCode).toBeDefined();
  expect(result.optimizedCode).toBeDefined();
  return result as typeof result & {
    originalCode: Bytecode;
    optimizedCode: Bytecode;
  };
}
function observation(result: Outcome) {
  return {
    output: result.output,
    globals: result.globals,
    code: result.error?.code,
    location: result.error?.span,
  };
}
function paths(source: string) {
  const result = ready(source);
  const direct = interpret(result.analysis!.program);
  const optimizedDirect = interpret(result.optimized!);
  const before = new VirtualMachine(result.originalCode),
    after = new VirtualMachine(result.optimizedCode);
  const raw = before.run(),
    folded = after.run();
  expect(observation(raw), source).toEqual(observation(direct));
  expect(observation(folded), source).toEqual(observation(direct));
  expect(observation(optimizedDirect), source).toEqual(observation(direct));
  for (const vm of [before, after]) {
    const trace = vm.trace;
    expect(trace.length).toBeGreaterThan(0);
    expect(trace[0].before.pc).toBe(0);
    for (let i = 0; i < trace.length; i++) {
      expect(trace[i].step).toBe(i + 1);
      if (i) expect(trace[i].before).toEqual(trace[i - 1].after);
    }
    expect(trace.at(-1)!.after.done).toBe(true);
  }
  return { direct, before, after, result };
}

describe("Lexer / Parser / AST", () => {
  it("tracks UTF-16 positions, comments and CRLF accurately", () => {
    const tokens = lex("// 中文😀\r\nlet x: int = 12;\nprint(x);");
    expect(tokens[0]).toMatchObject({
      text: "let",
      span: { start: { offset: 9, line: 2, column: 1 } },
    });
    expect(tokens.find((t) => t.text === "12")).toMatchObject({
      kind: "integer",
      span: { start: { line: 2, column: 14 }, end: { line: 2, column: 16 } },
    });
    expect(tokens.at(-1)).toMatchObject({
      kind: "eof",
      span: { start: { line: 3, column: 10 } },
    });
  });
  it("recognizes every operator without conflating assignment/equality", () => {
    expect(
      lex("= == != <= >= < > && || ! + - * /")
        .slice(0, -1)
        .map((t) => t.text),
    ).toEqual([
      "=",
      "==",
      "!=",
      "<=",
      ">=",
      "<",
      ">",
      "&&",
      "||",
      "!",
      "+",
      "-",
      "*",
      "/",
    ]);
  });
  it("builds real nodes with left associativity and correct precedence", () => {
    const ast = parse("print(9 - 3 - 1 * 2);");
    expect(children(ast)[0].kind).toBe("print");
    const node = ast.body[0];
    expect(node.kind === "print" && node.value).toMatchObject({
      kind: "binary",
      op: "-",
      left: { kind: "binary", op: "-" },
      right: { kind: "binary", op: "*" },
    });
    expect(
      paths("print(9 - 3 - 1 * 2); print(!false && false || true);").direct
        .output,
    ).toEqual(["4", "true"]);
  });
  it.each([
    "@",
    "&",
    "|",
    'print("x");',
    "let 2x: int = 1;",
    "print(1)",
    "let x = 1;",
    "if (true) { print(1);",
    "else {}",
    "print();",
    "print((1);",
    "x + 1;",
    "print(1 2);",
    "if (true) print(1);",
  ])("rejects invalid syntax: %s", (source) => {
    const result = compile(source);
    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.originalCode).toBeUndefined();
    expect(result.diagnostics[0].span.start.line).toBeGreaterThan(0);
  });
  it("rejects host language input", () => {
    for (const source of [
      "eval(1);",
      "new Function();",
      "while (true) {}",
      "print(window);",
      "let a: int = [1];",
      "print(fetch(1));",
    ])
      expect(compile(source).diagnostics.length).toBeGreaterThan(0);
  });
  it("bounds long sources, token streams, recursive grammar and left-deep AST", () => {
    expect(compile(" ".repeat(LIMITS.source + 1)).diagnostics[0].code).toBe(
      "ResourceLimit",
    );
    expect(compile("1 ".repeat(LIMITS.tokens)).diagnostics[0].code).toBe(
      "ResourceLimit",
    );
    expect(
      compile(`print(${"(".repeat(50)}1${")".repeat(50)});`).diagnostics[0]
        .code,
    ).toBe("ResourceLimit");
    expect(
      compile(`print(${Array(50).fill("1").join("+")});`).diagnostics[0].code,
    ).toBe("ResourceLimit");
    expect(compile("print(1);".repeat(260)).diagnostics[0].code).toBe(
      "ResourceLimit",
    );
    expect(
      compile("if(true){".repeat(40) + "}".repeat(40)).diagnostics[0].code,
    ).toBe("ResourceLimit");
  });
});

describe("Semantic analyzer", () => {
  it.each([
    ["print(missing);", "UndeclaredVariable"],
    ["x = 1;", "UndeclaredVariable"],
    ["let x: int = x;", "UndeclaredVariable"],
    ["let x: int = 1; let x: int = 2;", "DuplicateDeclaration"],
    ["let x: bool = 1;", "TypeMismatch"],
    ["let x: int = true;", "TypeMismatch"],
    ["let x: int = 1; x = false;", "TypeMismatch"],
    ["if(1) { print(1); }", "TypeMismatch"],
    ["print(true + 1);", "TypeMismatch"],
    ["print(true < false);", "TypeMismatch"],
    ["print(1 == true);", "TypeMismatch"],
    ["print(1 && false);", "TypeMismatch"],
    ["print(!1);", "TypeMismatch"],
    ["print(-false);", "TypeMismatch"],
    ["if(false) { print(undeclared); }", "UndeclaredVariable"],
    ["print(true || (1 == false));", "TypeMismatch"],
    ["if(true) { let y: int = 1; } print(y);", "UndeclaredVariable"],
    ["print(2147483648);", "IntegerRange"],
    ["print(-2147483648);", "IntegerRange"],
  ])("%s → %s", (source, code) => {
    const result = compile(source);
    expect(result.diagnostics.map((d) => d.code)).toContain(code);
    expect(result.optimizedCode).toBeUndefined();
  });
  it("does not annotate the input tree; shadow initializer sees outer binding", () => {
    const raw = parse(
      "let x: int = 2; if(true) { let x: int = x + 1; print(x); }",
    );
    const original = structuredClone(raw),
      result = analyze(raw);
    expect(raw).toEqual(original);
    expect(result.diagnostics).toEqual([]);
    expect(result.symbols.map((s) => [s.id, s.name, s.depth])).toEqual([
      [0, "x", 0],
      [1, "x", 1],
    ]);
  });
  it("caps declarations independently of AST node cap", () => {
    expect(
      compile(
        Array.from({ length: 129 }, (_, i) => `let a${i}: int = 0;`).join(""),
      ).diagnostics[0].code,
    ).toBe("ResourceLimit");
  });
  it("reports multiple semantic errors with real source spans", () => {
    const result = compile("let x: bool = 1;\nprint(nope);");
    expect(result.diagnostics.map((d) => [d.code, d.span.start.line])).toEqual([
      ["TypeMismatch", 1],
      ["UndeclaredVariable", 2],
    ]);
  });
});

describe("Independent hand-calculated semantics / optimization equivalence", () => {
  it.each(["+", "-", "*", "/"])(
    "exhaustive small integer oracle for %s",
    (op) => {
      // JS arithmetic is exact in this deliberately tiny domain; Math.trunc gives
      // an independent division oracle, separate from both BigInt evaluators.
      for (let a = -8; a <= 8; a++)
        for (let b = -8; b <= 8; b++) {
          const code = ready(`print(${a} ${op} ${b});`);
          const direct = interpret(code.analysis!.program);
          const raw = new VirtualMachine(code.originalCode).run();
          const folded = new VirtualMachine(code.optimizedCode).run();
          if (op === "/" && b === 0) {
            for (const result of [direct, raw, folded])
              expect(result.error?.code).toBe("DivisionByZero");
          } else {
            const expected = String(
              op === "+"
                ? a + b
                : op === "-"
                  ? a - b
                  : op === "*"
                    ? a * b
                    : Math.trunc(a / b),
            );
            for (const result of [direct, raw, folded]) {
              expect(result.error).toBeUndefined();
              expect(result.output).toEqual([expected]);
            }
          }
        }
    },
  );
  it.each([
    [
      "print(7 / 2); print(-7 / 2); print(7 / -2); print(-7 / -2); print(-0);",
      ["3", "-3", "-3", "3", "0"],
    ],
    ["print(1 + 2 * 3 == 7 && !false); print(9 / 3 / 3);", ["true", "1"]],
    [
      "print(1 < 2); print(2 <= 2); print(3 > 2); print(3 >= 4); print(1 != 2); print(false == false);",
      ["true", "true", "true", "false", "true", "true"],
    ],
    [
      "print(false && (1/0 == 0)); print(true || (2147483647 + 1 == 0));",
      ["false", "true"],
    ],
    [
      "let x: int = 1; if (false) { x = 8; } else { if (true) { x = 4; } } print(x);",
      ["4"],
    ],
    [
      "let x: int = 2; if(true) { let x: int = x+1; print(x); } print(x);",
      ["3", "2"],
    ],
    ["if(true) {let y: int = 2;} else {let y: bool = true;} print(0);", ["0"]],
    [
      "let __proto__: int = 1; let constructor: int = 2; __proto__ = constructor + 3; print(__proto__);",
      ["5"],
    ],
  ])("hand oracle: %s", (source, output) =>
    expect(paths(source).direct.output).toEqual(output),
  );
  it.each([
    ["print(1/0);", "DivisionByZero"],
    ["print(2147483647 + 1);", "Overflow"],
    ["print(-2147483647 - 1);", "Overflow"],
    ["print(50000 * 50000);", "Overflow"],
    ["print((1/0 == 0) && false);", "DivisionByZero"],
    ["print((2147483647+1 == 0) || true);", "Overflow"],
    ["print(true && (1/0 == 0));", "DivisionByZero"],
    ["print(false || (1/0 == 0));", "DivisionByZero"],
    ["print(1 / (2147483647 + 1));", "Overflow"],
  ])("preserves language error: %s", (source, code) =>
    expect(paths(source).direct.error?.code).toBe(code),
  );
  it("preserves output and global state at the precise failing assignment", () => {
    const { direct, before } = paths(
      "let x: int = 4; print(x); if(true) { x = 7; let y: int = 5; x = y / 0; }",
    );
    expect(direct.output).toEqual(["4"]);
    expect(direct.globals).toEqual({ x: 7 });
    const failure = before.trace.at(-1)!;
    expect(failure.after.stack).toEqual(failure.before.stack);
    expect(failure.after.variables).toEqual(failure.before.variables);
    expect(failure.after.pc).toBe(failure.before.pc);
    expect(failure.error?.span.start.column).toBe(65);
  });
  it("folds real AST nodes and emits fewer instructions without mutating source", () => {
    const { result, before, after } = paths(
      "let x: int = 2 + 3 * 4; print(true && (x == 14));",
    );
    expect(result.optimized!.body[0]).toMatchObject({
      kind: "let",
      value: { kind: "literal", value: 14 },
    });
    expect(result.analysis!.program.body[0]).toMatchObject({
      value: { kind: "binary" },
    });
    expect(after.trace.length).toBeLessThan(before.trace.length);
    expect(result.optimizedCode.instructions.length).toBeLessThan(
      result.originalCode.instructions.length,
    );
  });
  it("leaves faulting constant expressions in the AST", () => {
    const result = ready("print(1 / 0);");
    expect(result.optimized!.body[0]).toMatchObject({
      value: { kind: "binary", op: "/" },
    });
  });
  it("runs all published examples against their hand-written expected output", () => {
    for (const example of examples.slice(0, 3))
      expect(paths(example.source).direct.output.join("\n")).toBe(
        example.expected,
      );
  });
  it("empty program terminates with empty output and state", () =>
    expect(paths("").direct).toEqual({ output: [], globals: {} }));
});

describe("Bytecode, VM and trace integrity", () => {
  it("emits the expected exact unoptimized instruction sequence", () => {
    const result = ready("let x: int = 1+2; print(x);");
    expect(result.originalCode.instructions.map(formatInstruction)).toEqual([
      "PUSH 1",
      "PUSH 2",
      "BINARY +",
      "DECLARE #0",
      "LOAD #0",
      "PRINT",
      "HALT",
    ]);
  });
  it("emits valid jump destinations and skips the short-circuited code", () => {
    const { result, before } = paths(
      "print(false && (1 / 0 == 1)); if(false){print(7);}else{print(8);}",
    );
    for (const ins of result.originalCode.instructions)
      if ("target" in ins)
        expect(ins.target).toBeLessThan(
          result.originalCode.instructions.length,
        );
    expect(
      before.trace.some(
        (t) => t.instruction?.op === "BINARY" && t.instruction.operator === "/",
      ),
    ).toBe(false);
    const and = before.trace.find((t) => t.instruction?.op === "AND")!;
    expect(and.after.stack).toEqual([false]);
    expect(and.after.pc).toBeGreaterThan(and.before.pc + 1);
  });
  it("single step and continue follow the exact bytecode and deterministic snapshots", () => {
    const code = ready("let x: int = 3; print(x+2);").originalCode;
    const one = new VirtualMachine(code),
      two = new VirtualMachine(code);
    expect(one.step()).toMatchObject({
      before: { pc: 0, stack: [] },
      after: { pc: 1, stack: [3] },
    });
    one.run();
    two.run();
    expect(one.trace).toEqual(two.trace);
    for (const entry of one.trace)
      expect(entry.instruction).toEqual(code.instructions[entry.before.pc]);
    expect(one.step()).toBeUndefined();
  });
  it("trace, snapshots, outcomes and bytecode are isolated from caller mutation", () => {
    const code = ready("print(1);").originalCode,
      vm = new VirtualMachine(code);
    code.instructions[0] = { op: "PUSH", value: 9, span: origin };
    const entry = vm.step()!;
    entry.after.stack[0] = 99;
    vm.snapshot().stack.push(5);
    vm.trace[0].after.stack.push(6);
    expect(vm.run().output).toEqual(["1"]);
    vm.outcome().output.push("mutated");
    expect(vm.outcome().output).toEqual(["1"]);
  });
  it("removes only local slots on LEAVE", () => {
    const vm = paths(
      "let x: int = 2; if(true){let y: int = 3; x=y;} print(x);",
    ).before;
    const leave = vm.trace.find((t) => t.instruction?.op === "LEAVE")!;
    expect(leave.before.variables).toEqual({ "x@0": 3, "y@1": 3 });
    expect(leave.after.variables).toEqual({ "x@0": 3 });
  });
  it.each([
    ["AND", true],
    ["OR", false],
  ] as const)("validates the evaluated RHS of %s before PRINT", (op, left) => {
    const vm = new VirtualMachine({
      symbols: [],
      instructions: [
        { op: "PUSH", value: left, span: origin },
        { op, target: 3, span: origin },
        { op: "PUSH", value: 1, span: origin },
        { op: "PRINT", span: origin },
        { op: "HALT", span: origin },
      ],
    });
    expect(vm.run()).toMatchObject({
      output: [],
      error: { code: "InvalidBytecode" },
    });
    const failure = vm.trace.at(-1)!;
    expect(failure.before.pc).toBe(3);
    expect(failure.after.stack).toEqual(failure.before.stack);
    expect(failure.after.pc).toBe(failure.before.pc);
  });
  it.each([
    ["AND", false],
    ["OR", true],
  ] as const)("does not validate skipped RHS values of %s", (op, left) => {
    const vm = new VirtualMachine({
      symbols: [],
      instructions: [
        { op: "PUSH", value: left, span: origin },
        { op, target: 3, span: origin },
        { op: "PUSH", value: 1, span: origin },
        { op: "PRINT", span: origin },
        { op: "HALT", span: origin },
      ],
    });
    expect(vm.run()).toEqual({ output: [String(left)], globals: {} });
    expect(vm.trace.some((entry) => entry.before.pc === 2)).toBe(false);
  });
  it("checks nested boolean joins sharing a continuation", () => {
    for (const right of [true, 1]) {
      const vm = new VirtualMachine({
        symbols: [],
        instructions: [
          { op: "PUSH", value: true, span: origin },
          { op: "AND", target: 5, span: origin },
          { op: "PUSH", value: false, span: origin },
          { op: "OR", target: 5, span: origin },
          { op: "PUSH", value: right, span: origin },
          { op: "PRINT", span: origin },
          { op: "HALT", span: origin },
        ],
      });
      const result = vm.run();
      expect(result.error?.code).toBe(
        right === true ? undefined : "InvalidBytecode",
      );
      expect(result.output).toEqual(right === true ? ["true"] : []);
    }
  });
  it("rejects bytecode jumping past a pending logical boundary", () => {
    const vm = new VirtualMachine({
      symbols: [],
      instructions: [
        { op: "PUSH", value: true, span: origin },
        { op: "AND", target: 4, span: origin },
        { op: "PUSH", value: 1, span: origin },
        { op: "JUMP", target: 5, span: origin },
        { op: "HALT", span: origin },
        { op: "PRINT", span: origin },
        { op: "HALT", span: origin },
      ],
    });
    expect(vm.run()).toMatchObject({
      output: [],
      error: { code: "InvalidBytecode" },
    });
  });
  it.each([
    [{ op: "PRINT", span: origin }],
    [{ op: "JUMP", target: -1, span: origin }],
    [
      { op: "PUSH", value: 1, span: origin },
      { op: "JUMP_FALSE", target: 0, span: origin },
    ],
    [{ op: "LOAD", slot: 0, span: origin }],
    [{ op: "STORE", slot: 0, span: origin }],
    [{ op: "LEAVE", span: origin }],
    [{ op: "PUSH", value: NaN, span: origin }],
    [
      { op: "PUSH", value: 1, span: origin },
      { op: "HALT", span: origin },
    ],
    [{ op: "BOGUS", span: origin }],
  ])("rejects damaged bytecode %#", (...instructions) => {
    const code = { instructions, symbols: [] } as unknown as Bytecode;
    expect(new VirtualMachine(code).run().error?.code).toBe("InvalidBytecode");
  });
  it("terminates backward jumps via an explicit step budget and bounded trace", () => {
    const vm = new VirtualMachine(
      { instructions: [{ op: "JUMP", target: 0, span: origin }], symbols: [] },
      3,
    );
    expect(vm.run().error?.code).toBe("ResourceLimit");
    expect(vm.trace).toHaveLength(4);
  });
  it("bounds output independently and preserves previous lines", () => {
    const result = ready("print(1);print(2);");
    const vm = new VirtualMachine(result.originalCode, LIMITS.steps, 1);
    const direct = interpret(result.analysis!.program, LIMITS.steps, 1);
    expect(observation(vm.run())).toEqual(observation(direct));
    expect(direct.output).toEqual(["1"]);
  });
  it("enforces interpreter budget; invalid budgets fail before running", () => {
    const ast = parse("print(1+2);");
    expect(interpret(ast, 1).error?.code).toBe("ResourceLimit");
    for (const value of [0, -1, NaN, Infinity, 1.5, LIMITS.steps + 1]) {
      expect(() => interpret(ast, value)).toThrow(LabError);
      expect(() => new VirtualMachine(ready("").originalCode, value)).toThrow(
        LabError,
      );
    }
  });
  it("applies AST limits consistently to lower-level public passes", () => {
    const ast: Program = {
      kind: "program",
      body: Array(513).fill({
        kind: "print",
        value: { kind: "literal", value: 1, span: origin },
        span: origin,
      }),
      span: origin,
    };
    for (const action of [
      () => checkAst(ast),
      () => analyze(ast),
      () => optimize(ast),
      () => interpret(ast),
      () => compileBytecode(ast, []),
    ])
      expect(action).toThrow(LabError);
  });
});

// Source generator does not import interpreter or VM internals; seed + source are the reproducer.
function generate(seed: number) {
  let state = seed >>> 0;
  const pick = (n: number) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
  const intExpr = (depth: number): string => {
    if (!depth)
      return ["x", "y", String(pick(15) - 7), "0", String(MAX_INT)][pick(5)];
    const op = (["+", "-", "*", "/"] as BinaryOp[])[pick(4)];
    return `(${intExpr(depth - 1)} ${op} ${intExpr(depth - 1)})`;
  };
  const boolExpr = (depth: number): string => {
    if (!depth)
      return [
        "true",
        "false",
        "flag",
        `(${intExpr(1)} ${["==", "!=", "<", "<=", ">", ">="][pick(6)]} ${intExpr(0)})`,
      ][pick(4)];
    return pick(3) === 0
      ? `!(${boolExpr(depth - 1)})`
      : `(${boolExpr(depth - 1)} ${pick(2) ? "&&" : "||"} ${boolExpr(depth - 1)})`;
  };
  let source = `let x: int = ${pick(11) - 5}; let y: int = ${pick(11) - 5}; let flag: bool = ${pick(2) ? "true" : "false"};\n`;
  for (let i = 0; i < 5; i++) {
    switch (pick(5)) {
      case 0:
        source += `x = ${intExpr(2)};\n`;
        break;
      case 1:
        source += `flag = ${boolExpr(1)}; print(flag);\n`;
        break;
      case 2:
        source += `if (${boolExpr(1)}) { let x: int = x + 1; if(flag) {y = x;} else {y = 2;} print(x); } else {y = ${intExpr(1)};}\n`;
        break;
      case 3:
        source += `print(${intExpr(2)});\n`;
        break;
      case 4:
        source += `print(${boolExpr(2)});\n`;
        break;
    }
  }
  return source + "print(x); print(y); print(flag);";
}
describe("Fixed-seed AST interpreter / raw VM / optimized VM differential", () => {
  it.each(Array.from({ length: 160 }, (_, i) => i + 1))(
    "seed %i (source printed on mismatch)",
    (seed) => {
      const source = generate(seed);
      try {
        paths(source);
      } catch (error) {
        throw new Error(`可复现 seed=${seed}\n${source}\n${String(error)}`, {
          cause: error,
        });
      }
    },
  );
  it("generator itself is reproducible", () =>
    expect(generate(42)).toBe(generate(42)));
  it("generated corpus contains successes, division faults and overflows", () => {
    const outcomes = new Set(
      Array.from({ length: 160 }, (_, i) => {
        const code = ready(generate(i + 1));
        return interpret(code.analysis!.program).error?.code ?? "success";
      }),
    );
    expect(outcomes).toEqual(
      new Set(["success", "DivisionByZero", "Overflow"]),
    );
  });
});
