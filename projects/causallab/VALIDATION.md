# CausalLab v0.1 验证记录

## 环境与任务连续性

2026-10-18，本任务执行环境曾显示 `pending/offline`，命令工具返回 `No usable execution environment is available`；之后恢复为 `running/connected`，实际 shell、Python、Git 命令成功。平台没有提供足够启动诊断信息，未确认根因；未为该故障修改仓库配置或 Git 历史。

恢复后确认仓库根目录正确，原 `work` 与重新 fetch 的 `origin/main` 完全一致（基线 `db02a968002d`，ahead/behind=0/0），从该基线创建 `feature/causallab`。按根 AGENTS.md 通过邮箱 API 核验匿名身份并启用仓库 hooks；未输出私人身份、未修改全局 Git 身份。

本地执行平台为 Linux x86_64，Node.js 24.19.0、npm 11.9.0；项目兼容 Node≥22.12。Chromium 由 Playwright 1.64.1 安装，生产 E2E 使用 Vite preview 4178 端口，不是开发服务器。

## 实际本地验证

- `npm ci`：通过，独立锁文件；没有升级共享或其他项目依赖。
- `npm audit --audit-level=moderate`：通过，0 已知漏洞（含开发依赖）。
- `npm run typecheck`、`npm run lint`、`npm run build`：通过。
- `npm test`：95 项 Vitest 通过，0 跳过；覆盖模型校验、循环/缺失引用、冻结缓存、固定 PRNG、线性依赖顺序、概率频率、do 与条件筛选、非后代保持、统计/OLS/SE/区间、导入导出、非法与极小样本。
- 多种子数学检验：种子 1、7、42、2026、98765，每次 n=20000；连续混杂模型 `X=U+εx, Y=2X+3U+εy` 的真实 ATE 恒为 2，观察 OLS 接近 3.5、调整 OLS 接近 2；并验证三例的混杂偏差、碰撞条件关联和辛普森组内/汇总反转。
- 已知效应参考：无混杂连续结果、二元结果 ATE=0.5、多中介总效应=6；独立小型数值夹具验证均值、n−1 方差、Welch SE、OLS 斜率/SE 和 t 区间，而非仅调用同一实现自证。
- `npm run test:e2e`：10 项生产 Chromium 流程通过，0 跳过。覆盖编辑、三案例、生成、观察、do、四种导出、模型文件/实验导入与结果精确重放、自环/有向环拒绝、非法参数与恢复、小样本、连续处理、390px 窄屏、旧结果失效和最大 n=20000 预算。生产页面运行时未观测到外部资源请求。
- 根目录 `python -m unittest discover -s tests -v`：26 项隐私回归通过，0 跳过。

首轮曾有一项 CSV 引号测试断言失败（JSON 内引号与 CSV 引号有两层转义）；修正为直接验证 CSV 文本字段的引号转义，并改进负数保持为数值，随后全量单元测试通过。另增加极大共同偏移下的解析 ATE 回归：直接传播均值差，避免两个大均值相减丢失小效应。一次写文件命令的工作目录错误、一次从根目录运行 npm 均已纠正，不将这些失败计作通过。

## 隐私与远程 CI

提交前执行暂存区与拟提交说明检查；提交后检查实际提交；推送前检查全部新增提交。根隐私脚本、规则与私有词表均保持原样，不使用 `--no-verify`。最终提交与远程状态见本节后续记录和根 PROJECTS.md，不把尚未运行的 CI 写作通过。

已增加独立 Linux/Windows 工作流，并接入 `CI required`。远程 PR、Windows CI、CI required 和合并均未执行；推送已因下述既有隐私阻塞暂停，没有远程运行链接或合并 SHA。

## 尚未验证与已知限制

本地未运行 Windows 原生系统；Windows 结果须以实际远程 CI 为准。用户电脑人工验收、Firefox/WebKit、真实手机未执行。无外部部署。浏览器资源上限由应用约束，不承诺所有设备延迟。OLS 使用同方差标准误；分层区间按固定经验权重；共同噪声配对区间仅针对该合成 SCM。未知私人信息、图片及远程隐藏引用超出通用隐私扫描能力，不宣称绝对不存在泄露。

## 既有隐私检查阻塞（最终本地状态）

- `python scripts/privacy_check.py --all-history`：失败，83 个提交 / 355 个唯一 blob / 12 项 `known-private-identity`。
- 独立验证基线 `python scripts/privacy_check.py --commits origin/main`：同样失败，79 个提交 / 349 个唯一 blob / 相同 12 项命中；尚未有 CausalLab 提交时即已存在。
- 命中位置为既有 `scripts/privacy_check.py`、`tests/test_privacy_check.py`、`AGENTS.md`、`docs/PRIVACY.md`；这些文件相对最新 origin/main 无差异。本记录只报告类别、计数和脱敏位置，不回显匹配原值，不推断误报原因。
- 本次新增/修改文件的 `--staged` 检查与拟提交说明检查通过；根 26 项回归通过不等于全历史检查通过。
- 按任务书停止受阻的推送、PR 与合并操作；保留本地功能分支和经单独检查的提交。未修改安全规则、hooks、私有词表或共享历史，未绕过检查。需要独立解决既有隐私阻塞后，重新检查全部待推送提交、运行最新跨平台 CI 并完成合并。
- 桌面与 390px 窄屏截图已在本地检查；发现长边可能与中间节点重叠，改为弧线显示跳过中间层的同排边，确保混杂边可见。最终 UI 改动再次通过 lint、类型、生产构建与完整 E2E。
