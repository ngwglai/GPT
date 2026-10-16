"""Metadata and content guard. Findings never include matched secret values."""

import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

EMAIL = re.compile(r"(?<![\w.+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
TRAILER = re.compile(r"^(?:Co-authored-by|Signed-off-by|Reviewed-by|Acked-by|Tested-by|Reported-by|Suggested-by|Helped-by):\s*(.*)$", re.I | re.M)
PATH = re.compile(r"(?:[A-Za-z]:[\\/](?:Users|Documents and Settings)[\\/]([^\\/\s<>\"']+)|/(?:Users|home)/([^/\s<>\"']+))")
SAMPLE_DOMAINS = {"example.com", "example.org", "example.net", "example.test", "example.invalid", "localhost.invalid"}
SAFE_SYSTEM_EMAIL_DOMAINS = {"github.com"}
SAMPLE_USERS = {"alice", "bob", "user", "username", "example", "exampleuser", "public", "default", "runner", "agent"}
PATTERNS = {
    "github-credential": re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,})\b"),
    "service-credential": re.compile(r"\b(?:sk-[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|AIza[A-Za-z0-9_-]{30,})\b"),
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    "account-link": re.compile(r"https?://(?:chatgpt\.com|chat\.openai\.com)/(?:c|share)/[A-Za-z0-9-]{12,}"),
}
ASSIGNMENT = re.compile(r"\b(?:password|passwd|api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*['\"]([^'\"\r\n]{8,})['\"]", re.I)


def git(*args):
    result = subprocess.run(["git", *args], capture_output=True)
    if result.returncode:
        raise ValueError("Git operation failed")
    return result.stdout


def config(key):
    result = subprocess.run(["git", "config", "--local", "--get", key], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else None


def findings(text, email, terms=()):
    hits = []
    for match in EMAIL.finditer(text):
        domain = match[0].lower().rsplit("@", 1)[-1]
        if match[0] != email and domain not in SAMPLE_DOMAINS and domain not in SAFE_SYSTEM_EMAIL_DOMAINS:
            hits.append(("nonanonymous-email", text.count("\n", 0, match.start()) + 1))
    for term in terms:
        if not term:
            continue
        for match in re.finditer(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, re.I):
            hits.append(("known-private-identity", text.count("\n", 0, match.start()) + 1))
    for match in PATH.finditer(text):
        if (match[1] or match[2]).lower() not in SAMPLE_USERS:
            hits.append(("personal-absolute-path", text.count("\n", 0, match.start()) + 1))
    for category, pattern in PATTERNS.items():
        hits.extend((category, text.count("\n", 0, m.start()) + 1) for m in pattern.finditer(text))
    for match in ASSIGNMENT.finditer(text):
        value = match[1].lower()
        if not any(marker in value for marker in ("example", "placeholder", "dummy", "your_", "your-", "${", "not-a-secret", "changeme", "<", "test-only")):
            hits.append(("possible-hardcoded-secret", text.count("\n", 0, match.start()) + 1))
    return sorted(set(hits))


def identity_ok(identity, email):
    return identity.startswith(f"ngwglai <{email}> ")


class Check:
    def __init__(self, email, terms=(), max_bytes=5 * 1024 * 1024):
        self.email, self.terms, self.max_bytes = email, terms, max_bytes
        self.issues, self.seen_blobs, self.seen_commits = [], set(), set()

    def location(self, value):
        if findings(value, self.email, self.terms):
            return "redacted-path-" + hashlib.sha256(value.encode()).hexdigest()[:12]
        return re.sub(r"[\x00-\x1f\x7f]", "?", value)

    def add(self, kind, location, line=None):
        self.issues.append({"kind": kind, "location": self.location(location), "line": line})

    def text(self, value, location, message=False):
        for kind, line in findings(value, self.email, self.terms):
            self.add(kind, location, line)
        if message:
            for trailer in TRAILER.finditer(value):
                if trailer[1].strip() != f"ngwglai <{self.email}>":
                    self.add("noncanonical-identity-trailer", location, value.count("\n", 0, trailer.start()) + 1)

    def blob(self, oid, path):
        self.text(path, "tracked-path:" + path)
        if path.endswith(".bundle") or re.search(r"(?:^|/)(?:privacy-private|privacy-backups)(?:/|$)", path):
            self.add("private-history-backup", path)
        if oid in self.seen_blobs:
            return
        self.seen_blobs.add(oid)
        size = int(git("cat-file", "-s", oid))
        if size > self.max_bytes:
            self.add("unscanned-large-blob", path)
            return
        self.text(git("cat-file", "blob", oid).decode("utf-8", "replace"), path)

    def prospective(self):
        for key in ("GIT_AUTHOR_IDENT", "GIT_COMMITTER_IDENT"):
            if not identity_ok(git("var", key).decode(), self.email):
                self.add("noncanonical-" + key.lower(), "prospective-commit")

    def staged(self):
        for path in git("diff", "--cached", "--name-only", "--diff-filter=ACMRT", "-z").split(b"\0"):
            if not path:
                continue
            name = path.decode("utf-8", "surrogateescape")
            oid = git("rev-parse", ":" + name).decode().strip()
            self.blob(oid, name)

    def commits(self, revisions, exclude_remote=None):
        if any(value.startswith("-") for value in revisions):
            raise ValueError("revision cannot be an option")
        rev_args = list(revisions)
        if exclude_remote is not None:
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", exclude_remote):
                raise ValueError("invalid remote name")
            rev_args.extend(["--not", f"--remotes={exclude_remote}"])
        for sha in git("rev-list", *rev_args, "--").decode().splitlines():
            if sha in self.seen_commits:
                continue
            self.seen_commits.add(sha)
            fields = git("show", "-s", "--format=%an%x00%ae%x00%cn%x00%ce%x00%P%x00%B", sha).decode("utf-8", "replace").split("\0", 5)
            author, ae, committer, ce, parents, message = fields
            where = "commit:" + sha[:12]
            if author != "ngwglai" or ae != self.email:
                self.add("noncanonical-author", where)
            platform_merge = (
                len(parents.split()) >= 2
                and author == "ngwglai"
                and ae == self.email
                and committer == "GitHub"
                and ce == "noreply@github.com"
                and re.match(r"^Merge pull request #[0-9]+ from ngwglai/", message)
            )
            if (committer != "ngwglai" or ce != self.email) and not platform_merge:
                self.add("noncanonical-committer", where)
            self.text(message, where, message=True)
            for entry in git("ls-tree", "-r", "-z", sha).split(b"\0"):
                if not entry:
                    continue
                info, path = entry.split(b"\t", 1)
                _, kind, oid = info.split()
                if kind == b"blob":
                    self.blob(oid.decode(), path.decode("utf-8", "replace"))

    def tags(self):
        for ref in git("for-each-ref", "--format=%(refname)", "refs/tags").decode().splitlines():
            if git("cat-file", "-t", ref).strip() != b"tag":
                continue
            content = git("cat-file", "tag", ref).decode("utf-8", "replace")
            headers, _, message = content.partition("\n\n")
            tagger = next((line[7:] for line in headers.splitlines() if line.startswith("tagger ")), "")
            if not identity_ok(tagger, self.email):
                self.add("noncanonical-tagger", ref)
            self.text(message, ref, message=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--staged", action="store_true", help="check staged blobs and effective future commit identities")
    parser.add_argument("--all-history", action="store_true", help="check commits/blobs reachable from every local ref and annotated tags")
    parser.add_argument("--commits", action="append", default=[], metavar="REVISION_RANGE")
    parser.add_argument("--message-file", type=Path)
    parser.add_argument("--pre-push", action="store_true", help="consume Git pre-push stdin and check outgoing ancestry")
    parser.add_argument("--remote-name", help="named remote passed by the pre-push hook; used to exclude existing remote-tracking history when creating a new ref")
    parser.add_argument("--denylist", type=Path, help="private JSON file with a terms list; never commit this file")
    parser.add_argument("--max-bytes", type=int, default=5 * 1024 * 1024, help="larger blobs fail as unscanned")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args(argv)
    try:
        email = config("privacy.email")
        if not email or not re.fullmatch(r"[^\s<>@]+@users\.noreply\.github\.com", email) or config("privacy.name") != "ngwglai":
            raise ValueError("confirmed local identity missing")
        if args.max_bytes < 1:
            raise ValueError("invalid read limit")
        denylist = args.denylist or (Path(config("privacy.denylist")) if config("privacy.denylist") else None)
        terms = []
        if denylist:
            bare = git("rev-parse", "--is-bare-repository").strip() == b"true"
            root = Path(git("rev-parse", "--absolute-git-dir" if bare else "--show-toplevel").decode().strip()).resolve()
            if denylist.resolve().is_relative_to(root):
                raise ValueError("private denylist must remain outside the checkout")
            data = json.loads(denylist.read_text(encoding="utf-8"))
            terms = data["terms"]
            if not isinstance(terms, list) or any(not isinstance(term, str) or not term for term in terms):
                raise ValueError("invalid private denylist")
        check = Check(email, terms, args.max_bytes)
        if not any((args.staged, args.all_history, args.commits, args.message_file, args.pre_push)):
            args.staged = True
        if args.staged or args.message_file:
            check.prospective()
        if args.staged:
            check.staged()
        if args.message_file:
            if args.message_file.stat().st_size > args.max_bytes:
                raise ValueError("message exceeds read limit")
            check.text(args.message_file.read_text(encoding="utf-8", errors="replace"), "commit-message", message=True)
        if args.all_history:
            # --all is added by the checker, not accepted as a user revision.
            refs = git("for-each-ref", "--format=%(refname)").decode().splitlines()
            if refs:
                check.commits(refs)
            check.tags()
        if args.commits:
            check.commits(args.commits)
        if args.pre_push:
            for row in sys.stdin:
                fields = row.split()
                if len(fields) != 4 or not all(re.fullmatch(r"[0-9a-f]{40,64}", fields[i]) for i in (1, 3)):
                    raise ValueError("invalid pre-push input")
                local_sha, remote_sha = fields[1], fields[3]
                if set(local_sha) == {"0"}:
                    continue
                known = subprocess.run(["git", "cat-file", "-e", remote_sha + "^{commit}"], capture_output=True).returncode == 0
                if known:
                    check.commits([remote_sha + ".." + local_sha])
                elif args.remote_name:
                    # A newly created remote branch has no remote SHA. Exclude every
                    # commit already reachable from this remote's local tracking refs,
                    # so old main history is not re-audited while new commits are still checked.
                    check.commits([local_sha], exclude_remote=args.remote_name)
                else:
                    # Manual invocations without the hook-provided remote remain conservative.
                    check.commits([local_sha])
            check.tags()
        summary = {"ok": not check.issues, "commits_checked": len(check.seen_commits), "blobs_checked": len(check.seen_blobs),
                   "counts": dict(Counter(issue["kind"] for issue in check.issues)), "findings": check.issues}
        if args.json:
            print(json.dumps(summary, ensure_ascii=True))
        else:
            print(f"Privacy check: {'PASS' if summary['ok'] else 'FAIL'}; {len(check.seen_commits)} commits, {len(check.seen_blobs)} unique blobs, {len(check.issues)} findings.")
            for issue in check.issues[:100]:
                print(f"{issue['kind']}: {issue['location']}" + (f":{issue['line']}" if issue['line'] else ""))
            if len(check.issues) > 100:
                print("Additional findings omitted; use --json for redacted structured locations.")
        return 0 if summary["ok"] else 1
    except (OSError, ValueError, TypeError, KeyError, UnicodeError):
        print("Privacy check could not complete. Check local identity initialization, Git refs, private denylist and read limits. No input values logged.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
