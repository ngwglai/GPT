"""Private configuration lifecycle; never log paths, terms or raw errors."""

import json
import os
from pathlib import Path
import stat
import tempfile

# A reviewed configuration migration, not a scanner allowlist. Exact spelling only.
LEGACY_PUBLIC_TERM = "noreply" + "@" + "github.com"


def unique_fields(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate private configuration field")
        result[key] = value
    return result


def read_denylist(path, roots):
    path = Path(path).expanduser().resolve(strict=True)
    if any(path.is_relative_to(Path(root).resolve()) for root in roots):
        raise ValueError("private configuration must be outside Git storage and checkout")
    if not path.is_file():
        raise ValueError("private configuration must be a regular file")
    if os.name != "nt" and stat.S_IMODE(path.stat().st_mode) & 0o077:
        raise ValueError("private configuration requires owner-only permissions")
    raw = path.read_bytes()
    data = json.loads(raw, object_pairs_hook=unique_fields)
    if not isinstance(data, dict) or not isinstance(data.get("terms"), list):
        raise ValueError("invalid private configuration")
    if any(not isinstance(term, str) or not term.strip() for term in data["terms"]):
        raise ValueError("invalid private term")
    return path, raw, data


def migrate_denylist(path, roots):
    """Preserve the original bytes before removing the one reviewed legacy error.

    Atomic replacement and an exclusive lock prevent concurrent initializers from
    overwriting one another. Unknown fields, term order and duplicates survive.
    A stale lock requires investigation; failures never fall back to an empty list.
    """
    path, raw, data = read_denylist(path, roots)
    if LEGACY_PUBLIC_TERM not in data["terms"]:
        return path, False
    if not path.stat().st_mode & stat.S_IWUSR:
        raise ValueError("private configuration is read-only; update the private source")
    lock = path.with_name(path.name + ".migration.lock")
    fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    os.close(fd)
    temporary = None
    try:
        path, raw, data = read_denylist(path, roots)
        if LEGACY_PUBLIC_TERM not in data["terms"]:
            return path, False
        backup_dir = path.parent / ".privacy-migration-backups"
        if backup_dir.is_symlink():
            raise ValueError("backup directory must not be a symlink")
        backup_dir.mkdir(mode=0o700, exist_ok=True)
        if os.name != "nt" and stat.S_IMODE(backup_dir.stat().st_mode) & 0o077:
            raise ValueError("backup directory requires owner-only permissions")
        with tempfile.NamedTemporaryFile(dir=backup_dir, prefix="original-", delete=False) as backup:
            backup.write(raw)
            backup.flush()
            os.fsync(backup.fileno())
            backup_path = Path(backup.name)
        if backup_path.read_bytes() != raw:
            raise ValueError("backup verification failed")
        corrected = dict(data, terms=[term for term in data["terms"] if term != LEGACY_PUBLIC_TERM])
        with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".privacy-migration-", delete=False) as target:
            temporary = Path(target.name)
            target.write((json.dumps(corrected, ensure_ascii=True, indent=2) + "\n").encode())
            target.flush()
            os.fsync(target.fileno())
        if json.loads(temporary.read_bytes()) != corrected or path.read_bytes() != raw:
            raise ValueError("configuration changed during migration")
        os.replace(temporary, path)
        temporary = None
        return path, True
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)
        lock.unlink()
