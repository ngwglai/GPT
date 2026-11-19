"""Private configuration lifecycle; never log paths, terms or raw errors."""

import json
import os
from pathlib import Path
import stat

# A reviewed legacy configuration error. Exact spelling only.
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
