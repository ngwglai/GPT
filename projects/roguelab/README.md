# RogueLab · 深井协议

用 Godot 4.6.3 制作的独立回合制卡组肉鸽。你要带着一套不断改写的战斗协议，穿过失控实验室的三层区域，关闭深井核心。目标用户是喜欢路线选择、资源取舍和构筑组合的单人策略玩家；无需账号、付费接口或服务器。

- **Web 试玩**：<https://ngwglai.github.io/GPT/roguelab/>
- **Windows 下载**：<https://github.com/ngwglai/GPT/releases/tag/roguelab-v1.0.0>
- 游戏界面为英文；本页提供中文操作和机制说明。

链接对应发布目标；发布是否完成请以 GitHub Pages 与 Release 的实际状态为准。

## 完整游戏内容

- 三职业：Warden（护盾反击）、Mycologist（毒素与催化）、Engineer（充能与连锁）。所有职业立即可用，无永久数值养成门槛。
- 三幕，每幕七层、三条相邻路线；普通战、精英、随机事件、休息、商店、首领。每幕第 1、3、5 层必有战斗，第 7 层为首领。
- 35 种卡牌定义（含一张敌人加入的干扰牌），14 种遗物，6 种普通敌人、2 种精英与 3 位首领，4 个三选一事件。
- 卡牌奖励三选一或跳过；永久升级、商店删牌、精英遗物，以及生命/金币/药剂的跨战斗管理。
- 敌人行动预告、状态、抽弃牌堆与消耗牌堆；完整胜利、死亡、结算与再开流程。
- 可复现种子、UTC 每日种子、五档 Threat 难度、本地战绩和逐行动自动存档。
- 原创程序化图形、轻量合成提示音、键鼠操作；无广告、遥测、登录与外部运行资源。

## 操作与策略

点击 `BEGIN DESCENT` 开局。地图仅亮起可到达节点，选一条路线前进。战斗中点击敌人面板选择目标，再点击卡牌；数字 `1–9 / 0` 也可打牌，左右方向键切换目标，空格结束回合，`H` 使用药剂，`Esc` 关闭弹层或返回主菜单。菜单中的 `CONTINUE` 恢复当前冒险；新开局会先确认替换已有存档。

每回合通常有 3 能量、抽 5 张牌。未打出的手牌回合结束时进入弃牌堆，抽牌堆用尽时洗入弃牌。`Exhaust` 只在本场战斗移除卡牌；`Power` 效果持续整场。卡牌升级会在名字后显示 `+`，数值同步更新。

护盾挡攻击，通常在自己下回合开始时清空。`Weak` 使攻击伤害减少 25%；`Vulnerable` 使目标受到的攻击伤害增加 50%。敌人毒素在行动前造成穿透护盾的伤害并减少 1；玩家毒素在结束回合后结算。`Charge` 为 Overload 与 Static shield 提供增益。药剂不消耗能量，一次恢复 16 HP。

Warden 可先叠护盾再用 Repulsor 反击；Mycologist 可用孢子叠毒，再用 Catalyst 翻倍；Engineer 需要考虑保留充能用于防御，还是立即 Overload 结束战斗。不要盲目拿每张奖励牌；精简卡组能更频繁抽到关键组合。休息只能选择回血或升级其一，商店每次只能删一张牌。

输入数字种子可复现同职业、同难度、同选择的一局；文本种子转换为稳定数字，结算显示的数字可直接分享。每日种子只是同一天的共同随机源，不提供联网排行榜。Threat 每档提高敌人生命 12% 并增加 1 点力量。

## 本地启动

使用官方 **Godot 4.6.3 standard**（无需 .NET）打开本目录 `project.godot`，按 F6/F5 运行，或：

```sh
godot --path projects/roguelab
```

Windows 下载包解压后直接运行 `RogueLab.exe`。程序未购买商业代码签名；无需安装 Godot。

项目源代码完全在 `projects/roguelab/` 内，除独立 Actions、聚合 Pages 工作流和项目索引外，不修改其他项目。

## 测试与导出

在仓库根目录运行：

```sh
python projects/roguelab/tools/verify.py
# 已安装匹配的官方导出模板时：
python projects/roguelab/tools/verify.py --export
python -m pip install playwright==1.62.0
python -m playwright install chromium
python projects/roguelab/tests/web_smoke.py
# 最高难度的另一次平衡抽样：
godot --headless --path projects/roguelab --script tests/simulate.gd -- --hard
```

`verify.py` 将 GDScript 错误当成失败，即使 Godot 进程返回 0。覆盖规则、所有界面、60 局完整种子模拟；浏览器测试操作真实导出文件，读取正常 IndexedDB 存档核对状态，不注入作弊接口。

官方工具链安装脚本只向显式指定目录写入文件，并校验固定 SHA-256。CI 使用它安装引擎与模板；Linux 同时导出 Web 和 Windows，Windows runner 再执行规则测试并启动导出的 EXE。构建产物位于本项目 `build/`，不提交进 Git。Web 本地测试须用 HTTP 服务，不能双击 HTML：

```sh
python -m http.server 8080 --directory projects/roguelab/build/web
```

## 发布隔离

`.github/workflows/roguelab.yml` 按项目路径触发，独立执行检查、导出和 Windows 原生验收。仅 main 的成功流水线可创建 `roguelab-v1.0.0` Release；既有版本不会覆盖。新版本需更新应用版本、tag、下载链接与说明。

Pages 沿用仓库唯一聚合发布工作流：同时构建原有 `/entropylab/` 和新增 `/roguelab/`，保留站点入口。推送执行构建检查；显式触发 `GitHub Pages` 工作流才发布。没有另建会覆盖全站的 deploy-pages 工作流。Godot 使用 Compatibility 渲染与单线程 Web 导出，无需 SharedArrayBuffer、COOP/COEP 或服务工作线程接管其他路径。

## 存储、隐私与限制

所有游戏状态仅存在本机 Godot `user://`，Web 对应站点 IndexedDB；不收集身份、不请求凭据。清理站点数据会删除存档；隐私模式或禁用存储时不保证跨会话保存。存档带版本、结构与内容校验，损坏时保留提示并允许重新开始。它不是防作弊系统。

优先支持桌面 Chrome / Edge / Firefox 等提供 WebGL 2 的浏览器。已自动验证 Chromium；Safari、Firefox、手机触屏和 Windows 图形窗口的人工长时间试玩不作已验证承诺。手机横屏可缩放显示，较小屏幕文字会变小。Godot canvas 目前没有完整屏幕阅读器支持。

内容为 v1 的有限池，具有完整通关与重复构筑流程，但长期平衡仍需要真实玩家反馈。自动策略胜率不等于真人胜率。未来可扩展中文界面、更多事件和职业卡，不以增加永久属性数值替代策略深度。

源码许可见 [LICENSE](LICENSE)，引擎许可见 [THIRD_PARTY.md](THIRD_PARTY.md)。开发记录与实际测试结果见 [VALIDATION.md](VALIDATION.md)。
