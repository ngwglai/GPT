# 本地麻将 v0.5.0 · 局域网四人联机

在 v0.4.0 基础上加入十三幺公开拾牌，修复联机终局暗牌隔离，并更新 Windows 双击启动脚本。包含局域网四人房间、刷新重连、连续牌局和单机四家明牌测试。

需要 **Python 3.11 或更新版本**。规则引擎本身仍然只用标准库；Web 服务器新增 `aiohttp` 依赖。游玩不需要 Node.js、数据库或账号。

## v0.7.1 牌墙规则

玩家逆时针按东、南、西、北行动。每墙从所属玩家的左端 0 编到右端 16。正常摸牌顺时针，墙内列号从 16 递减到 0，跨墙按东、南、西、北衔接。杠后补牌从牌尾沿相反的墩序取牌，两种取牌在墩内都先取上层再取下层。

开墙墙从庄家算第 1 位，按骰子和沿座位顺序数，和为 5 或 9 时用庄家对家墙。开墙位在 `16 - 小骰子` 号墩上层。金指示位在开墙墙的上家墙 `大骰子 - 1` 号墩上层。翻开指示牌保持余牌与正常游标，实际取走时才扣减。死墙从原开墙点计算，保留 `max(7, 杠数 + 6)` 墩。正常余牌统计仍在正常范围内的实牌，墙上实牌包含死墙。详见 [现行牌墙规则](WALL-RULES.md)。

## Windows 最简单的启动方法

1. 完整解压压缩包，进入 `local_mahjong_engine_web_v0.5.0` 文件夹。
2. 双击 **`start_lan.bat`**（或 `启动局域网联机.bat`）。首次启动自动创建 `.venv` 并安装依赖，需要电脑能访问 Python 软件源。安装过后可离线启动。
3. 保持这个窗口开着，浏览器会自动打开首页，选择“局域网联机”。
4. 输入昵称，创建房间并选择空位，把六位房间号告诉朋友。
5. 其他设备连接同一 Wi-Fi，在浏览器访问 **`http://电脑的局域网IPv4地址:8765/`**，选择联机入口，输入昵称和房间号，分别入座。
6. 四人都在线且入座后，房主点击“房主开始游戏”。东家为首局庄家；只有庄家会出现“掷骰子”，掷骰后统一发牌。

例如电脑地址是 `192.168.1.20`，其他设备输入 `http://192.168.1.20:8765/`。手机不能填写 `127.0.0.1` 或 `0.0.0.0`。启动窗口会尽可能列出地址；也可以在 Windows 命令提示符执行 `ipconfig`，查看正在使用的 Wi-Fi/以太网的 IPv4 地址。

若 Windows 询问防火墙权限，请允许 Python 访问**专用网络**。若手机打不开，检查是否在相同局域网、是否连了隔离访客 Wi-Fi、电脑防火墙是否允许 TCP 8765。无需路由器端口映射。

`start_web.bat` / `启动网页版.bat` 只监听本机，适合单机四家测试。两种启动脚本都先进入项目文件夹，在 PyCharm 里也可直接运行 `web_server.py`；联机时设置运行参数 `--host 0.0.0.0`，并用同一解释器安装依赖。

## 手动启动

```bash
python -m pip install -r requirements.txt
python web_server.py --host 0.0.0.0 --port 8765
```

不自动打开浏览器时追加 `--no-browser`。仅本机调试直接运行 `python web_server.py`。

## 页面与操作

首页提供两个入口。单机页 `/local.html` 仍然四家明牌，并有固定 Seed、重置整场、下一局、手动全部过等测试按钮；这些 API 仅允许服务器本机访问，使用独立牌桌，与联机房间互不影响。

联机页 `/lan.html` 把自己的座位放在下方，用金色边框标记。联机期间和终局都只有本人能看到自己的暗手牌和听口。其他玩家的暗手牌仅显示数量。牌河、副露、已上金的牌和十三幺公开拾牌区按公开规则显示。点选手牌后可打出、报听或上金。符合资格时，响应区会直接显示“拾幺牌”；拾取成功后，本局只能胡十三幺。详见 [十三幺拾牌与金牌规则](THIRTEEN_ORPHANS_V0.5.0.md)。

牌局结束后由房主点击“下一局”，四人、房间、座位保持不变。庄家由原引擎的 `RoundResult.next_dealer` 决定：庄家胡或流局连庄，闲家胡后庄家顺延一位。每局都重新等庄家掷骰。

## 刷新、离开与房间寿命

- 当前浏览器会保存临时身份，刷新或网络恢复后自动重连到原房间、原座位；收到最新视图后继续。
- 正常关闭页面会显示断线；网络突然中断通过 WebSocket 心跳检测，通常约 15 秒，可能受系统休眠、网络延迟影响。不会自动替玩家出牌或判负。
- 等待阶段点击“离开房间”会释放座位、作废该身份。房主主动离开时会把房主身份交给其他玩家。
- 游戏开始后座位锁定。点击“离开房间”只暂时断开，座位仍为本人保留，点击“返回原房间”恢复。不允许新人顶替进行中的座位。
- 短暂掉线保留房主身份；如果房主离线，需要等其回来才能开始或续局。
- 房间保存在服务器内存。服务器退出/重启即清空；全员断线且 24 小时无活动的房间自动过期。最多保留 128 个临时房间。
- 同一浏览器、相同服务器地址共用一份身份；多开标签仍然是同一名玩家。单机模拟四人请用不同浏览器或独立浏览器配置。请一直使用同一个服务器地址，改变 IP/端口会改变浏览器的身份存储位置。
- 清除网站数据或丢失身份后，进行中的座位无法找回；本版没有账号恢复、自动托管或云存档。

## 网络边界与复现

`lan_server.py` 只管理房间、身份、连接与传输。牌局操作用服务器保存的座位映射调用 `TableService.handle_intent`，客户端传入的 `seat` / `player_id` 会被拒绝。游戏操作必须携带当前 `round_id` 和 `revision`，且属于该玩家当前 `legal_actions`；过期请求会收到错误及本人最新视图，需要重新选择，不会自动重放。

每个房间用一把异步锁串行处理操作和广播。`revision` 是引擎的游戏版本，`room_version` 另记录连接/座位等房间变化。每次合法动作后，服务器分别生成四人的视图，客户端之间不互传权威状态。响应者先到不会越过原有优先级；收到其他人的响应后，未响应者会得到新版操作窗口。

联机不会发送 `GameState`、原始 `event_log`、暗牌、隐藏暗杠牌面、他人听口或 Seed。牌墙只传物理状态；声音/动画事件也按本人/他人过滤暗杠。私有牌墙与 Seed 只保存在服务器。`--seed` 只用于独立的本机测试桌，不能控制联机房间；服务器代码中的测试工具仍可注入 Seed 验证复现机制。骰子保持 v0.3.1 的方式：Seed 确定结果，庄家点击后才公开结果并发牌。

临时 token 使用不可预测的随机值，WebSocket 建立后的第一条消息用于认证，不放在 URL 或公共玩家列表中。服务器只托管 `web/` 内资源；跨站 HTTP/WS 请求会被拒绝。本版面向可信局域网使用 HTTP/WS，不提供公网部署、TLS 或防服务器持有者作弊协议。

## 验证命令

```bash
python -m unittest discover -v
node --check web/app.js
node --check web/lan.js
node --check web/presentation.js
```

可选前端集成测试（需要 Node.js 22.19+）：先保持服务器运行，在另一个终端执行 `npm install`，再执行 `npm run test:ui -- http://127.0.0.1:8765`。这是 jsdom 的 DOM/脚本集成测试，不代替真实浏览器的屏幕排版检查。

Node.js 用于前端验证。网络测试实际监听临时端口并连接四个客户端，覆盖拾牌、重连、完整流局、续局、抢补杠和终局隐私。交付验证结果见 [v0.5.0 测试报告](TEST_REPORT_V0.5.0.md)。

## 命令行直接运行

解压后，在 `mahjong_engine` 文件夹打开终端：

```bash
python -m unittest discover -v
python -m mahjong demo --seed 42 --rounds 3
python -m mahjong waits --tiles 1112223444555m --gold 7z
python -m examples.debug_gang
python -m examples.service_usage
```

Windows 如果 `python` 命令不可用，可以换成 `py -3`。必须先进入项目根目录，那里应能看到本文件、`mahjong`、`tests` 和 `examples`。

`demo` 使用四个只选择合法操作的测试机器人，会自动打到胡牌或流局。机器人不是麻将策略 AI。牌谱简写：`m` 万、`p` 筒、`s` 条；`1z..7z` 依次是东、南、西、北、中、发、白。上面的听口命令会返回 `1m、2m、3m、4m、5m、7z`，其中 `7z` 是设置的金。结构听口包含金；玩家第一次拿到金后可以先保留，但在完成首次上金之前不能胡。

## 开局与提交操作

```python
from mahjong import GameEngine, RuleConfig, Seat, Action, ActionType

engine = GameEngine(RuleConfig())
engine.start_round({seat: f"player-{int(seat)}" for seat in Seat})

# 服务端取得该玩家可见的数据；有时初始金选择属于其他座位。
view = engine.player_view(Seat.EAST)
actions = engine.legal_actions(Seat.EAST)
if actions:
    engine.submit(
        actions[0],
        actor_id="player-0",  # 必须来自服务端已认证会话
        expected_round_id=view["round_id"],
        expected_revision=view["revision"],
    )
```

不要让客户端决定 `actor_id`。`start_round` 的指定随机种子、骰子和牌墙参数也都是服务端调试参数。正式对局省略这些参数，由服务端产生私有随机种子，开局只洗牌一次。

客户端操作通过 `TableService` 接入更方便，它会根据服务端身份确定座位，检查 JSON 参数，并以单桌锁串行处理请求：

```python
from mahjong.game.service import TableService

table = TableService(engine)
view = table.view_for(authenticated_player_id)
payload = {
    "round_id": view["round_id"],
    "revision": view["revision"],
    "type": "DISCARD",
    "tile_ids": [实际可出牌的实体ID],
}
new_view = table.handle_intent(authenticated_player_id, payload)
```

每个操作的可用参数都在 `legal_actions` 中。不要自行拼出一个前端认为合法的操作。`DECLARE_TING` 必须带一张手牌实体 ID，表示“用这张牌宣告听牌”，动作会原子执行。该牌会从结构手牌移入玩家专属的 `ting_tile`，不会进入普通牌河，也不会成为 `current_discard`，因此其他玩家不能对它吃、碰、杠、胡。普通摸牌和杠补牌由引擎自动推进，虽然保留了 `DRAW` 枚举，客户端不需要也不能主动调用它。

同一牌型的四张牌有不同实体 ID。报听后只能打出刚摸到的那一张实体牌，不能用手里原有的同牌替换。报听后的合法杠会更新 `current_waits`，原始 `declared_waits` 始终保留。

## 状态与响应窗口

正式回合统一使用 `TURN_ACTION`。金不会触发独立的选择阶段：玩家可以把金留在手中并打出其他普通牌，也可以提交 `SHELVE_GOLD` 完成上金。金绝对不能作为普通 `DISCARD` 进入牌河。上金占用一次正常出牌机会，上金后不补牌、不打开弃牌响应窗口，直接轮到下家正常摸牌。

普通弃牌后进入 `WAITING_FOR_RESPONSES`。报听时移出的 `ting_tile` 是例外：它不进入牌河、不建立响应窗口，直接轮到下家摸牌。只有对普通弃牌确有吃、碰、杠、胡或十三幺拾牌机会的玩家才会收到响应操作，其余玩家自动跳过。所有有资格者回答之后统一裁决，依次为胡、杠或碰、吃、拾幺牌。同级按弃牌者之后的座次。选择胡的人中只取最近一位，先收到请求不会提前夺取胡牌权。响应提交后不能反悔或重复提交。

若当前没有人能响应，引擎直接为下家摸牌。超时由可信服务端计时器调用 `TableService.timeout_responses(round_id, revision)`，为尚未响应者补 PASS，保留已经提交的操作。服务层负责窗口截止时间、重连及计时器更新；任一响应会增加 revision，因此调用超时时需在锁内使用当前窗口版本，并先确认窗口尚未变化。

所有 Action 都检查局号与 revision，避免旧局或旧版本请求被误执行。失败操作会回滚本次状态变更和事件。`TableService` 的锁只适用于一个 Python 进程；多进程部署应把同一桌路由到同一个 actor/进程，或者另行实现跨进程串行化。不要绕开服务层并发修改 `engine.state`。

## 还需要当地规则确认的部分

这些项目在原规格里没有完全确定。下面给出本版采用的明确约定及修改入口，避免把实现习惯当成地方规则。

| 项目 | 本版处理 | 修改入口 |
|---|---|---|
| 上金后的回合推进 | 上金相当于出牌：不补牌、不增加杠数、不产生吃碰杠胡响应，直接轮到下家摸牌 | `GameEngine._shelve` |
| 初始手牌中金的处理时机 | 不做特殊处理；金留在手中，轮到该玩家正常出牌时自行决定保留或上金 | `start_round`、`legal_actions` |
| 七对中的四张同牌 | 默认允许算两对，可关闭 | `RuleConfig.quad_as_two_pairs` |
| 金能否组成公开吃碰杠 | 万能替代只用于胡牌求解；副露按实体牌原本牌型判断。未完成首次上金时，不能通过吃入第一金绕过上金 | `rules/meld.py`、`_response_actions` |
| 已保留的金能否稍后上金 | 报听前允许；报听后仅允许处理刚获得的金，不拆走原手牌中的金 | `legal_actions` |
| 补杠是否允许被抢 | 默认关闭；启用后只在补杠场景开胡/PASS窗口，确认无人抢才增加杠数、补牌 | `RuleConfig.allow_rob_bu_gang` |
| 海底事件的精确定义 | 默认不加标签；启用示例策略时，自摸且普通取牌端已到保留线便加 HAI_DI | `RuleConfig.enable_hai_di_tag` |
| 对手暗杠的展示 | 默认只给类型和数量，不给牌面，可配置显示 | `RuleConfig.hide_an_gang` |
| 碰、杠同级冲突 | 默认同优先级，按座次；允许替换裁决策略，但胡必须最高 | `ResponseResolver` |

## 计分不会擅自填数

默认 `ScoreConfig` 的待确认数值为 `None`，胡牌和流局仍会正常结束，但结算返回 `PENDING_CONFIGURATION` 及 `missing` 字段，不会把未知分数当成0分发放。七对和十三幺没有内置牌型加分，特殊事件默认也不加分。

如果只是测试数值管道，可以明确填写演示配置：

```python
from mahjong import ScoreConfig, ScoreEngine

score = ScoreEngine(ScoreConfig(
    base_ping_hu=1,
    shelf_bonus=1,
    dealer_multiplier=2,
    discard_multiplier=1,
    self_draw_multiplier=1,
    dealer_scope="EITHER_PARTY",
    self_draw_payment="EACH_OPPONENT",
))
```

**以上数字仅作调用示例。** 参考策略把赢家的上金数作为胡牌加算，再乘自摸/点炮倍率和庄家倍率。`dealer_scope` 可以是只看赢家的 `WINNER_ONLY`，也可以看支付任一方是否为庄家的 `EITHER_PARTY`。自摸参考策略由三家分别支付。使用 Decimal 运算，返回字符串形式的金额；没有擅自规定取整方式。

“已经报听的玩家之后正常弃牌被胡”会先切换到 `MINIMUM_PING_HU`，只取 `base_ping_hu`，跳过上金加算、庄家倍率、特殊事件以及所有额外计分 hook。胡牌合法性不受影响。

若显式启用抢补杠，结果方法记录为 `ROB_GANG`；参考策略由被抢杠者支付，按普通点炮倍率计价，但补杠不是弃牌，不自动套用“报听者弃牌最低平胡”。当地如有不同约定，需要替换计分策略。

流局时已上金的金牌如何结算、上金是否即时由其他三家支付、杠本身是否计分，都尚无确定规则。默认流局结算待配置。若采用即时支付或其他模式，应替换 `ScoreEngine.settle` 并订阅上金/杠事件；不能用当前“赢家上金数加算”的参考策略冒充最终规则。

## 指定牌局、检查和模拟

`mahjong.game.debug` 提供 `PlayerFixture`、`build_fixture`、`inspect_hand`、`inspect_gang`、`simulate_action`。完整示例见 `examples/debug_gang.py`。

```python
from mahjong.game.debug import PlayerFixture, build_fixture, inspect_hand

build_fixture(
    engine,
    {Seat.EAST: PlayerFixture(
        hand=[0,0,0,1,1,1,2,3,3,3,4,4,4],
        declared=True,
        declared_waits={0,1,2,3,4,33},
    )},
    dealer=Seat.EAST,
    current=Seat.EAST,
    dice=(6,6),
    gold=33,
    gang_count=0,
    head=0,
    tail=135,
)
print(inspect_hand(engine, Seat.EAST))
```

支持手牌、副露、十三幺公开拾牌区、上金数量、首次上金标志、报听状态、原始听口、当前摸牌类型与来源、庄家、当前玩家、骰子、完整实体牌墙、指定金、指定金指示牌位置/牌型、弃牌和双端游标。调试参数 `head`、`tail` 表示从原开墙位沿正常方向编号的可取墙位窗口，含两端。真实报听流程中的 `ting_tile` 由引擎动作产生，不参与胡牌/听牌结构手牌计算。多家的牌统一分配唯一实体 ID，超过四张同牌会拒绝。指定金可以故意不符合指示牌映射，用于隔离测试。

调试游标 `head/tail` 是相对最初开牌位置的0..135逻辑偏移。指定弃牌会立即建立响应窗口；没有合法响应时会自动推进下家。未指定的玩家手牌为空，因此这些可以是聚焦单个问题的合成牌局，不保证其他三家有完整手牌。真实 `start_round` 会启用每家结构牌数断言；调试构造只关闭该手数断言，仍检查136张实体牌的守恒。

`inspect_gang` 返回不含补牌的模拟手牌，以及杠前、杠后结构听口。`simulate_action` 在独立副本上执行，可以模拟杠、弃牌或任何合法 Action，不改变原桌。需要运行中快照时，服务端可在桌锁内使用 `copy.deepcopy(engine.state)`；这是开发调试能力，本版未附带数据库快照格式。

## 信息隔离与事件

`GameState`、`event_log`、调试工具和随机种子只能在服务端使用。日志记录开局完整墙序、骰子、规则配置、初始发牌、摸打、上金、报听、响应、十三幺拾牌、杠及听口变化、胡牌和结算，可以用于排查和实现复盘。`TING_DECLARED` 会在服务端日志中记录真实 `ting_tile` 实体 ID，但不会同时生成普通 `TILE_DISCARDED` 事件。日志包含私密信息，不能直接广播，也不能当作客户端增量事件接口。

`player_view` 只返回自己的暗牌、自己的听口和操作选项；自己的 `ting_tile` 返回真实实体 ID/牌型，对手的 `ting_tile` 只返回 `{"hidden": true}`，不泄露牌型或实体 ID。对手的普通暗牌仍只给数量、报听标志及公开信息。牌墙不返回剩余牌序、游标对应的暗牌、种子或未来摸牌。即使一局结束，也没有自动公开全桌手牌。

金不再使用独立的私人选择阶段；是否上金直接体现在当前玩家的 `legal_actions` 中。其他玩家不会因为阶段名得知当前玩家是否持有金。等待普通弃牌/抢杠响应时，公开候选牌放在 `pending_claim` 中。

服务端仍然知道整个固定牌墙；这一实现隔离的是客户端信息，不提供防运营方作弊的密码学协议。

## 文件结构

```text
mahjong/
  core/       实体牌、座次、牌墙、玩家、动作、事件和状态
  solver/     普通胡、七对、十三幺、万能牌递归求解
  rules/      金、听、胡、杠、十三幺拾牌、响应、轮庄和计分
  game/       引擎、下一局、JSON接入层及调试工具
  notation.py 牌谱简写
  __main__.py 自动对局和听口检查命令
tests/        单元测试、独立算法对照及完整对局测试
examples/     调试杠与接入示例
```

后续新增胡型使用 `WinSolver.register(name, validator)`；计分可继承 `ScoreEngine` 或注册加算/倍率 hook；吃碰杠的响应优先级可替换 `ResponseResolver`。胡牌的实体组合、玩家是否报听、计分和事件标签保持分离。
