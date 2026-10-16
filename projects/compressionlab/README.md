# CompressionLab v0.1

一个纯本地浏览器数据压缩实验室，面向想看懂算法内部过程的学生与自学者。输入文本，单步或自动播放真实算法轨迹，观察冗余、概率、树、窗口和可逆变换。React + TypeScript + Vite，无后端、账号、数据库、外部 API、远程字体或付费服务。安装依赖需要网络；构建后全部计算在浏览器内完成，输入不上传、不存储。

与仓库中的 EntropyLab 不同，本项目研究字符数据与编码，而非计算物理中的空间熵和动力学。不实现 ZIP、GZIP、Zstd、Deflate 文件格式。

## 安装、启动和测试

需要 Node.js **22.12+** 与 npm（推荐 Node 22/24 LTS）。Windows PowerShell/cmd、macOS、Linux 使用相同命令：

```sh
cd projects/compressionlab
npm ci
npm run dev
```

打开终端显示的本机地址，默认 `http://127.0.0.1:5173`。

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run preview
```

生产预览默认 `http://127.0.0.1:4173`。`dist/` 需通过 HTTP 服务访问，不能直接双击 HTML；使用相对资源路径，可放在静态服务器的子目录。不自动部署。

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright 自动启动 **生产预览**，端口 4175 必须空闲。Linux 缺系统库时使用 `npx playwright install --with-deps chromium`；可用环境变量 `CHROMIUM_PATH` 指向已安装浏览器。测试数量、实测环境与未验证事项见 [VALIDATION.md](VALIDATION.md)。

## 四个实验

| 实验 | 能观察什么 |
| --- | --- |
| Information Entropy | 按 Unicode 符号扫描、频率、概率、直方图、Shannon 熵与理论下界 |
| Huffman Coding | 初始队列、每次真实合并、当前子树与最终树、编码表、bit stream、prefix-free、平均码长与编码效率 |
| RLE + LZ77 | 选择两种算法；run 与已生成 token，或滑动窗口、lookahead、匹配来源及 `(distance, length, next)` |
| BWT + Move-to-Front | 生成循环旋转、排序矩阵、Last Column、primary index；初始/更新 alphabet、当前 symbol/index 和 MTF 输出 |

操作：输入或选用数据集 → 选择实验 → 单步 / 自动运行 → 暂停 / 恢复 → 重置。输入、实验、RLE/LZ77 选择及窗口参数改变时暂停并从头开始。步进间隔可调整。最后一步自动停止，重置后可重放。界面只选择算法层生成的快照，不在 UI 中重新推导编码。

五个内置数据集为通用虚构测试数据：English-like、Highly repetitive、Periodic、固定的 Random 样本、DNA-like。Random 是可复现样本，不是安全随机数。深浅主题优先跟随系统并保存选择；浏览器禁止存储时仍可使用。支持窄屏、键盘焦点、滚动大矩阵/树和 `prefers-reduced-motion`；只有主动点击才会播放，没有额外动画库。

## 算法要点

**信息熵：**从样本频率得到 `p(x)`，`H₀ = −Σ p(x) log₂ p(x)`，单位 bit/符号。空输入定义 H=0，单一符号 H=0；均匀 k 种符号时 H=log₂k。使用补偿求和。`N×H₀` 是独立符号模型的理论载荷下界，不包含模型或容器开销，也不是利用上下文的所有压缩器的普遍下界。周期文本的零阶熵可以很高。

**Huffman：**反复合并两个最轻节点；左边记 0，右边记 1。叶子路径生成前缀无歧义的变长码。相同权重按最小 Unicode code point、节点 ID 排序，结果不依赖 locale。空输入为空树，单一符号用 `0`，平均码长为 1；因此该退化情况效率 H/L=0。一般非退化分布满足 `H≤L<H+1`。解码器验证 bit stream 和完整码字。

**RLE：**将相邻重复符号表示为 `{symbol,count}`，结束时 flush 最后一个 run。使用结构化 token，数字和分隔符不与原文混淆；解码器检查正整数 count 和单符号。适合长连续重复，无重复文本通常膨胀。

**LZ77：**在已处理窗口寻找 lookahead 开头的最长匹配；同长度取最近来源。生成 `{distance,length,next}`；纯字面量为 `(0,0,symbol)`，末尾没有 next 时用 `null`。length 上限为 lookahead（另可消费一个 next），距离上限为 window。解码时逐符号复制，支持匹配源与目标重叠，例如 `aaaaaaaa` 可用字面量 a 后接 `(1,7,null)`。UI 提供 window=4–64、lookahead=2–32，核心允许 1–256 / 1–64。

**BWT + MTF：**BWT 对全部循环旋转按 code point 排序，输出最后一列并保存原始行的 0-based primary index，不依赖特殊哨兵字符。逆变换使用稳定出现序号的 LF mapping；重复/周期输入也可逆。MTF 使用排序后的不同符号作为初始 alphabet，输出当前位置的 0-based 索引，再将符号移到首位；逆变换需保存初始 alphabet。两者改变表示但不直接构成压缩格式。

所有符号均为 **Unicode code points**，支持中文、emoji、组合字符，不做 Unicode 归一化，不按 grapheme cluster 合并。UTF-8 字节数通过 TextEncoder 计算。UI 和 BWT 拒绝孤立 UTF-16 surrogate，避免变换后发生隐式替换；有效 Unicode 文本不受影响。组合 emoji 可能由多个符号组成。

## 统计的计量方式

综合面板始终显示**完整输入的最终结果预览**，中间状态在实验面板逐步显示。

- 原始：UTF-8 字节数 × 8。Shannon 熵与理论下界使用 code point 概率。
- Huffman：输出为**逻辑载荷** bit 数；另列 UTF-8 JSON 编码表大小及含元数据的比率。JS 中用于展示的 `"0101"` 字符串不是真实 bit-packed 文件，未定义容器、字节填充、版本头等开销。
- RLE/LZ77：输出为 token 数组 `JSON.stringify(...)` 的 UTF-8 实测大小，包括字段名、数字和标点。
- BWT：输出为 `{lastColumn,primaryIndex}` 的 UTF-8 JSON；BWT+MTF 为 `{output,alphabet,primaryIndex}` 的 UTF-8 JSON，已包含逆变换所需元数据。
- 压缩率定义为 `输出 / 原始 × 100%`，越低越小；空输入显示 `—`。平均码长只用于 Huffman。计量格式不同，不能把此表当作工业压缩格式的性能排名。很短的数据可能因元数据显著膨胀。

## 结构与性能限制

```text
src/
  algorithms/   # React 无关的纯函数、编码/解码与真实 trace
  models/       # 显式节点、token、轨迹数据模型
  simulation/   # 有界实验结果、数据集、比较统计、播放 reducer
  ui/           # 控件、SVG 树、表格、扫描状态和样式
  main.tsx
tests/          # 算法边界、已知向量、随机回环、轨迹及播放状态
e2e/           # Playwright 生产页面交互
```

n 为符号数，k 为不同符号数，w 为窗口，l 为 lookahead：

| 实现 | 时间 / 空间（不含 UI） |
| --- | --- |
| 熵分析 | O(n+k log k) / O(k)；教学逐前缀 trace 重算，最坏 O(n² log n) 时间、O(n²) 空间 |
| Huffman | 简单排序队列 O(n+k² log k)，编码路径总长度与输出另计；队列 trace 最坏 O(k²)，节点共享且不修改 |
| RLE | 编码扫描 O(n)，复制 token 快照最坏 O(n²) 时间/空间；解码 O(n) |
| LZ77 | 匹配最坏 O(nwl)，token 快照最坏 O(n²)；解码 O(n)，每步窗口/lookahead 快照额外 O(w+l) |
| BWT | 生成矩阵 O(n²) 空间，字符串逐符号比较排序最坏 O(n² log n) 时间；LF 逆变换 O(n log n) / O(n) |
| MTF | O(nk)；教学 trace 含 alphabet 与输出复制，最坏 O(n²+nk) 时间/空间 |

全部轨迹预计算后回放，主线程计算；**UI 最多 512 个 code point，BWT 核心和 UI 最多 96**，控制快照/矩阵内存、排序及渲染成本。超限明确提示，不截断输入；97–512 符号仍能运行其余算法。部分实验快照以一次合并、token 输出或排序完成为粒度，不展示排序比较器内部每次比较。大树/频率表/矩阵在面板内滚动。

## 已知限制与后续

v0.1 是文本教学模型：不处理二进制文件、流式大输入、实际 bit 打包或工业文件格式；JSON token 的体积并非精简二进制表示。未实现 Worker，超长输入受预算限制。逆解码接口按教学 token 工作，不是对无限制不可信压缩文件的资源防护库。

后续可按需加入规范化的二进制 token 格式与元数据成本对照、更多已知向量、可逆管线后接 Huffman 的实验、Worker 和有界流式 trace。保持本地、可观察、可测试，不扩张为完整归档工具。
