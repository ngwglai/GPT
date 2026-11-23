# 青雀麻将 v0.7.0 验收报告

开发基准为 `feature/mahjong-0.6` 的 `58da515`。牌桌由独立的桌框、绒布、牌体和骰井构成。牌局继续经既有服务与规则引擎处理。新增的表现事件字段只携带已取走的公开墙位，以及明杠的公开来源席位。

## 实际 Chromium 截图

截图由正在运行的 Python 服务和 Chromium 页面生成。为覆盖副露、报听和结算等状态，浏览器测试进程可在服务端设置固定牌况。空桌截图使用游戏自身的场景渲染器。概念和渲染原型另见 [美术与渲染记录](TABLE-ART-v0.7.0.md)。

| 验收项 | 截图 |
| --- | --- |
| 空桌结构与开局前双层墙 | [空桌](validation/v0.7.0/empty.webp) · [开局前](validation/v0.7.0/wall-before-dice.webp) · [牌墙近景](validation/v0.7.0/wall.webp) |
| 四家牌局和视角 | [四家明牌桌](validation/v0.7.0/four-seats.webp) · [联机本席视图](validation/v0.7.0/lan.webp) · [俯视](validation/v0.7.0/overhead.webp) |
| 牌体与公开区域 | [手牌近景](validation/v0.7.0/hand.webp) · [桌面牌河近景](validation/v0.7.0/river-table.webp) · [牌河清单](validation/v0.7.0/rivers.webp) · [横置副露近景](validation/v0.7.0/melds.webp) |
| 金牌、骰子及提示 | [金牌与骰子](validation/v0.7.0/gold-and-dice.webp) · [AI 托管](validation/v0.7.0/ai.webp) · [胡牌提示](validation/v0.7.0/waits.webp) · [胡牌结算](validation/v0.7.0/win.webp) |
| 多端布局 | [1920×1080](validation/v0.7.0/viewport-1920x1080.webp) · [1366×768](validation/v0.7.0/viewport-1366x768.webp) · [1024×768](validation/v0.7.0/viewport-1024x768.webp) · [390×844](validation/v0.7.0/viewport-390x844.webp) · [844×390](validation/v0.7.0/viewport-844x390.webp) |

## 流程与回归

| 项目 | 结果 |
| --- | --- |
| Python 规则与服务 | 164 项回归。覆盖金牌、十三幺、特殊拾牌、听牌、吃碰杠胡优先级、联机隐私、AI 控制权与连续牌局 |
| jsdom | 真实 HTTP 和 WebSocket 的四客户端集成。覆盖开房、入座、掷骰、16 次同步操作、断线恢复、人工接管、私有手牌和拾牌 |
| Chromium 功能验收 | 单机、四个联机客户端、吃碰杠胡与过、断线和返回、AI 托管和人工接管、报听与可见剩余变化、长听口提示、素材故障回退 |
| Chromium 场景验收 | 五种视口与手机模拟触摸。核对 136→83→82 张实牌、服务端公开墙位、两条空间移动曲线的实际结束状态、场景点击与视角切换 |
| 三档 AI 重放 | 种子 1000–1101 的 102 局，60 胡、42 流局，最长 149 个动作。每局均通过实体牌守恒与分数平衡 |

102 局的玩法、局数和结果按难度与 v0.6.0 基准一致。完整动作汇总和逐局记录见 [ai-replay.json](validation/v0.7.0/ai-replay.json)。

## 性能

使用 Linux 无头 Chromium、CPU 配额 2 核及本机 HTTP 服务。每种视口关闭浏览器缓存，独立打开三次，记录完整双层牌墙可见后的首屏采样。帧间隔在一次真实出牌及随后的摸牌期间记录，采样窗口约 950 ms。手机数据使用 Chromium 触屏模拟。

浏览器版本为 Chromium 154.0.8037.57。

| 视口 | 首屏中位数 | 帧间隔 P50 | 帧间隔 P95 | 最长间隔 | 超过 32 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1920×1080 | 476 ms | 83.3 ms | 116.7 ms | 150.1 ms | 10 / 12 |
| 1366×768 | 795 ms | 150.0 ms | 150 ms | 350 ms | 5 / 6 |
| 1024×768 | 869 ms | 58.3 ms | 133.3 ms | 216.7 ms | 9 / 12 |
| 390×844 | 539 ms | 50 ms | 99.9 ms | 100.0 ms | 14 / 19 |
| 844×390 | 636 ms | 16.7 ms | 50 ms | 100 ms | 13 / 36 |

无头软件渲染仍能观测到动作期间的长帧。以上帧间隔反映测试环境中的页面更新与合成开销。

桌面本次新增纹理载荷约 82 KiB，手机省略环境图。桌面贴图解码后约 7 MiB，手机约 2.5 MiB，未计浏览器合成缓冲和原牌面。正式页面加载的是压缩材质。牌墙及场景中的静止牌体批量绘制，牌体移动走有限时长动画。无逐帧物理模拟。原始测量见 [performance.json](validation/v0.7.0/performance.json)。

验收环境包括 Linux Chromium 及模拟触屏。Windows 原生环境、Safari 和实体手机的表现由相应设备进一步核验。开局演出包含骰子和金指示牌揭示，发牌后直接显示四家当前手牌。

## 复验

在 `projects/mahjong/` 目录运行：

```bash
python -m unittest discover -v
python -m tests.browser_acceptance --screenshots browser-screenshots
python -m tests.scene_acceptance --output scene-screenshots
python -m tools.run_ai_matches --output ai-replay.json
```

jsdom 的服务启动与复验见 [README](README.md)。浏览器脚本均可用 `--chromium` 指定已安装的 Chromium。
