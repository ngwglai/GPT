# CompressionLab v0.1 验证记录

日期：2026-10-16。以下为实际执行的本地 Linux / Node.js 24.19.0 验证，不以配置存在代替执行结果。本文前半保留首次本地验收快照；旧推送阻塞已由 main 的 PR #8 解除。最新维护复验见文末，远程 Linux/Windows 结果以维护 PR 最新提交为准。

| 检查 | 实际结果 |
| --- | --- |
| `npm run typecheck` | 通过；严格 TypeScript、无 unused locals/parameters |
| `npm run lint` | 通过；ESLint 零警告，含 React hooks 规则 |
| `npm test` | **106/106 通过**，2 个文件，无跳过 |
| `npm run build` | 通过；Vite production build，运行时只有 React/ReactDOM 两个直接依赖 |
| `npm run test:e2e` | **13/13 通过**，Chromium 156，针对生产构建，无跳过 |
| 根 `python -m unittest discover -s tests -v` | **18/18 隐私脚本回归通过** |
| 新增暂存区、提交说明、作者/提交者与新增提交扫描 | PASS，0 findings |
| 首次推送的完整祖先扫描 / `--commits origin/main` | **FAIL：main 既有 2 项 noncanonical-committer**；不是新增代码的问题，但阻止交付 |

## 核心正确性证据

- 熵：空、单符号、均匀/非均匀分布、100,002 符号的极偏分布数值稳定性、Unicode code point 与 UTF-8 分离计量、顺序不影响 H₀。
- Huffman：14 类输入（含空、Unicode、组合符号及控制字符）逐例 prefix-free 与 round-trip；单符号编码、同频确定性、code point 排序、合并两个最小节点/权重守恒/历史队列不变、H≤L<H+1、非法 bit stream。
- RLE：14 类回环、run flush 时点、最终 trace 与实际 token 一致、无效计数拒绝。
- LZ77：14 类输入分别在 9 组 window/lookahead 参数下回环；全字面量、重叠 `(1,7,null)`、窗口恰好边界和边界外、最近匹配决胜、参数/token 验证。
- BWT：14 类逆变换与符号多重集一致、banana 已知矩阵/last column/primary index、周期相同行的稳定排序、96 符号边界、非法 primary index。
- MTF：14 类逆变换、逐步 alphabet 首位验证、banana 已知序列与连续零、无效 alphabet/index。
- 一个测试内额外执行 **250 组固定种子混合 Unicode 样本**，同时验证 Huffman prefix-free、Huffman/RLE/LZ77/BWT+MTF 回环；这是 106 项中的一项，不冒称另有 250 个测试用例。
- 最大 512 种不同符号的全长轨迹、BWT 跳过策略、统计实测字节数、孤立 surrogate 拒绝、真实 BWT/MTF trace 阶段。
- 播放 reducer：暂停时忽略 tick、暂停后同位恢复、单步、终点自动停止与 clamp、重置。

## 生产浏览器流程（13 项）

1. 熵逐步频率、暂停期间等待确认不推进、恢复、终点及重置。
2. Huffman 真正的合并节点、SVG 树、暂停/恢复、编码 bit stream 与 prefix-free。
3. Huffman 单符号 emoji 与空树。
4. RLE 当前 run 和最终 JSON token。
5. LZ77 重叠 token、窗口/lookahead 配置与参数变更重置。
6. BWT 旋转行、banana 的 `nnbaaa`、primary=3、MTF 的 `2,0,2,2,0,0`。
7. BWT 输入超限时不截断，Huffman 仍可运行，缩短后恢复。
8. 513 符号全局超限及恢复。
9. 五个数据集选择、单步与重置。
10. 运行中编辑或切换实验会暂停并清空旧播放状态。
11. 每个实验的空输入流程。
12. 375px 布局不产生全页水平溢出，主题保存/重载、reduced-motion 下可操作。
13. 离线后计算、HTML 样式输入安全显示、不发送外部请求、仅保存主题、重载不保留输入。

每个浏览器用例同时断言没有 pageerror。另实际生成并查看桌面深色及手机浅色截图（临时截图不提交），检查树、表格和溢出。

首轮 E2E 为 12/13：熵测试误按 caption 的可访问名称定位，页面实际已有正确频率。修正为按 table 的 caption 名称定位后，完整重跑 13/13 通过；没有放宽算法断言或跳过失败项。

## 范围与未执行事项

- 本地没有原生 Windows；新增独立 Linux/Windows CI，运行结果见 PR，不能把本地结果称为 Windows 实测。
- Firefox、WebKit、真实手机和用户电脑人工操作未执行；不承诺所有浏览器兼容。
- 未部署网站、未做工业压缩格式兼容测试；这些不属于 v0.1。
- 有界主线程轨迹，512 符号 / BWT 96 符号；JSON token 大小和逻辑 Huffman bit 有明确计量差异，详见 README。
- 已执行暂存区、拟提交说明、有效身份与新增提交扫描，均通过。首次推送 hook 扫描完整祖先时发现 main 既有两项 noncanonical-committer；对 origin/main 单独扫描可复现。没有回显身份原值，没有绕过 hook，也未改写历史。
- 因完整祖先检查失败，PR 未创建、CI 未运行、未合并。按 AGENTS.md，共享历史治理需要具体授权，应单独处理；本地源码和验证结果可供审查，不声称 v0.1 全部交付条件已满足。

## 2026-10-16 解除阻塞与维护复验

main 的 PR #8 提供严格的 GitHub 平台合并元数据规则及新分支推送检查范围；本次正常合并该最新 main，不重写历史。私有词表中误列的一个公开系统身份已在仓库外备份并纠正，保留所有私人词条；当前完整可达历史检查通过。文本扫描进一步从整个 GitHub 邮箱域收窄到精确系统身份；既有合成测试 fixture 仅按固定 blob 哈希、路径与单一虚构值保留，未来编辑和显式私人词条均不豁免。

升级 Vitest 5.0.5 / typescript-eslint 8.71.2 后，106/106 Vitest、13/13 生产 Chromium、lint、typecheck、build 完整通过；npm 包含开发依赖的审计为 0 已知漏洞。根 CI required 现涵盖本项目 Linux/Windows 工作流。前文“未创建 PR / 未合并”属于首次受阻的历史记录，不是本轮复验结论。
