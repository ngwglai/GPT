# v0.10.1 性能调查与验证报告

日期：2026-11-25。开发基准为此次上传的 v0.10.0 完整包，不是仓库原先的 v0.8.0。数据目录为 [validation/v0.10.1](validation/v0.10.1/)。

## 结论及边界

已实测确认逐牌重复投影/栅格化、运行时 PNG 编解码，以及高分辨率整桌滤镜存在可避免的开销；它们不能直接证明真实手机进程崩溃的原因。云端测试没有复现浏览器自动重载，也没有手机系统的崩溃日志，故**不宣称已确认或完全修复手机崩溃根因**。后台演算依赖服务端而非浏览器绘图，四个页面全部冻结后服务端仍可完成对局，恢复后同步最新 revision。

保留现有逐牌渲染及三维几何投影，删除运行时图片编码链，复用牌体投影和存活 Canvas，按屏幕需求限制像素，预绘制桌布阴影。整桌单 Canvas 和有界 Blob 图片方案也做了实现与实测，因整体耗时/内存没有稳定优势而放弃。没有为了测试结果替换规则、降低 AI 决策、移除声音或取消动画。

## 基准整合

- 比较 main、现存麻将分支和提交历史。历史分支头均已是 main 的祖先；保留其他独立项目和既有历史，不重写提交。
- 上传包中游戏引擎、AI、TableService、HTTP/WebSocket 服务与 main 的有效实现一致；将其较新的前端、资源和版本文档完整导入 `projects/mahjong/`，不导入 `.venv`、缓存或安装依赖。
- 移除未被当前入口引用的 `web/table-mesh.js` 和旧 `sprites-v100.json`。历史设计、原型和验证资料仍保留，README 明确它们不代表当前版本验收。
- 当前有效入口为 `web/cuboid-scene.js`。服务器调度保持原实现。随后按追加需求校正了实体墙取牌方向，详见下文。

## 调查证据与控制变量

1. 基准 Chromium CPU 采样中，`sprite` 累计 1493.68ms，`triangle` 242.01ms，`fit` 200.94ms，而 GC 55.41ms。原代码每个变化牌重新生成圆棱曲面、纹理三角形，再 `toDataURL('image/png')`，以新 Image 解码。修改牌面会连带重做相同牌体。证据：[初始 profile](validation/v0.10.1/experiments/baseline-profile.json)。这是有采样开销的定位实验，不能与正式基准混算。
2. 移除 PNG 循环后继续拆分牌体底图、纹理、栅格尺寸，分别测试；原始结果见 `experiments/*-profile.json`。只删除编码链收益不足，最终采用底图复用、SVG 预栅格和自适应纹理网格组合。
3. WPE WebKit 的 JS 已下降，但两个 rAF 墙钟仍有明显长尾。隐藏牌图不能消除开销；禁用滤镜和空白页面对照显著降低耗时。[定位实验](validation/v0.10.1/webkit-paint-controls.json)。同页 A/B/A 对照的整桌 CSS 阴影 → 外部不可变 SVG → 恢复 CSS，墙钟中位数约 285 → 79 → 259ms。[完整序列](validation/v0.10.1/felt-paint-controls.json)。SVG 在高 DPI 仍有重复滤镜栅格长尾，最终预绘制为 PNG，保留矢量源和生成工具。
4. 真实合法出牌测试覆盖了固定视角压力夹具遗漏的“操作席自动旋转”：相同外观的墙牌/暗手牌因逻辑所属席位改变被重复绘制。改为按投影视位复用节点，动画标识仍使用逻辑 tile ID；不可见的对手立牌正面不参与像素缓存键。对比 smoke 文件保留在 `legal-smoke.json` 与 `legal-slots-smoke.json`。两次 smoke 的测量边界不同，不能直接把墙钟数字作为优化比例；正式两版对比使用同一脚本。
5. 声音对照未支持其为主要瓶颈：实际首发牌仅创建背景音乐与骰子两个 Audio，不是每发一张牌创建一个；关闭提示音未产生实质 PSS 优势。未采用推测性的声音池或合并提示。证据：[声音控制实验](validation/v0.10.1/audio-before-controls.json)。

## 正式测量方法

Linux 云端共享虚拟 CPU，约 9.9GB RAM，无 Swap；Chromium 154.0.8037.57、Firefox 153、WPE WebKit 26.5，Playwright 1.62.0，headless/software rendering。WebKit 所需系统库在测试专用目录提供，未修改产品依赖。不是 Safari/iOS 真机，也不是 Android 手机。浏览器版本及平台写在每份 JSON 内。

视口：1440×900/DPR1 桌面、844×390/DPR3 手机横屏、390×844/DPR3 手机竖屏、1180×820/DPR2 平板；触控标志和减少动态效果开启。高 DPR 只模拟像素需求，不模拟物理 GPU、手机内存上限或操作系统回收。

`tools/performance_regression.py` 先以真实 HTTP seed42/dealer0 创建牌局，实际点击掷骰、选牌及弃牌，再执行两种明确分开的场景：

- 默认 `--scenario legal`：从服务端合法动作选择胡/过/弃牌等，真实提交 HTTP，包含行动席旋转。HTTP 请求时间另记；JS 更新及“调用更新→图片就绪→两个 rAF”墙钟从收到响应后开始测量。动作之间等待240ms。每个视口/样本启动新浏览器，避免跨样本原生资源干扰。
- `--scenario stress`：固定视角，在真实发牌快照中加入32～43张弃牌并持续更换牌型。总数可达179张，**不是合法136张牌对局**，仅用于高频栅格压力和回归诊断。早期优化与失败数据多使用此场景；不能和合法轨迹混算。

Chromium 两版均3次×36变化×4视口，顺序运行、同一机器、相同脚本。其他引擎各1次×36变化×4视口。p95 使用排序后 `floor((n-1)*.95)`，汇总合并同一视口原始样本。冷启动、掷骰、所有原始更新、墙钟、长任务、诊断和错误均保存，不删除最慢样本。CPU4 是 CDP 节流实验，与真实低端机不同。

默认 JS 更新 p95 预算180ms、双 rAF 墙钟预算350ms，是本项目自动化诊断门禁，不是60fps承诺。早期尝试的250/300ms墙钟预算未稳定通过，原始失败文件保留；350ms仍可能在软件渲染环境受调度/绘制长尾影响。报告列出失败及未达目标，不把限额调整本身视作性能收益。

### Chromium 优化前后对比

此组在追加方向修复前完成，两个服务端使用相同的旧版墙位路径，便于隔离渲染改动。每个视口包含108次更新。

| 视口 | JS p95，原版 → 优化版（ms） | 双 rAF p95，原版 → 优化版（ms） | 冷启动中位（ms） | 掷骰中位（ms） |
|---|---:|---:|---:|---:|
| 桌面 | 330.5 → 71.0 | 615.3 → 294.9 | 1190.9 → 1298.4 | 638.7 → 468.5 |
| 手机横屏 | 312.2 → 75.0 | 450.2 → 238.3 | 1040.8 → 1271.5 | 614.0 → 458.1 |
| 手机竖屏 | 373.3 → 68.4 | 500.6 → 211.4 | 1094.6 → 1371.0 | 420.8 → 484.6 |
| 平板 | 369.8 → 94.3 | 618.8 → 404.6 | 1288.1 → 1376.1 | 661.4 → 490.5 |

JS 更新 p95 降低 74.5%～81.7%。冷启动在这组测量中增加；掷骰在桌面、横屏和平板更快，竖屏略慢。平板的三轮绘制 p95 均超过350ms。

### 跨引擎与 CPU 节流

| 引擎 | 桌面 JS/双 rAF p95（ms） | 手机横屏 | 手机竖屏 | 平板 |
|---|---:|---:|---:|---:|
| Firefox | 86 / 290 | 100 / 254 | 77 / 204 | 128 / 397 |
| WPE WebKit | 67 / 312 | 174 / 1222 | 138 / 698 | 259 / 912 |
| Chromium CPU 4× | 284 / 838 | 366 / 1054 | 未测 | 未测 |

Firefox 平板超过350ms。WPE 两种手机视口及平板的墙钟超预算，平板 JS 也超过180ms。CPU 4×使用节流专用预算。全部原始值及失败字段保留。

JS heap 不含 GPU/图片/Canvas 原生存储。`cacheBytes`、`bodyBytes`、`liveBytes`、`artBytes`、`backgroundBytes` 是已知像素 backing store 的计数估算，不是浏览器总内存。Linux Chromium 在样本结束、俯视往返及强制GC后另读取本次浏览器所有进程 PSS（这是保留量样本，不是全过程峰值），避免 RSS 简单求和重复计算共享页；包含浏览器基础开销，不能全部归因于游戏。基准和候选整体 PSS 同量级，**不宣称总浏览器内存大幅下降或已排除手机 OOM**。

## 实际实现与取舍

- 存活牌直接使用 Canvas；撤销节点时清为1×1。相同投影的无纹理圆棱牌体由6MiB/320项 LRU复用；不可变常用精灵由8MiB/192项 LRU管理，淘汰时释放底图。
- 1× 常用资源解码约3.31MB，2×墙资源约7.86MB，按需求选择一组。显示栅格1/1.5/2×；SVG正面按投影需求预绘制100/150/200宽，不在每个三角形重新栅格SVG。窗口增大可升级资源。
- 正交/平行面使用单次精确仿射绘制，透视面自适应分片。独立三维平面采样144种姿态，最大误差0.191902个栅格像素，低于0.25预算。[测试](tests/v101_texture.cjs)。真实发牌截图的纹理算法变更像素差：[结果](validation/v0.10.1/texture-pixel-comparison.json)，仅对应纹理步骤，不冒充整版本视觉差异。
- 桌布以同一几何源生成两视角×三分辨率PNG，保持渐变、边框、阴影，运行时不再计算整桌实时滤镜；图片加载失败有矢量回退。当前所选背景已知像素上限32MiB，资源文件合计约1.1MB。
- 服务器相同快照不重复重绘；页面隐藏时跳过绘图，恢复从服务器同步。2D上下文恢复/持久页面恢复会重建像素。上下文恢复事件是合成验证，不是硬件GPU丢失实测。
- 拒绝的整桌 Canvas 方案需要额外整屏 backing store及复制，PSS和跨引擎长尾未改善；有界 Blob/PNG 图方案仍付出图片编码/解码开销。[board](validation/v0.10.1/board-webkit.json)、[bounded IMG](validation/v0.10.1/bounded-img-webkit.json)。这些是探索性控制，不与最终串行数字混算。

## 功能、美术与长期回归

45°桌面、30°第一视角手牌、1.4近远宽比、8个圆角与12条圆棱由原几何及投影测试保护。所有规则、特殊玩法、AI和联机服务保留。只有牌面25.svg（八条）改变，其余33种正面及牌背逐字节保持上传包原版，六筒上下分组间距不变。完整性清单：[protected_art.json](tests/protected_art.json)。八条由上下镜像的四根实体竹纹组合，包含两根外侧直竹、两根交错斜竹、竹节、端部椭圆和留白，沿用条牌绿色；没有使用字体W/M。

当前回归入口：Python完整规则/API套件；6个Node几何/布局/纹理脚本；真实HTTP/WebSocket四客户端DOM测试；迁移后的完整真实浏览器验收；4种seed×4庄家墙位身份/暗牌/俯视切换和24次上下文恢复后的连续切换；四窗口多局服务端AI soak；Linux及Windows原生CI、4个Windows批处理入口、嵌入式Python便携包解压到含空格中文路径后的启动与发牌。

`tests/ui_smoke.cjs` 的 Canvas 为绘图桩，仅验证DOM/传输。真正像素、点击和布局由Playwright测试验证。旧版历史视觉脚本仍可查阅，但不作为当前验收。

### 追加的轮转方向校正

修复前，下一家投影到左侧，实体墙也按玩家座次向前跨墙。修复后东 → 南 → 西 → 北仍是玩家行动序，固定第一视角为下 → 右 → 上 → 左。正常取墙用独立的东 → 北 → 西 → 南循环，按 16 至 0 号墩及先上后下取牌，杠后补牌反向跨墩。骰子沿玩家顺序数开门，5/9 对家例外及上家墙金指示位置沿用；具体见 [规则](WALL-RULES.md)。

吃牌仍仅允许接上家，十三幺拾牌轮次和多席响应排序仍沿玩家方向。碰、杠来源使用拥有者的实际左右侧，吃牌按顺子牌值定位并标注来源。回归覆盖全部庄家与144组骰子组合、跨墙和补牌的136物理牌位置、发牌顺序，及四位联机玩家画面中实际投影的位置与墙角连接。固定种子在方向修复后会发出不同的手牌，因此修复后的合法轨迹单独注明。

## 已知限制与失败记录

- 没有真实 iPhone/iPad/Android/Windows触屏设备；不能承诺其稳定性验收，不能把桌面WebKit等同于iOS内存策略。真实手机浏览器崩溃/自动重载尚未复现，缺少系统终止原因；原型中的热点是已证实的性能问题，不是已证实的崩溃根因。
- 软件WPE在高DPI绘制、冷切换和重复压力场景存在明显长尾；所有失败JSON保留，包括 `pre-adaptive-webkit-failed.json`、`felt-atlas-first-run-250ms-failed.json`、`webkit.json` 及被放弃的架构结果。早期并行运行Firefox的失败也保留为 `exploratory-firefox-concurrent.json`，不用于最终比例。
- 历史桌面等比例缩放会令390px竖屏部分操作目标较小；此次保持布局并修复声音面板越界，没有将现有小按钮宣称为44px触控目标。需要后续真实设备可用性测试。
- 页面/四窗口冻结和恢复使用CDP控制，不模拟操作系统杀进程。完整对局使用服务端真实AI和规则，快速soak只调整节奏；正常生产节奏另测。
- CI耗时和浏览器分数受运行器影响；基准比较应在同一空闲机器串行重复，不能把不同机器的数据直接作版本收益。正式性能文件与探索性实验均带原始数据，没有将理论估算伪装为测量。

## 复现命令

在 `projects/mahjong/` 安装 `requirements.txt`、Playwright1.62.0和浏览器，Node22.19+安装开发依赖。完整命令见README和 [CI](https://github.com/ngwglai/GPT/blob/main/.github/workflows/mahjong.yml)。

```sh
python tools/performance_regression.py --samples 3 --iterations 36 --output candidate.json
python tools/performance_regression.py --base-url http://127.0.0.1:8766 --baseline --samples 3 --iterations 36 --output baseline.json
python tools/summarize_performance.py baseline.json candidate.json --output comparison.csv
python tools/performance_regression.py --scenario stress --samples 1 --output stress.json
python -m tests.soak_acceptance --rounds 8 --output frozen-soak.json
python -m tests.soak_acceptance --foreground --delay .24 --rounds 8 --output foreground-soak.json
python -m tests.v101_scene_acceptance
```

原版服务从未修改的v0.10.0目录启动 `python web_server.py --no-browser --port 8766`；两版依次运行，不与其他压力任务并行。`--chromium` / `--webkit-executable` 可指定测试机路径，路径不写入测量结果。
