"""All identities and credentials below are synthetic, generated inside temp repos."""

import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("privacy_check", ROOT / "scripts/privacy_check.py")
privacy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(privacy)
INIT_SPEC = importlib.util.spec_from_file_location("configure_identity", ROOT / "scripts/configure_git_identity.py")
identity = importlib.util.module_from_spec(INIT_SPEC)
INIT_SPEC.loader.exec_module(identity)
SAMPLE_NOREPLY = "test-only" + "@" + "users.noreply.github.com"
SAMPLE_PRIVATE = "fictional.person" + "@" + "mail.invalid"


class PrivacyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / "repo"
        self.repo.mkdir()
        self.env = {key: value for key, value in os.environ.items()
                    if key not in {"GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME", "GIT_COMMITTER_EMAIL", "EMAIL"}}
        self.command("git", "init", "--quiet")
        for key, value in {"user.name": "ngwglai", "user.email": SAMPLE_NOREPLY,
                           "author.name": "ngwglai", "author.email": SAMPLE_NOREPLY,
                           "committer.name": "ngwglai", "committer.email": SAMPLE_NOREPLY,
                           "privacy.name": "ngwglai", "privacy.email": SAMPLE_NOREPLY}.items():
            self.command("git", "config", "--local", key, value)

    def command(self, *args, env=None, input=None):
        result = subprocess.run(args, cwd=self.repo, env=env or self.env,
                                input=input, capture_output=True, text=True)
        if result.returncode:
            self.fail("fixture command failed (output intentionally suppressed)")
        return result.stdout.strip()

    def write(self, name, text):
        p = self.repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding="utf-8")
        self.command("git", "add", name)

    def check(self, *args, env=None, input=None):
        return subprocess.run([os.sys.executable, str(ROOT / "scripts/privacy_check.py"), *args],
                              cwd=self.repo, env=env or self.env, input=input, capture_output=True, text=True)

    def test_safe_staged_and_history(self):
        self.write("hello.py", "print('hello')\n")
        self.assertEqual(self.check("--staged").returncode, 0)
        self.command("git", "commit", "--quiet", "-m", "Add sample")
        result = self.check("--all-history", "--json")
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout)["commits_checked"], 1)

    def test_private_email_is_redacted(self):
        self.write("file.txt", SAMPLE_PRIVATE)
        result = self.check("--staged", "--json")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(SAMPLE_PRIVATE, result.stdout + result.stderr)
        self.assertIn("nonanonymous-email", result.stdout)

    def test_effective_identity_override(self):
        env = dict(self.env, GIT_AUTHOR_NAME="Fictional Person", GIT_AUTHOR_EMAIL=SAMPLE_PRIVATE)
        result = self.check("--staged", env=env)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(SAMPLE_PRIVATE, result.stdout + result.stderr)
        self.assertNotIn("Fictional Person", result.stdout + result.stderr)

    def test_actual_committer_and_author(self):
        self.write("a.txt", "safe")
        env = dict(self.env, GIT_AUTHOR_NAME="Fictional Person", GIT_AUTHOR_EMAIL=SAMPLE_PRIVATE,
                   GIT_COMMITTER_NAME="Fictional Person", GIT_COMMITTER_EMAIL=SAMPLE_PRIVATE)
        self.command("git", "commit", "--quiet", "-m", "Sample", env=env)
        result = self.check("--all-history", "--json")
        self.assertEqual(result.returncode, 1)
        self.assertIn("noncanonical-author", result.stdout)
        self.assertIn("noncanonical-committer", result.stdout)
        self.assertNotIn(SAMPLE_PRIVATE, result.stdout + result.stderr)

    def test_github_generated_merge_commit_is_allowed(self):
        self.write("base.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Base")
        base = self.command("git", "rev-parse", "HEAD")

        self.command("git", "checkout", "--quiet", "-b", "side")
        self.write("side.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Side")
        side = self.command("git", "rev-parse", "HEAD")
        tree = self.command("git", "rev-parse", "HEAD^{tree}")
        env = dict(self.env, GIT_AUTHOR_NAME="ngwglai", GIT_AUTHOR_EMAIL=SAMPLE_NOREPLY,
                   GIT_COMMITTER_NAME="GitHub", GIT_COMMITTER_EMAIL="noreply" + "@github.com")
        result = subprocess.run(
            ["git", "commit-tree", tree, "-p", base, "-p", side],
            cwd=self.repo, env=env, input="Merge pull request #123 from ngwglai/side\n\nSynthetic merge\n",
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0)
        merge_sha = result.stdout.strip()
        result = self.check("--commits", merge_sha)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_identity_trailers(self):
        msg = Path(self.temp.name) / "message"
        msg.write_text("Sample\n\nCo-authored-by: Fictional Person <" + SAMPLE_PRIVATE + ">\nSigned-off-by: Fictional Person <" + SAMPLE_NOREPLY + ">\n", encoding="utf-8")
        result = self.check("--message-file", str(msg), "--json")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["counts"]["noncanonical-identity-trailer"], 2)
        self.assertNotIn("Fictional Person", result.stdout + result.stderr)

    def test_staged_version_not_worktree(self):
        path = self.repo / "a.txt"
        self.write("a.txt", SAMPLE_PRIVATE)
        path.write_text("now safe", encoding="utf-8")
        self.assertEqual(self.check("--staged").returncode, 1)
        self.command("git", "add", "a.txt")
        path.write_text(SAMPLE_PRIVATE, encoding="utf-8")
        self.assertEqual(self.check("--staged").returncode, 0)

    def test_keys_paths_account_links(self):
        value = "\n".join(["ghp_" + "A" * 36,
                           "-----BEGIN " + "PRIVATE KEY-----",
                           "C:" + "\\Users\\PrivateExample\\repo",
                           "https://chatgpt.com/" + "c/" + "a" * 24])
        self.write("a.txt", value)
        result = self.check("--staged", "--json")
        self.assertEqual(result.returncode, 1)
        kinds = json.loads(result.stdout)["counts"]
        self.assertTrue({"github-credential", "private-key", "personal-absolute-path", "account-link"} <= kinds.keys())
        self.assertNotIn("A" * 36, result.stdout)

    def test_hardcoded_secret_and_examples(self):
        self.write("a.txt", "password = \"" + "syntheticvalue" + "\"\n")
        self.assertEqual(self.check("--staged").returncode, 1)
        self.write("a.txt", "person@example.invalid\n" + "C:" + "\\Users\\Alice\\project\n" + "password = \"placeholder_value\"\n")
        self.assertEqual(self.check("--staged").returncode, 0)

    def test_private_denylist_and_filename_redaction(self):
        term = "Fictional" + "-Identity"
        deny = Path(self.temp.name) / "terms.json"
        deny.write_text(json.dumps({"terms": [term]}), encoding="utf-8")
        self.write(term + ".txt", "safe")
        result = self.check("--staged", "--denylist", str(deny))
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(term, result.stdout + result.stderr)
        self.assertIn("redacted-path-", result.stdout)

    def test_missing_denylist_and_identity_fail_closed(self):
        self.assertEqual(self.check("--denylist", str(Path(self.temp.name) / "absent")).returncode, 2)
        self.command("git", "config", "--unset", "privacy.email")
        self.assertEqual(self.check("--staged").returncode, 2)

    def test_denylist_inside_checkout_rejected(self):
        self.write("terms.json", '{"terms": ["Fictional Person"]}')
        self.assertEqual(self.check("--staged", "--denylist", str(self.repo / "terms.json")).returncode, 2)

    def test_large_blobs_and_backup_blocked(self):
        self.write("large.bin", "x" * 100)
        result = self.check("--staged", "--max-bytes", "10")
        self.assertEqual(result.returncode, 1)
        self.assertIn("unscanned-large-blob", result.stdout)
        self.write("old.bundle", "synthetic archive")
        self.assertIn("private-history-backup", self.check("--staged").stdout)

    def test_annotated_tag_metadata(self):
        self.write("a.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Sample")
        env = dict(self.env, GIT_COMMITTER_NAME="Fictional Person", GIT_COMMITTER_EMAIL=SAMPLE_PRIVATE)
        self.command("git", "tag", "-a", "v-test", "-m", "Sample tag", env=env)
        result = self.check("--all-history")
        self.assertEqual(result.returncode, 1)
        self.assertIn("noncanonical-tagger", result.stdout)

    def test_pre_push_checks_ancestry(self):
        self.write("a.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Sample")
        sha = self.command("git", "rev-parse", "HEAD")
        data = f"refs/heads/main {sha} refs/heads/main {'0' * 40}\n"
        self.assertEqual(self.check("--pre-push", input=data).returncode, 0)
        self.assertEqual(self.check("--pre-push", input="bad input\n").returncode, 2)

    def test_pre_push_new_branch_excludes_remote_history(self):
        self.write("base.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Base")

        # Simulate an old main commit with a noncanonical committer that is already remote.
        self.write("legacy.txt", "safe")
        bad_env = dict(self.env, GIT_COMMITTER_NAME="Fictional Person", GIT_COMMITTER_EMAIL=SAMPLE_PRIVATE)
        self.command("git", "commit", "--quiet", "-m", "Legacy history", env=bad_env)
        legacy = self.command("git", "rev-parse", "HEAD")
        self.command("git", "update-ref", "refs/remotes/origin/main", legacy)
        self.command("git", "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main")

        self.write("new.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "New branch work")
        sha = self.command("git", "rev-parse", "HEAD")
        data = f"refs/heads/feature/new {sha} refs/heads/compressionlab {'0' * 40}\n"
        result = self.check("--pre-push", "--remote-name", "origin", input=data)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

        # A bad commit added after the remote baseline must still be rejected.
        bad_env = dict(self.env, GIT_AUTHOR_NAME="Fictional Person", GIT_AUTHOR_EMAIL=SAMPLE_PRIVATE,
                       GIT_COMMITTER_NAME="Fictional Person", GIT_COMMITTER_EMAIL=SAMPLE_PRIVATE)
        self.write("bad.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Bad new commit", env=bad_env)
        sha = self.command("git", "rev-parse", "HEAD")
        data = f"refs/heads/feature/new {sha} refs/heads/compressionlab {'0' * 40}\n"
        result = self.check("--pre-push", "--remote-name", "origin", input=data)
        self.assertEqual(result.returncode, 1)
        self.assertIn("noncanonical-author", result.stdout)
        self.assertIn("noncanonical-committer", result.stdout)
        self.assertNotIn(SAMPLE_PRIVATE, result.stdout + result.stderr)

    def test_pre_push_new_branch_requires_remote_name_for_scoped_mode(self):
        self.write("base.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Base")
        self.write("legacy.txt", "safe")
        bad_env = dict(self.env, GIT_COMMITTER_NAME="Fictional Person", GIT_COMMITTER_EMAIL=SAMPLE_PRIVATE)
        self.command("git", "commit", "--quiet", "-m", "Legacy history", env=bad_env)
        self.write("new.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "New work")
        sha = self.command("git", "rev-parse", "HEAD")
        data = f"refs/heads/new {sha} refs/heads/new {'0' * 40}\n"
        result = self.check("--pre-push", input=data)
        self.assertEqual(result.returncode, 1)
        self.assertIn("noncanonical-committer", result.stdout)

    def test_actual_hooks_reject_message(self):
        shutil.copytree(ROOT / "scripts", self.repo / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(ROOT / ".githooks", self.repo / ".githooks")
        self.command("git", "config", "--local", "core.hooksPath", ".githooks")
        self.write("a.txt", "safe")
        message = "Sample\n\nCo-authored-by: Fictional Person <" + SAMPLE_PRIVATE + ">"
        result = subprocess.run(["git", "commit", "-m", message], cwd=self.repo, env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(SAMPLE_PRIVATE, result.stdout + result.stderr)
        self.command("git", "commit", "--quiet", "-m", "Safe sample")

    def test_initializer_uses_api_address_and_local_config_only(self):
        writes = []
        def fake_run(args):
            if args[:3] == ["git", "rev-parse", "--show-toplevel"]:
                return str(Path.cwd())
            if args == ["gh", "api", "user"]:
                return json.dumps({"login": "ngwglai"})
            if args == ["gh", "api", "user/emails"]:
                return json.dumps([{"email": SAMPLE_NOREPLY, "verified": True}])
            if args[:2] == ["git", "var"]:
                return f"ngwglai <{SAMPLE_NOREPLY}> 1 +0000"
            writes.append(args)
            return ""
        with patch.object(identity, "run", side_effect=fake_run), contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(identity.main([]), 0)
        self.assertTrue(all(args[:3] == ["git", "config", "--local"] for args in writes))
        self.assertTrue(any(args[-1] == SAMPLE_NOREPLY for args in writes))

    def test_initializer_never_guesses_address(self):
        def fake_run(args):
            if args[:2] == ["git", "rev-parse"]:
                return str(Path.cwd())
            return json.dumps({"login": "ngwglai"}) if args[-1] == "user" else "[]"
        with patch.object(identity, "run", side_effect=fake_run), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(identity.main([]), 2)

    def test_bare_all_history_with_private_denylist(self):
        self.write("a.txt", "safe")
        self.command("git", "commit", "--quiet", "-m", "Sample")
        bare = Path(self.temp.name) / "mirror.git"
        self.command("git", "clone", "--quiet", "--mirror", str(self.repo), str(bare))
        for key, value in {"privacy.name": "ngwglai", "privacy.email": SAMPLE_NOREPLY}.items():
            subprocess.run(["git", "config", "--local", key, value], cwd=bare, check=True, capture_output=True)
        deny = Path(self.temp.name) / "terms.json"
        deny.write_text('{"terms": ["Fictional Person"]}', encoding="utf-8")
        result = subprocess.run([os.sys.executable, str(ROOT / "scripts/privacy_check.py"), "--all-history", "--denylist", str(deny)],
                                cwd=bare, env=self.env, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)


if __name__ == "__main__":
    unittest.main()
