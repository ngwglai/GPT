# EntropyLab 1.0

面向学生、自学者和复杂系统爱好者的浏览器计算物理实验室。React + TypeScript + Vite；Canvas 2D 实时渲染。四个实验均可独立操作，数学模型完全在本地运行，无后端、账号、数据库、外部 API 或远程字体。安装依赖需要网络，构建后的应用不需要网络请求。

## 本地运行

需要 Node.js 22.12+（推荐 Node 22 LTS）与 npm；Windows PowerShell、cmd、macOS、Linux 均可使用相同命令：

```sh
cd projects/entropylab
npm ci
npm run dev
```

打开终端显示的地址，默认是 `http://127.0.0.1:5173/GPT/entropylab/`。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

生产预览默认 `http://127.0.0.1:4173/GPT/entropylab/`。构建输出 `dist/`，需通过 HTTP 服务，不支持直接双击 `index.html`。第一次执行浏览器测试前安装 Chromium：

```sh
npx playwright install chromium
npm run test:e2e
```

Linux 若缺少浏览器系统依赖，可使用 `npx playwright install --with-deps chromium`。可通过环境变量 `CHROMIUM_PATH` 指定已安装的 Chromium（CI 默认使用 Playwright 浏览器）。浏览器测试针对生产构建，自动启动预览；4173 端口须空闲。

## 实验与操作

| 实验 | 操作与统计 | 模型与单位 |
| --- | --- | --- |
| 粒子扩散与熵增 | 10–2,000 粒子、运动速度 0–1 L/s、隔板开关；空间直方图、网格 Shannon 熵与历史曲线 | 归一化正方形边长 L=1；固定步长 1/60 模拟秒；墙壁与隔板镜面反射 |
| 二维随机游走 | 1–512 粒子、步长 0.5–5 u、16/64/128 步轨迹窗口、单步/+100 步、径向分布；MSD 与理论 nℓ² | 无界二维平面、均匀随机方向、固定步长；画布自动缩放，虚线圆为理论 RMS 半径 |
| 康威生命游戏 | 绘制/擦除、触屏拖动、清空、单步、1–30 代/s；40/64/96 格、有限/周期边界、活细胞数与代数 | 标准同步 B3/S23；滑翔机、闪烁器、脉冲星、高斯帕滑翔机枪、随机与空白预设 |
| 二维伊辛模型 | 温度 0–5 J/kᴮ、16/32/64/96 格、随机/有序初态；磁化、平均能量、接受率、sweep 历史 | 周期边界、J=kᴮ=1、h=0；Metropolis 随机点翻转，每 sweep 尝试 N² 次（有放回） |

- 各实验初始暂停；开始/暂停、单步、按当前参数重置、恢复所有默认参数。
- 全局播放倍率 0.25×–4×；除扩散外可调每秒离散更新数。速率是目标，设备繁忙时可以降低；固定步进不会因帧率降低而扩大数值步长。
- 改变粒子数量、随机游走步长、网格大小、预设或伊辛初态会重置并暂停；其余参数实时更新。切换实验重置至该实验默认状态，不暗中保留旧任务。
- 重置固定种子 42，方便比较参数；随机模型在相同初态和操作序列下可复现。物理模拟与 Canvas 像素尺寸无关。
- 生命游戏暂停后编辑：左键/触屏拖动绘制，右键或擦除按钮擦除；快速拖动插值补全；边界外输入忽略。编辑保留代数，清空会暂停；重置重新载入当前预设。
- 深浅主题偏好保存在浏览器；存储被禁用时仍可使用。窄屏将导航和参数面板重新排列。

## 数学正确性与解释边界

**扩散：**粒子不相互碰撞、不交换能量、无外力，速率固定。关闭隔板保留当时两侧的粒子，不将右侧粒子强行移回左侧。熵使用 10×10 网格粒子占比 `pᵢ`，`H = −Σ pᵢ log₂pᵢ`，单位 bit，零概率项贡献为零；100 格均匀时上限约 6.644 bit，有限样本有偏差。它是位置的粗粒化 Shannon 熵，**不等于完整热力学熵**，也不保证随时间严格单调。

**随机游走：**每步方向独立各向同性，`E[|rₙ|²] = nℓ²`。样本均方位移始终相对初始原点计算；轨迹截断不影响统计。步数与任意长度单位 u 不对应真实秒或米，有限样本偏离理论是正常现象。

**生命游戏：**有限边界外视为死细胞；周期边界在两个方向环绕；更新使用新数组，避免就地更新改变规则。没有真实物理时间含义。

**伊辛：**`E = −Σ⟨i,j⟩ sᵢsⱼ`，每条键只算一次；翻转能差 `ΔE = 2sᵢ Σ邻居 sⱼ`。`ΔE≤0` 必接受；其余概率 `exp(−ΔE/T)`。零温明确拒绝升能翻转，不除以零。显示带符号每自旋磁化 `m`、有序指标 `|m|` 和当前空间平均能量 `E/N²`；这些**不是烧入后热平衡时间平均**。无限格临界温度约 2.269；有限尺寸使转变变宽，临界附近需较长弛豫；温度变化不清除历史，便于观察非平衡响应。Monte Carlo sweep **不是实际物理时间**，高温有序初始化也需先弛豫。

## 工程与测试

```text
src/experiments/*/model.ts  纯数值算法，可注入随机源
src/experiments/session.ts  参数校验、实验状态、有界统计历史
src/experiments/render.ts   Canvas 绘制与坐标映射
src/utils/clock.ts          暂停/恢复/单步与固定步进时钟
src/hooks/useSimulation.ts  React、requestAnimationFrame、ResizeObserver
src/components/             参数面板与有单位的 SVG 图表
tests/models.test.ts        数值、边界、极值、时钟与可复现性测试
tests/app.test.tsx          页面组件及控制流程
tests/browser/             生产构建 Chromium 操作和布局测试
```

依赖沿用仓库 React 19.1 / TypeScript 5.8 / Vite 6.4 版本，独立锁文件；新增 Vitest、ESLint 和测试依赖，不修改其他项目工具链。轨迹每粒子最多 128 点，统计历史最多 360 点（超过后滚动显示），UI 统计约 10 Hz 刷新，Canvas 使用 requestAnimationFrame 和最高 2× 像素密度。隐藏标签页不推进，恢复后丢弃后台积压；单帧最多推进 24 步，防止长帧造成卡死。

当前规模在主线程计算，暂未引入 Worker，避免同步成本与不必要依赖。低性能设备建议降低粒子/网格规模或速率；不声称任意设备均能达到 60 fps。所有算法参数都有有限范围，NaN/Infinity 回退默认，计数取整数。无持久化实验存档、平衡态估计、误差条或数据导出；这些不影响当前交互实验目标。

GitHub Actions 的 `EntropyLab` 独立工作流在 Linux/Windows 执行锁文件安装、ESLint、Vitest、TypeScript 与生产构建；Linux 额外执行 Chromium。现有 RepoScope/ConstraintLab CI 不变。具体已执行结果见 [VALIDATION.md](VALIDATION.md)，配置存在不等于 CI 已通过。

## GitHub Pages

Vite `base` 为 `/GPT/entropylab/`。预期 URL：

`https://ngwglai.github.io/GPT/entropylab/`

**此地址是预期部署路径，不代表已上线。** 分支和 PR 不自动发布；只有合并至 `main` 后、Pages 设置完成且工作流成功才上线。

本次检查未发现既有 Pages 工作流或静态站点目录。新增 `.github/workflows/pages.yml`，将 EntropyLab 的 `dist/` 放入同一 Pages artifact 的 `entropylab/`，根目录仅提供项目链接；没有把其他项目部署到静态站点，也未修改其代码。未来有新静态项目，应扩展此聚合工作流，把各项目放到 `_site/<slug>/`，不要用第二个 Pages 部署覆盖整站。

首次启用由仓库管理员操作：Settings → Pages → Build and deployment → Source 选择 **GitHub Actions**；检查 `github-pages` 环境允许 `main` 部署。PR 合并后检查 `GitHub Pages` 工作流；需要重试时在 `main` 上手动 Run workflow。无需密钥、付费服务或新增 PAT。本任务不修改仓库设置，不自动合并。
