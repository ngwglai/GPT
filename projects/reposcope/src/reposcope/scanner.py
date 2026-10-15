"""Iterative traversal, bounded content reads and nested gitignore semantics."""

from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
import codecs
import fnmatch
import os
import stat
from xml.etree.ElementTree import ParseError

from pathspec import GitIgnoreSpec

from .analysis import CONFIG_NAMES, LANGUAGES, SOURCE_LANGUAGES, analyze_text, tech_stack

DEFAULT_DIRS = {".git", ".hg", ".svn", "node_modules", "venv", ".venv", "env", "__pycache__", ".tox", ".mypy_cache", ".pytest_cache", ".ruff_cache"}
SENSITIVE_DIRS = {".ssh", ".aws", ".azure", ".gnupg", ".kube", ".docker", ".terraform"}
SENSITIVE_NAMES = {".env", ".npmrc", ".pypirc", ".netrc", ".git-credentials", ".pgpass", ".my.cnf", ".bash_history", ".python_history", "token", "tokens.json", "auth.json", "credentials", "credentials.json", "secrets.json", "secrets.yaml", "secrets.yml", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519", "kubeconfig"}
SENSITIVE_PATTERNS = (".env.*", "*.pem", "*.key", "*.p8", "*.p12", "*.pfx", "*.keystore", "*.jks", "*.sqlite", "*.sqlite3", "*.db", "*credentials*", "*secret*", "service-account*.json", "*.tfstate*")


@dataclass
class Options:
    excludes: list[str] = field(default_factory=list)
    max_file_bytes: int = 1024 * 1024
    max_files: int = 100_000
    long_file_lines: int = 500
    large_dir_bytes: int = 100 * 1024 * 1024


def sensitive(name):
    lower = name.lower()
    return lower in SENSITIVE_NAMES or any(fnmatch.fnmatchcase(lower, p) for p in SENSITIVE_PATTERNS)


def is_link(path):
    # Windows junctions are reparse points even when is_symlink() is false.
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def read_regular(path, limit):
    """Reject special files and links, with a second check immediately before open.

    O_NOFOLLOW protects the final component on POSIX. See README for concurrent
    directory replacement limits; this is not a sandbox for hostile live trees.
    """
    if is_link(path):
        raise OSError("link not read")
    mode = path.lstat().st_mode
    if not stat.S_ISREG(mode):
        raise OSError("not a regular file")
    flags = os.O_RDONLY | getattr(os, "O_BINARY", 0) | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
    fd = os.open(path, flags)
    with os.fdopen(fd, "rb") as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise OSError("not a regular file")
        return stream.read(limit + 1)


def decode_text(data):
    if data.startswith((codecs.BOM_UTF16_LE, codecs.BOM_UTF16_BE)):
        return data.decode("utf-16")
    if b"\x00" in data:
        return None
    if data and sum(c < 32 and c not in (9, 10, 12, 13) for c in data) / len(data) > .02:
        return None
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None


def scan(root, options=None):
    options = options or Options()
    if options.max_file_bytes < 1 or options.max_files < 1 or options.long_file_lines < 1 or options.large_dir_bytes < 1:
        raise ValueError("limits must be positive")
    root = Path(root).expanduser().resolve(strict=True)
    if not root.is_dir():
        raise ValueError("scan target must be a directory")
    files, errors, configs, issues = [], [], [], []
    skipped = Counter()
    error_count = 0
    directories = defaultdict(lambda: {"bytes": 0, "files": 0, "code": 0})
    directories["."]
    extra = GitIgnoreSpec.from_lines(options.excludes)
    stack = [(root, [])]
    truncated = False

    def error(rel, operation):
        nonlocal error_count
        error_count += 1
        if len(errors) < 100:
            # Exception strings can contain source/config fragments: do not echo them.
            errors.append({"path": rel, "message": operation})

    def ignored(rel, directory, rules):
        candidate = rel + ("/" if directory else "")
        decision = None
        for base, spec in rules:
            local = candidate[len(base):] if candidate.startswith(base) else None
            if local is not None:
                match = spec.check_file(local)
                if match.include is not None:
                    decision = match.include
        return bool(decision) or extra.match_file(candidate)

    while stack:
        directory, rules = stack.pop()
        rel_dir = directory.relative_to(root).as_posix()
        ignore_file = directory / ".gitignore"
        try:
            if ignore_file.exists() or ignore_file.is_symlink():
                if is_link(ignore_file):
                    error(ignore_file.relative_to(root).as_posix(), "gitignore is a link; subtree skipped")
                    continue
                raw = read_regular(ignore_file, options.max_file_bytes)
                if len(raw) > options.max_file_bytes:
                    error((directory / ".gitignore").relative_to(root).as_posix(), "gitignore exceeds read limit; rules unavailable")
                    continue
                else:
                    spec = GitIgnoreSpec.from_lines(raw.decode("utf-8-sig").splitlines())
                    rules = rules + [("" if rel_dir == "." else rel_dir + "/", spec)]
        except (OSError, UnicodeError, ValueError):
            error(ignore_file.relative_to(root).as_posix(), "cannot read gitignore; rules unavailable")
            # Fail closed: unknown exclusion rules must not expose ignored files.
            continue
        try:
            # Do not sort/materialize entire directories; bounded metadata grows with files.
            with os.scandir(directory) as entries:
                for entry in entries:
                    path = Path(entry.path)
                    rel = path.relative_to(root).as_posix()
                    try:
                        if is_link(path):
                            skipped["links"] += 1
                            continue
                        is_dir = entry.is_dir(follow_symlinks=False)
                        if is_dir and (entry.name.lower() in DEFAULT_DIRS | SENSITIVE_DIRS or sensitive(entry.name)):
                            skipped["directories"] += 1
                            continue
                        if ignored(rel, is_dir, rules):
                            skipped["ignored"] += 1
                            continue
                        if is_dir:
                            directories[rel]
                            stack.append((path, rules))
                            continue
                        info = entry.stat(follow_symlinks=False)
                        if not stat.S_ISREG(info.st_mode):
                            skipped["special"] += 1
                            continue
                        if len(files) >= options.max_files:
                            truncated = True
                            break
                        language = LANGUAGES.get(path.suffix.lower(), "Unknown")
                        record = {"path": rel, "bytes": info.st_size, "language": language, "status": "pending", "lines": None, "method": None, "metrics": {}}
                        files.append(record)
                        if sensitive(entry.name):
                            record["status"] = "sensitive"
                        elif info.st_size > options.max_file_bytes:
                            record["status"] = "oversized"
                        else:
                            try:
                                raw = read_regular(path, options.max_file_bytes)
                                if len(raw) > options.max_file_bytes:
                                    record["status"] = "oversized"
                                else:
                                    text = decode_text(raw)
                                    if text is None:
                                        record["status"] = "binary_or_encoding"
                                    else:
                                        record["lines"], record["method"], record["metrics"] = analyze_text(text, language)
                                        record["status"] = "analyzed"
                                        if entry.name in CONFIG_NAMES:
                                            try:
                                                configs.append({"path": rel, **tech_stack(entry.name, text)})
                                            except (ValueError, TypeError, AttributeError, RecursionError, ParseError):
                                                error(rel, "configuration cannot be parsed; stack detection skipped")
                            except (OSError, UnicodeError, RecursionError):
                                record["status"] = "unreadable"
                                error(rel, "cannot read or analyze file")
                        if record["status"] != "analyzed":
                            skipped[record["status"]] += 1
                        for parent in path.relative_to(root).parents:
                            key = parent.as_posix()
                            directories[key]["bytes"] += info.st_size
                            directories[key]["files"] += 1
                            if record["lines"] and language in SOURCE_LANGUAGES:
                                directories[key]["code"] += record["lines"]["code"]
                    except OSError:
                        error(rel, "cannot inspect entry")
                if truncated:
                    break
        except OSError:
            error(rel_dir, "cannot read directory")
    files.sort(key=lambda f: f["path"])
    languages = {}
    methods = Counter()
    extensions = Counter()
    statuses = Counter()
    for record in files:
        row = languages.setdefault(record["language"], {"files": 0, "bytes": 0, "code": 0, "comment": 0, "blank": 0, "analyzed": 0})
        row["files"] += 1
        row["bytes"] += record["bytes"]
        extensions[Path(record["path"]).suffix.lower() or "(none)"] += 1
        statuses[record["status"]] += 1
        if record["lines"]:
            row["analyzed"] += 1
            for key in ("code", "comment", "blank"):
                row[key] += record["lines"][key]
            methods[record["method"]] += 1
            if record["language"] in SOURCE_LANGUAGES and record["lines"]["code"] > options.long_file_lines:
                issues.append({"path": record["path"], "message": f"Long source file: {record['lines']['code']} code lines"})
        metrics = record["metrics"]
        if metrics.get("longest_function", 0) > 80 or metrics.get("max_branch_score", 0) > 10:
            issues.append({"path": record["path"], "message": "Python function exceeds 80 physical lines or branch score 10"})
        if metrics.get("max_brace_depth", 0) > 6 or metrics.get("branch_markers", 0) > 50:
            issues.append({"path": record["path"], "message": "JS/TS structure exceeds depth 6 or 50 branch markers (heuristic)"})
    for path, sizes in sorted(directories.items()):
        if path != "." and sizes["bytes"] > options.large_dir_bytes:
            issues.append({"path": path, "message": f"Large directory: {sizes['bytes']} included bytes (recursive)"})
    source = [f for f in files if f["language"] in SOURCE_LANGUAGES and f["lines"]]
    top = sorted(source, key=lambda f: (-f["lines"]["code"], f["path"]))
    total_code = sum(f["lines"]["code"] for f in source)
    if len(source) >= 5 and total_code and top[0]["lines"]["code"] / total_code > .5:
        issues.append({"path": top[0]["path"], "message": "More than 50% of analyzed source code lines are in one file"})
    if truncated:
        issues.append({"path": ".", "message": f"Inventory stopped at {options.max_files} files; totals are partial"})
    primary = sorted((lang for lang in languages if lang in SOURCE_LANGUAGES), key=lambda lang: (-languages[lang]["code"], -languages[lang]["files"], lang))
    return {"name": root.name, "root": str(root), "files": files, "languages": languages,
            "extensions": dict(extensions), "directories": dict(directories), "configs": configs,
            "primary_languages": primary[:3], "top_files": top[:20], "issues": issues,
            "errors": errors, "error_count": error_count, "skipped": dict(skipped), "statuses": dict(statuses),
            "methods": dict(methods), "truncated": truncated, "total_bytes": directories["."]["bytes"],
            "limits": {"max_file_bytes": options.max_file_bytes, "max_files": options.max_files,
                       "long_file_lines": options.long_file_lines, "large_dir_bytes": options.large_dir_bytes}}
