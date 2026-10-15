# ConstraintLab v0.1.0

面向 CSP 学习者与算法研究者的本地有限域约束实验室。自主实现 BT、FC、MAC，不依赖 CSP/SAT 求解器、付费 API、GPU 或云端服务。Python 核心可独立使用；React 浏览器界面由本机服务提供。

## 功能

- 严格 JSON 模型：整数有限域、一元/二元比较、AllDifferent、Sum、允许元组表、AND/OR 组合。禁止代码表达式。
- BT、FC、二元 AC-3 MAC；固定顺序、MRV、Degree、Dom/Ddeg；自然、LCV、固定种子随机取值。
- 4×4 / 9×9 数独（网格与初始串编辑）、N 皇后（1–32）、图着色（边列表编辑）、澳大利亚地图着色、课程/教师/教室排课示例。
- 首解/多解、超时/节点上限、取消；SAT/UNSAT/UNKNOWN/ERROR，单独报告枚举完成标志。
- 棋盘、着色图、决策路径、完整状态轨迹回放，前后步、速度、暂停和域变化。轨迹截断显式提示。
- 多实例/多配置/多次重复实验，耗时/节点条形图及统计表；JSON 用 `problems`（按哈希去重）和 `rows`（引用 `problem_id`）保存完整复现信息；CSV 仅在每个问题的首条记录包含完整问题 JSON，后续重复行的 `problem` 单元格为空，其余配置、种子、环境和状态逐行保留。
- 独立完整赋值验证器、笛卡尔积参考求解器与随机差分测试。

## 安装与 Windows 启动

安装 **Python 3.11+**（启用 `py` 启动器）、**Node.js 20.19+**（建议 Node 22/24 LTS）。首次安装需要网络下载开源依赖。下载仓库后双击 `start-windows.cmd`，或在本目录执行：

```bat
start-windows.cmd
```

看到服务启动后访问 **http://127.0.0.1:8765**。Ctrl+C 停止服务。脚本创建项目内 `.venv`、安装 Python 包、用锁文件安装前端依赖并构建。端口占用时关闭之前的 ConstraintLab 实例。

已安装构建后，无网络启动：

```bat
.venv\Scripts\python.exe -m constraintlab.cli --serve
```

**Windows Server 2025 原生自动验收已通过：启动脚本、含空格和中文路径、后端测试及浏览器流程均实测。用户电脑的人工双击验收未执行；证据见测试报告。**

## Linux

```sh
./start-linux.sh
# 以后直接离线启动
.venv/bin/python -m constraintlab.cli --serve
```

必须从源码 checkout 使用浏览器界面，前端构建产物不打包进 Python wheel。核心 wheel 可独立安装使用。

## 基本操作

1. 选择内置问题并载入；数独可直接改网格，图可输入边 JSON；或导入 `examples/` 文件。
2. 展开 JSON 编辑变量/约束，点击验证。保存 JSON 可复用配置。
3. 设置算法、启发式、种子与资源限额，开始求解。取消按钮停止实际后端计算。
4. 最终解可选择、导出并再次独立验证；轨迹页的播放/暂停仅控制回放。
5. 性能实验默认比较 BT/FC/MAC。可删除配置，将左侧配置加入实验。配置的限额在加入时复制；修改左侧不会修改已加入配置。
6. 默认使用当前问题；也可依次载入不同规模问题，点击“加入规模实验”。所有配置运行同一实例集合。导出 CSV/JSON 保存完整复现信息。

## CLI 与 Python API

```sh
python -m constraintlab.cli examples/queens-4.json --algorithm MAC --max-solutions 100
python -m constraintlab.cli --serve
```

```python
from constraintlab import Config, solve, verify
from constraintlab.problems import builtin
p = builtin('queens', size=8)
r = solve(p, Config(algorithm='MAC', max_solutions=1000, trace_limit=0))
assert r['complete'] and len(r['solutions']) == 92
assert all(verify(p, a) for a in r['solutions'])
```

## 测试

```sh
python -m pip install -e ".[test]"
python -m pytest backend/tests -q
npm --prefix frontend ci
npm --prefix frontend run build
# 一个终端启动服务，另一个运行浏览器测试：
python -m constraintlab.cli --serve
cd frontend
npx playwright install chromium
npm test
```

已安装 Chromium 时可设置 `CHROMIUM_PATH` 指向浏览器可执行文件，无需下载浏览器。测试配置不依赖机器的私人路径。Python 纯核心测试不需第三方库：`PYTHONPATH=backend python -m unittest discover -s backend/tests -p test_engine.py`（此环境变量语法用于 Linux）。

## 文档与限制

- [格式、算法、计数定义与资源边界](docs/ARCHITECTURE.md)
- [测试与性能报告](docs/VALIDATION.md)
- [可复现实验脚本](docs/benchmark.py)

所有值目前仅支持有界整数；最多 150 个变量、每域 150 个值。AllDifferent 使用两两不等，**不是 Régin 全局传播**；MAC 对二元约束维护弧一致性，非二元 Sum 只做安全边界推理，其他组合/高元约束仅在全部或只剩一个变量未赋值时检查，**不是广义弧一致性**。大问题可能 UNKNOWN；附带的高难度数独在默认 10 秒限制下可能超时，可提高限额或改变启发式。

单服务串行运行一个任务，最多保留八个任务结果，重启丢失；可通过导出持久保存。轨迹仅在计算结束后回放，不是实时调试器，不支持暂停实际搜索或续算。无可靠隔离内存测量，因此峰值内存字段为 null。单机耗时不用于跨硬件排行；Windows 原生自动验收结果见测试报告；用户电脑上的交互与实际性能仍以本机运行结果为准。
