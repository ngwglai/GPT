# 本地麻将 v0.5.1

青雀麻将提供四家明牌练习和四人局域网联机。v0.5.1 支持主动开启十三幺拾牌、连续牌局与刷新重连，规则由 Python 服务端执行。Web 美术升级提供翡翠绒面牌桌、SVG 牌组和桌面、平板、手机布局。

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
node --check tests/ui_smoke.cjs
```

前端集成测试需要 Node.js 22.19 或更新版本。先在一个终端运行 `python web_server.py --no-browser`，然后在另一个终端运行：

```bash
npm install --no-package-lock
npm run test:ui -- http://127.0.0.1:8765
```

前端测试使用 jsdom 和实际 HTTP/WebSocket 连接，覆盖四个客户端的房间同步、私人拾牌意向、重连和公开锁定，另有 Playwright 验收覆盖手机触控、普通操作共存及牌桌布局。命令行引擎可用 `python -m mahjong demo --seed 42 --rounds 3` 试跑。试玩机器人继续从各自的合法操作中选择，开局主动开启意向以保留原有策略。

## Web 美术与浏览器验收

[美术升级说明](VISUAL-UPGRADE.md) 收录资产清单、布局与操作变化，以及 Playwright 验收和截图生成方式。

## 原版资料

- [原始 README](README.original.md) 收录规则引擎接口、调试命令和房间行为。
- [十三幺拾牌与金牌兼容](THIRTEEN_ORPHANS_V0.5.0.md) 和 [Web 使用说明](WEB_README.md) 介绍规则与界面。
- [v0.5.0 原始交付报告](TEST_REPORT_V0.5.0.md)、[原始测试日志](validation/) 和 [Web 变更历史](WEB_CHANGELOG.txt) 保留上游记录。
- [素材说明](web/assets/README.md) 介绍背景音乐、语音和资源映射。
