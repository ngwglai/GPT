import { describe, expect, it } from "vitest";
import {
  addEdge,
  compileModel,
  descendants,
  removeVariable,
  topologicalOrder,
  validateModel,
  type Model,
} from "../src/core/model";
import { loadExample } from "../src/core/examples";
const fresh = () => loadExample("confounding").model;
describe("model schema and dependency graph", () => {
  it("orders shuffled definitions and reports descendants", () => {
    const m = fresh();
    m.variables.reverse();
    expect(topologicalOrder(m).map((v) => v.id)).toEqual(["U", "X", "Y"]);
    expect(descendants(m, "U")).toEqual(["X", "Y"]);
    expect(descendants(m, "Y")).toEqual([]);
  });
  it("rejects self loops and directed cycles", () => {
    const m = fresh();
    expect(() => addEdge(m, "Y", "Y", 1)).toThrow(/自环/);
    m.variables[0].weights = { Y: 1 };
    expect(() => validateModel(m)).toThrow(/有向环/);
  });
  it("rejects a missing parent and unknown edge endpoints", () => {
    const m = fresh();
    m.variables[2].weights.Z = 1;
    expect(() => validateModel(m)).toThrow(/缺失/);
    expect(() => addEdge(fresh(), "Z", "Y", 1)).toThrow(/不存在/);
  });
  it("deletes a variable together with its incoming and outgoing edges", () => {
    const m = removeVariable(fresh(), "U");
    expect(m.variables.map((v) => v.id)).toEqual(["X", "Y"]);
    expect(m.variables.every((v) => !Object.hasOwn(v.weights, "U"))).toBe(true);
    expect(validateModel(m)).toEqual(m);
  });
  it("caches immutable copies without aliasing the caller", () => {
    const m = fresh(),
      a = compileModel(m);
    expect(compileModel(fresh())).toBe(a);
    m.variables[2].weights.X = 5;
    expect(a.model.variables[2].weights.X).toBe(2);
    expect(compileModel(m)).not.toBe(a);
    expect(Object.isFrozen(a.order)).toBe(true);
  });
  it("bounds cache size and recompiles old values correctly", () => {
    for (let i = 0; i < 25; i++) {
      const m = fresh();
      m.name = "model" + i;
      compileModel(m);
    }
    expect(compileModel(fresh()).model).toEqual(fresh());
  });
  const invalid: Array<[string, (m: Model) => void]> = [
    [
      "duplicate ID",
      (m) => {
        m.variables[1].id = "U";
      },
    ],
    [
      "reserved ID",
      (m) => {
        m.variables[0].id = "constructor";
      },
    ],
    [
      "bad ID",
      (m) => {
        m.variables[0].id = "a b";
      },
    ],
    [
      "missing parents",
      (m) => {
        delete (m.variables[2] as Partial<Model["variables"][number]>).weights;
      },
    ],
    [
      "NaN",
      (m) => {
        m.variables[0].intercept = NaN;
      },
    ],
    [
      "infinite",
      (m) => {
        m.variables[2].noiseStd = Infinity;
      },
    ],
    [
      "negative noise",
      (m) => {
        m.variables[2].noiseStd = -1;
      },
    ],
    [
      "binary noise",
      (m) => {
        m.variables[0].noiseStd = 1;
      },
    ],
    [
      "too large coefficient",
      (m) => {
        m.variables[2].weights.X = 101;
      },
    ],
    [
      "invalid probability",
      (m) => {
        m.variables[1].intercept = 0.8;
      },
    ],
    [
      "negative probability",
      (m) => {
        m.variables[0].intercept = -0.01;
      },
    ],
    [
      "continuous parent of binary",
      (m) => {
        m.variables[0].kind = "linear";
      },
    ],
    [
      "empty label",
      (m) => {
        m.variables[0].label = "";
      },
    ],
    [
      "empty model",
      (m) => {
        m.variables = [];
      },
    ],
    [
      "too many nodes",
      (m) => {
        m.variables = Array.from({ length: 13 }, (_, i) => ({
          ...m.variables[0],
          id: `V${i}`,
        }));
      },
    ],
  ];
  it.each(invalid)("rejects %s", (_, mutate) => {
    const m = fresh();
    mutate(m);
    expect(() => validateModel(m)).toThrow();
  });
  it.each([null, [], {}, { schemaVersion: 2, name: "M", variables: [] }])(
    "rejects malformed root %j",
    (input) => expect(() => validateModel(input)).toThrow(),
  );
  it("rejects unknown fields and prototype keys", () => {
    expect(() => validateModel({ ...fresh(), code: "not executed" })).toThrow(
      /未知/,
    );
    const m = fresh();
    m.variables[2].weights = JSON.parse('{"__proto__":1}') as Record<
      string,
      number
    >;
    expect(() => validateModel(m)).toThrow(/保留/);
  });
});
