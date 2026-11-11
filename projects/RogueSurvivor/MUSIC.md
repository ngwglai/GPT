# 战斗音乐清单（v1.8.1）

十二首音乐均由用户提供，项目内本地播放。本文件记录整合事实，不声明用户上传音乐具有额外公开再分发许可，也不将其标为CC0。音效授权仍见独立的[SFX_CREDITS.md](SFX_CREDITS.md)。

新增六首均读取到与原文件名一致的ID3标题；旧六首沿用v1.5已核对的上传映射，现有发布文件已无标题标签。两首Sugar Rush Battle的ID3同名，以原上传文件名区分。新增第8～12首采用音频流复制封装，移除与游戏无关的作者、评论、歌词、封面等元数据，仅保留标题和编码器信息；这五首解码PCM与上传原件一致。第7首压缩音频帧内随机字节触发公开提交文本扫描，采用libmp3lame VBR高质量`-q:a 4`重新编码并复核，不施加响度压缩；它与原件并非PCM逐字节相同。旧六首字节完全不变。

## 曲目与地图

|文件|实际标题／原上传文件|来源|地图|分配依据|
|---|---|---|---|---|
|battle-1.mp3|サイバーバトルビート|原有|月蚀遗迹|沿用高能战斗定位，丰富遗迹战斗段落|
|battle-2.mp3|Crystal Sparkle Battle|原有|水晶洞窟|水晶主题与原有洞窟曲目对应|
|battle-3.mp3|月lightの幻想曲|原有|森林、洞窟|月光幻想主题，连接探索与魔法氛围|
|battle-4.mp3|軽快な戦闘テーマ|原有|星光森林|轻快战斗主题，保留森林原有辨识度|
|battle-5.mp3|Sugar Rush Battle（原文件Sugar Rush Battle1.mp3）|原有|糖果庭院|糖果战斗主题；与另一版为不同录音|
|battle-6.mp3|Sugar Rush Battle（原文件Sugar Rush Battle.mp3）|原有|糖果庭院|保留庭院既有曲目|
|battle-7.mp3|最終の旋律|新增|月蚀遗迹|终章意象，安排在遗迹歌单中段；不触发Boss专属切歌|
|battle-8.mp3|Enchanted Circus Swing|新增|糖果庭院|魔法马戏与摇摆的标题意象，呼应古怪茶会|
|battle-9.mp3|Abandoned Sanctuary|新增|月蚀遗迹|废弃圣所的标题主题，与古代祭坛遗迹对应|
|battle-10.mp3|冒険の旋律|新增|森林、洞窟|冒险主题，补充两类探索场景|
|battle-11.mp3|星森冒険曲|新增|森林、糖果庭院|星森冒险主题，森林主曲并作为庭院幻想补充|
|battle-12.mp3|Frozen Dawn|新增|洞窟、遗迹|冰冷黎明意象，与晶体和月光场景关联|

分配主要依据可靠标题、既有地图定位及实测音频技术信息。执行了全曲解码和响度/真峰值分析，**没有进行完整人工听审，响度分析不能证明曲风**；上述氛围描述为首版策划判断，后续可据玩家试听反馈调整。

## 完整播放顺序

- **星光森林**：星森冒険曲 → 冒険の旋律 → 軽快な戦闘テーマ → 月lightの幻想曲（约11分17秒一轮）。
- **水晶洞窟**：Crystal Sparkle Battle → Frozen Dawn → 月lightの幻想曲 → 冒険の旋律（约12分03秒一轮）。
- **糖果魔女庭院**：Enchanted Circus Swing → Sugar Rush Battle（原Battle）→ Sugar Rush Battle（原Battle1）→ 星森冒険曲（约10分22秒一轮）。
- **月蚀遗迹**：Abandoned Sanctuary → 最終の旋律 → サイバーバトルビート → Frozen Dawn（约13分40秒一轮）。

每图4首且不重复，12首均被使用；复用4首用于主题衔接，四图播放顺序不同。曲末只循环当前地图歌单。继续存档按地图选择歌单首曲，不保存跨刷新歌曲秒数；手动暂停/恢复保留当前播放进度。没有新增Boss专属BGM系统。

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
