# 验证数据索引

本目录全部为云端/CI浏览器测试，不是物理手机、平板或用户电脑验收。最终说明见 [性能报告](../../PERFORMANCE-v0.10.1.md)。保留探索和失败数据是为了使技术决策可审查，不代表这些方案进入最终版本。

| 文件 | 场景及用途 |
|---|---|
| `baseline-legal.json` / `candidate-legal.json` / `comparison.csv` | 当前脚本、独立浏览器样本、真实合法HTTP动作；Chromium正式前后比较 |
| `final-chromium.json` / `final-firefox-tablet.json` / `final-webkit-tablet.json` | 方向、桌布及顶栏修正后复测，包括仍超预算的原始值 |
| `firefox-legal.json` / `webkit-legal.json` / `cpu4-legal.json` | 当前合法轨迹的其他引擎/CPU节流补充，失败字段原样保留 |
| `baseline-chromium.json` / `optimized-chromium.json` | 前一阶段固定视角、179张牌的合成压力对比；当时浏览器在样本间共享，不能与最终合法轨迹混算 |
| `legal-smoke.json` / `legal-slots-smoke.json` | 席位旋转发现与修正的短试验；两次墙钟边界不同，不作为正式前后比例 |
| `soak-final.json` / `foreground-tabs.json` / `normal-pace.json` | 四窗口冻结、持续执行、生产节奏的完整真实AI牌局；节奏/回合/各页revision与heap在JSON中 |
| `soak.json` | 早期8局冻结实验，最终代码另以soak-final复验 |
| `experiments/*-profile.json` | 不同栅格、底图、纹理、Canvas策略的CPU定位，带采样开销 |
| `webkit-paint-controls.json` / `felt-paint-controls.json` | 隐藏牌图/关闭滤镜/空白页，以及同页CSS→SVG→CSS控制实验 |
| `audio-before-controls.json` | 默认声音/禁用提示音对照；未支持声音是主要瓶颈，未修改声音系统 |
| `board-*.json` / `bounded-img-*.json` | 实现后放弃的整桌Canvas及有界PNG/Blob图片方案 |
| `layer-controls.json` / `felt-scale-pixel-comparison.json` | 平板图层、提示音和桌布分辨率对照及截图像素差 |
| `corrected-before-toolbar.json` | 横屏响应阶段顶部按钮遮挡时保留的部分数据，随后修复和复测 |
| `texture-pixel-comparison.json` | 同一实际发牌状态在自适应纹理步骤前后的像素差，非整版本视觉差 |
| `pre-*` / `svg-felt-*` / `per-tile-png-webkit.json` | 各中间阶段的实测数据，其中含预算失败 |
| `webkit.json` / `felt-atlas-first-run-250ms-failed.json` | 前一阶段WPE软件渲染/墙钟预算失败，未删除最差样本 |
| `exploratory-*` | 最早探索，包含并发其他测试时的Firefox失败，不纳入正式比较 |
| `baseline-memory.json` | 单次原版浏览器进程PSS补充，不能代替真实手机内存峰值 |
| `release-*.png` / `eight-bamboo.png` | 最终版真实浏览器截图；屏幕尺寸/DPR为模拟 |

保留实拍联机竖屏 acceptance/09-lan-phone.png。foreground-soak.json 是只完成一局的手动注入对照。

JSON中的 `paint_ms` 为外部墙钟等待图片就绪及两个requestAnimationFrame回调的代理，包含自动化/软件绘制/调度开销，不是物理屏幕延迟。`liveBytes` 等是已知像素存储计数估算，不包含全部浏览器/GPU资源。Chromium Linux的PSS另读取浏览器进程；不要将JS heap视作总内存。
