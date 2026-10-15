import codecs
import contextlib
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import warnings
from unittest.mock import patch
from html.parser import HTMLParser

from reposcope.analysis import analyze_text
from reposcope.cli import main
from reposcope.reports import html_report, markdown_report
from reposcope.scanner import Options, read_regular, scan


class ReportParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.scripts = []
        self.tags = []
        self.events = []

    def handle_starttag(self, tag, attrs):
        self.tags.append(tag)
        self.events.extend(key for key, value in attrs if key.lower().startswith("on"))
        if tag == "script":
            self.scripts.append(dict(attrs))


class RepoScopeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def write(self, name, content="x\n"):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(content, bytes):
            path.write_bytes(content)
        else:
            path.write_text(content, encoding="utf-8")
        return path

    def paths(self, result):
        return {f["path"] for f in result["files"]}

    def test_empty(self):
        result = scan(self.root)
        self.assertEqual(result["files"], [])
        self.assertEqual(result["total_bytes"], 0)
        self.assertIn("No entries", html_report(result))
        self.assertIn("None detected", markdown_report(result))

    def test_python_lines_metrics_and_no_execution(self):
        marker = self.root / "EXECUTED"
        self.write("app.py", f"# comment\n\n\"\"\"docstring\"\"\"\ndef run(x):\n    if x and x > 2: # inline\n        return 1\n    return 0\nopen({str(marker)!r}, 'w').close()\n")
        result = scan(self.root)
        record = result["files"][0]
        self.assertEqual(record["lines"], {"code": 6, "comment": 1, "blank": 1})
        self.assertEqual(record["method"], "tokenized")
        self.assertEqual(record["metrics"]["max_branch_score"], 3)
        self.assertEqual(record["metrics"]["longest_function"], 4)
        self.assertFalse(marker.exists())
        self.assertEqual(result["primary_languages"], ["Python"])

    def test_python_nested_functions_do_not_inflate_parent(self):
        _, method, metrics = analyze_text("def a():\n    def b():\n        if True:\n            pass\n    return b\n", "Python")
        self.assertEqual(method, "tokenized")
        self.assertEqual(metrics["functions"], 2)
        self.assertEqual(metrics["max_branch_score"], 2)

    def test_python_invalid_syntax_falls_back(self):
        self.write("bad.py", "def invalid(:\n # comment\n")
        record = scan(self.root)["files"][0]
        self.assertEqual(record["method"], "heuristic")
        self.assertIn("limitation", record["metrics"])

    def test_javascript_typescript(self):
        self.write("app.js", '// comment\nconst url = "https://example.test";\n/* block\nend */\nfunction f(x) { if (x) return 1; }\n')
        self.write("app.ts", "const f = (x: number) => { return x && 2; };\n")
        result = scan(self.root)
        js = next(f for f in result["files"] if f["language"] == "JavaScript")
        self.assertEqual(js["lines"], {"code": 2, "comment": 3, "blank": 0})
        self.assertEqual(js["metrics"]["function_markers"], 1)
        self.assertEqual(js["metrics"]["branch_markers"], 1)
        self.assertEqual(result["languages"]["TypeScript"]["code"], 1)

    def test_html_markup_is_not_ranked_as_source(self):
        self.write("index.html", "<main>Hello</main>\n<!-- comment -->\n")
        self.write("app.py", "print('hello')\n")
        result = scan(self.root)
        html = next(f for f in result["files"] if f["path"] == "index.html")
        self.assertEqual(html["language"], "HTML")
        self.assertEqual(html["method"], "unclassified")
        self.assertEqual(result["primary_languages"], ["Python"])
        self.assertNotIn("index.html", {f["path"] for f in result["top_files"]})
        self.assertEqual(result["directories"]["."]["code"], 1)

    def test_mixed_languages_and_recursive_sizes(self):
        self.write("src/a.py", "print(1)\n")
        self.write("src/lib/a.rs", "// hello\nfn main() {}\n")
        self.write("data.weird", "anything\n")
        result = scan(self.root)
        self.assertEqual(result["directories"]["src"]["files"], 2)
        self.assertEqual(result["directories"]["src"]["code"], 2)
        self.assertEqual(result["total_bytes"], sum(f["bytes"] for f in result["files"]))
        self.assertEqual(result["methods"]["unclassified"], 1)

    def test_binary_and_encodings(self):
        self.write("null.py", b"\0hello")
        self.write("exe.bin", bytes(range(256)))
        self.write("legacy.txt", b"caf\xe9")
        self.write("utf16.py", codecs.BOM_UTF16_LE + "# 中文\r\nprint(1)\r\n".encode("utf-16-le"))
        result = scan(self.root)
        self.assertEqual(result["statuses"]["binary_or_encoding"], 3)
        record = next(f for f in result["files"] if f["path"] == "utf16.py")
        self.assertEqual(record["lines"]["code"], 1)
        self.assertEqual(record["lines"]["comment"], 1)

    def test_default_excludes(self):
        for folder in (".git", "node_modules", "venv", ".venv", "__pycache__", ".aws", "secrets", ".env.private"):
            self.write(folder + "/hidden.py")
        self.write("app.py")
        self.assertEqual(self.paths(scan(self.root)), {"app.py"})

    def test_nested_gitignore_and_extra_patterns(self):
        self.write(".gitignore", "*.log\n/build/\n*.tmp\n!keep.tmp\nspace\\ file.txt\n")
        self.write("sub/.gitignore", "!local.log\n/private/\n")
        for name in ("a.log", "sub/local.log", "sub/b.log", "build/a.py", "keep.tmp", "gone.tmp", "sub/private/a.py", "space file.txt", "app.py", "extra.py", "sub/build/a.py"):
            self.write(name)
        paths = self.paths(scan(self.root, Options(excludes=["extra.py"])))
        self.assertTrue({"app.py", "keep.tmp", "sub/local.log", "sub/build/a.py"} <= paths)
        self.assertTrue({"a.log", "sub/b.log", "build/a.py", "gone.tmp", "sub/private/a.py", "space file.txt", "extra.py"}.isdisjoint(paths))

    def test_gitignore_parent_pruning(self):
        self.write(".gitignore", "blocked/\n!blocked/keep.py\n")
        self.write("blocked/keep.py")
        self.assertNotIn("blocked/keep.py", self.paths(scan(self.root)))

    def test_patterns_match_git_oracle(self):
        subprocess.run(["git", "init", "--quiet", str(self.root)], check=True)
        self.write(".gitignore", "**/cache/\n/root-only.txt\n*.log\n!keep.log\nfile[0-9].tmp\n")
        self.write("sub/.gitignore", "!nested.log\n")
        names = ["a/cache/a.py", "root-only.txt", "sub/root-only.txt", "a.log", "keep.log", "file1.tmp", "filex.tmp", "sub/nested.log", "sub/other.log"]
        for name in names:
            self.write(name)
        result = self.paths(scan(self.root))
        for name in names:
            command = subprocess.run(["git", "check-ignore", "--no-index", "--quiet", name], cwd=self.root)
            self.assertIn(command.returncode, (0, 1))
            self.assertEqual(name not in result, command.returncode == 0, name)

    def test_permission_denied_file(self):
        self.write("blocked.py")
        self.write("fine.py", "print(1)\n")
        original = read_regular

        def deny(path, limit):
            if path.name == "blocked.py":
                raise PermissionError("do not echo secret details")
            return original(path, limit)

        with patch("reposcope.scanner.read_regular", side_effect=deny):
            result = scan(self.root)
        self.assertEqual(result["statuses"]["unreadable"], 1)
        self.assertEqual(result["error_count"], 1)
        self.assertEqual(result["languages"]["Python"]["code"], 1)
        self.assertNotIn("secret details", html_report(result))

    def test_directory_permission_error(self):
        self.write("blocked/a.py")
        original = os.scandir

        def deny(path):
            if Path(path).name == "blocked":
                raise PermissionError()
            return original(path)

        with patch("reposcope.scanner.os.scandir", side_effect=deny):
            result = scan(self.root)
        self.assertEqual(result["error_count"], 1)
        self.assertIn("cannot read directory", result["errors"][0]["message"])

    def test_unicode_and_windows_style_input(self):
        self.write("中文 空间/分析.py", "# 中文\nprint('你好')\n")
        result = scan(str(self.root) + os.sep + "中文 空间" + os.sep)
        self.assertEqual(result["files"][0]["path"], "分析.py")
        self.assertIn("中文 空间", html_report(result))

    def test_injection_paths_configs_and_markdown(self):
        # Windows forbids angle brackets in filenames; inject equivalent metadata there.
        self.write("safe.py", "print(1)\n")
        self.write("package.json", '{"name":"<img src=x onerror=alert(1)>","scripts":{"build":"SECRET_SCRIPT"},"dependencies":{"react":"SECRET_VERSION"}}')
        result = scan(self.root)
        attack = '</script><img src=x onerror=alert(1)>|`[x](https://bad)\n# heading'
        result["name"] = attack
        result["root"] = attack
        result["top_files"][0]["path"] = attack
        if os.name != "nt":
            self.write("<b>&'\".py", "pass\n")
            scanned = html_report(scan(self.root))
            self.assertIn("&lt;b&gt;&amp;&#x27;&quot;.py", scanned)
        report = html_report(result)
        parser = ReportParser()
        parser.feed(report)
        self.assertEqual(len(parser.scripts), 1)
        self.assertNotIn("img", parser.tags)
        self.assertEqual(parser.events, [])
        self.assertNotIn("SECRET_SCRIPT", report)
        self.assertNotIn("SECRET_VERSION", report)
        self.assertIn("&lt;/script&gt;", report)
        markdown = markdown_report(result)
        self.assertNotIn("<img", markdown)
        self.assertNotIn("[x](https://bad)", markdown)
        self.assertNotIn("\n# heading", markdown)

    def test_many_small_files(self):
        for i in range(1500):
            self.write(f"src/f{i}.py", "x = 1\n")
        result = scan(self.root)
        self.assertEqual(len(result["files"]), 1500)
        self.assertEqual(result["languages"]["Python"]["code"], 1500)
        self.assertEqual(result["directories"]["src"]["files"], 1500)

    def test_sensitive_files_never_opened(self):
        names = [".env", ".env.example", ".env.production", "server.pem", "private.key", ".npmrc", "credentials.json", "secrets.yaml", "data.db", "state.tfstate"]
        for name in names:
            self.write(name, "TOP_SECRET_VALUE")
        self.write("app.py", "pass\n")
        original = read_regular
        opened = []

        def spy(path, limit):
            opened.append(path.name)
            return original(path, limit)

        with patch("reposcope.scanner.read_regular", side_effect=spy):
            result = scan(self.root)
        self.assertTrue(set(names).isdisjoint(opened))
        self.assertEqual(result["statuses"]["sensitive"], len(names))
        self.assertNotIn("TOP_SECRET_VALUE", html_report(result) + markdown_report(result))

    def test_symlink_loop_and_external_file(self):
        self.write("src/a.py", "pass\n")
        try:
            (self.root / "src" / "loop").symlink_to(self.root, target_is_directory=True)
            (self.root / "alias.py").symlink_to(self.root / "src" / "a.py")
            (self.root / "broken").symlink_to(self.root / "absent")
        except OSError as exc:
            self.skipTest(f"symlink creation unavailable: {type(exc).__name__}")
        result = scan(self.root)
        self.assertEqual(self.paths(result), {"src/a.py"})
        self.assertEqual(result["skipped"]["links"], 3)

    def test_windows_reparse_detection(self):
        from reposcope.scanner import is_link
        fake = unittest.mock.Mock()
        fake.lstat.return_value.st_mode = 0o40755
        fake.lstat.return_value.st_file_attributes = 0x400
        self.assertTrue(is_link(fake))

    def test_file_limits(self):
        self.write("large.py", "x" * 50)
        self.write("small.py", "pass\n")
        result = scan(self.root, Options(max_file_bytes=10))
        self.assertEqual(result["statuses"]["oversized"], 1)
        self.assertEqual(result["languages"]["Python"]["code"], 1)
        partial = scan(self.root, Options(max_files=1))
        self.assertTrue(partial["truncated"])
        self.assertEqual(len(partial["files"]), 1)
        self.assertIn("PARTIAL", html_report(partial))

    def test_manifest_detection(self):
        manifests = {
            "package.json": '{"dependencies":{"react":"*","next":"*"},"devDependencies":{"vite":"*","typescript":"*"}}',
            "pyproject.toml": '[project]\ndependencies=["fastapi>=0.1"]\n[build-system]\nbuild-backend="setuptools.build_meta"\n',
            "requirements.txt": "django>=4\nflask==3\n--index-url https://example.test\n",
            "Cargo.toml": '[package]\nname="sample"\n',
            "go.mod": "module example.test/demo\ngo 1.22\n",
            "pom.xml": '<project xmlns="http://maven.apache.org/POM/4.0.0"><dependencies><dependency><artifactId>spring-boot-starter-web</artifactId></dependency></dependencies></project>',
        }
        for name, content in manifests.items():
            self.write(name, content)
        result = scan(self.root)
        self.assertEqual(len(result["configs"]), 6)
        frameworks = {f for c in result["configs"] for f in c["frameworks"]}
        self.assertTrue({"React", "Next.js", "FastAPI", "Flask", "Django", "Spring Boot"} <= frameworks)
        tools = {t for c in result["configs"] for t in c["tools"]}
        self.assertTrue({"Cargo", "Go modules", "Maven", "Vite", "setuptools"} <= tools)

    def test_invalid_manifests_are_not_echoed(self):
        self.write("package.json", 'invalid TOP_SECRET')
        self.write("pyproject.toml", 'invalid TOP_SECRET')
        self.write("pom.xml", '<!DOCTYPE x [<!ENTITY x "TOP_SECRET">]><project/>')
        result = scan(self.root)
        self.assertEqual(result["error_count"], 3)
        self.assertNotIn("TOP_SECRET", html_report(result))

    def test_heuristic_issues(self):
        self.write("big.py", "x = 1\n" * 20)
        for i in range(4):
            self.write(f"lib/a{i}.py", "pass\n")
        result = scan(self.root, Options(long_file_lines=10, large_dir_bytes=1))
        messages = " ".join(i["message"] for i in result["issues"])
        self.assertIn("Long source file", messages)
        self.assertIn("Large directory", messages)
        self.assertIn("50%", messages)

    def test_cli_reports_repeatable_and_output_excluded(self):
        self.write("app.py", "pass\n")
        output = self.root / "report [test]"
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main([str(self.root), "-o", str(output)]), 0)
            self.assertEqual(main([str(self.root), "-o", str(output)]), 2)
            self.assertEqual(main([str(self.root), "-o", str(output), "--force"]), 0)
            original_html = (output / "report.html").read_text(encoding="utf-8")
            self.assertIn("<td>Inventoried files</td><td>1</td>", original_html)
            self.assertEqual(main([str(self.root), "-o", str(output), "--force"]), 0)
            self.assertEqual((output / "report.html").read_text(encoding="utf-8"), original_html)
            self.assertEqual(main([str(self.root), "-o", str(self.root)]), 2)
        self.assertIn("Suggested code reading order", (output / "report.md").read_text(encoding="utf-8"))

    def test_cli_exit_codes_and_formats(self):
        self.write("a.py")
        self.write("b.py")
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main([str(self.root), "-o", str(self.root / "out"), "--max-files", "1"]), 1)
            self.assertEqual(main([str(self.root / "missing")]), 2)
            self.assertEqual(main([str(self.root), "-o", str(self.root / "only"), "--format", "markdown", "--exclude", "out/"]), 0)
        self.assertFalse((self.root / "only" / "report.html").exists())
        self.assertTrue((self.root / "only" / "report.md").exists())

    def test_cli_rejects_output_symlink(self):
        (self.root / "destination").mkdir()
        try:
            (self.root / "link").symlink_to(self.root / "destination", target_is_directory=True)
        except OSError:
            self.skipTest("symlink creation unavailable")
        with contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(main([str(self.root), "-o", str(self.root / "link")]), 2)

    def test_unreadable_gitignore_fails_closed(self):
        self.write(".gitignore", "private/\n")
        self.write("private/config.txt", "DO_NOT_READ")
        with patch("reposcope.scanner.read_regular", side_effect=PermissionError()):
            result = scan(self.root)
        self.assertEqual(result["files"], [])
        self.assertEqual(result["error_count"], 1)
        self.assertNotIn("DO_NOT_READ", html_report(result))

    def test_unknown_lines_are_not_claimed_accurate(self):
        self.write("unknown.xyz", "# not a recognized comment\n\n")
        result = scan(self.root)
        self.assertEqual(result["files"][0]["method"], "unclassified")
        self.assertEqual(result["files"][0]["lines"], {"code": 1, "comment": 0, "blank": 1})
        self.assertIn("not verified code", html_report(result))

    def test_special_fifo_is_not_opened(self):
        if not hasattr(os, "mkfifo"):
            self.skipTest("FIFO not available on this platform")
        os.mkfifo(self.root / "pipe")
        result = scan(self.root)
        self.assertEqual(result["files"], [])
        self.assertEqual(result["skipped"]["special"], 1)

    def test_gitignore_link_fails_closed(self):
        self.write("rules", "private.txt\n")
        self.write("private.txt", "DO_NOT_READ")
        try:
            (self.root / ".gitignore").symlink_to(self.root / "rules")
        except OSError:
            self.skipTest("symlink creation unavailable")
        result = scan(self.root)
        self.assertEqual(result["files"], [])
        self.assertEqual(result["error_count"], 1)

    def test_python_warnings_do_not_echo_source(self):
        with warnings.catch_warnings(record=True) as captured:
            warnings.simplefilter("always")
            analyze_text("x = '\\q SECRET_LITERAL'\n", "Python")
        self.assertEqual(captured, [])

    def test_error_list_is_bounded(self):
        for i in range(110):
            self.write(f"a{i}.py")
        with patch("reposcope.scanner.read_regular", side_effect=PermissionError()):
            result = scan(self.root)
        self.assertEqual(result["error_count"], 110)
        self.assertEqual(len(result["errors"]), 100)

    def test_long_function_and_js_findings(self):
        self.write("long.py", "def f():\n" + "    x = 1\n" * 81)
        self.write("deep.js", "if (x) {" * 8 + "x();" + "}" * 8)
        messages = " ".join(issue["message"] for issue in scan(self.root)["issues"])
        self.assertIn("Python function", messages)
        self.assertIn("JS/TS structure", messages)

    def test_posix_real_permission_denied(self):
        if os.name == "nt" or not hasattr(os, "geteuid") or os.geteuid() == 0:
            self.skipTest("requires a non-root POSIX user")
        path = self.write("no_access.py", "PRIVATE\n")
        try:
            path.chmod(0)
            result = scan(self.root)
        finally:
            path.chmod(0o600)
        self.assertEqual(result["statuses"]["unreadable"], 1)


if __name__ == "__main__":
    unittest.main()
