# RepoScope v0.1.0

RepoScope 是面向 Windows 用户的本地代码仓库分析器。给定一个目录，生成单文件 HTML 报告和适合交给 AI 阅读的 Markdown 概览。分析过程不联网、不上传数据、不需要 API Key，也不导入或执行目标项目的代码、安装脚本或 Git hooks。

这是本仓库首个独立项目，面向需要快速了解陌生仓库规模、技术栈和阅读重点的开发者。v0.1.0 的范围是 CLI 扫描、规模统计、基础维护风险提示与离线报告，不包含 GUI、依赖漏洞扫描或语义级代码审计。

## 安装与启动

需要 Python 3.11+。唯一运行时第三方依赖是固定版本 `pathspec==0.12.1`，用于 Git 通配符、否定规则、锚定路径及嵌套 `.gitignore`；自行实现简化匹配容易漏掉排除规则。运行时不需要安装 Git；测试中的 Git 语义对照检查需要 Git。

Windows PowerShell，在本项目目录中运行（无需激活虚拟环境）：

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install .
.\.venv\Scripts\reposcope.exe --help
.\.venv\Scripts\reposcope.exe "C:\Users\Alice\我的项目" --output "C:\Users\Alice\Reports\my-project"
```

Linux / macOS：

```sh
python3 -m venv .venv
.venv/bin/python -m pip install .
.venv/bin/reposcope /path/to/repository --output /path/to/reports
```

安装会获取构建工具和 `pathspec`；安装完成后扫描和查看报告完全离线。开发安装可用 `python -m pip install -e .`。也可在安装后执行 `python -m reposcope ...`。

需要在另一台无网络 Windows 机器安装时，先在可联网机器为目标 Python 准备 wheel（本项目和 pathspec 都是纯 Python）：

```powershell
py -3 -m pip wheel . --wheel-dir wheelhouse
# 将 wheelhouse 复制到离线机器后：
py -3 -m pip install --no-index --find-links wheelhouse reposcope==0.1.0
```

## 使用

```powershell
reposcope "D:\work\my repo" -o "D:\reports\my repo" --exclude "dist/" --exclude "*.generated.*"
reposcope . --format markdown -o reports --max-file-bytes 2097152 --max-files 50000
reposcope . --long-file-lines 800 --large-dir-bytes 209715200 -o reports --force
```

- `--format both|html|markdown`：默认生成 `report.html` 和 `report.md`。
- `--exclude`：可重复，语法与 `.gitignore` 相同。规则始终使用 `/`，路径参数使用当前系统的原生路径格式。路径含空格时加引号。
- `--max-file-bytes`：单文件内容读取上限，默认 1 MiB；大文件仅保留路径、大小、语言等元数据。
- `--max-files`：最多记录 100,000 个文件，达到上限且存在更多文件时停止，报告明确标记为部分统计。
- `--long-file-lines`：超长源文件阈值，默认超过 500 代码行。
- `--large-dir-bytes`：超大目录阈值，默认超过 100 MiB（递归计入未排除文件）。
- `--force`：明确允许替换已有的 `report.html` / `report.md`。默认保护已有文件。
- 输出目录不能等于扫描根目录；位于扫描目录内部时，自动排除整个输出目录，避免重复扫描报告。默认输出 `./reposcope-report`，相对于运行命令的工作目录。

用浏览器直接打开 `report.html` 即可。HTML 内含样式、浅色/深色主题切换脚本和全部报告数据，没有 CDN、远程字体或远程图表。关闭 JavaScript 也能阅读全部数据。Markdown 不包含完整源码或配置值。

退出码：`0` 为完成扫描（预期排除、二进制文件、超大文件等不会导致失败）；`1` 为已生成报告但存在读取/配置解析错误或文件数量截断，需要查看报告；`2` 为输入/输出等致命错误。`--help` / `--version` 为 `0`。

## 扫描与隐私边界

- 自动跳过 `.git`、`.hg`、`.svn`、`node_modules`、`venv`、`.venv`、`env`、`__pycache__`、`.tox` 以及常见 Python 缓存目录。
- 遵守扫描根目录及子目录的 `.gitignore`；子目录规则可覆盖父目录规则，已排除目录不再进入，因此不能单独恢复其子文件。用户额外排除规则独立应用，不会恢复 `.gitignore` 排除项，也不能恢复内置排除项。不读取根目录之外的父级 `.gitignore`、全局 Git 配置或 `.git/info/exclude`。
- `.gitignore` 无权限、是链接、无法解码、规则无效或超过读取上限时，跳过对应整棵子树并记录错误，避免在规则未知时读取本应排除的文件。匹配使用区分大小写的 pathspec 语义，不读取 Git 的 `core.ignoreCase` 设置。
- 不跟随文件或目录符号链接、Windows junction/reparse point；跳过 FIFO、设备等特殊文件。根路径作为用户选择的目录先解析到实际位置；之后不跟随其内部链接。
- `.ssh`、`.aws`、`.azure`、`.gnupg`、`.kube`、`.docker`、`.terraform` 以及名字匹配敏感规则的目录直接跳过；`.env`、`.env.*`（包括示例文件）、`.npmrc`、`.pypirc`、`.netrc`、常见私钥、凭据、secrets 文件、证书私钥、数据库及 Terraform state 文件不读取内容，只统计元数据。策略见 `scanner.py` 的 `SENSITIVE_*` 常量。
- 对无法读取的文件/目录记录通用错误并继续，不回显可能带有敏感配置片段的异常信息。报告最多列出 100 条错误，并保留错误总数。
- 敏感识别是保守的文件名规则，不是通用秘密检测器。普通源码内可能包含硬编码秘密，但报告从不输出源码或任意配置字段。**文件名、目录名、绝对根路径及大小仍会出现在报告中**；分享前请检查元数据，私有项目报告不要提交到公开仓库。
- 目标目录应在扫描期间保持稳定。POSIX 使用 `O_NOFOLLOW` 拒绝最终路径组件链接；Windows 做 reparse point 检查。但路径检查与读取之间仍存在目录替换竞态，本工具不是分析恶意、并发修改文件树的安全沙箱。

## 统计口径和算法限制

| 项目 | 算法与解释 |
| --- | --- |
| 文件/语言 | 按扩展名识别；文件数包括敏感、二进制及超大文件。Unknown 明确标记未知，不推断无扩展名脚本。 |
| 目录大小 | 对已纳入清单的普通文件求字节数之和；父目录含子目录，因此榜单不可相加。不是磁盘实际块占用量，不包含已排除文件，硬链接按路径重复计数。 |
| Python 行数 | 成功解析时使用 `tokenize` 分类物理行，带代码的混合行计为代码；独立注释行计为注释；纯空白行计为空行；docstring 计为代码。标记 `tokenized`，在此口径下精确，不代表语义复杂度。语法错误回退到 `heuristic`。 |
| 其他语言行数 | 常见 C 风格语言识别 `//` / `/* */`，Shell/Ruby/PowerShell/YAML/TOML 识别 `#`，SQL 识别 `--`；屏蔽简单字符串。属于启发式估算，不能完整处理正则、heredoc、raw string、模板和嵌入语言。HTML/XML/JSON/Markdown/Text/Unknown 标记 `unclassified`，非空行不等于真实代码行。 |
| 编码/二进制 | 支持 UTF-8（含 BOM）及带 BOM 的 UTF-16；NUL/明显控制字符或不支持的编码归为 `binary_or_encoding`，不分析内容。不自动猜测 GBK、UTF-32、无 BOM UTF-16。 |
| 主要语言 | 仅在源语言中按代码行数、文件数排序，最多三个；未分析文件不会被假定有代码行。框架与工具来自已知清单特征，不能保证推断完整或符合实际使用情况。 |
| Python 函数长度 | AST 中 `def` 行到函数体结束行（包含空行和注释，不含装饰器），超过 80 行提示。函数数量包含方法、异步函数和嵌套函数，不含 lambda。 |
| Python 分支分数 | 每函数从 1 开始，对 if、for、async-for、while、except、条件表达式、match case 各加 1，布尔运算再加操作数减一；排除嵌套函数、类、lambda 的子树，超过 10 提示。没有完整控制流图，不是准确圈复杂度；推导式、try/finally 等不计。 |
| JavaScript/TypeScript | 屏蔽简单字符串和注释后，统计 `function` / `=>` 标记、if/for/while/case/catch/`&&`/`\|\|` 标记和最大花括号嵌套。深度超过 6 或分支标记超过 50 时提示。不是语法解析器，JSX、模板插值、正则可产生误差，不能当作准确函数数量或圈复杂度。 |
| 代码集中度 | 至少 5 个已分析源文件，某一个文件占源代码总行数超过 50% 时提示。排除配置与文本文档行数。 |

技术栈识别支持 `package.json`、`pyproject.toml`、`requirements.txt`、`Cargo.toml`、`go.mod` 和 `pom.xml`。可识别 React、Vue、Next.js、Express、Angular、Svelte、Django、Flask、FastAPI、Spring Boot 及常见构建工具；不执行 package scripts，不解析动态 setup.py，不输出依赖版本、仓库 URL 或配置的任意字段。XML 拒绝 DTD/实体声明，不获取网络资源。未解析的清单会显示错误。

维护问题均为人工复查线索，不能直接判定代码质量；超长源文件排行只是阅读候选，并非真正入口。报告包含技术栈、核心目录结构（深度 3、最多 50 项）、最大目录（30 项）、关键清单（100 项）、优先源文件（20 项）、重点文件指标、维护提示（100 项）以及建议阅读顺序，各节明确展示截断规则。

内存主要为 O(纳入文件数 + 目录数 + 当前单文件内容/语法树)，不在结果里保存源码，也不一次加载整个目录的全部条目。单文件默认读取至多 1 MiB + 1 字节，Python 解析仍会有额外内存开销。大型依赖目录请用 `--exclude` 排除；最大文件数限制不限制空目录数量，也不保证总运行时间。扫描顺序依赖文件系统，数量截断时纳入的子集可能不同。

## 自动化测试与验收

在本项目目录内：

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

```sh
.venv/bin/python -m unittest discover -s tests -v
```

测试在临时目录自动生成数据，覆盖空目录、Python、JS/TS、混合语言、二进制、嵌套 Git 排除与额外规则、权限错误、Unicode、HTML/Markdown 注入、1,500 个小文件、敏感文件从未打开、符号链接循环、Windows reparse 标志、读取上限、复杂度提示及 CLI 重复生成。权限错误通过 mock 稳定复现，不依赖 root/Windows ACL 差异；另有 Git 命令对照测试验证代表性忽略规则（Git 仅是测试工具）。Windows 若缺少创建符号链接的权限，对应测试会明确 skip。

建议验收：对真实仓库运行 CLI，确认退出码、两份报告、文件统计及错误/跳过项，再离线打开 HTML 切换主题，检查 Markdown 阅读顺序。Windows 原生执行及浏览器验证结果见 `VALIDATION.md`，未执行的平台不会宣称通过。

## 后续计划

- Windows 3.11+ 原生回归与更多编码样本。
- 扩展语言词法器、入口文件和 lockfile 工具识别。
- 可选的机器可读 JSON 汇总与更严格的增量扫描预算。
