"""Synthetic regressions for configuration hygiene and unchanged tree scanning."""

import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("privacy_configuration_guard", ROOT / "scripts/privacy_check.py")
privacy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(privacy)
SAMPLE_NOREPLY = "test-only" + "@users.noreply.github.com"
SAMPLE_MARKER = "Fictional Private Marker"


class PrivacyConfigurationRegression(unittest.TestCase):
    def test_corrected_public_entry_preserves_private_priority_and_other_detectors(self):
        before = [privacy.GITHUB_SYSTEM_EMAIL, SAMPLE_MARKER]
        corrected = [entry for entry in before if entry != privacy.GITHUB_SYSTEM_EMAIL]
        self.assertEqual(corrected, [SAMPLE_MARKER])
        self.assertIn(("known-private-identity", 1),
                      privacy.findings(privacy.GITHUB_SYSTEM_EMAIL, SAMPLE_NOREPLY, before))
        self.assertEqual(privacy.findings(privacy.GITHUB_SYSTEM_EMAIL, SAMPLE_NOREPLY, corrected), [])
        self.assertIn(("known-private-identity", 1),
                      privacy.findings(SAMPLE_MARKER, SAMPLE_NOREPLY, corrected))
        self.assertIn(("nonanonymous-email", 1),
                      privacy.findings("fictional" + "@mail.invalid", SAMPLE_NOREPLY, corrected))
        self.assertIn(("github-credential", 1),
                      privacy.findings("ghp_" + "A" * 36, SAMPLE_NOREPLY, corrected))
        # The checker must still reject an explicitly denied public identifier;
        # configuration correction never becomes a global exemption in code.
        self.assertIn(("known-private-identity", 1),
                      privacy.findings(privacy.GITHUB_SYSTEM_EMAIL, SAMPLE_NOREPLY,
                                       [privacy.GITHUB_SYSTEM_EMAIL]))

    def test_new_commit_range_still_scans_unchanged_tree_files(self):
        with tempfile.TemporaryDirectory() as temp:
            repo = Path(temp) / "repo"
            repo.mkdir()
            env = {key: value for key, value in os.environ.items()
                   if key not in {"GIT_AUTHOR_NAME", "GIT_AUTHOR_EMAIL", "GIT_COMMITTER_NAME",
                                  "GIT_COMMITTER_EMAIL", "EMAIL"}}

            def git(*args):
                result = subprocess.run(["git", *args], cwd=repo, env=env,
                                        capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, "synthetic fixture Git command failed")
                return result.stdout.strip()

            git("init", "--quiet")
            for key, value in {"user.name": "ngwglai", "user.email": SAMPLE_NOREPLY,
                               "author.name": "ngwglai", "author.email": SAMPLE_NOREPLY,
                               "committer.name": "ngwglai", "committer.email": SAMPLE_NOREPLY,
                               "privacy.name": "ngwglai", "privacy.email": SAMPLE_NOREPLY}.items():
                git("config", "--local", key, value)
            (repo / "unchanged.txt").write_text(SAMPLE_MARKER, encoding="utf-8")
            git("add", "unchanged.txt")
            git("commit", "--quiet", "-m", "Synthetic baseline")
            base = git("rev-parse", "HEAD")
            (repo / "new.txt").write_text("safe new content", encoding="utf-8")
            git("add", "new.txt")
            git("commit", "--quiet", "-m", "Synthetic new work")
            denylist = Path(temp) / "private-terms.json"
            denylist.write_text(json.dumps({"terms": [SAMPLE_MARKER]}), encoding="utf-8")
            result = subprocess.run(
                [sys.executable, str(ROOT / "scripts/privacy_check.py"), "--commits",
                 base + "..HEAD", "--denylist", str(denylist), "--json"],
                cwd=repo, env=env, capture_output=True, text=True,
            )
            self.assertEqual(result.returncode, 1)
            summary = json.loads(result.stdout)
            self.assertEqual(summary["commits_checked"], 1)
            self.assertEqual(summary["blobs_checked"], 2)
            self.assertEqual(summary["counts"], {"known-private-identity": 1})
            self.assertEqual(summary["findings"][0]["location"], "unchanged.txt")
            self.assertNotIn(SAMPLE_MARKER, result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
