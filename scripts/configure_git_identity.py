"""Confirm a GitHub-owned noreply address; configure this checkout only."""

import argparse
import json
import os
from pathlib import Path
import re

import subprocess
import sys

from privacy_config import migrate_denylist


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise ValueError("Git/GitHub operation unavailable; no credentials or response body logged")
    return result.stdout


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install-hooks", action="store_true", help="enable .githooks if no custom hook configuration exists")
    parser.add_argument("--denylist", type=Path, help="existing private source outside the checkout; otherwise use local config or PRIVACY_DENYLIST")
    args = parser.parse_args(argv)
    try:
        root = run(["git", "rev-parse", "--show-toplevel"]).strip()
        if Path(root).resolve() != Path.cwd().resolve():
            raise ValueError("run from the checkout root")
        account = json.loads(run(["gh", "api", "user"]))
        if not isinstance(account, dict) or account.get("login") != "ngwglai":
            raise ValueError("authenticated account is not the expected repository owner")
        emails = json.loads(run(["gh", "api", "user/emails"]))
        if not isinstance(emails, list) or any(not isinstance(entry, dict) for entry in emails):
            raise ValueError("invalid email API response")
        candidates = [entry["email"] for entry in emails
                      if entry.get("verified") is True and isinstance(entry.get("email"), str) and entry["email"].endswith("@users.noreply.github.com")]
        if len(candidates) != 1:
            raise ValueError("a unique verified noreply address could not be confirmed; obtain it from the account's email settings")
        email = candidates[0]
        if not re.fullmatch(r"[^\s<>@]+@users\.noreply\.github\.com", email):
            raise ValueError("invalid verified noreply address")
        source = args.denylist
        if source is None:
            configured = subprocess.run(["git", "config", "--local", "--get", "privacy.denylist"], capture_output=True, text=True)
            source = configured.stdout.strip() or os.environ.get("PRIVACY_DENYLIST")
        if not source:
            raise ValueError("private source is required; restore it through private environment provisioning")
        if args.install_hooks:
            existing = subprocess.run(["git", "config", "--get", "core.hooksPath"], capture_output=True, text=True)
            if existing.returncode == 0 and existing.stdout.strip() != ".githooks":
                raise ValueError("custom hooksPath exists; integrate privacy checks manually")
            hook_path = run(["git", "rev-parse", "--git-path", "hooks"]).strip()
            if existing.returncode and Path(hook_path).exists():
                if any(p.is_file() and not p.name.endswith(".sample") for p in Path(hook_path).iterdir()):
                    raise ValueError("existing local hooks must be preserved; integrate checks manually")
            if not all((Path(root) / ".githooks" / name).is_file()
                       and os.access(Path(root) / ".githooks" / name, os.X_OK)
                       for name in ("pre-commit", "commit-msg", "pre-push")):
                raise ValueError("tracked privacy hooks are missing")
        private_path, migrated = migrate_denylist(source, [root, run(["git", "rev-parse", "--path-format=absolute", "--git-common-dir"]).strip()])
        for key, value in {
            "user.name": "ngwglai", "user.email": email,
            "author.name": "ngwglai", "author.email": email,
            "committer.name": "ngwglai", "committer.email": email,
            "user.useConfigOnly": "true", "privacy.name": "ngwglai", "privacy.email": email,
            "privacy.denylist": str(private_path),
        }.items():
            run(["git", "config", "--local", key, value])
        for key in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
            if not run(["git", "var", key]).startswith(f"ngwglai <{email}> "):
                raise ValueError("environment identity override detected; local config cannot override process variables")
        if args.install_hooks:
            run(["git", "config", "--local", "core.hooksPath", ".githooks"])
        print("Private configuration validated; reviewed legacy correction applied with verified backup." if migrated else "Private configuration validated; no migration needed.")
        print("Confirmed account-owned noreply identity configured locally; no global settings changed.")
        return 0
    except (ValueError, OSError, KeyError, TypeError):
        print("Identity configuration incomplete. Check account/API access, unique verified noreply address, environment overrides, existing hooks and private configuration source/permissions. No identity values logged.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
