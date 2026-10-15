"""Console interface. No network calls, subprocesses or target code execution."""

import argparse
from pathlib import Path
import os
import sys
import tempfile

from . import __version__
from .reports import html_report, markdown_report
from .scanner import Options, is_link, scan


def positive(value):
    number = int(value)
    if number < 1:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return number


def parser():
    cli = argparse.ArgumentParser(description="RepoScope: scan local repositories offline; never execute target code.")
    cli.add_argument("path", type=Path, help="local directory (quote Windows paths containing spaces)")
    cli.add_argument("--version", action="version", version=f"RepoScope {__version__}")
    cli.add_argument("-o", "--output", type=Path, default=Path("reposcope-report"), help="report directory (default: ./reposcope-report)")
    cli.add_argument("--format", choices=("both", "html", "markdown"), default="both")
    cli.add_argument("--exclude", action="append", default=[], metavar="PATTERN", help="additional gitignore pattern; repeat as needed (use / separators)")
    cli.add_argument("--max-file-bytes", type=positive, default=1024 * 1024, help="content read limit per file (default: 1048576)")
    cli.add_argument("--max-files", type=positive, default=100_000, help="stop after this many inventoried files; partial result exits 1")
    cli.add_argument("--long-file-lines", type=positive, default=500, help="source code line finding threshold (default: 500)")
    cli.add_argument("--large-dir-bytes", type=positive, default=100 * 1024 * 1024, help="recursive included-byte finding threshold (default: 104857600)")
    cli.add_argument("--force", action="store_true", help="replace existing report.html/report.md only")
    return cli


def main(argv=None):
    args = parser().parse_args(argv)
    temporary = []
    try:
        root = args.path.expanduser().resolve(strict=True)
        raw_output = args.output.expanduser().absolute()
        for part in (raw_output, *raw_output.parents):
            if (part.exists() or part.is_symlink()) and is_link(part):
                raise ValueError("report directory must not traverse symbolic links or reparse points")
        output = raw_output.resolve()
        if output == root:
            raise ValueError("choose a separate report directory, not the scan root")
        names = [name for name, fmt in (("report.html", "html"), ("report.md", "markdown")) if args.format in ("both", fmt)]
        for name in names:
            target = output / name
            if target.is_symlink() or (target.exists() and (not args.force or not target.is_file())):
                raise ValueError("report already exists or is not a regular file; choose another output or use --force")
        excludes = list(args.exclude)
        if output.is_relative_to(root):
            # Literal output paths may contain gitignore metacharacters. Escape them.
            rel = output.relative_to(root).as_posix()
            escaped = "".join("\\" + c if c in "\\*?[]!# " else c for c in rel)
            excludes.append("/" + escaped + "/")
        result = scan(root, Options(excludes, args.max_file_bytes, args.max_files,
                                    args.long_file_lines, args.large_dir_bytes))
        output.mkdir(parents=True, exist_ok=True)
        for name in names:
            content = html_report(result) if name.endswith("html") else markdown_report(result)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", dir=output, delete=False, prefix=".reposcope-") as stream:
                temporary.append(Path(stream.name))
                stream.write(content)
        for tmp, name in zip(temporary, names):
            os.replace(tmp, output / name)
        print(f"Scanned {len(result['files'])} files, {result['total_bytes']} included bytes; {result['error_count']} read/parse errors.")
        print(f"Reports written to: {output}")
        if result["error_count"] or result["truncated"]:
            print("Partial analysis: inspect the report's errors and limits.", file=sys.stderr)
            return 1
        return 0
    except (OSError, ValueError) as exc:
        # Keep potentially sensitive parser/I/O details out of the terminal.
        message = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
        print(f"RepoScope: {message}. Check paths, permissions, exclusions and output destination.", file=sys.stderr)
        return 2
    finally:
        for path in temporary:
            try:
                path.unlink(missing_ok=True)
            except OSError:
                pass  # Preserve the primary I/O failure if cleanup is also denied.
