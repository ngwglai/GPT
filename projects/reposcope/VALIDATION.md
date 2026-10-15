# v0.1.0 实际验证记录

日期：2026-10-15。执行环境：Linux，Python 3.12.14 / 3.11.17，Git 2.52.0。下述命令均实际运行；没有在 Windows 原生环境执行，不将 reparse 标志模拟测试视为 Windows 原生通过。

## 自动化测试

在仓库根目录，先将项目安装到仓库外虚拟环境，再执行：

```sh
/workspace/reposcope-venv/bin/python -m pip install --no-build-isolation --no-deps -e projects/reposcope
/workspace/reposcope-venv/bin/python -m unittest discover -s projects/reposcope/tests -v
git diff --check
```

`pathspec==0.12.1` 与 setuptools 已预先安装。结果：**34 tests / OK，34 通过，0 失败，0 跳过**。执行耗时约 0.27 秒；不作为性能承诺。

另外通过 uv 安装 Python 3.11.17 到仓库外目录，用该解释器创建全新虚拟环境，只从本地 wheelhouse 安装已构建的包，然后实际执行：

```sh
/tmp/reposcope-py311-venv/bin/python -m unittest discover -s projects/reposcope/tests -v
/tmp/reposcope-py311-venv/bin/reposcope /workspace/GPT --output /tmp/reposcope-python311-report
```

结果同样为 **34 通过，0 失败，0 跳过**；CLI 生成两份报告，0 读取/解析错误。3.11 验证使用安装后的 wheel，而非源码目录的导入路径。

覆盖了用户要求的 12 类场景，另外验证了嵌套忽略规则与 `git check-ignore` 的一致性、FIFO 跳过、超大文件/文件数限制、配置解析错误不回显内容、Python 警告不泄漏源码、错误列表上限、重复生成报告及输出保护。权限场景同时含稳定的 mock 测试和非 root POSIX 用户下的真实 `chmod(0)` 文件；本次两者均执行通过。

## 实际仓库与打包

```sh
/workspace/reposcope-venv/bin/reposcope /workspace/GPT --output /tmp/reposcope-real-report
/workspace/reposcope-venv/bin/python -m pip wheel --no-build-isolation --no-deps projects/reposcope --wheel-dir /tmp/reposcope-wheelhouse
/workspace/reposcope-venv/bin/python -m pip download --only-binary=:all: --no-deps pathspec==0.12.1 --dest /tmp/reposcope-wheelhouse
python3 -m venv /tmp/reposcope-offline-venv
/tmp/reposcope-offline-venv/bin/python -m pip install --no-index --find-links /tmp/reposcope-wheelhouse reposcope==0.1.0
/tmp/reposcope-offline-venv/bin/reposcope --version
/tmp/reposcope-offline-venv/bin/reposcope /workspace/GPT --output /tmp/reposcope-offline-report
/tmp/reposcope-offline-venv/bin/python -m pip check
```

实际结果：

- CLI 帮助与版本可用，版本为 `0.1.0`。
- 真实仓库扫描成功，HTML 和 Markdown 均生成，读取/配置解析错误为 0，退出码为 0。文件数会随后续文档加入而变化，不固定为验收断言。
- 成功构建 `reposcope-0.1.0-py3-none-any.whl`。
- 全新虚拟环境仅从本地 wheelhouse 安装成功（`--no-index`）；已安装 CLI 的扫描成功，依赖检查无冲突。
- 未将报告、wheel、依赖目录或虚拟环境提交到公开仓库。

## 浏览器验证

使用系统 Chromium + 环境已有的 Playwright（不属于项目依赖）。浏览器 context 设置 `offline=True`，加载生成报告的完整 HTML：

- 12 个报告区块正常显示。
- 点击主题按钮，验证 `data-theme` 在 dark / light 之间切换。
- 在 1280px 桌面和 390px 窄屏下渲染；窄屏文档无横向溢出（宽表格内部可横向滚动）。
- 无 JavaScript 异常，无网络请求。
- HTML/脚本注入由独立测试使用恶意路径和配置值验证，实际文件名含 HTML 特殊字符的场景也已在 Linux 执行。

限制：云端受管 Chromium 对 `file://` 返回 `ERR_BLOCKED_BY_ADMINISTRATOR`；因此上述验证使用 `page.set_content()` 加载同一 HTML 字节内容，不宣称已在该云浏览器中通过直接双击文件验证。报告没有外部资源，最终 Windows 用户应在本地浏览器打开 HTML 完成原生验收。

## 尚未执行

- Windows 原生 Python、Windows ACL、长路径/UNC 与实际 junction 创建测试。
- 超过 100,000 文件仓库的压力测试；已验证小规模文件数截断和 1,500 文件清单，未作百万文件性能承诺。
