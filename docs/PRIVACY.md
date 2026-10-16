# 公开仓库隐私保护

本仓库仅使用 GitHub 用户名 `ngwglai` 与该账号已验证的 GitHub noreply 邮箱提交代码。作者和提交者都必须符合规则；匿名配置只保护未来提交，不能消除既有历史或 GitHub 页面中的关联。

## 初始化当前 checkout

从仓库根目录执行，需要 Python 3.11+、Git 与能访问当前账号邮箱接口的 GitHub CLI：

```sh
python scripts/configure_git_identity.py --install-hooks
```

脚本调用 `gh api user` 和 `gh api user/emails`，确认登录账号及唯一、已验证的 noreply 邮箱，然后设置本仓库 `user.*`、`author.*`、`committer.*`、`user.useConfigOnly` 和 `privacy.*`。它不猜测邮箱，不输出账号邮箱或 API 响应，不改动全局 Git 配置，也不保存凭据。API 权限不足或无法唯一确认时返回 2；应由用户在 GitHub 邮箱设置中核实，不能索要聊天中的私人邮箱/令牌或临时编造地址。

已有正确本地配置时，`privacy_check.py` 完全离线运行。每个新 checkout 都需重新初始化；不能假定云环境、容器、GUI 或 shell 的环境变量会沿用正确身份。若变量覆盖身份，检查会失败，需从该环境的配置来源移除覆盖；本工具不改其他项目或全局配置。

初始化会拒绝覆盖已有自定义 hooksPath 或实际本地 hooks。请人工集成 `--staged`、`--message-file` 和 `--pre-push` 检查。`.githooks` 文件会跟随代码，但 `core.hooksPath` 不会随 clone 自动启用；Git 的 hooks 也可能被 GUI、平台配置或 `--no-verify` 跳过。因此所有开发代理必须主动执行以下命令。

## 日常检查

```sh
# 先 git add，再检查暂存区，不读取可能不同的工作树版本。
python scripts/privacy_check.py --staged
# 提交说明先保存到本地临时文件；检查后再用于 git commit --file。
python scripts/privacy_check.py --message-file /tmp/commit-message.txt
# 检查实际新增提交；按当前任务基线调整范围。
python scripts/privacy_check.py --commits HEAD^..HEAD
# 审计所有本地引用的可达历史（需要已获取远程分支、标签和可访问 PR 引用）。
python scripts/privacy_check.py --all-history --json
```

Windows 可使用原生临时目录替代 `/tmp/commit-message.txt`，路径含空格时加引号。Python 可使用 `python`、`python3` 或 `py -3`，取决于本机安装。pre-push hook 从 Git 提供的标准输入中检查待推送提交；它不发送网络请求。对于已存在的远程引用，检查 `remote-oid..local-oid`；对于首次创建的远程分支，使用 hook 提供的远程名称，通过 `git rev-list <local> --not --remotes=<remote>` 排除该远程已有的本地跟踪历史，只检查可能随本次 push 新增的提交。若没有远程名称（例如手工调用），保持保守行为并检查完整祖先。

退出码：0 为指定范围通过；1 为发现问题；2 为缺少确认身份、Git 操作失败、输入不可读取等导致未能完成。未扫描不能视为通过。默认每个 blob 上限 5 MiB，超过上限会报错项，不会静默忽略；确需检查大文件可提高 `--max-bytes`。

检查内容：

- 普通提交的作者、提交者（以及 `--all-history` 下的附注标签 tagger）必须精确匹配已确认的身份；检查前瞻身份时也考虑 Git 环境变量覆盖。GitHub 网页生成的合并提交可以使用 GitHub 的系统提交身份；仅当作者仍为已确认身份、提交具有至少两个父提交且提交说明匹配 `Merge pull request #... from ngwglai/...` 时允许。仅精确的 GitHub 公共系统 noreply 地址作为平台元数据豁免；不豁免整个域、普通员工地址或其他子域。私有 denylist 始终优先，公开系统词条若被误列，应在仓库外备份并核实后纠正，不屏蔽检查结果。首次创建远程分支时只排除远程跟踪引用已知的祖先，不降低对本次新增提交的身份与内容检查标准。
- 提交说明中的共同作者、签署、评审等身份尾注只能使用该匿名身份。不要自动添加不必要尾注。
- 暂存文件/历史 blob、文件名、提交说明中的非批准邮箱、常见服务令牌、私钥、疑似硬编码密码、个人绝对路径与 ChatGPT 会话/分享链接。
- 真实姓名无法靠通用正则可靠判断。支持仓库外 JSON 私有词表 `{"terms": ["Example Person", "person@example.invalid"]}`；示例只是虚构格式，实际词表**不得提交**。可以通过 `--denylist` 指定，或以 `git config --local privacy.denylist <private-path>` 固定在当前 checkout。

输出只有类别、计数和脱敏位置；命中的路径本身含私人信息时使用不可逆位置标识。不回显匹配值、源码片段或底层 Git/API 错误。`--json` 也保持同样规则。错误报告仍可能暴露普通项目文件名，分享前应检查。

## 能力边界

这是一道标准库实现的轻量防线，不是秘密发现的完备证明。示例域名和常用虚构路径（如 Alice、Bob、USER）允许使用；有意混淆、未列出的凭据格式、未知姓名、图片/编码内容、Git LFS 外部对象与子模块内容不保证检出。子模块只检查本仓库 gitlink/清单，不读取其他仓库；历史扫描只覆盖本地可达引用，不包含 GitHub 缓存、隐藏引用、不可达对象或其他人的克隆。大文件明确报告未扫描。

已知身份词表随当前环境私有保存，新的环境可能没有该词表；作者/提交者检查与通用规则仍适用，但不能宣称检出了未知姓名。审计时应补充由用户管理的私有词表，禁止将其放在公开策略文件里。

## 清理历史与恢复

先备份并实际验证恢复，再在隔离本地副本用 `git-filter-repo` 重写所有可访问分支、标签及 PR 引用；统一作者/提交者并删除私人身份尾注。先比较每个历史提交树，再单独加入经过审查的防护文件，保留项目内容。

重写会改变提交 SHA，原有提交/标签签名不能保留有效性，GitHub Verified 标记、贡献归属、提交链接和已有 PR 的提交关系可能变化。使用精确旧 SHA 的 `--force-with-lease` 只能减少并发覆盖风险，不能清除 GitHub 内部 PR 引用。禁止直接使用 `git push --mirror`，避免修改不可控的引用或删除分支。

原始 bundle、归档与旧新引用映射只保存在仓库外的受限位置。可以从 bundle 恢复到新的本地目录，或从完整归档恢复未提交/忽略文件；先验证 `git fsck --full`。恢复原历史到远程会重新公开私人信息，必须另行明确批准，不能作为自动回滚步骤。

## GitHub 服务端残留及账号设置

- 在 GitHub 邮箱设置启用隐藏邮箱及阻止暴露私人邮箱的命令行推送；清理个人资料中的真实姓名、公开邮箱和不必要外链。这些账号级变更由用户操作，本任务不会改其他仓库。
- 已合并 PR 的 `refs/pull/*`、旧提交对象、评审引用和缓存可能保留身份。普通 Git 推送无法删除这些内部引用；旧 URL 在重写后也不保证失效。外部克隆、搜索引擎和归档无法由本仓库控制。
- 参考 [GitHub 官方敏感数据移除指南](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)；通过 [GitHub Support](https://support.github.com/contact) 申请检查受影响 PR 引用、旧对象及缓存。是否受理及能移除的范围由 GitHub 决定，不保证完成。

支持申请可使用以下不含私人原值的说明（不要发布到公开 Issue）：

> 仓库 ngwglai/GPT 的历史提交作者、提交者及身份尾注暴露了个人身份信息。我们计划/已在保留代码的前提下重写公开分支，并统一为账号拥有的 noreply 身份。请协助说明或处理 PR #1 的内部历史引用、旧提交页面及相关缓存中的身份残留。受影响的旧新提交映射已私下保存，可通过安全渠道提供。请不要在公开回复中重复原始姓名或邮箱。我们理解外部克隆与搜索引擎缓存不在仓库所有者可直接控制的范围内。

## 既有合成测试夹具

2026-10-16 将整个 GitHub 邮箱域豁免收窄为精确系统地址时，发现既有历史中的一份回归测试源文件使用了非保留域的虚构拒绝样本。`LEGACY_SYNTHETIC_EMAIL_FIXTURES` 仅对该已存在 blob 的精确对象哈希、精确测试文件路径和那一个合成地址组合保留原先已有的通过行为；不跳过 blob 扫描，其他邮箱、凭据、私人词条均照常检查。任何新编辑会产生不同哈希，不享受此例外。测试验证路径、编辑和 denylist 不能借此绕过；无需改写共享历史。新样例仍必须使用保留域或动态构造。
