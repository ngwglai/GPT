# 本地麻将 v0.5.0 交付与测试报告

验证日期为 2026 年 11 月 19 日。以用户提供的 v0.4.0 完整 ZIP 为基线。v0.5.0 ZIP 内含完整源码、原有网页素材、Windows 双击启动入口、测试、验证日志及规则说明。

## 交付状态

| 状态 | 结果 |
|---|---|
| 已实现且测试通过 | 上金文字统一；十三幺拾牌、公开牌区、每轮限制、跳过摸牌和路线锁定；金牌补缺、报听、自摸及荣胡；联机终局暗牌隔离；原有规则、计分、连续多局与断线重连。 |
| 已实现但测试未通过 | 无产品测试失败。尝试启动系统 Chromium 时，执行环境禁止 Chromium 创建本地进程锁套接字，未进入页面。jsdom 前端集成和四连接 HTTP/WebSocket 测试均通过。 |
| 已实现，部分待验证 | Windows 启动脚本及干净 ZIP 已完成。已验证 Linux 下的干净虚拟环境建置、依赖安装、离线重复检查和实际服务启动，也已下载 Windows x64 Python 3.11 适配的全部依赖。当前环境无 Windows，未执行原生双击启动。 |
| 尚未实现 | 本次任务范围内无已知未实现功能。 |
| 因规则信息不足而暂缓 | 原本未确认的流局附加结算、即时上金支付和杠分继续按 v0.4.0 的配置处理。未为十三幺拾牌增设额外计分。 |

## 回归结果

| 验证 | 实际结果 |
|---|---|
| v0.4.0 基线 | 129 项。127 项通过，2 项在胡牌终局复现对手暗牌泄露。两项原断言保留，在 v0.5.0 通过。 |
| v0.5.0 Python 完整回归 | 142 项全部通过。含全部 129 项原测试，以及 12 项十三幺规则测试和 1 项四连接联机拾牌测试。使用 Python 3.12，常规环境与从 `requirements.txt` 新装依赖的环境各完成一轮。 |
| 十三幺动作与实体守恒 | 实际发牌后的拾取转移和牌河清除、公开而不可弃、牌墙游标不变、拾后结构牌数正确，每一步维持 136 张实体牌守恒。测试覆盖同轮第二次被拒、不同玩家同轮拾取、跨庄位进入下一轮、次局重置，以及胡、杠、碰和吃的响应优先级。 |
| 听口、上金与十三幺结构 | 锁定后拒绝普通胡和七对；支持十三幺报听、荣胡、用金牌补缺后的自摸；验证金牌可补对子、金本身为幺牌、首次上金资格、非法余牌、两个对子、三张同牌及重复实体。原普通胡、七对、十三幺及上金测试全部保留。 |
| 联机和终局 | 真实 HTTP/WebSocket 连接四个认证席位，验证公开拾牌、断线重连、荣胡和终局隔离。自然流局共经历 153 次认证操作，流局后仍隐藏对手暗牌，房主可续局并重新发牌。现有抢补杠和其他终局测试也通过。 |
| 前端集成 | Node.js 24.22.3 与 jsdom 30.0.1。四客户端建房、选座、掷骰、16 步同步操作、手牌隔离、刷新重连和单机拾牌通过。确认拾牌按钮无需选中暗牌、牌从牌河移到不可点击的公开区且牌墙张数不变。jsdom 使用了媒体接口替身，脚本错误检查保持开启。 |
| 启动与打包 | `pip install -r requirements.txt`、`pip check`、导入 aiohttp 及离线重复执行通过。服务健康接口返回 `{"ok":true,"version":"0.5.0"}`。验证四个 Windows 入口的监听参数、脚本 CRLF、ZIP 校验及排除虚拟环境和构建缓存。 |

原始回归输出在 `validation/python-tests-v0.5.0.txt` 和 `validation/ui-tests-v0.5.0.txt`。可在项目根目录复跑：

```bash
python -m pip install -r requirements.txt
python -m unittest discover -v
node --check web/app.js
node --check web/lan.js
node --check web/presentation.js
```

前端测试使用两个终端。一个运行 `python web_server.py --no-browser`，另一个在 `npm install` 后运行 `npm run test:ui -- http://127.0.0.1:8765`。

## 规则与实现约定

- 每张弃牌最多一人取得。十三幺拾牌排在原有胡、杠或碰、吃之后。同为拾牌时，以弃牌后的座次优先。
- 每轮资格以弃牌所在轮计算。从庄家起按顺时座次推进，操作跨过庄位时换轮。一次拾牌只有成功取得实体牌才消耗本轮机会。
- 首次拾牌要求未报听且没有普通副露。此后保留原报听和上金机制，可报听十三幺；普通副露会使十三幺无法成立，因此锁定后禁吃碰杠。公开牌区的牌不可回收或弃出。
- v0.4.0 的 `SHELVE_GOLD`、`shelf_tiles` 与首次上金流程继续使用原有接口。金牌求解共用同一份计数和万能牌识别，十三幺限用模式只调用原十三幺结构求解器。现有语音素材保留。详细规则见 `THIRTEEN_ORPHANS_V0.5.0.md`。
- 联机结算继续展示公开胡牌结果和胡牌牌面。对手的暗手牌只提供张数。原有本机四家调试页继续合并四家的本人视图。

## 修改文件清单

| 文件 | 变更 |
|---|---|
| `mahjong/rules/thirteen_orphans.py` | 新增拾牌资格、轮次、实体转移、路线锁定、胡与听牌入口。 |
| `mahjong/core/action.py`、`mahjong/core/event.py`、`mahjong/core/player.py`、`mahjong/core/state.py` | 增加拾牌动作、事件、公开区和轮次记录。新增枚举放在末尾，已有枚举值保持原编号。 |
| `mahjong/game/engine.py`、`mahjong/game/debug.py` | 串接行动和响应、更新实体守恒和私有视图、支持十三幺调试构造。 |
| `mahjong/rules/response.py`、`mahjong/rules/win.py`、`mahjong/rules/ting.py`、`mahjong/rules/gang.py` | 接入拾牌优先级、限定牌型求解与路线约束。 |
| `web/app.js`、`web/presentation.js`、`web/styles.css`、`web/index.html`、`web/lan.html`、`web/local.html` | 拾牌按钮、明牌区和拾牌提示，上金文字及页面版本显示。 |
| `mahjong/__main__.py`、`web_server.py`、`lan_server.py`、`pyproject.toml`、`package.json` | 更新命令行文字和版本信息。 |
| `start_mahjong.bat`、`start_web.bat`、`start_lan.bat`、`启动网页版.bat`、`启动局域网联机.bat` | 共用 Windows 启动流程，检测 Python，准备并检查依赖，按入口选择监听地址。 |
| `tests/test_orphan_pickup.py`、`tests/test_lan_server.py`、`tests/ui_smoke.cjs` | 拾牌规则、联机拾牌与终局隔离、前端集成回归。 |
| `README.md`、`WEB_README.md`、`GOLD_RULE_CHANGE.txt`、`WEB_CHANGELOG.txt`、`V0.3.1_CHANGE.txt`、`V0.4.0_LAYOUT_SCORING_CHANGE.md` | 使用说明、术语统一及历史说明校正。 |
| `THIRTEEN_ORPHANS_V0.5.0.md`、`TEST_REPORT_V0.5.0.md`、`validation/python-tests-v0.5.0.txt`、`validation/ui-tests-v0.5.0.txt` | 新版规则、金牌兼容、验证结果和日志。 |

## Windows 使用

解压后双击 `start_web.bat` 玩单机四家测试，或者双击 `start_lan.bat` 开局域网房间。首次启动需要 Python 3.11 或更新版本以及可用的 Python 软件源。安装完成后可以离线启动。启动窗口会保留错误信息，便于核对 Python、依赖或端口问题。
