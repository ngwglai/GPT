# 青雀麻将素材

`manifest.json` 记录逻辑键与资源的对应关系。路径可相对本目录，浏览器也接受同源根路径。运行时只需要项目自带资源。

| 清单键 | 素材 |
| --- | --- |
| `backgrounds.home`、`backgrounds.lobby` | 首页牌桌、大厅茶室的 WebP 场景图 |
| `table.felt` | 牌桌绒面 WebP |
| `tiles.0` 至 `tiles.33`、`tiles.back` | SVG 牌面和暗牌。顺序为万、筒、条、东南西北、中发白 |
| `dice.1` 至 `dice.6` | 六个点数的 SVG 骰面 |
| `ui.icons` | 包含青雀、房主、在线、断线、声音等图标的 SVG 符号表 |
| `bgm`、`voice`、`sfx` | 背景音乐、牌名及动作语音、合成事件音效 |

可用 `table.background` 指定整页底图、用 `bgm.result` 指定结算音乐，并在 `voice.wins` 按后端牌型标识配置优先播放的胡牌语音。

牌面 SVG 负责牌纹，牌体的厚度、金牌光晕和不同尺寸由 `table.css` 控制。整套矢量牌纹与骰面可用项目的 `tools/draw_game_assets.py` 重画。该脚本使用装有 fontTools 的 Python 和本机 Noto Serif CJK Bold，简体中文 TTC 通常指定 `--font-index 2`。现成 SVG 已把字形转成路径，游玩设备无需安装该字体。Noto 字体项目采用 SIL Open Font License 1.1。

运行服务后访问 `/asset-gallery.html` 查看主要资源及组件。图片文件或清单缺失时，桌面留有底色，牌面与骰子会显示文字与数字。背景图由内置图像生成工具生成，牌面、骰子、图标及结算纹样由矢量和 CSS 绘制。详细资产清单与验收见项目美术升级说明。
