#!/usr/bin/env python3
"""Select repository CI jobs from changed paths, failing safely to a full run."""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from typing import Iterable, Sequence


PROJECT_PATHS = {
    "reposcope": "projects/reposcope",
    "constraintlab": "projects/constraintlab",
    "qq_mail_mcp": "projects/qq-mail-mcp",
    "entropylab": "projects/entropylab",
    "compressionlab": "projects/compressionlab",
    "matchuplab": "projects/matchuplab",
    "causallab": "projects/causallab",
    "modelchecklab": "projects/modelchecklab",
    "synthlab": "projects/synthlab",
    "adversarylab": "projects/adversarylab",
    "deltalab": "projects/deltalab",
    "agenttrustlab": "projects/agenttrustlab",
    "calibrationlab": "projects/calibrationlab",
    "compilerlab": "projects/compilerlab",
    "rogue_survivor": "projects/RogueSurvivor",
    "mahjong": "projects/mahjong",
}

WORKFLOW_PROJECTS = {
    ".github/workflows/entropylab.yml": "entropylab",
    ".github/workflows/compressionlab.yml": "compressionlab",
    ".github/workflows/matchuplab.yml": "matchuplab",
    ".github/workflows/causallab.yml": "causallab",
    ".github/workflows/modelchecklab.yml": "modelchecklab",
    ".github/workflows/synthlab.yml": "synthlab",
    ".github/workflows/adversarylab.yml": "adversarylab",
    ".github/workflows/deltalab.yml": "deltalab",
    ".github/workflows/agenttrustlab.yml": "agenttrustlab",
    ".github/workflows/calibrationlab.yml": "calibrationlab",
    ".github/workflows/compilerlab.yml": "compilerlab",
    ".github/workflows/rogue-survivor.yml": "rogue_survivor",
    ".github/workflows/mahjong.yml": "mahjong",
}

GLOBAL_FILES = {
    ".github/workflows/ci.yml",
    "scripts/ci_changed_projects.py",
    ".gitmodules",
    ".npmrc",
    ".nvmrc",
    ".python-version",
    ".ruff.toml",
    ".pre-commit-config.yaml",
    "Pipfile",
    "Pipfile.lock",
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "pyproject.toml",
    "pytest.ini",
    "requirements.txt",
    "requirements-dev.txt",
    "ruff.toml",
    "setup.cfg",
    "tox.ini",
    "tsconfig.json",
    "uv.lock",
    "yarn.lock",
}

PRIVACY_FILES = {
    "scripts/configure_git_identity.py",
    "scripts/privacy_check.py",
    "scripts/privacy_config.py",
    "docs/PRIVACY.md",
}

CONSTRAINTLAB_FILES = {"scripts/ci_constraintlab_e2e.py"}

PROJECT_KEYS = tuple(PROJECT_PATHS)


def _normalise(path: str) -> str:
    return path.replace("\\", "/").removeprefix("./").lstrip("/")


def classify_changed_paths(paths: Iterable[str]) -> dict[str, bool]:
    """Return changed-project flags. Unknown executable/config paths run all jobs."""
    selected = {key: False for key in PROJECT_KEYS}
    run_all = False

    for raw_path in paths:
        path = _normalise(raw_path)
        if not path:
            continue

        if path in GLOBAL_FILES or path.startswith(".github/actions/"):
            run_all = True
            continue

        if path == ".github/workflows/pages.yml":
            # The aggregate site builds these projects together. RogueLab has
            # its own path-filtered workflow; the root CI checks the other two.
            selected["entropylab"] = True
            selected["rogue_survivor"] = True
            continue

        if path in WORKFLOW_PROJECTS:
            selected[WORKFLOW_PROJECTS[path]] = True
            continue

        if path == ".github/workflows/roguelab.yml" or path.startswith(
            "projects/roguelab/"
        ):
            # RogueLab is validated by its own independent workflow.
            continue

        if path.startswith("projects/"):
            parts = path.split("/")
            if len(parts) >= 2:
                project_key = next(
                    (
                        key
                        for key, directory in PROJECT_PATHS.items()
                        if parts[1] == directory.split("/")[1]
                    ),
                    None,
                )
                if project_key is not None:
                    selected[project_key] = True
                else:
                    # A new or unrecognised project must not silently escape CI.
                    run_all = True
            else:
                run_all = True
            continue

        if path in PRIVACY_FILES or path.startswith("tests/"):
            # Privacy and identity checks run on every event already.
            continue

        if path in CONSTRAINTLAB_FILES:
            selected["constraintlab"] = True
            continue

        if path.startswith("scripts/"):
            # Unmapped root scripts may be shared by several projects.
            run_all = True
            continue

        if path.startswith(".github/workflows/"):
            # An unmapped workflow may change shared CI behaviour.
            run_all = True
            continue

        if path.startswith("docs/") or path in {
            "AGENTS.md",
            "PROJECTS.md",
            "README.md",
        }:
            # Documentation-only changes do not require project runtime tests.
            continue

        # Fail closed: a new root-level file or unclassified path broadens CI.
        run_all = True

    if run_all:
        for key in PROJECT_KEYS:
            selected[key] = True

    return {"all": run_all, **selected}


def _is_commit(revision: str) -> bool:
    if not revision or set(revision) == {"0"}:
        return False
    return (
        subprocess.run(
            ["git", "cat-file", "-e", f"{revision}^{{commit}}"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        ).returncode
        == 0
    )


def changed_paths(event: str, base: str, head: str) -> list[str] | None:
    """Return changed paths, or None when a safe full run is required."""
    if event == "workflow_dispatch":
        return None
    if not _is_commit(base) or not _is_commit(head):
        return None

    revision = f"{base}...{head}" if event == "pull_request" else f"{base} {head}"
    result = subprocess.run(
        ["git", "diff", "--no-renames", "--name-only", "-z", *revision.split()],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        return None

    return [
        item.decode("utf-8", errors="surrogateescape")
        for item in result.stdout.split(b"\0")
        if item
    ]


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--event", required=True)
    parser.add_argument("--base", default="")
    parser.add_argument("--head", default="")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    paths = changed_paths(args.event, args.base, args.head)
    flags = (
        {"all": True, **{key: True for key in PROJECT_KEYS}}
        if paths is None
        else classify_changed_paths(paths)
    )

    lines = [f"{key}={'true' if value else 'false'}" for key, value in flags.items()]
    output = "\n".join(lines) + "\n"
    if args.output:
        with args.output.open("a", encoding="utf-8", newline="\n") as stream:
            stream.write(output)
    else:
        sys.stdout.write(output)

    if paths is None:
        print("Change range unavailable or full dispatch requested; selecting all project checks.")
    elif flags["all"]:
        print(f"{len(paths)} changed paths; a shared or unknown path selected all project checks.")
    else:
        selected = [key for key, value in flags.items() if key != "all" and value]
        print(f"{len(paths)} changed paths; selected project checks: {', '.join(selected) or 'none'}.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
