# 青雀麻将 v0.7.0 牌桌美术与渲染

## 设计原型

先用 ImageGen 确定深胡桃木、墨绿绒布、象牙色陶瓷、香槟金嵌条和青瓷牌背。概念图包含俯视、斜俯视、绒布、木材、金属圆角和麻将牌的六个分格。[概念原图](web/assets/table/concept/table-studies.png)

分格可单独查看。[俯视](web/assets/table/concept/overhead.webp) · [斜视](web/assets/table/concept/oblique.webp) · [绒布](web/assets/table/concept/baize.webp) · [木材](web/assets/table/concept/walnut.webp) · [金属与圆角](web/assets/table/concept/trim.webp) · [牌体与牌背](web/assets/table/concept/tile.webp)

用同一组 ImageGen 纹理和原 SVG 牌面各做一个最小原型。两个原型都在 Chromium 中显示了透视牌桌、双层堆叠、同一批公开牌和独立的骰井。WebGL 2 原型还在软件图形后端运行了一次。[真实浏览器原型对照](validation/v0.7.0/prototypes.webp) · [原型源文件](tools/table-prototypes.html)

| 方案 | 原型观察 | 实施代价 |
| --- | --- | --- |
| CSS 3D + SVG | 牌沿清楚，SVG 字形锋利。圆角、材料高光和遮挡均可表现。 | 桌框侧壁需要分段构建。光照由各材质表面及阴影样式定义。 |
| Three.js 0.180 / WebGL 2 | 材质可接受真实方向光。深度排序交给 GPU。 | 需要为逐牌 SVG 生成纹理，为鼠标、键盘和触屏连接额外的场景与 HTML 控件。部署还需要 WebGL 2 可用性处理。 |

选择 CSS 3D。桌沿包含带开口的顶面、分段的圆角侧壁、底层和嵌条。绒布坐在嵌条下方。牌面、牌背和四条侧边具有独立深度。俯视和斜视共用桌面坐标。现有 SVG 可以直接显示，手牌和操作继续使用原生 HTML 按钮。静止牌的可见面使用同一透视坐标批绘到单层画布，以减少浏览器合成层数。移动牌、骰子和操作区维持 CSS 3D。画布不可用时，保留完整 CSS 3D 牌体。

复验原型时在项目目录运行 `npm install --no-save --no-package-lock three@0.180.0`，再运行 `python -m http.server 8921`，访问 `http://127.0.0.1:8921/tools/table-prototypes.html`。正式游戏直接由 Python 服务器提供所需文件。

## ImageGen 使用记录

工具输出为 PNG，透明装饰选择透明背景。以下路径位于 `web/assets/table/`。ImageGen 输出保留工具生成的原始文件。公开仓库保存逐像素相同的全尺寸 PNG，公开副本移除了嵌入的来源元数据。生成图未参与最终牌面绘制，正式游戏沿用 34 张经审查的 SVG 和六种骰子点数。

| 用途 | ImageGen 请求 | 原图 | 上线文件与处理 |
| --- | --- | --- | --- |
| 统一视觉参考 | 六格工业设计表，包含四家俯视、桌面斜视、三类桌面材质和麻将牌特写，无字样 | [table-studies.png](web/assets/table/concept/table-studies.png) | 供设计及原型参考 |
| 绒布 | 正交漫反射材质表左半，均匀松绿色羊毛绒布 | [felt-and-walnut.png](web/assets/table/generated/felt-and-walnut.png) | [felt.webp](web/assets/table/textures/felt.webp)，512×512。裁出干净样本，缩放后镜像铺接各边 |
| 桌框 | 同一材质表右半，平光下细纹深胡桃木 | [felt-and-walnut.png](web/assets/table/generated/felt-and-walnut.png) | [walnut.webp](web/assets/table/textures/walnut.webp)，512×512。独立裁切和镜像铺接，用于木框顶面及侧壁 |
| 牌背 | 无倒角或透视的青瓷色背底，中部有细金线雀羽纹 | [celadon-back.png](web/assets/table/generated/celadon-back.png) | [celadon.webp](web/assets/table/textures/celadon.webp)，128×163。居中裁成长方形，覆盖立体牌背 |
| 骰井外圈 | 透明背景、正交视图的圆形铜质装饰，四个嵌件，无骰子或文字 | [dice-well.png](web/assets/table/generated/dice-well.png) | [dice-well.webp](web/assets/table/decorations/dice-well.webp)，320×320。圆形遮罩去掉轮廓外颗粒，保留抗锯齿透明边。检查四角 alpha 为 0，中心为 0.99 |
| 房间 | 宽屏、暖光、正俯视深木房间，中央预留桌面位置 | [club-room.png](web/assets/table/generated/club-room.png) | [club-room.webp](web/assets/table/backgrounds/club-room.webp)，1440×810。缩放并压缩，窄屏用纯色背景 |

处理使用 ImageMagick。每份上线 WebP 移除了图像元数据。桌布、木材、牌背、骰井和背景合计约 80 KB，源 PNG 不参与页面加载。浏览器的资源记录见 [performance.json](validation/v0.7.0/performance.json)。

## 动作与布局

`table-scene.js` 把公开桌况、当前视图可见的手牌和座位方向转换成场景坐标。`MahjongTile` 为桌面对象和操作区提供共用的六面结构。右下角摸牌间距、金色牌面和选牌边线反映当前状态。暗牌直接使用牌背素材。

现行墙位、四面墙路径和层号见 [v0.7.1 实体牌墙规则](WALL-RULES.md)。

正常摸牌与杠后补牌事件携带公开墙位坐标，继续隐藏牌型和实体 ID。浏览器以快照中的实际出发点和目标点执行确定性曲线路径。牌河按服务器弃牌顺序排布，移走已被认领的牌。吃碰杠的横牌位置以相对来源确定，补杠将新增的牌叠到原横牌上。上金、十三幺拾牌、报听暗牌和胡牌继续遵循服务器提供的可见状态。重连进入当前桌况，减少动画模式直接显示当前桌况。
