# 青雀麻将 v0.8.0 技术实现与验收

## 范围与实现

以 `fix/mahjong-0.7.2-table` 的 `bd9d30b` 为基准。GitHub 的 `main` 在开发开始时为 v0.5.1，所以功能分支同时包含原有的 v0.6–v0.7.2 提交。

- 对局镜头对桌面内容做透视投影，按牌河、公开牌、指示牌和其他三席立牌的投影边界决定缩放。木框可延伸出画面。完整桌面使用更接近俯视的角度，按桌框和牌体的联合边界适配。
- 牌体局部坐标以 +z 为牌面、−z 为牌背、−y 为牌面文字上缘、+y 为下缘、±x 为侧缘。桌面牌平放，三席手牌绕局部 x 轴竖立，由座向和向内法线计算方位。左右席再朝观察方向对称旋转，使牌背的投影面积大于上缘。单机选席位时，手牌、操作区和相对座向同时更新。
- 底部手牌使用独立前景层。牌宽根据可用宽度、手牌数、牌间距和摸牌间隔计算。全部手牌共用一行，主要操作紧贴上方。选牌抬升 8 像素，再点同牌确认普通出牌。报听、上金和多个组合各有明确的按钮。四方座位资料、得分、托管、状态和公开区可随时查看。
- 桌面和前景以实体牌、墙位、牌河及公开区的键匹配动画起终点，再转换到同一个浏览器坐标系。普通摸牌、补牌、出牌和副露可在两层之间移动。游戏逻辑仍由原有引擎提供。
- 听牌预览使用现有求解器、合法报听动作、本人手牌和已授权可见的桌面信息。预览及听口牌型通过 Web 展示接口只发给该席位。未知位置的牌仍计入可能剩余，数字不等同于实际可摸牌数。

## 对局参考

查看了官方入门指南第 14 页的横屏画面和分步操作，也查看了 Steam 的 PC 实战截图与预告片的桌面、杠和荣胡画面。参考了底部一排手牌、分隔的摸牌、轻抬后确认打牌、操作出现时靠近手牌、座位信息绕桌分布等做法。青雀沿用自己的桌面、牌面、音频和反馈。公开官方资料中的对局画面为横屏，本版竖屏按青雀自身的可用面积布局。 [官方入门指南](https://mahjongsoul.com/startguide/assets/jantama_startguide.pdf#page=14) · [Steam 官方截图与预告片](https://store.steampowered.com/app/2739990/Mahjong_Soul/)

## 联机缩放调查

在四个 Chromium 浏览器上下文中，v0.7.2 的连续页面缩放和旋转保留同一条 WebSocket，没有页面重载或异常。另一个实验在握手期间连续触发两次 `online`，v0.7.2 建立三条连接，前两条以 1006 中止。v0.8.0 的同一实验只有一条连接。原手机是否经历了这一竞态，仍待现场复验。

现在连接生命周期由 `lan.js` 管理。窗口尺寸和摄像机变化只触发布局及绘制。连接断开时保留最后画面和身份，暂停发送操作，按退避策略依原房间和令牌重新鉴权。服务端的权威状态到达后恢复交互。有编号的操作等待自己的确认，其他客户端的房间通知不会解锁此操作。已发送的动作在恢复连接时不重发。鉴权输入被中断或超时只关闭该连接，确认房间或身份不存在时才清除凭据。

## 浏览器截图

截图由 Chromium 渲染青雀麻将真实页面。常规布局和响应按钮使用游戏状态或服务端合法动作，密集公开牌使用压力夹具。每张对比图都保持相同的浏览器尺寸和牌局夹具。

| 场景 | 截图 |
|---|---|
| PC 默认对局视角 | [1920×1080](validation/v0.8.0/match-1920x1080.webp) · [1366×768](validation/v0.8.0/match-1366x768.webp) |
| PC 完整桌面 | [1920×1080](validation/v0.8.0/full-desktop.webp) |
| 手机横屏与竖屏 | [844×390](validation/v0.8.0/match-844x390.webp) · [390×844](validation/v0.8.0/match-390x844.webp) |
| 平板横屏与竖屏 | [1180×820](validation/v0.8.0/match-1180x820.webp) · [820×1180](validation/v0.8.0/match-820x1180.webp) |
| 手机 14 张手牌与选牌抬升 | [操作截图](validation/v0.8.0/phone-14-selected.webp) |
| 四个观察席与三家牌背 | [四席对比](validation/v0.8.0/perspectives.webp) |
| 吃、碰、明杠、胡与过 | [吃碰杠](validation/v0.8.0/phone-calls.webp) · [胡与过](validation/v0.8.0/phone-win-or-pass.webp) |
| 听口、可见剩余与胡牌型 | [报听预览](validation/v0.8.0/phone-ting-preview.webp) · [报听后](validation/v0.8.0/phone-ting-declared.webp) |
| 多组副露及 80 张弃牌压力用例 | [多组副露](validation/v0.8.0/multiple-melds.webp) · [手机横屏](validation/v0.8.0/crowded-844x390.webp) · [手机竖屏](validation/v0.8.0/crowded-390x844.webp) · [PC](validation/v0.8.0/crowded-1920x1080.webp) |
| 新旧版本 | [手机横屏](validation/v0.8.0/compare-landscape.webp) · [手机竖屏](validation/v0.8.0/compare-portrait.webp) · [PC](validation/v0.8.0/compare-desktop.webp) |

## 自动化验收

测试在项目目录运行。Chromium 154 由 Playwright 驱动。四客户端联机测试校验视觉变化期间的连接、牌局与席位，以及模拟断线后的操作确认。浏览器度量和断线记录见 [验收数据](validation/v0.8.0/evidence.json)。

```bash
python -m unittest discover -q
npm run test:ui -- http://127.0.0.1:8765
python -m tests.browser_acceptance --chromium /usr/bin/chromium
python -m tests.wall_browser_acceptance --chromium /usr/bin/chromium
python -m tests.layout_browser_acceptance --chromium /usr/bin/chromium
python -m tests.scene_acceptance --chromium /usr/bin/chromium --output scene-screenshots
python -m tests.match_browser_acceptance --chromium /usr/bin/chromium --output match-screenshots
python -m tools.run_ai_matches --output ai-matches.json
```

| 检查 | 结果 |
|---|---|
| Python 回归 | 164 项通过，含牌墙顺序、计分、金牌、十三幺、房间鉴权和私有听牌数据 |
| DOM 集成 | 四客户端完成坐席、掷骰、16 次同步操作、托管、复连和拾牌 |
| Chromium 对局与墙位 | 四客户端、人机控制、音频、常规摸牌、跨角取牌、四次杠后补牌、响应仲裁及素材回退通过 |
| Chromium 布局与动画 | 八类屏幕的完整桌面边界、四席按钮尺寸、四席各 49 张公开牌布局压力场景及副露、上金、拾牌、报听、出牌和补牌落点通过 |
| Chromium 新版验收 | 六种目标视口的 13 张与 14 张手牌均完整单行。844×390 下牌宽 40 px，390×844 下牌宽 25.5 px，两处触控高度均至少 44 px。两种镜头的适用边界、其他三席牌背、操作组合、听牌和 80 张弃牌场景通过 |
| AI 连续对局 | 初级、普通和高级合计 102 局，63 局胡牌、39 局流局，累计分守恒 |

联机浏览器测试在等待响应时设定页面比例为 1.75、1、2、1，记录到 7 次 `visualViewport` 变动和 5 次窗口尺寸事件。缩放、旋转、切换镜头和模拟返回前台期间只使用一条 WebSocket。随后主动关闭一次连接，并在操作确认后中断一次 TCP 传输，浏览器分别记录关闭代码 1000 和 1006。两次均恢复至同一房间、牌局和原席位，依然只有本人可见的私有手牌。操作只发送和确认一次，revision 从 0 到 1，浏览器无未捕获异常。

## 真机复验

本环境的 Chromium 合成双指手势未改变页面比例，因此用 CDP 设置页面比例验证真正的 visualViewport 变化。冻结与激活指令未出现 DOM 冻结回调，测试另外模拟了隐藏和返回前台的事件。iOS Safari 和 Android Chrome 的原生双指手势、浏览器栏和长时间后台调度需要使用真实设备复验。

1. 在同一局域网用四个独立浏览器加入一桌，手机坐在有待响应动作的一席。通过「详情」记录本局标识和 revision，在开发工具查看 WebSocket 连接。
2. 手机双指放大到约 1.8 倍并缩回。连续旋转设备三轮，再切换「完整桌面」与「对局视角」。在没有提交动作时，确认同一个房间、席位和 revision，等待操作依然可点。
3. 切到其他应用再返回，随后暂时关闭手机 Wi-Fi 再接回同一网络。恢复后确认原手牌和座位，再点「过」或执行一个合法动作。用另一个客户端确认 revision 只推进一次。
