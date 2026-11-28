# 青雀麻将 v1.1.2

v1.1.2 加固局域网连接：Windows 禁用原生 sendfile，限制文件传输及连接关闭时间，浏览器主动探测断线并用原身份恢复（不自动重发麻将操作）。

青雀麻将支持四家明牌练习、AI 托管和局域网四人联机。v1.1.0 增加终局全员亮牌、报听后自动摸打（可在席位控制中关闭）和四家准备下一局。胡牌、金牌、杠牌及响应仍由真人选择；托管席位自动准备，全托管时需手动确认继续。版本变更见 [Web 变更记录](WEB_CHANGELOG.txt)。

## 正式计分

单机可在「牌局」菜单中重置整场时选 1 分或 5 分作为基础分。联机由房主在创建房间时选择，整场固定。对局结束后可在「详情」查看各家支付明细，下一局承接累计分。完整计分和同响顺位见 [计分规则](SCORING-RULES.md)。

Windows x64 便携包内置 Python 与依赖。完整解压后双击 `启动网页版.bat`，联机时双击 `启动局域网联机.bat`。首次启动可离线。源码版启动方式见下文；自行构建便携包时执行 `python tools/package_release.py --output /path/QingqueMahjong_v1.1.2.zip`，构建需要联网。

浏览器验收使用视口模拟。真实 iOS 与 Android 设备仍待验证。既有渲染性能测量及限制见 [v0.10.1 历史报告](PERFORMANCE-v0.10.1.md)。

## 历史渲染记录

v0.10.1 采用按状态变化重绘、复用投影底图和存活牌 Canvas、按显示尺寸选择栅格分辨率的实现，并更新八条牌面。桌面采用 45° 视角，南家手牌采用独立 30° 投影。

v0.10.0 首次采用逐牌位图精灵，详见 [当时的设计与测试说明](V0.10.0-DESIGN-AND-TESTS.md)。以下版本段落用于历史对照，当前渲染入口为 `web/cuboid-scene.js`。

## v0.9.8 · 30°手牌与圆润立体麻将

v0.9.8 保留45°桌面及1.4近远宽比，视觉南家手牌使用独立30°正交投影、参考对家2倍宽度；全部麻将采用真正圆角长方体（12条圆柱棱和8个球面角），点击区域与实际投影轮廓一致。详见 [v0.9.8 设计与测试说明](V0.9.8-DESIGN-AND-TESTS.md)。

v0.9.7 使用45°桌面透视（近远宽比1.4），视觉南家暗手牌采用正视独立投影，牌面宽高比1:1.48，参考对家牌面宽度2倍；公开牌保持桌面透视，沿用最大等比例视口适配。详见 [v0.9.7 设计与测试说明](V0.9.7-DESIGN-AND-TESTS.md)。

v0.9.5 保留 v0.9.4 的全部几何参数，以近端桌布边缘与北家理论立牌顶点确定固定矩形，无边距等比例适配整个游戏视口。金牌移入桌布左上角，外围透明控件不参与缩放计算。详见 [v0.9.5 设计与测试说明](V0.9.5-DESIGN-AND-TESTS.md)。

v0.9.4 采用固定俯角30°、观察距离100、焦距25的长方体顶点投影；手牌、牌河、实体牌墙和副露使用统一几何尺寸及四家旋转坐标。牌面纹理按四个投影顶点映射，操作按钮覆盖己方牌墙，顶部控制浮层透明化。详见 [v0.9.4设计及测试说明](V0.9.4-DESIGN-AND-TESTS.md)。

## 历史版本

v0.9.3 将牌墙、四家暗手牌、牌河、副露、自家手牌与中央计分牌放进统一的正方形逻辑桌面，并用同一个二维平面单应变换投影到屏幕。它不是3D场景，也不是只把桌面背景变成梯形；桌面上的每个物体都共享同一套透视映射。头像、分数与操作按钮保留独立屏幕坐标。

[v0.9.3纯2D透视设计与测试报告](V0.9.3-DESIGN-AND-TESTS.md)；[v0.9.2副露对齐与2.5D历史报告](V0.9.2-DESIGN-AND-TESTS.md)。静态构图原型位于 `/prototype-v093.html`。

v0.9.2 曾修正东西家旋转占位、副露来源与补杠叠放，并调整联机居中；其桌面表面仍使用轻度2.5D样式，现已由v0.9.3统一平面投影取代。

v0.9.1 在全新2D牌桌基础上，将桌面改为真正的正方形，手牌嵌回桌面下缘、金牌嵌入中央计分牌，并让四家牌河采用对称旋转布局，缓解拥挤牌局的重叠问题。

v0.9.0 不是旧版CSS的换色补丁：对局界面采用全新 **2D牌桌渲染器**，统一四面牌墙、弃牌、副露、金牌与风位中央信息牌，提供PC、手机横屏和竖屏专门排版。新增以 ImageGen 制作的春樱房间背景与四位角色头像（独立WebP资源）。游戏规则、AI、十三幺、金牌、牌墙实体映射、WebSocket联机协议与操作API保持v0.8.0原有实现。

**Windows快速启动**：完整解压ZIP，双击 `启动网页版.bat`，访问浏览器打开的页面；联机请双击 `启动局域网联机.bat`。Release 便携包已含运行库；源码版首次启动需要联网安装 Python 依赖。

[v0.9.2对齐牌桌说明、截图与测试](V0.9.2-DESIGN-AND-TESTS.md)；[v0.9.1正方形牌桌说明](V0.9.1-DESIGN-AND-TESTS.md)；[v0.9.0重构记录](V0.9.0-DESIGN-AND-TESTS.md)。静态对局构图原型位于 `/prototype-v093.html`（仅供设计预览，不连接游戏引擎）。

## v0.9.3 纯2D透视桌面

- `web/perspective.js` 提供统一平面单应矩阵，所有桌面物体共享同一投影。
- 自家真实手牌按钮DOM移动到桌面投影层，保留原有点击事件和tile ID。
- PC、手机横屏、竖屏使用相同投影模型与不同投影参数；玩家信息和操作控件保持屏幕坐标。
- 「完整桌面」切换到单位矩阵俯视，不丢失牌局状态。

详见 [v0.9.3设计与测试报告](V0.9.3-DESIGN-AND-TESTS.md)。

## v0.9.2 对齐与2.5D牌桌（历史版本）

- 东西家暗手牌、牌河与副露使用固定视觉占位单元，旋转牌面不会改变相邻单元的基线和间距。
- 副露按来源座位计算横置牌位置；吃牌保持顺子数字顺序，碰/明杠按来源侧放置，补杠第四张牌保留叠放标记。
- PC联机与手机横屏使用对称侧栏预留和视口居中布局，牌桌不再因单侧操作栏偏移。
- 桌面表面使用轻度梯形2.5D效果；麻将牌、中央计分牌及交互目标不做整体透视变形，保持牌面可读与点击位置稳定。

详见 [v0.9.2设计与测试报告](V0.9.2-DESIGN-AND-TESTS.md)。

## 安装与启动

在仓库的 `projects/mahjong/` 目录操作。需要 Python 3.11 或更新版本。Node.js 仅用于前端测试。

Windows 可双击 `start_web.bat`（或 `启动网页版.bat`）在本机运行，也可双击 `start_lan.bat`（或 `启动局域网联机.bat`）允许同一局域网的设备连接。脚本会创建或复用 `.venv`、安装并检查依赖。首次安装需要访问 Python 软件源。服务器运行时请保持命令窗口开启。

也可以在已激活的 Python 虚拟环境中启动：

```bash
python -m pip install -r requirements.txt
python web_server.py
```

打开 `http://127.0.0.1:8765/`。首页可进入四家明牌练习 `/local.html`、联机大厅 `/lan.html` 和美术图鉴 `/asset-gallery.html`。服务器可用 `--no-browser` 关闭自动打开浏览器。Windows 后台运行或重定向控制台输出时，可设置 `PYTHONIOENCODING=utf-8` 以输出中文启动信息。

## 局域网四人联机

手动启动时执行 `python web_server.py --host 0.0.0.0 --port 8765`。其他玩家连接同一 Wi-Fi 或有线网络，并访问主机的局域网 IPv4 地址，例如 `http://192.168.1.20:8765/`。Windows 可用 `ipconfig` 查看地址，并在防火墙提示时允许 Python 访问专用网络。

房主在联机页输入昵称、创建房间并分享六位房间号。其余玩家输入房间号加入。四人入座且在线后，房主开始游戏，东家掷骰发牌。刷新会用同一浏览器保存的身份恢复座位。

服务器使用 HTTP 和 WebSocket，适用于可信局域网。房间状态保存在内存，重启即清空。进行中的座位绑定浏览器保存的身份，清除网站数据后无法恢复该座位。

## 春樱 2D 牌桌

- 点手牌选中并抬起，再点同一张牌或「打出」出牌。报听和上金需要点各自的按钮。吃、碰、杠、胡、过、拾牌只在存在合法操作时出现。同一种操作有多个组合时，点按钮选择组合。
- 联机自己的席位始终在下方。单机点头像可以从该席位查看明牌与操作，点「操作席」回到当前行动或响应席。手牌在手机横屏、竖屏、平板和 PC 都在底部单行显示。
- 「完整桌面」切换到更宽松的桌框总览，「对局视角」恢复默认构图。点「查看牌河」可放大弃牌与公开区域。开启系统「减少动态效果」后，页面直接显示操作后的状态。
- 顶部「余」显示规则允许的普通摸牌数。「牌局详情」另列墙上实牌总数，其中包含保留牌。桌面青色边标记正常摸牌端，暖金边标记杠后补牌端。
- 实际对局使用逐牌Canvas精灵及DOM控件，按原三维顶点投影到2D，不依赖WebGL。旧的3D CSS仅为历史美术图鉴保留；新背景和头像位于 `web/assets/ui-v09/`。

## 牌墙规则

玩家逆时针按东、南、西、北行动。任何玩家固定第一视角均为下方 → 右方 → 上方 → 左方。正常摸牌沿物理墙顺时针，每面从 16 号墩摸到 0 号墩，再衔接东 → 北 → 西 → 南 → 东的下一面墙。杠后补牌从牌尾反向跨墩。两种取牌均从每墩上层开始。

每家从自己的视角左端为 0、右端为 16。开墙墩为 `16 - 小骰子`，点数和 5 或 9 时从庄家对家墙开墙。金指示牌在开墙墙的逆时针下家墙（顺时针上家墙），取 `大骰子 - 1` 号墩上层。翻开指示牌时它仍在墙上，之后可按规则正常取走。

[牌墙规则](WALL-RULES.md) 收录完整发牌方法、死墙边界、四面墙路径图和骰子示例。

## 托管与胡牌提示

- 席位上的「开启托管」使用普通 AI，再点「人工接管」即可恢复手动操作。顶部「托管」可选初级、普通和高级。联机时只能切换自己的席位，刷新或重连会恢复该席位的控制方式。
- 本地「托管」菜单中的「四家自动对局」会让四个席位使用普通 AI。「暂停托管」把四个席位交还人工。每局结束后可点「下一局」继续。
- 选中可报听的牌时，手牌附近会预览听口、可见剩余和支持的胡牌型。报听后继续显示当前听口。零张显示「已见完」，受首次上金限制的听口显示「需上金」。可见剩余包含未知位置的牌，实际可摸数量取决于牌墙和对手手牌。

## 十三幺拾牌

在自己席位的操作区点击「开启十三幺拾牌」。牌局默认关闭拾牌意向，幺九牌只有在存在合法操作时才会等待响应，界面没有独立拾牌弹窗。开启时会显示「十三幺·待拾」。有合法机会时，直接在普通操作区选择「拾牌」或「过」。首次实际取得弃牌后，席位显示「十三幺·已锁定」，拾来的牌公开保存在独立区域。本局余下的拾牌与胡牌遵循既有十三幺规则。

[Web 使用说明](WEB_README.md) 说明响应窗口、关掉意向及断线恢复时的行为。[v0.5.0 规则资料](THIRTEEN_ORPHANS_V0.5.0.md) 收录原始拾牌、上金与胡牌规则。

## 测试

```bash
python -m pip check
python -m unittest discover -v
python -m unittest -v tests.test_orphan_pickup
python -m unittest -v tests.test_gold tests.test_win
node --check web/app.js
node --check web/lan.js
node --check web/presentation.js
node --check web/table-scene.js
node --check web/perspective.js
node tests/v092_scene_logic.cjs
node tests/v093_projection.cjs
python -m unittest -v tests.test_v093_projection
node --check tests/ui_smoke.cjs
```

前端集成测试需要 Node.js 22.19 或更新版本。先在一个终端运行 `python web_server.py --no-browser`，然后在另一个终端运行：

```bash
npm install --no-package-lock
npm run test:ui -- http://127.0.0.1:8765
```

前端集成测试使用 jsdom 与真实 HTTP/WebSocket；它的 Canvas 是绘图桩，只验证 DOM、规则与联机，不能证明渲染质量。当前真实浏览器和性能测试：

```bash
python -m pip install playwright==1.62.0
python -m playwright install chromium firefox webkit
python -m tests.browser_acceptance --chromium /path/to/chromium
python -m tests.v101_scene_acceptance --chromium /path/to/chromium
python -m tests.scoring_browser_acceptance --chromium /path/to/chromium
python -m tests.soak_acceptance --chromium /path/to/chromium --rounds 8
python tools/performance_regression.py --chromium /path/to/chromium --screenshots --output validation/v1.0.0/current.json
python tools/performance_regression.py --engine firefox --samples 1 --output validation/v1.0.0/firefox.json
python tools/performance_regression.py --engine webkit --samples 1 --output validation/v1.0.0/webkit.json
node tests/v094_cuboid.cjs
node tests/v095_fit.cjs
node tests/v098_perspective.cjs
node tests/v101_texture.cjs
python -m tools.run_ai_matches --output ai-matches.json
```

性能工具不指定 `--base-url` 时会自行启动并清理独立服务。对原 v0.10.0 服务使用相同命令加 `--base-url http://127.0.0.1:8766 --baseline`，两版依次运行，避免其他浏览器负载；默认三次样本、四种视口、36次真实合法HTTP动作；`--scenario stress` 另测固定视角、可超过136张牌的合成栅格压力，不能当成真实对局；每个样本启动独立浏览器，每次等待牌图解码并取得两个 rAF 回调。`--cpu-rate 4` 仅为 Chromium CPU 节流，不等同于真实低端设备。`--max-update-ms` 为更新 p95 门禁，默认180ms；双 rAF 墙钟代理的 p95 门禁为350ms（包含自动化与软件渲染开销，不等于物理显示延迟）。同时检查缓存上限、存活像素、节点数量、未变化状态不重建及脚本/崩溃错误。完整时延和失败记录写入 JSON。冻结恢复测试加速服务端节奏，但不替换规则或 AI 决策；加 `--foreground --delay .24` 可测持续执行的四窗口及正常生产节奏。

`scene_acceptance`、`wall_browser_acceptance`、`layout_browser_acceptance`、`match_browser_acceptance` 保留 v0.8 的历史视觉断言，不能作为当前版本验收。当前 CI 使用已迁移的完整 `browser_acceptance`、新场景身份与暗牌检查、计分浏览器验收、性能工具和多局冻结恢复测试。预烘焙资源可用 `CHROMIUM_PATH=/path/to/chromium python tools/bake_tile_sprites.py` 重建。

命令行引擎可用 `python -m mahjong demo --seed 42 --rounds 3` 试跑。

## Web 美术与浏览器验收

[v0.9.3设计与验证报告](V0.9.3-DESIGN-AND-TESTS.md) 与 [v0.9.3浏览器原型截图](validation/v0.9.3/) 收录统一平面透视的几何验证与PC/手机静态原型；[v0.9.0设计与验证报告](V0.9.0-DESIGN-AND-TESTS.md) 保留前端初次重构的历史记录。

[v0.8.0 技术实现与验收报告](VALIDATION-v0.8.0.md) 收录六类视口、真实浏览器截图、新旧对比、联机重连实测及手机复验步骤。

[v0.7.2 桌面布局验收报告](VALIDATION-v0.7.2.md) 收录前后对比、七类视口和公开牌压力测试。

[v0.7.1 牌墙验收报告](VALIDATION-v0.7.1.md) 收录混合取牌、全量回归和浏览器截图。

[v0.7.0 验收报告](VALIDATION-v0.7.0.md) 收录实际浏览器截图、交互及性能结果。[2.5D 美术与渲染记录](TABLE-ART-v0.7.0.md) 收录原型对照、ImageGen 原图和上线资源。旧版规则与牌面审查见 [v0.6.0 验收报告](VALIDATION-v0.6.0.md)。

## 原版资料

- [原始 README](README.original.md) 收录规则引擎接口、调试命令和房间行为。
- [十三幺拾牌与金牌兼容](THIRTEEN_ORPHANS_V0.5.0.md) 和 [Web 使用说明](WEB_README.md) 介绍规则与界面。
- [v0.5.0 原始交付报告](TEST_REPORT_V0.5.0.md)、[原始测试日志](validation/) 和 [Web 变更历史](WEB_CHANGELOG.txt) 保留上游记录。
- [素材说明](web/assets/README.md) 介绍背景音乐、语音和资源映射。


**v0.9.1验证**：179项Python单元测试通过；详见 [v0.9.1设计与测试记录](V0.9.1-DESIGN-AND-TESTS.md)。

### 美术资源重建

`node tools/build_table_backgrounds.cjs` 从同一投影生成桌布矢量源；`CHROMIUM_PATH=/path/to/chromium python tools/bake_table_backgrounds.py` 预绘制保留原渐变、桌边和阴影的 1× / 1.5× PNG。运行时不再计算整桌实时滤镜。`tools/bake_tile_sprites.py` 生成 1×常用牌与 2×牌墙资源；高 DPI 仅选择所需一组。牌面 SVG 的完整性由 `tests/protected_art.json` 记录，修改美术时应明确审查并更新该清单。
