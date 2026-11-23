# 青雀麻将 v0.7.2 桌面布局验收

基线为 v0.7.1 的 `fix/mahjong-0.7.1-wall`（`7913729`）。浏览器为 Linux 上的 Chromium 154.0.8037.57。前后对比使用单机练习、种子 42、东家坐庄、发牌结束后的同一局面。

## 四席操作按钮

v0.7.1 在 1920×1080 下，普通席的两个按钮都高 27 px，字号均为 10 px。北家切入操作席后，旧北家选择器仍保留纵排和拉伸样式，两按钮随约 1000 px 宽的容器铺满。v0.7.2 将该选择器限制在旧布局。普通席统一为 30 px 高、11 px 字号和 4 px 间距，窄屏普通席为 32 px 高。操作席桌面端为 38 px 高、13 px 字号，手机为 44 px 高。两种席位都保持单个按钮文案不换行，空间不足时整枚按钮移至下一行。

Chromium 轮流将东、南、西、北切到操作席，逐次比较控件容器宽度及按钮的高度、宽度、字号、内边距、圆角、行高和换行行为。四家操作席的规格一致，每一轮的三个普通席也一致。点击「操作席」回到东家并正确聚焦。

[优化前后的北家与四家操作席按钮](validation/v0.7.2/buttons.webp)

## 桌面与公开牌

- 木框从 862×550 扩大到 1014×704 个场景单位，横向增加约 18%，纵向增加约 28%。桌布从 805×493 扩大到 958×648，面积增加约 56%。木框厚度为 43，木纹、桌布纹理、金属嵌边和原有两种观察角度继续使用。
- 牌墙的世界坐标和 17 墩间距沿用 v0.7.1。牌墙外缘至桌布边缘的留白，东西两侧为 164 个场景单位，南北两侧为 126 个场景单位。
- 桌上手牌、副露、上金、拾牌和报听牌共用 25×36×11 的实体尺寸。副露整组换行，补杠叠在横置来源牌上。各类公开牌之间留出间距，四面共用同一摆放算法。
- 使用浏览器测试夹具在 35 张牌河和部分剩余牌墙外摆放 49 张公开牌。压力最大的席位有四组副露、四张上金、十三张幺九牌和一张报听牌。依次把该组放到四个方位，每次排成两行，逐牌检查桌布范围、牌墙与手牌间隔、中央区域、相邻公开牌以及叠牌关系。夹具允许组合真实对局中互斥的状态。

[优化前](validation/v0.7.2/before-oblique.webp) · [优化后](validation/v0.7.2/oblique-1920x1080.webp) · [发牌前的 136 张牌墙](validation/v0.7.2/wall-full.webp) · [多组副露](validation/v0.7.2/multiple-melds.webp) · [密集公开牌斜视](validation/v0.7.2/crowded-oblique.webp) · [密集公开牌俯视](validation/v0.7.2/crowded-overhead.webp)

## 响应式

| 视口 | 斜视 | 俯视 |
| --- | --- | --- |
| 1920×1080 | [截图](validation/v0.7.2/oblique-1920x1080.webp) | [截图](validation/v0.7.2/overhead-1920x1080.webp) |
| 1600×900 | [截图](validation/v0.7.2/oblique-1600x900.webp) | 通过 |
| 1366×768 | [截图](validation/v0.7.2/oblique-1366x768.webp) | 通过 |
| 1280×720 | [截图](validation/v0.7.2/oblique-1280x720.webp) | 通过 |
| 手机竖屏 390×844 | [截图](validation/v0.7.2/oblique-390x844.webp) | 通过 |
| 手机横屏 844×390 | [截图](validation/v0.7.2/oblique-844x390.webp) | [截图](validation/v0.7.2/overhead-844x390.webp) |
| 平板竖屏 820×1180 | [截图](validation/v0.7.2/oblique-820x1180.webp) | 通过 |

两个角度均检查真实投影桌沿在首屏内、席位卡片与木框分离、页面没有横向滚动。较矮的桌面视口可以向下滚动查看操作栏余下内容。手机操作栏固定可达，长手牌可在栏内横向滑动。横屏把操作栏放在桌面右侧，普通席移到桌面下方，密集公开牌预览也可在席位卡片内滚动。移动端记录来自 Chromium 的视口及触屏模拟，真机和 Safari 未测。

[手机横屏密集公开牌](validation/v0.7.2/crowded-mobile-landscape.webp)

## 回归

| 检查 | 结果 |
| --- | --- |
| `python -m unittest discover -v` | 162 项通过，其中包含完整联机牌局和 15 项实体牌墙测试。 |
| `npm run test:ui -- http://127.0.0.1:8767` | 四客户端真实 HTTP/WebSocket 通过，覆盖 16 次同步行动、私有手牌、墙位、AI、掉线恢复和十三幺拾牌。 |
| `python -m tests.browser_acceptance` | 单机、四个联机视角、手机操作、联机重连、私有报听牌、下一局、美术图鉴和素材回退通过。 |
| `python -m tests.scene_acceptance` | 五种视口通过，核对实景渲染、正常摸牌和出牌动画、手机操作栏。 |
| `python -m tests.wall_browser_acceptance` | 四组骰子、四个墙角、四次连续杠补及之后的正常摸牌通过，核对实体墙位与动画起点。 |
| `python -m tests.layout_browser_acceptance` | 七种视口、四席样式、四方位压力夹具通过。实测吃、碰、明杠、暗杠、补杠、十三幺拾牌、上金、报听与出牌的终点和静止牌坐标误差小于 1 CSS px；另检查正常摸牌和杠补的落点。 |
| `python -m tools.run_ai_matches` | 三档 AI 共完成 102 局，其中 63 局胡牌、39 局流局。每局校验实体牌守恒与积分平衡。 |
| 语法与构建 | JavaScript 语法、Python 依赖、wheel 构建及 HTTP 健康检查通过，版本为 0.7.2。 |

## 修改文件

- `web/scene.css`、`web/play.css` 为玩家卡片、预览区及操作席分配空间，统一按钮规格。
- `web/table-scene.js`、`web/table-mesh.js`、`web/app.js` 描述桌面几何、投影与公开牌排列，切换视角后同步画布和动画锚点。
- `tests/layout_browser_acceptance.py` 检查计算样式、桌沿、公开牌区域和动画落点；`validation/v0.7.2/` 保存浏览器实拍。
- `web/index.html`、`package.json`、`pyproject.toml`、`mahjong/__init__.py` 更新版本；`README.md`、本报告和仓库 `PROJECTS.md` 记录功能与复验入口。
