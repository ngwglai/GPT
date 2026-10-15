"""Confirm a GitHub-owned noreply address; configure this checkout only."""

import argparse
import json
import subprocess
import sys


def run(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise ValueError("Git/GitHub operation unavailable; no credentials or response body logged")
    return result.stdout


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--install-hooks", action="store_true", help="enable .githooks if no custom hook configuration exists")
    args = parser.parse_args(argv)
    try:
        root = run(["git", "rev-parse", "--show-toplevel"]).strip()
        from pathlib import Path
        if Path(root).resolve() != Path.cwd().resolve():
            raise ValueError("run from the checkout root")
        account = json.loads(run(["gh", "api", "user"]))
        if account.get("login") != "ngwglai":
            raise ValueError("authenticated account is not the expected repository owner")
        emails = json.loads(run(["gh", "api", "user/emails"]))
        candidates = [entry["email"] for entry in emails
                      if entry.get("verified") and entry.get("email", "").endswith("@users.noreply.github.com")]
        if len(candidates) != 1:
            raise ValueError("a unique verified noreply address could not be confirmed; obtain it from the account's email settings")
        email = candidates[0]
        if args.install_hooks:
            existing = subprocess.run(["git", "config", "--get", "core.hooksPath"], capture_output=True, text=True)
            if existing.returncode == 0 and existing.stdout.strip() != ".githooks":
                raise ValueError("custom hooksPath exists; integrate privacy checks manually")
            hook_path = run(["git", "rev-parse", "--git-path", "hooks"]).strip()
            if existing.returncode and Path(hook_path).exists():
                if any(p.is_file() and not p.name.endswith(".sample") for p in Path(hook_path).iterdir()):
                    raise ValueError("existing local hooks must be preserved; integrate checks manually")
            if not (Path(root) / ".githooks" / "pre-commit").is_file():
                raise ValueError("tracked privacy hooks are missing")
        for key, value in {
            "user.name": "ngwglai", "user.email": email,
            "author.name": "ngwglai", "author.email": email,
            "committer.name": "ngwglai", "committer.email": email,
            "user.useConfigOnly": "true", "privacy.name": "ngwglai", "privacy.email": email,
        }.items():
            run(["git", "config", "--local", key, value])
        for key in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
            if not run(["git", "var", key]).startswith(f"ngwglai <{email}>"):
                raise ValueError("environment identity override detected; local config cannot override process variables")
        if args.install_hooks:
            run(["git", "config", "--local", "core.hooksPath", ".githooks"])
        print("Confirmed account-owned noreply identity configured locally; no global settings changed.")
        return 0
    except (ValueError, OSError, KeyError, TypeError):
        print("Identity configuration incomplete. Check account/API access, unique verified noreply address, environment overrides and existing hooks. No identity values logged.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
