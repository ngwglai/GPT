# 美术资源清单

当前v1.6角色资源、逐帧动画来源与处理见 [V1.6.md](V1.6.md)。当前共114项图片映射、115个资源工坊ID（含既有UI面板配置）。v1.4地图／怪物见 [ART-ASSETS-v1.4.md](ART-ASSETS-v1.4.md)。下表保留v1.3历史映射；全部当前ID以`public/assets/manifest.json`和`src/data/visuals.ts`为准。

## v1.6角色替换

三角色ID为`ranger`、`knight`、`mage`，每个角色的资源目录为`public/assets/v1.6/characters/<角色>/`。

| 稳定ID | 文件／帧尺寸 |
| --- | --- |
| `portrait.<角色>` | `portrait.webp`，透明全身立绘；分别499×1031、559×1041、538×1019 |
| `avatar.<角色>` | `avatar.webp`，256×256头像 |
| `player.<角色>` | `fallback.webp`，192×192静态回退，旧自定义根图仍优先 |
| `animation.<角色>.idle/run/dash/cast/hurt/defeat/revive` | 各同名WebP，1536×192横条，8个192×192帧 |

21个同名GIF仅供预览，不用于运行时解码。旧v1.3静态图片文件保留。每个动作均可独立在资源工坊替换为静图或精灵图，不改变角色判定。默认动画、帧率和优先级统一由`data/characterAnimations.ts`配置；缺失动作图使用静态角色回退。


# v1.3 美术资源清单

来源：本任务内置 OpenAI image_gen 原创生成；无外部素材/API。可通过资源工坊覆盖稳定ID，或修改映射文件并构建。母图与处理说明见 V1.3.md。

共 54 个ID、45张独立引用图，合计 1,450,110 字节。

|稳定ID|图片文件|尺寸|
|---|---|---|
|portrait.ranger|characters/ranger-full.webp|625×670|
|player.ranger|characters/ranger-battle.webp|128×128|
|avatar.ranger|characters/ranger-avatar.webp|256×256|
|enemy.crawler|enemies/crawler.webp|128×128|
|portrait.knight|characters/knight-full.webp|625×682|
|player.knight|characters/knight-battle.webp|128×128|
|avatar.knight|characters/knight-avatar.webp|256×256|
|portrait.mage|characters/mage-full.webp|625×655|
|player.mage|characters/mage-battle.webp|128×128|
|avatar.mage|characters/mage-avatar.webp|256×256|
|enemy.runner|enemies/runner.webp|128×128|
|enemy.archer|enemies/archer.webp|128×128|
|enemy.seer|enemies/seer.webp|128×128|
|enemy.shaman|enemies/shaman.webp|128×128|
|enemy.guard|enemies/guard.webp|128×128|
|enemy.bomber|enemies/bomber.webp|128×128|
|enemy.warden|enemies/warden.webp|256×256|
|enemy.witch|enemies/witch.webp|256×256|
|enemy.titan|enemies/titan.webp|256×256|
|weapon.bow|weapons/bow.webp|128×128|
|weapon.blade|weapons/blade.webp|128×128|
|weapon.ember|weapons/ember.webp|128×128|
|weapon.orbit|weapons/orbit.webp|128×128|
|weapon.drone|weapons/drone.webp|128×128|
|skill.fire|effects/fire.webp|128×128|
|skill.ice|effects/ice.webp|128×128|
|skill.lance|effects/lance.webp|128×128|
|skill.ward|effects/ward.webp|128×128|
|skill.bloom|effects/bloom.webp|128×128|
|skill.storm|effects/storm.webp|128×128|
|card.shuffle|cards/shuffle.webp|128×128|
|card.treasure|cards/treasure.webp|128×128|
|card.negative|cards/negative.webp|128×128|
|card.lucky|cards/lucky.webp|128×128|
|ui.gem|ui/gem.webp|128×128|
|map.rock|maps/rock.webp|128×128|
|map.flower|maps/flower.webp|128×128|
|map.tree|maps/tree.webp|128×128|
|map.obelisk|maps/obelisk.webp|128×128|
|projectile.bow|effects/bow.webp|128×128|
|projectile.ember|effects/ember.webp|128×128|
|projectile.drone|effects/drone.webp|128×128|
|projectile.enemy|effects/enemy.webp|128×128|
|effect.bloom|effects/bloom.webp|128×128|
|effect.ward|effects/ward.webp|128×128|
|projectile.lance|effects/enemy.webp|128×128|
|projectile.blade|effects/bow.webp|128×128|
|projectile.orbit|effects/enemy.webp|128×128|
|card.common|cards/lucky.webp|128×128|
|card.rare|effects/ice.webp|128×128|
|card.epic|effects/storm.webp|128×128|
|card.mechanism|effects/lance.webp|128×128|
|map.ground|maps/grass.webp|512×512|
|ui.world|ui/world.webp|1672×941|
