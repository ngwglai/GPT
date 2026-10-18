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
| 仓库根目录 | `python scripts/privacy_check.py --all-history` | 未通过：既有历史 12 项 `known-private-identity` 命中；未回显命中值 |
| 仓库根目录 | `python scripts/privacy_check.py --commits origin/main` | 同样 12 项既有命中，确认来自开发基线祖先；并非本项目新增文件 |

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

既有全历史命中保留原样，未删除或更改私有词表、未降低扫描标准、未关闭钩子、未改写共享历史。新增暂存内容、提交说明、实际提交及待推送范围仍需分别通过检查。即使项目本地验证通过，也不将既有全历史隐私失败视为通过；必要条件未全部满足前不合并。最终 PR / 合并状态以交付说明和 GitHub 实际结果为准。

未执行真实用户电脑人工验收、Firefox/WebKit 或长期后台性能测试；未部署、未改仓库权限或账号设置。冻结策略评估与短时模拟不构成全部对手上的最优性保证。
