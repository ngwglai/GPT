# 青雀麻将 v0.7.1

青雀麻将提供四家明牌练习和四人局域网联机。v0.7.0 加入具有真实透视的 2.5D 牌桌、六面麻将牌、双层牌墙与沿桌面移动的动作动画。继续支持三档 AI 托管、报听后的胡牌提示和可见剩余数量。规则由 Python 服务端执行。v0.7.1 修正开墙、金指示牌与双端取牌，统一服务端墙位和 2.5D 场景坐标。

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

## 2.5D 牌桌

- 点击手牌选中，再用下方操作区确认出牌、报听或上金。联机时自己的座位始终在下方。单机可点击任一座位的头像查看手牌，点「操作席」回到当前响应席位。
- 「俯视」与「斜视」切换桌面角度。「查看牌河」按座位放大所有弃牌，可在手机上查看远处及侧面的牌面。
- 手机竖屏将操作区固定在下方，横屏将操作区置于牌桌右侧。自己的手牌可横向滑动。浏览器启用「减少动态效果」时直接显示每次操作后的状态。
- 顶部「余」显示规则允许的普通摸牌数。「牌局详情」另列墙上实牌总数，其中包含保留牌。桌面青色边标记正常摸牌端，暖金边标记杠后补牌端。
- 建议使用支持 CSS 3D 的现代浏览器。游戏资源由本地服务提供，无须联网下载 3D 引擎。实际桌面需要的 ImageGen 素材约 80 KB。

## 牌墙规则

玩家逆时针按东、南、西、北行动。正常摸牌沿物理墙顺时针，每面从 16 号墩摸到 0 号墩，再衔接东 → 南 → 西 → 北 → 东的下一面墙。杠后补牌从牌尾反向跨墩。两种取牌均从每墩上层开始。

每家从自己的视角左端为 0、右端为 16。开墙墩为 `16 - 小骰子`，点数和 5 或 9 时从庄家对家墙开墙。金指示牌在开墙墙的上家墙，取 `大骰子 - 1` 号墩上层。翻开指示牌时它仍在墙上，之后可按规则正常取走。

[牌墙规则](WALL-RULES.md) 收录完整发牌方法、死墙边界、四面墙路径图和骰子示例。

## 托管与胡牌提示

- 席位上的「开启托管」使用普通 AI，再点「人工接管」即可恢复手动操作。顶部「托管」可选初级、普通和高级。联机时只能切换自己的席位，刷新或重连会恢复该席位的控制方式。
- 本地「托管」菜单中的「四家自动对局」会让四个席位使用普通 AI。「暂停托管」把四个席位交还人工。每局结束后可点「下一局」继续。
- 报听后，手牌旁会用实际牌面列出听口和各自的可见剩余。零张显示「已见完」，受首次上金限制的听口显示「需上金」。可见剩余包含未知位置的牌，实际可摸数量取决于牌墙和对手手牌。

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
node --check web/table-mesh.js
node --check tests/ui_smoke.cjs
```

前端集成测试需要 Node.js 22.19 或更新版本。先在一个终端运行 `python web_server.py --no-browser`，然后在另一个终端运行：

```bash
npm install --no-package-lock
npm run test:ui -- http://127.0.0.1:8765
```

前端集成测试使用 jsdom 和真实 HTTP/WebSocket 连接。浏览器验收使用 Chromium，在项目目录运行：

```bash
python -m pip install playwright==1.62.0
python -m playwright install chromium
python -m tests.browser_acceptance --screenshots browser-screenshots
python -m tests.scene_acceptance --output scene-screenshots
python -m tests.wall_browser_acceptance --output wall-screenshots
python -m tools.run_ai_matches --output ai-matches.json
```

命令行引擎可用 `python -m mahjong demo --seed 42 --rounds 3` 试跑。

## Web 美术与浏览器验收

[v0.7.1 牌墙验收报告](VALIDATION-v0.7.1.md) 收录混合取牌、全量回归和浏览器截图。

[v0.7.0 验收报告](VALIDATION-v0.7.0.md) 收录实际浏览器截图、交互及性能结果。[2.5D 美术与渲染记录](TABLE-ART-v0.7.0.md) 收录原型对照、ImageGen 原图和上线资源。旧版规则与牌面审查见 [v0.6.0 验收报告](VALIDATION-v0.6.0.md)。

## 原版资料

- [原始 README](README.original.md) 收录规则引擎接口、调试命令和房间行为。
- [十三幺拾牌与金牌兼容](THIRTEEN_ORPHANS_V0.5.0.md) 和 [Web 使用说明](WEB_README.md) 介绍规则与界面。
- [v0.5.0 原始交付报告](TEST_REPORT_V0.5.0.md)、[原始测试日志](validation/) 和 [Web 变更历史](WEB_CHANGELOG.txt) 保留上游记录。
- [素材说明](web/assets/README.md) 介绍背景音乐、语音和资源映射。
