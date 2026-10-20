# CalibrationLab v0.1

中文概率预测校准实验室，面向学习者与开发者。在本机生成二元预测，比较校准前后独立测试集评分与可靠性图，无后端、账号、远程服务或付费 API。所有结果都是合成实验，不能写成真实模型结论。

与现有项目的区别：CausalLab 研究因果识别，MatchupLab 研究决策策略；本项目研究概率预测的频率一致性及独立样本校准。工程沿用仓库 React、TypeScript、Vite、Vitest、Playwright 版本，算法及 SVG 图表无新增依赖。不部署。

## Windows 安装、启动与验证

需要 Node.js ≥22.12 与 npm。Windows PowerShell、命令提示符及 Linux 可执行同样的命令。仓库开发者还需要 Python 3.11+、Git 与仓库规定的私有身份词表；先在根目录执行 `python scripts/configure_git_identity.py --install-hooks`，遵守根 `AGENTS.md`。

```sh
cd projects/calibrationlab
npm ci
npm run dev
```

打开终端提供的本机 URL。服务只监听 `127.0.0.1`。依赖安装需要网络；加载完成后实验可离线运行，无遥测、外部字体或外部资源。生产 CSP 禁止应用网络连接；开发模式只额外允许本机 Vite 样式注入与 HMR。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm audit --audit-level=moderate
```

Linux 缺少系统库时使用 `npx playwright install --with-deps chromium`。E2E 必须先构建，测试启动真实生产预览 `127.0.0.1:4190`，不复用已有服务；`CHROMIUM_PATH` 可选择实际安装的 Chromium。手动预览使用 `npm run preview`。根隐私回归：在仓库根目录运行 `python -m unittest discover -s tests -v`。独立 Linux/Windows 工作流接入 `CI required`；实际验证见 [VALIDATION.md](VALIDATION.md)。

## 操作

1. 选择四种实验之一，设置总样本量、整数种子与等宽分箱数。
2. 点击“运行实验”生成校准集与测试集，先查看原始预测评分与图。
3. 点击“执行校准（两种方法）”，分别用同一校准集拟合两种方法，在同一测试集上评价；选择“查看方法”切换对比。拟合失败有明确原因，不生成虚构评分。
4. 查看箱样本量、95% Wilson 区间和小样本标记；可展开原始箱表与模型参数。
5. 下载 CSV 逐条数据或完整 JSON。重新运行相同种子重复结果；“重新生成”把可见种子增加 1（最大种子再递增会报错，不静默回绕）。重置恢复默认并清空结果。修改任何生成参数也清空旧结果。

默认总样本 2000，前 1000 校准、后 1000 测试，过度自信、种子 2026、10 箱。实验不持久化，刷新页面会清空。最大 20,000 样本、30 箱；最小 2 样本用于观察稀疏数据与拟合拒绝状态。

## 数学定义与可复现性

PRNG 为显式 uint32 运算的 Mulberry32，种子为 `[0, 2³²−1]` 整数。`generateData(config, rng)` 通过依赖注入取得每个样本恰好两个 `[0,1)` 抽样值 U、V：

- 真实概率：`q = 0.05 + 0.9U`。
- 实际标签：`y = 1[V < q]`，即条件分布 Bernoulli(q)。
- 预测概率：`p = σ(a logit(q))`，`σ(z)=1/(1+exp(−z))`。

| 类型 | a | 数学性质 |
| --- | --- | --- |
| 理想校准 | 1 | p=q，E[y\|p]=p；有限样本仍有波动 |
| 过度自信 | 2 | p 比 q 更远离 0.5；排序保留 |
| 欠自信 | 0.5 | p 向 0.5 收缩；排序保留 |
| 缺乏区分能力 | 0 | 恒报 0.5；总体 E[q]=0.5，仍可总体校准但不能区分个体 |

无随意添加的预测噪声，也没有预设校准改善幅度。同种子在四类实验中保留相同 q 和 y，仅更改 p。所有样本独立同分布；按与标签无关的固定位置将前 `floor(n/2)` 作为校准集，余下作为测试集。不存在单独的基模型训练集，因为预测公式已定义，并没有用样本训练基模型。样本 ID 全局唯一且两集不相交。

`fitPlatt` / `fitIsotonic` 只接收校准集的 p、y；预测接口只接收模型与 p，不接收 y。真实概率 q 只用于生成、解释与导出，不参与拟合或评分。校准前后使用相同的测试 ID、标签和样本数。相同运行时、固定版本、配置和种子可逐字节重现 JSON（不写入时间或机器路径）；不同引擎的 exp/log 实现可能有末位舍入差异，跨运行时数值检查使用明确容差，不承诺跨引擎逐位相同。JSON 包含完整数据、原始与两种校准结果、模型参数、未舍入箱值及数学约定；可手动填回配置重跑，v0.1 不支持 JSON 导入。

## 指标

对同一测试集的 N 个 `(pᵢ,yᵢ)`：

- Brier Score：`(1/N) Σ(pᵢ−yᵢ)²`，越低越好。
- Log Loss：`−(1/N) Σ ln(max(10⁻¹⁵, sᵢ))`，其中 `sᵢ=pᵢ`（y=1），`sᵢ=1−pᵢ`（y=0）。极端错误固定上限 `−ln(10⁻¹⁵)`，极端正确为 0。它是有界数值约定，不是理论上允许正无穷的未裁剪对数损失；所有比较统一用自然对数与相同下限。直接计算观测类别，避免 `0×∞` 及 p=1 附近裁剪的相消不对称。
- 平均预测概率：`Σpᵢ/N`；实际发生率：`Σyᵢ/N`。
- ECE：`Σ(n_b/N)|mean(p_b)−mean(y_b)|`。它依赖分箱方案，存在有限样本与分箱偏差，不能单独作为模型优劣的证明。

空数据返回 `null`，箱保留边界但均值/发生率/区间均为 `null`，图不绘制空箱。非法概率（非有限或超出 [0,1]）、非二元标签、非法箱数直接报错，不隐式转换或静默过滤。

k 个等宽箱采用 `[i/k,(i+1)/k)`，最后一箱包含 1；实际实现索引 `min(k−1,floor(kp))`，遵守双精度边界计算。图和导出都直接使用 `Evaluation.bins`，显示表格边界保留三位、JSON 保留完整数值；图显示均值位置、发生率及箱内逐箱 Wilson 95% 区间。箱样本少于 30 会额外标记，但 30 不是可靠性的硬阈值。

Wilson 区间令 `r=s/n`、`z=1.959963984540054`：中心 `(r+z²/(2n))/(1+z²/n)`；半宽 `z√(r(1−r)/n+z²/(4n²))/(1+z²/n)`，并约束到 [0,1]。这是箱内发生率的不确定性，不是模型校准曲线置信带，也不保证多箱同时 95% 覆盖。

## 校准算法

**Platt Scaling**：以原始预测的 logit 为分数 `x=logit(clip(p,10⁻¹⁵,1−10⁻¹⁵))`，拟合 `p′=σ(Ax+B)`。不是直接用 p 作为分数的另一种参数化；此约定能表达本实验温度失真的逆变换。采用 Platt 的类别计数目标平滑：正类目标 `(N₊+1)/(N₊+2)`，负类 `1/(N₋+2)`。

优化目标为平均交叉熵加 `10⁻⁶(A²+B²)/2`，这是明确的轻微 L2 稳定化版本，非无惩罚 MLE。稳定 softplus 和 sigmoid、二维 Hessian、阻尼 Newton 与 Armijo 回溯线搜索。最大 100 次迭代，最大绝对梯度 <10⁻⁸ 时成功；Hessian 数值退化、回溯步长 ≤10⁻¹⁰ 或不收敛均报告失败。A 允许为负，以适应反向相关分数；它不保证保留排序。输出模型包括 A、B 与迭代数。

**Isotonic Regression**：按 p 升序排序，将完全相同 p 的样本合并为带权均值，再用 Pool Adjacent Violators Algorithm (PAVA) 合并违反非递减顺序的相邻块，求 `min Σ(yᵢ−f(pᵢ))²` 的非递减拟合。严格相等的预测先合并，不把近似值当成相等；合并权重是样本数。预测在相邻唯一 p 上的拟合值之间线性插值，超出校准分数范围时使用端点常量。输出阈值与拟合值；不会用测试分布重新拟合阈值。拟合可以给出 0/1，因此测试集 Log Loss 可能显著恶化；评分使用上述统一极端处理。

两种方法均要求校准集 ≥20 条、每类 ≥2 条且预测范围 ≥10⁻¹⁰；否则明确拒绝。常量分数本可只估计总体发生率，但本版本保守地拒绝识别不了曲线的情形，不伪称完成可靠曲线校准。少于 100 条额外提示方差风险。满足阈值也不保证泛化；这些是工程拒绝边界，不是统计有效性定理。

## 校准、区分能力与总体评分

校准要求 `E[y|p]=p`，区分能力描述能否将高风险个体排在低风险个体之前。理想预测和恒报总体发生率都可能校准，后者缺少区分能力。Brier / Log Loss 是总体概率评分，在真实条件概率处期望最优；它们结合校准和分辨率，不能用平均概率相近、单个 ECE 或一张有限样本图替代全部判断。v0.1 不提供 AUC、假设检验或模型选择。

校准集分布、有限样本、平滑/正则与测试随机波动会影响结果。校准不保证改善所有测试集、指标或种子。界面报告实际有符号差值（后−前），分数升高标为“变差”，不筛除不利案例；不应反复挑测试集或种子来选择方法后仍把它称为独立验证。

## 架构与导出

- `src/core/data.ts`：PRNG、参数验证、四类纯生成器。
- `metrics.ts`：独立评分、分箱、Wilson；`calibration.ts`：拟合与预测。
- `experiment.ts`：数据划分与不泄漏的比较；`export.ts`：CSV/JSON。
- `src/main.tsx` / `style.css`：中文 React、响应式 SVG 和表格，结果全部使用纯模块输出。
- `tests/`：独立手算与穷举 PAVA 对照、固定种子统计性质、数值/退化/隔离/导出测试。
- `e2e/`：生产页面真实操作、下载内容解析、SVG 坐标对照、离线与手机窄屏。

CSV 使用 UTF-8 BOM、CRLF、双引号转义，防电子表格公式前缀；每条含 split、ID、真实概率、原始概率、标签及两个校准概率。校准集的校准概率列留空，因为不将拟合集评分混为测试评分。拟合未执行或失败也留空；JSON 保留明确状态与原因。浏览器以文本显示数据，无 `eval` 或任意表达式执行。

## 依赖、许可证与风险

运行依赖仅 React 19.1.0、React DOM 19.1.0（MIT）；无算法、随机数或图表库。开发依赖复用仓库已锁定的 Vite 6.4.4、Vitest 5.0.5、TypeScript 5.8.3、Playwright 1.64.1、ESLint 9.39.1 与 TypeScript ESLint 8.71.2 等。完整锁文件可重复安装；不升级其他项目。

已核查所有锁文件包许可证：MIT、Apache-2.0、BSD-2-Clause、BSD-3-Clause、ISC、BlueOak-1.0.0、Python-2.0；无缺失许可证元数据。均为宽松许可证，分发时应保留相应第三方声明。npm 包元数据可辅助核查，不替代许可证法律审查。React、TypeScript、Playwright、Vite/Vitest 均来自既有活跃项目；使用的版本不承诺都是最新主版本。ESLint 9.39.1 被 npm 标记为结束支持，作为仅开发工具沿用，当前完整 `npm audit --audit-level=moderate` 无已知漏洞；后续应在独立仓库维护任务迁移受支持版本。审计仅覆盖已知公告，不等于不存在风险。

## 已知限制

20,000 样本上限；生成/拟合/导出在主线程同步计算，UI 先显示忙碌状态，运算中禁用设置。PAVA O(n log n)，Platt 最多 100 次迭代与有界回溯；无大文件导入。模型仅限静态 IID 二元概率，不处理分布漂移、样本权重、交叉验证、置信带或真实模型训练。

默认只验证 Chromium；Firefox/WebKit、真实手机与用户电脑人工测试未执行，不能把 Actions Windows 验证当作这些测试。后续按需加入 Worker 与更广模型诊断，保留独立校准/测试边界，不增加远程后端。

## 数学参考

- Brier (1950), *Verification of forecasts expressed in terms of probability*, Monthly Weather Review 78(1), 1–3. DOI: [10.1175/1520-0493(1950)078<0001:VOFEIT>2.0.CO;2](https://doi.org/10.1175/1520-0493(1950)078%3C0001:VOFEIT%3E2.0.CO;2)。概率平方评分。
- Platt (1999), *Probabilistic Outputs for Support Vector Machines and Comparisons to Regularized Likelihood Methods*, Advances in Large Margin Classifiers。逻辑校准与目标平滑；本项目额外的 L2 与 logit 输入约定已在上文明确。
- Niculescu-Mizil & Caruana (2005), *Predicting Good Probabilities with Supervised Learning*, ICML. DOI: [10.1145/1102351.1102430](https://doi.org/10.1145/1102351.1102430)。比较 Platt 与保序校准，说明有限样本限制。
- Gneiting & Raftery (2007), *Strictly Proper Scoring Rules, Prediction, and Estimation*, JASA. DOI: [10.1198/016214506000001437](https://doi.org/10.1198/016214506000001437)。校准、分辨率与恰当评分。
- Wilson (1927), *Probable Inference, the Law of Succession, and Statistical Inference*, JASA. DOI: [10.1080/01621459.1927.10502953](https://doi.org/10.1080/01621459.1927.10502953)。二项发生率区间。
