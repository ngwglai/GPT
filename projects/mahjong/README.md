# 本地麻将 v0.5.0

本地麻将规则引擎、四家明牌调试页和四人局域网联机。v0.5.0 支持十三幺公开拾牌、连续牌局与刷新重连。规则由 Python 服务端执行。

## 安装与启动

在仓库的 `projects/mahjong/` 目录操作。需要 Python 3.11 或更新版本。Node.js 仅用于前端测试。

Windows 可双击 `start_web.bat`（或 `启动网页版.bat`）在本机运行，也可双击 `start_lan.bat`（或 `启动局域网联机.bat`）允许同一局域网的设备连接。脚本会创建或复用 `.venv`、安装并检查依赖。首次安装需要访问 Python 软件源。服务器运行时请保持命令窗口开启。

也可以在已激活的 Python 虚拟环境中启动：

```bash
python -m pip install -r requirements.txt
python web_server.py
```

打开 `http://127.0.0.1:8765/`。首页链接到四家明牌调试页 `/local.html` 和房间页 `/lan.html`。服务器可用 `--no-browser` 关闭自动打开浏览器。Windows 后台运行或重定向控制台输出时，可设置 `PYTHONIOENCODING=utf-8` 以输出中文启动信息。

## 局域网四人联机

手动启动时执行 `python web_server.py --host 0.0.0.0 --port 8765`。其他玩家连接同一 Wi-Fi 或有线网络，并访问主机的局域网 IPv4 地址，例如 `http://192.168.1.20:8765/`。Windows 可用 `ipconfig` 查看地址，并在防火墙提示时允许 Python 访问专用网络。

房主在联机页输入昵称、创建房间并分享六位房间号。其余玩家输入房间号加入。四人入座且在线后，房主开始游戏，东家掷骰发牌。刷新会用同一浏览器保存的身份恢复座位。

服务器使用 HTTP 和 WebSocket，适用于可信局域网。房间状态保存在内存，重启即清空。进行中的座位绑定浏览器保存的身份，清除网站数据后无法恢复该座位。

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

前端测试使用 jsdom 和实际 HTTP/WebSocket 连接，覆盖四个客户端的房间与牌局同步。屏幕排版和音频播放需要真实浏览器验收。命令行引擎可用 `python -m mahjong demo --seed 42 --rounds 3` 试跑。

## 原版资料

- [原始 README](README.original.md) 收录规则引擎接口、调试命令和房间行为。
- [十三幺拾牌与金牌兼容](THIRTEEN_ORPHANS_V0.5.0.md) 和 [Web 使用说明](WEB_README.md) 介绍规则与界面。
- [v0.5.0 原始交付报告](TEST_REPORT_V0.5.0.md)、[原始测试日志](validation/) 和 [Web 变更历史](WEB_CHANGELOG.txt) 保留上游记录。
- [素材说明](web/assets/README.md) 介绍背景音乐、语音和资源映射。
