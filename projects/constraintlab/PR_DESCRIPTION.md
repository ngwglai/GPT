## ConstraintLab v0.1.0

新增可本地运行的 CSP 算法实验平台，支持通过浏览器编辑问题、使用自主实现的 BT/FC/MAC 求解、回放有界搜索轨迹，并在相同实例上比较算法及导出可复现实验记录。不会修改 RepoScope。

- 严格整数有限域 JSON、一元/二元比较、AllDifferent、Sum、声明组合、独立验证器与穷举 oracle。
- 五类内置问题，四种变量启发式、三种取值策略；解枚举、超时、节点限额、取消和明确的完成语义。
- React/TypeScript 界面、本地 FastAPI 服务、CLI/Python API、Windows/Linux 启动脚本、示例与算法/测试文档。
- 实验支持多规模、多配置、多次重复；统计、条形图、JSON/CSV 包含问题/配置/种子/环境。

验证：11 项后端测试通过（含 120 个随机 CSP 完整解集合差分、N=1–8 皇后计数）；3 项 Chromium E2E 通过；TypeScript/Vite 构建、Python wheel、静态检查及依赖审计通过。性能实测与完整边界见 docs/VALIDATION.md。

限制：Windows 原生未测试；MAC 仅二元弧一致性，Sum 为安全边界推理，高元约束传播较弱；轨迹为计算后回放且可截断；峰值内存为 null。请按 README 和测试报告在 Windows 验收，未经确认不合并 main。
