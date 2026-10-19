"""Exercise real Git objects, fresh checkouts and private migration using synthetic data."""

import contextlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import unittest
from unittest.mock import patch

import test_privacy_check as base
from privacy_config import LEGACY_PUBLIC_TERM, migrate_denylist


class InfrastructureTests(unittest.TestCase):
    setUp = base.PrivacyTests.setUp
    command = base.PrivacyTests.command
    write = base.PrivacyTests.write
    check = base.PrivacyTests.check

    def private_source(self, terms=None):
        path = Path(self.temp.name) / "private.json"
        data = {"terms": terms if terms is not None else [LEGACY_PUBLIC_TERM, "Fictional Private Marker", "Fictional Private Marker"],
                "unrecognized_metadata": {"preserve": True}}
        raw = json.dumps(data, indent=3).encode()
        path.write_bytes(raw)
        path.chmod(0o600)
        return path, raw, data

    def initialize(self, *args, env=None):
        real_run = base.identity.run
        def run(command):
            if command == ["gh", "api", "user"]:
                return json.dumps({"login": "ngwglai"})
            if command == ["gh", "api", "user/emails"]:
                return json.dumps([{"email": base.SAMPLE_NOREPLY, "verified": True}])
            return real_run(command)
        output = io.StringIO()
        with contextlib.chdir(self.repo), patch.dict(os.environ, env or self.env, clear=True), \
                patch.object(base.identity, "run", side_effect=run), \
                contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            code = base.identity.main(list(args))
        self.assertNotIn("Fictional Private Marker", output.getvalue())
        self.assertNotIn(str(self.temp.name), output.getvalue())
        return code

    def install_sources(self):
        shutil.copytree(base.ROOT / "scripts", self.repo / "scripts", ignore=shutil.ignore_patterns("__pycache__"))
        shutil.copytree(base.ROOT / ".githooks", self.repo / ".githooks")

    def test_fresh_checkout_initializes_from_private_environment_and_enforces_hooks(self):
        self.install_sources()
        path, raw, data = self.private_source()
        self.assertEqual(self.initialize("--install-hooks", env=dict(self.env, PRIVACY_DENYLIST=str(path))), 0)
        self.assertEqual(self.command("git", "config", "--local", "privacy.denylist"), str(path.resolve()))
        self.assertEqual(self.command("git", "config", "--local", "core.hooksPath"), ".githooks")
        corrected = json.loads(path.read_bytes())
        self.assertEqual(corrected, dict(data, terms=data["terms"][1:]))
        backups = list((path.parent / ".privacy-migration-backups").iterdir())
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_bytes(), raw)
        if os.name != "nt":
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(backups[0].stat().st_mode & 0o777, 0o600)
            self.assertEqual(backups[0].parent.stat().st_mode & 0o777, 0o700)
        # A second initialization is a no-op, including original backup bytes.
        after = path.read_bytes()
        self.assertEqual(self.initialize("--install-hooks"), 0)
        self.assertEqual(path.read_bytes(), after)
        self.assertEqual(len(list(backups[0].parent.iterdir())), 1)
        self.write("public.txt", LEGACY_PUBLIC_TERM)
        self.command("git", "commit", "--quiet", "-m", "Public system fixture")
        self.write("private.txt", data["terms"][1])
        result = subprocess.run(["git", "commit", "-m", "Private fixture"], cwd=self.repo,
                                env=self.env, capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn(data["terms"][1], result.stdout + result.stderr)

    def test_restored_legacy_snapshot_is_migrated_again_without_dropping_unknown_terms(self):
        path, raw, data = self.private_source()
        self.assertEqual(self.initialize("--denylist", str(path)), 0)
        path.write_bytes(raw)  # Simulate a new Codex session restored from an old snapshot.
        self.assertEqual(self.initialize(), 0)
        self.assertEqual(json.loads(path.read_bytes())["terms"], data["terms"][1:])
        self.assertEqual(len(list((path.parent / ".privacy-migration-backups").iterdir())), 2)

    def test_missing_source_does_not_initialize_or_silently_disable_private_checks(self):
        self.command("git", "config", "--unset", "privacy.email")
        self.assertEqual(self.initialize(), 2)
        self.assertEqual(self.check("--staged").returncode, 2)

    def test_missing_configured_source_does_not_fall_back_to_environment(self):
        path, _, _ = self.private_source()
        self.command("git", "config", "--local", "privacy.denylist", str(path.parent / "missing"))
        self.assertEqual(self.initialize(env=dict(self.env, PRIVACY_DENYLIST=str(path))), 2)
        self.assertEqual(self.check("--staged").returncode, 2)

    def test_migration_changes_only_exact_reviewed_term(self):
        terms = [LEGACY_PUBLIC_TERM, LEGACY_PUBLIC_TERM.upper(), "GitHub", "noreply",
                 "fictional" + "@github.com", " " + LEGACY_PUBLIC_TERM, "Fictional Private Marker"]
        path, _, data = self.private_source(terms)
        migrate_denylist(path, [self.repo])
        self.assertEqual(json.loads(path.read_bytes()), dict(data, terms=terms[1:]))

    def test_failed_backup_preserves_original_and_releases_lock(self):
        path, raw, _ = self.private_source()
        with patch("privacy_config.tempfile.NamedTemporaryFile", side_effect=OSError("synthetic failure")):
            self.assertEqual(self.initialize("--denylist", str(path)), 2)
        self.assertEqual(path.read_bytes(), raw)
        self.assertFalse(path.with_name(path.name + ".migration.lock").exists())

    def test_existing_migration_lock_is_not_removed(self):
        path, raw, _ = self.private_source()
        lock = path.with_name(path.name + ".migration.lock")
        lock.write_text("synthetic lock", encoding="utf-8")
        self.assertEqual(self.initialize("--denylist", str(path)), 2)
        self.assertEqual(path.read_bytes(), raw)
        self.assertTrue(lock.exists())

    def test_malformed_terms_and_unknown_metadata_are_not_repaired(self):
        path, _, _ = self.private_source()
        for data in (["not an object"], {"terms": [" "]}, {"terms": [7]}, {"other": []}):
            raw = json.dumps(data).encode()
            path.write_bytes(raw)
            self.assertEqual(self.initialize("--denylist", str(path)), 2)
            self.assertEqual(path.read_bytes(), raw)

    @unittest.skipIf(os.name == "nt", "POSIX mode policy; Windows uses private account ACLs")
    def test_shared_readable_private_source_fails_closed(self):
        path, raw, _ = self.private_source()
        path.chmod(0o644)
        self.assertEqual(self.initialize("--denylist", str(path)), 2)
        self.assertEqual(path.read_bytes(), raw)

    def test_all_three_hooks_required_and_custom_hooks_preserved(self):
        self.install_sources()
        path, raw, _ = self.private_source()
        (self.repo / ".githooks" / "pre-push").unlink()
        self.assertEqual(self.initialize("--install-hooks", "--denylist", str(path)), 2)
        self.assertEqual(path.read_bytes(), raw)
        self.command("git", "config", "--local", "core.hooksPath", "custom-hooks")
        self.assertEqual(self.initialize("--install-hooks", "--denylist", str(path)), 2)
        self.assertEqual(self.command("git", "config", "--get", "core.hooksPath"), "custom-hooks")

    def test_initializer_rejects_process_identity_override(self):
        path, _, _ = self.private_source()
        self.assertEqual(self.initialize("--denylist", str(path), env=dict(self.env, GIT_AUTHOR_EMAIL=base.SAMPLE_PRIVATE)), 2)
        self.assertEqual(self.check("--staged", env=dict(self.env, GIT_AUTHOR_EMAIL=base.SAMPLE_PRIVATE)).returncode, 1)

    def commit(self, content="safe"):
        self.write("fixture.txt", content)
        self.command("git", "commit", "--quiet", "-m", "Synthetic commit")
        return self.command("git", "rev-parse", "HEAD")

    def push(self, sha, remote_sha=None, remote="origin", ref="refs/heads/new"):
        row = f"{ref} {sha} {ref} {remote_sha or '0' * len(sha)}\n"
        return self.check("--pre-push", "--remote-name", remote, "--json", input=row)

    def test_detached_head_is_scanned_even_when_no_branch_points_to_it(self):
        self.commit()
        self.command("git", "checkout", "--quiet", "--detach")
        self.commit(base.SAMPLE_PRIVATE)
        result = self.check("--all-history", "--json")
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["commits_checked"], 2)
        self.assertNotIn(base.SAMPLE_PRIVATE, result.stdout + result.stderr)

    def test_unknown_nonzero_remote_tip_does_not_exclude_tracking_history(self):
        sha = self.commit(base.SAMPLE_PRIVATE)
        self.command("git", "update-ref", "refs/remotes/origin/main", sha)
        self.assertEqual(self.push(sha, "a" * 40).returncode, 1)

    def test_url_push_falls_back_to_full_scan(self):
        sha = self.commit(base.SAMPLE_PRIVATE)
        self.assertEqual(self.push(sha, remote="https://example.invalid/repo.git").returncode, 1)

    def test_pre_push_ignores_unrelated_tags_but_checks_the_pushed_tag(self):
        sha = self.commit()
        self.command("git", "tag", "-a", "unrelated", "-m", base.SAMPLE_PRIVATE)
        self.assertEqual(self.push(sha).returncode, 0)
        tag = self.command("git", "rev-parse", "refs/tags/unrelated")
        self.assertEqual(self.push(tag, ref="refs/tags/release").returncode, 1)
        self.assertEqual(self.check("--all-history").returncode, 1)

    def test_nested_tag_metadata_and_noncommit_targets_are_scanned(self):
        self.commit()
        self.command("git", "tag", "-a", "inner", "-m", base.SAMPLE_PRIVATE)
        self.command("git", "tag", "-a", "outer", "inner", "-m", "Safe outer")
        sha = self.command("git", "rev-parse", "outer")
        self.command("git", "tag", "-d", "inner")
        self.assertEqual(self.push(sha, ref="refs/tags/release").returncode, 1)
        blob = self.command("git", "hash-object", "-w", "--stdin", input=base.SAMPLE_PRIVATE)
        self.assertEqual(self.push(blob, ref="refs/tags/blob").returncode, 1)
        self.command("git", "tag", "blob", blob)
        self.assertEqual(self.check("--all-history").returncode, 1)

    def test_ref_names_are_scanned_and_redacted(self):
        sha = self.commit()
        result = self.push(sha, ref="refs/heads/" + base.SAMPLE_PRIVATE)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(base.SAMPLE_PRIVATE, result.stdout + result.stderr)

    def test_delete_push_does_not_scan_unrelated_tags(self):
        sha = self.commit()
        self.command("git", "tag", "-a", "unrelated", "-m", base.SAMPLE_PRIVATE)
        self.assertEqual(self.push("0" * 40, sha).returncode, 0)

    def test_shallow_history_fails_instead_of_claiming_complete_coverage(self):
        self.commit()
        self.commit("another")
        clone = Path(self.temp.name) / "shallow"
        self.command("git", "clone", "--quiet", "--depth=1", self.repo.as_uri(), str(clone))
        self.repo = clone
        for key, value in {"privacy.name": "ngwglai", "privacy.email": base.SAMPLE_NOREPLY}.items():
            self.command("git", "config", "--local", key, value)
        self.assertEqual(self.check("--all-history").returncode, 2)
        self.assertEqual(self.check("--commits", "HEAD").returncode, 2)

    def test_replacement_object_does_not_hide_actual_private_commit(self):
        bad = self.commit(base.SAMPLE_PRIVATE)
        safe = self.commit("safe")
        self.command("git", "replace", bad, safe)
        result = self.check("--commits", bad)
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(base.SAMPLE_PRIVATE, result.stdout + result.stderr)

    def test_real_clone_bootstraps_without_inherited_local_config(self):
        self.install_sources()
        self.command("git", "add", "scripts", ".githooks")
        self.commit()
        clone = Path(self.temp.name) / "new checkout"
        self.command("git", "clone", "--quiet", str(self.repo), str(clone))
        self.repo = clone
        self.assertEqual(self.check("--staged").returncode, 2)
        path, _, _ = self.private_source()
        self.assertEqual(self.initialize("--install-hooks", env=dict(self.env, PRIVACY_DENYLIST=str(path))), 0)
        self.write("public.txt", LEGACY_PUBLIC_TERM)
        self.command("git", "commit", "--quiet", "-m", "New environment")
        self.assertEqual(self.check("--all-history").returncode, 0)

    def test_duplicate_json_fields_fail_without_losing_any_data(self):
        path, _, _ = self.private_source()
        raw = b'{"terms": ["Fictional Private Marker"], "terms": []}'
        path.write_bytes(raw)
        self.assertEqual(self.initialize("--denylist", str(path)), 2)
        self.assertEqual(path.read_bytes(), raw)

    def test_private_source_inside_shared_git_directory_rejected(self):
        self.commit()
        source = self.repo / ".git" / "private.json"
        source.write_text('{"terms": ["Fictional Private Marker"]}', encoding="utf-8")
        source.chmod(0o600)
        worktree = Path(self.temp.name) / "linked"
        self.command("git", "worktree", "add", "--quiet", "--detach", str(worktree))
        self.repo = worktree
        self.assertEqual(self.check("--staged", "--denylist", str(source)).returncode, 2)
        self.assertEqual(self.initialize("--denylist", str(source)), 2)

    def test_tagged_tree_and_gitlink_paths_are_checked(self):
        sha = self.commit(base.SAMPLE_PRIVATE)
        tree = self.command("git", "rev-parse", "HEAD^{tree}")
        self.assertEqual(self.push(tree, ref="refs/tags/tree").returncode, 1)
        self.commit("safe")
        self.command("git", "update-index", "--add", "--cacheinfo", "160000", sha, "module")
        self.assertEqual(self.check("--staged").returncode, 0)
        self.command("git", "update-index", "--add", "--cacheinfo", "160000", sha, base.SAMPLE_PRIVATE)
        result = self.check("--staged")
        self.assertEqual(result.returncode, 1)
        self.assertNotIn(base.SAMPLE_PRIVATE, result.stdout + result.stderr)

    def test_grafts_cannot_hide_private_ancestors(self):
        self.commit(base.SAMPLE_PRIVATE)
        safe = self.commit("safe")
        grafts = self.repo / ".git" / "info" / "grafts"
        grafts.write_text(safe + "\n", encoding="utf-8")
        self.assertEqual(self.check("--commits", "HEAD").returncode, 2)
