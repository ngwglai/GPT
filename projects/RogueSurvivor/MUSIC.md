# 战斗音乐清单（v1.8.3 地图歌单调整）

十二首音乐均由用户提供，项目内本地播放。本文件记录整合事实，不声明用户上传音乐具有额外公开再分发许可，也不将其标为CC0。音效授权仍见独立的[SFX_CREDITS.md](SFX_CREDITS.md)。

新增六首均读取到与原文件名一致的ID3标题；旧六首沿用v1.5已核对的上传映射，现有发布文件已无标题标签。两首Sugar Rush Battle的ID3同名，以原上传文件名区分。新增第8～12首采用音频流复制封装，移除与游戏无关的作者、评论、歌词、封面等元数据，仅保留标题和编码器信息；这五首解码PCM与上传原件一致。第7首压缩音频帧内随机字节触发公开提交文本扫描，采用libmp3lame VBR高质量`-q:a 4`重新编码并复核，不施加响度压缩；它与原件并非PCM逐字节相同。旧六首字节完全不变。

## 曲目与地图

2026-11-12 按用户确认的最终方案，四张地图各配置三首主题曲；十二首曲目各使用一次，不跨地图复用。此项调整是地图音乐分配，不改变音频文件、音量增益或播放系统。分配由用户确认，未额外进行全曲人工听审。

| 文件 | 实际标题／原上传文件 | 来源 | 地图 | 分配定位 |
| --- | --- | --- | --- | --- |
| battle-1.mp3 | サイバーバトルビート | 原有 | 水晶洞窟 | 高能战斗 |
| battle-2.mp3 | Crystal Sparkle Battle | 原有 | 水晶洞窟 | 水晶幻想 |
| battle-3.mp3 | 月lightの幻想曲 | 原有 | 月蚀遗迹 | 月光幻想 |
| battle-4.mp3 | 軽快な戦闘テーマ | 原有 | 星光森林 | 轻快战斗 |
| battle-5.mp3 | Sugar Rush Battle（原文件Sugar Rush Battle1.mp3） | 原有 | 糖果魔女庭院 | 糖果主题（录音版本1） |
| battle-6.mp3 | Sugar Rush Battle（原文件Sugar Rush Battle.mp3） | 原有 | 糖果魔女庭院 | 糖果主题（录音版本2） |
| battle-7.mp3 | 最終の旋律 | 新增 | 月蚀遗迹 | 最终决战氛围 |
| battle-8.mp3 | Enchanted Circus Swing | 新增 | 糖果魔女庭院 | 魔法马戏 |
| battle-9.mp3 | Abandoned Sanctuary | 新增 | 月蚀遗迹 | 废弃圣所 |
| battle-10.mp3 | 冒険の旋律 | 新增 | 星光森林 | 幻想探索 |
| battle-11.mp3 | 星森冒険曲 | 新增 | 星光森林 | 森林冒险 |
| battle-12.mp3 | Frozen Dawn | 新增 | 水晶洞窟 | 冰冷神秘 |

## 完整播放顺序

- **星光森林**：11 星森冒険曲 → 10 冒険の旋律 → 4 軽快な戦闘テーマ（约8分19秒一轮）。
- **水晶洞窟**：2 Crystal Sparkle Battle → 12 Frozen Dawn → 1 サイバーバトルビート（约8分53秒一轮）。
- **糖果魔女庭院**：8 Enchanted Circus Swing → 6 Sugar Rush Battle（原Battle）→ 5 Sugar Rush Battle（原Battle1）（约7分42秒一轮）。
- **月蚀遗迹**：9 Abandoned Sanctuary → 3 月lightの幻想曲 → 7 最終の旋律（约10分12秒一轮）。

每张地图的歌单仅包含该地图专属的3首曲目，共12首，恰好覆盖全部文件一次。歌曲结束后播放本地图下一首，末尾回到本图第一首，不跨地图混播。继续存档按地图选择歌单首曲，不保存跨刷新歌曲秒数；手动暂停/恢复保留当前播放进度。**当前仍没有Boss专属BGM切歌系统**：第7首虽定位为最终决战氛围，但仍是月蚀遗迹的第三首循环曲，不与第20波触发绑定。

## 技术检查与音量

全部为48kHz双声道MP3，时长约142.54～222.05秒。使用FFmpeg全曲解码，EBU R128整曲响度范围−15.1～−13.8 LUFS；发布文件精确时长、字节、哈希、真峰值和播放增益见[分析数据](validation/v1.8.1/music-analysis.json)。

播放增益 `min(1, 10^((-16-I)/20), 10^((-1-TP)/20))`，I为整曲LUFS，TP为dBTP，保留四位小数。仅衰减、不提升、不压缩动态；目标约−16LUFS，另保留至少约1dB真峰值余量。月light因原真峰值+0.3dBTP，优先峰值余量；不会修复源文件本身可能已有的失真。最终音量=用户音乐滑块×当前曲目增益×战败演出衰减；音效不受影响。增益切歌时立即更新。

新增文件约24.98MiB，十二首合计约47.65MiB；不把所有MP3打进JavaScript，也不全量预加载/解码。沿用单个HTMLAudioElement、metadata预载，开始游戏才加载当前地图歌曲；错误时跳过，整张歌单失效则静默，不阻塞战斗。

本地复核（需FFmpeg/ffprobe，不是游戏运行依赖）：

```bash
python tools/check-music.py --output /tmp/music-analysis.json
```

无损处理上传文件的示例（仅本地开发使用，不上传原文件元数据）：

```bash
ffmpeg -i input.mp3 -map 0:a:0 -c:a copy -map_metadata -1 -metadata title="实际标题" public/audio/battle-7.mp3
```
