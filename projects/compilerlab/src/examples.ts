export const examples = [
  {
    name: "分支与常量折叠",
    expected: "21\ntrue",
    source: `// 声明、分支、常量折叠\nlet base: int = 2 + 3 * 4;\nlet total: int = base;\nif (base >= 10) {\n  total = total + 7;\n} else {\n  total = 0;\n}\nprint(total);\nprint(true && (total == 21));`,
  },
  {
    name: "布尔短路",
    expected: "false\ntrue\n-3",
    source: `// 右侧除零不会被求值\nlet safe: bool = false && (1 / 0 == 0);\nprint(safe);\nprint(true || (2147483647 + 1 == 0));\nprint(-7 / 2);`,
  },
  {
    name: "嵌套作用域",
    expected: "11\n6\n3",
    source: `let x: int = 3;\nif (x > 0) {\n  let x: int = x + 3;\n  if (x == 6) {\n    let y: int = x + 5;\n    print(y);\n  } else {\n    print(0);\n  }\n  print(x);\n}\nprint(x);`,
  },
  {
    name: "运行时除零",
    expected: "先输出 8，再报告 DivisionByZero",
    source: `let n: int = 8;\nprint(n);\nn = n / (3 - 3);\nprint(n);`,
  },
  {
    name: "类型错误定位",
    expected: "第 2 行 TypeMismatch",
    source: `let enabled: bool = true;\nlet count: int = enabled + 1;\nprint(count);`,
  },
];
