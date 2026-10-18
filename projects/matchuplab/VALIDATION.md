# MatchupLab v0.1 验证报告

验证日期：2026-10-18。开发基线：当时最新远程 `main`（`bb43646`）；独立分支 `feature/matchuplab`。开始前检查根规范、项目索引、现有五个项目与 CI，GitHub 未合并 PR 列表为空，未发现重复博弈学习实现。仅新增本项目、项目索引及 CI 接入，其他项目业务代码与依赖不变。

## 实际本地执行

环境：Linux，Node.js 24.19.0，npm 11.9.0，系统 Chromium。保留仓库现有 React / TypeScript / Vite / Vitest / Playwright 锁定版本；未升级其他项目依赖。

| 工作目录 | 命令 | 实际结果 |
| --- | --- | --- |
| 项目 | `npm ci` | 成功安装锁定依赖 |
| 项目 | `npm run typecheck` | 通过 |
| 项目 | `npm run lint` | 通过，0 warnings |
| 项目 | `npm test` | 5 文件、92 项测试全部通过 |
| 项目 | `npm run build` | 通过，包含独立模块 Worker，未发布 |
| 项目 | `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` | 生产构建，8 项 Chromium E2E 全部通过 |
| 项目 | `npm audit --audit-level=moderate` | 0 个已知漏洞 |
| 仓库根目录 | `python scripts/configure_git_identity.py --install-hooks` | 通过 GitHub 邮箱接口确认规范身份，仅配置当前 checkout；保留隐私钩子 |
| 仓库根目录 | `python -m unittest discover -s tests -v` | 26 项隐私回归全部通过 |
| 仓库根目录 | 首次 `python scripts/privacy_check.py --all-history` | 初次失败：12 项 `known-private-identity`；后经下述诊断确认均为同一公共系统项误列，获准纠正后复查通过 |
| 仓库根目录 | 首次 `python scripts/privacy_check.py --commits origin/main` | 同样 12 项命中，来自基线祖先；并非 MatchupLab 新增变化 |
| 仓库根目录 | `python scripts/privacy_check.py --staged` | 33 个新增/修改 blob 通过，0 命中；包括规范前瞻身份 |
| 仓库根目录 | `python scripts/privacy_check.py --message-file ...` | 提交说明及拟 PR 正文均通过，0 命中 |
| 仓库根目录 | 纠正后 `python scripts/privacy_check.py --commits 978f464^..978f464` | 通过：1 提交、202 个 blob、0 命中；原提交未改写 |
| 仓库根目录 | 纠正后 `python scripts/privacy_check.py --pre-push --remote-name origin` | 使用本次新分支更新作为标准输入，通过：1 提交、202 个 blob、0 命中 |
| 仓库根目录 | 纠正后 `python scripts/privacy_check.py --all-history` | 通过：77 提交、347 个 blob、0 命中；包含所有现有本地引用 |
| 仓库根目录 | `git diff --check`、工作流 YAML 解析 | 通过 |

## 覆盖的行为

- 完整收益矩阵、平局、动作越界、收益映射、两种游戏的理论均衡；每环境 1,000 组随机动作回归。
- 固定 PRNG 序列、seed=0、32 位种子回绕、重复运行、不同增量批大小输出一致；模拟禁止调用全局 `Math.random()`。
- 四种 Agent 的初始状态、均值/计数更新、深拷贝快照、重置及非法观测；每算法 20,000 次更新的数值稳定性。
- ε 混合概率、UCB1 零样本探索与置信项、EXP3 重要性加权及 log 权重规则。
- 五类对手可复现、偏好概率、响应对手仅观察过去、切换阈值 N/N+1 与 N=0。
- 训练结束后每次测试更新都核对 Agent 状态不变；修改测试长度与目标不影响训练；测试随机流、时钟与历史隔离；相同目标的配对测试一致。
- 三个内置模板分别运行四算法、三种子；额外 30 种子×两游戏×四算法的随机化汇总不变量回归。
- Welford 样本标准差、胜/平/负、动作计数、跨种子均值/SD/min/max、单样本限制、CSV BOM/转义/配置往返和 JSON 往返。
- 批量上限、非法配置、曲线内存上限、取消后禁止导出、Worker 暂停/恢复/单步、计算时间预算、异常结束与完成后迟到暂停。
- 生产 E2E：战术环境与算法配置、批量运行、阶段图表和累计曲线、JSON/CSV 下载内容、单局、暂停稳定、恢复/重置、迁移与切换模板、预算错误、取消后重启、编辑配置清除旧结果、偏好/响应对手、390px 手机布局及键盘操作。

首轮类型检查暴露测试局部数组缺少类型标注，已修正。首轮 E2E 有两处定位失败（标题换行和 select 标签精确匹配）；修正后完整重跑通过。手机检查还发现结果网格被表格最小内容宽度撑开，已限制网格列和面板最小宽度，390px 无页面横向溢出。桌面/手机截图仅作为本地浏览器人工检查材料，不提交产物。

## CI、隐私与交付限制

新增 `.github/workflows/matchuplab.yml`，Linux / Windows、Node 22 上安装锁定依赖、审计、lint、类型、92 项单元测试、生产构建和 8 项 Playwright 验证，并接入根 `CI required`。本地没有冒充 Windows 原生执行；远程 CI 结果以 PR 对应 SHA 的检查为准。

初次交付因实际提交整树扫描和待推送检查命中既有测试文件而停止，随后完成只读归因并按用户明确批准修复。规则 ID 为 `known-private-identity`（检查器没有独立数字编号），实现位于 `scripts/privacy_check.py:53–57`：私有词表逐条、不区分大小写、词边界字面匹配。目标为 `tests/test_privacy_check.py:107` 的合成平台合并提交 fixture；该文件在远程 main 与 `978f464` 中 blob 完全相同。词表命中项经程序化比较，精确等于检查器既有公共系统地址常量。全部 12 项历史命中都来自这一项，其他三个私人词条无命中。报告不展示词条原值。

`LEGACY_SYNTHETIC_EMAIL_FIXTURES` 只对精确 blob、路径及一个合成邮箱生效；本次目标 blob 不在该表中，且私有词表始终优先。无需新增或扩大任何豁免，也无需修改规则、fixture 或共享历史。按 `docs/PRIVACY.md` 已有“公开系统词条若被误列，应在仓库外备份并核实后纠正”的流程，并取得本次精确纠正的明确批准后，保存仓库外受限备份，仅移除这一个公共系统误列项；其余三个私人词条、检查规则与钩子全部保留。复查全历史、原始项目提交及待推送检查均为 0 命中。

原先暂存的项目索引和本报告应纳入交付，但须将“仍被阻塞、未改词表”更新为上述实际诊断和批准后的精确纠正，不能原样提交过时状态。代码提交 `978f464` 保留，通过后续正常文档提交补充验收记录。远程 PR、Windows CI 及合并状态以 GitHub 对应提交的实际检查和最终记录为准；不把本地通过当作远程交付完成。

未执行真实用户电脑人工验收、Firefox/WebKit 或长期后台性能测试；未部署、未改仓库权限或账号设置。冻结策略评估与短时模拟不构成全部对手上的最优性保证。
