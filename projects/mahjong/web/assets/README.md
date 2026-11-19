# 素材目录

`manifest.json` 是统一资源映射。路径可以写成 `/assets/...` 绝对路径，也可以直接写相对 `web/assets/` 的路径，例如：

```json
{
  "version": 1,
  "tiles": {
    "0": "tiles/1wan.png",
    "33": "tiles/bai.png",
    "back": "tiles/back.png"
  },
  "table": {
    "background": "table/felt.jpg"
  },
  "dice": {
    "1": "dice/1.png",
    "6": "dice/6.png"
  },
  "bgm": {
    "game": "bgm/game.mp3",
    "result": "bgm/result.mp3"
  },
  "sfx": {
    "dice": "sfx/dice.wav",
    "draw": "sfx/draw.wav",
    "tile_drop": "sfx/tile_drop.wav",
    "chi": "sfx/chi.wav",
    "peng": "sfx/peng.wav",
    "gang": "sfx/gang.wav",
    "hu": "sfx/hu.wav",
    "round_draw": "sfx/round_draw.wav"
  },
  "voice": {
    "tiles": {
      "0": "voice/tiles/1wan.mp3"
    },
    "actions": {
      "chi": "voice/actions/chi.mp3",
      "peng": "voice/actions/peng.mp3",
      "gang": "voice/actions/gang.mp3",
      "ting": "voice/actions/ting.mp3",
      "gold_shelved": "voice/actions/gold_shelved.mp3",
      "hu": "voice/actions/hu.mp3"
    },
    "wins": {
      "SEVEN_PAIRS": "voice/wins/seven_pairs.mp3"
    }
  },
  "ui": {},
  "effects": {}
}
```

牌型键使用后端 `patterns` 返回的英文标识。特殊胡牌语音存在时优先播放对应语音，否则自动回退到普通“胡”语音。

当前版本没有附带正式素材。映射缺失时，麻将牌、牌背、骰子和桌面都继续使用 CSS/文字回退，不影响规则测试。
