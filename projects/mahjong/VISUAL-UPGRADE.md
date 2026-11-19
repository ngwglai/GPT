# 青雀麻将 · Web 美术升级

以 v0.5.0 为基础更新首页、局域网大厅、单机与联机对局、结算和声音设置。牌桌使用翡翠绒面、暖木边框和象牙白牌体。单机保留四家明牌练习，联机始终以自己的席位为下方。两个模式共用桌面渲染与交互样式。

## 本地查看

在 `projects/mahjong/` 安装依赖后运行。Windows 也可使用项目附带的启动脚本。联机启动和房间恢复说明见项目 README。

```bash
python -m pip install -r requirements.txt
python web_server.py --no-browser
```

| 地址 | 内容 |
| --- | --- |
| `http://127.0.0.1:8765/` | 首页与玩法入口 |
| `http://127.0.0.1:8765/local.html` | 单机四家明牌 |
| `http://127.0.0.1:8765/lan.html` | 局域网大厅 |
| `http://127.0.0.1:8765/asset-gallery.html` | 背景、34 张牌面、牌背、金牌、骰子、操作按钮、徽章、席位、HUD 与手机样式 |

## 美术资产

| 资源 | 制作方式 |
| --- | --- |
| `backgrounds/terrace.webp` | 使用内置图像生成工具制作首页牌桌场景 |
| `backgrounds/tearoom.webp` | 使用内置图像生成工具制作大厅茶室场景 |
| `table/jade-felt.webp` | 使用内置图像生成工具制作绒布纹理 |
| `tiles/0.svg` 至 `33.svg`、`tiles/back.svg` | SVG 矢量牌面和统一牌背。万、风牌、红中、发财使用 Noto Serif CJK 的字形轮廓，筒、条、一条雀和白板由几何图形绘制 |
| `dice/1.svg` 至 `6.svg`、`icons/marks.svg` | 按点数精确放置的骰子圆点和 SVG 图标 |
| `sfx/*.wav` | 代码合成的摸牌、落牌、骰子、响应及结算短音 |
| CSS | 牌体厚度、金牌高亮、木边框、座位状态、按钮和胡牌结算光纹 |

三张场景及材质图已实际生成并压缩为 WebP，总大小约 235 KiB。当前工具未公开底层图像模型标识，无法核验精确版本号。素材全部随项目本地加载。图像装饰缺失时保留桌面底色，牌面、牌背与骰子加载失败时使用文字或数字。

## 桌面交互

- 桌面和横屏平板保留四向座位与牌墙。手机将其他牌位排至上方，桌面信息和大尺寸操作牌分区显示。单机用「操作席」跳到当前玩家或第一位待响应玩家，联机用「我的手牌」跳回自己的座位。
- 点击手牌后再点操作按钮。桌面用蓝、紫、暖黄分别显示摸牌端、补牌端和金指示位。副露、上金、拾幺牌和报听牌的独立区域在对应牌出现时展开。
- 胡牌和流局使用独立结算样式。累计分与上局记录在桌框下方。展开「牌局详情」查看 round 和 revision，单机一并显示 Seed。
- 声音面板有 BGM、音效和语音三路开关与独立音量，设置保存到当前浏览器。牌局中的首次点击可启动背景音乐。

## 维护与验收

视觉令牌和顶栏、声音面板在 `web/styles.css`，桌面组件在 `web/table.css`，大厅与图鉴分别在 `web/lan.css` 和 `web/gallery.css`。桌面、房间状态和美术展示复用 `web/components.js`。资源替换和 SVG 再生成方式见素材说明。

```bash
python -m unittest discover -v
npm install --no-package-lock
npm run test:ui -- http://127.0.0.1:8765
```

浏览器验收会启动独立临时本地服务器。安装 Playwright 后运行以下命令。截图目录可省略。已有 Chromium 可用 `--chromium /path/to/chromium` 指定。

```bash
python -m pip install playwright
python -m playwright install chromium
python -m tests.browser_acceptance --screenshots ./review-images
```

Python 144 项回归和现有 jsdom 集成通过，包括真实四客户端同步、手牌隔离和完整联机流局至下一局。Chromium 验收通过，额外覆盖首页链接、响应用例、移动端触控、BGM 播放、声音设置持久化、图鉴与缺图回退，并生成 19 张截图。其中胡牌、流局等稀有场景使用测试进程内的现有规则夹具，通过实际页面按钮与服务端交互。浏览器尺寸为 1920×1080、1366×768、1024×768 和 390×844。移动尺寸是在 Chromium 中模拟的，暂未做 iOS Safari 与实机局域网连通性验收。
