## 变更

在 `projects/reposcope/` 添加首个独立项目 RepoScope v0.1.0。用户可以通过 Python CLI 离线扫描本地仓库，了解语言和目录规模、常见技术栈及潜在维护问题，并生成内置样式与主题切换的单文件 HTML 和 Markdown 阅读摘要。

实现嵌套 `.gitignore`、额外排除、敏感文件内容保护、链接/reparse point 跳过、权限容错、单文件与文件数量限制。Python 采用 tokenize/AST，其他语言和 JS/TS 指标明确标注估算口径；不执行目标代码，不输出源码或任意配置值，报告中所有目标元数据均转义。

更新 `PROJECTS.md` 为 Testing 状态；提供安装、Windows/离线使用、统计算法、隐私边界与已知限制文档。唯一运行依赖为处理 Git 忽略语义的 `pathspec==0.12.1`。

## 实际验证

- Linux / Python 3.12.14 和 3.11.17：分别执行 34 项 unittest，全部通过，0 失败、0 跳过，覆盖任务列出的全部 12 类场景。
- 真实仓库 CLI 扫描成功，两种报告均生成，0 读取/解析错误。
- wheel 构建成功；全新虚拟环境用本地 wheelhouse 和 `--no-index` 安装成功，已安装 CLI 扫描及 `pip check` 通过。
- Chromium 离线加载报告内容：12 个区块、主题切换、390px 窄屏布局通过，无 JS 异常或网络请求。
- `git diff --check` 通过。

完整命令与边界见 `projects/reposcope/VALIDATION.md`。

## 限制与验收

Windows 原生环境尚未实测；Windows 路径使用 pathlib 原生处理，reparse 标志行为已有模拟测试。云浏览器策略禁止 `file://`，浏览器测试使用相同 HTML 内容而非直接文件导航。复杂度提示不是准确圈复杂度，也不替代人工审查。

请在 Windows 安装后运行 `reposcope "C:\path\to\repo" -o "C:\path\to\reports"`，检查两份报告并离线打开 HTML，切换主题、核对排除与统计结果。等待用户验收，不自动合并。
