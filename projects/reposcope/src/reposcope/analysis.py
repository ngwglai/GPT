"""Bounded, non-executing text analysis. No source is retained in results."""

import ast
import io
import json
import re
import tokenize
import tomllib
import warnings
import xml.etree.ElementTree as ET
from collections import Counter

LANGUAGES = {
    ".py": "Python", ".pyw": "Python", ".js": "JavaScript", ".jsx": "JavaScript",
    ".mjs": "JavaScript", ".cjs": "JavaScript", ".ts": "TypeScript", ".tsx": "TypeScript",
    ".rs": "Rust", ".go": "Go", ".java": "Java", ".c": "C", ".h": "C",
    ".cpp": "C++", ".hpp": "C++", ".cs": "C#", ".sh": "Shell", ".ps1": "PowerShell",
    ".rb": "Ruby", ".php": "PHP", ".html": "HTML", ".css": "CSS", ".sql": "SQL",
    ".json": "JSON", ".toml": "TOML", ".yaml": "YAML", ".yml": "YAML",
    ".md": "Markdown", ".txt": "Text", ".xml": "XML",
}
SOURCE_LANGUAGES = set(LANGUAGES.values()) - {"JSON", "TOML", "YAML", "Markdown", "Text", "XML"}
CONFIG_NAMES = {"package.json", "pyproject.toml", "requirements.txt", "Cargo.toml", "go.mod", "pom.xml"}


def python_lines(text):
    """Classify physical lines; code takes precedence over comments on a line."""
    code, comments = set(), set()
    for token in tokenize.generate_tokens(io.StringIO(text).readline):
        kind, value, start, end, _ = token
        if kind == tokenize.COMMENT:
            comments.add(start[0])
        elif kind not in {tokenize.NL, tokenize.NEWLINE, tokenize.INDENT, tokenize.DEDENT,
                          tokenize.ENDMARKER, tokenize.ENCODING} and value.strip():
            code.update(range(start[0], end[0] + 1))
    lines = text.splitlines()
    blank = sum(not line.strip() for line in lines)
    comment = sum(i in comments and i not in code for i, line in enumerate(lines, 1) if line.strip())
    return {"code": len(lines) - blank - comment, "comment": comment, "blank": blank}


def lexical_lines(text, language):
    """Small lexical approximation, also returning code with strings/comments masked."""
    c_style = language in {"JavaScript", "TypeScript", "Rust", "Go", "Java", "C", "C++", "C#", "PHP", "CSS"}
    hash_style = language in {"Shell", "PowerShell", "Ruby", "Python", "YAML", "TOML"}
    block, quote, escaped = False, None, False
    counts = Counter(code=0, comment=0, blank=0)
    masked = []
    for line in text.splitlines():
        has_code = False
        out = []
        i = 0
        while i < len(line):
            char, pair = line[i], line[i:i + 2]
            if block:
                if pair == "*/":
                    block = False
                    i += 2
                else:
                    i += 1
                out.append(" ")
            elif quote:
                has_code = True
                out.append(" ")
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == quote:
                    quote = None
                i += 1
            elif (c_style and pair == "//") or (hash_style and char == "#") or (language == "SQL" and pair == "--"):
                break
            elif c_style and pair == "/*":
                block = True
                i += 2
            elif char in {"'", '"', "`"}:
                quote = char
                has_code = True
                out.append(" ")
                i += 1
            else:
                has_code |= bool(char.strip())
                out.append(char)
                i += 1
        counts["blank" if not line.strip() else "code" if has_code else "comment"] += 1
        masked.append("".join(out))
        if quote != "`":
            quote = None
        escaped = False
    return dict(counts), "\n".join(masked)


def python_metrics(text):
    # Parser warnings may include source fragments; keep analysis output metadata-only.
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        tree = ast.parse(text)
    functions = []

    def decisions(node):
        count = 0
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)):
                continue
            count += isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.ExceptHandler, ast.IfExp, ast.match_case))
            if isinstance(child, ast.BoolOp):
                count += len(child.values) - 1
            count += decisions(child)
        return count

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append({"line": node.lineno, "length": node.end_lineno - node.lineno + 1,
                              "branch_score": 1 + decisions(node)})
    return {"functions": len(functions), "longest_function": max((f["length"] for f in functions), default=0),
            "max_branch_score": max((f["branch_score"] for f in functions), default=0),
            "method": "Python AST heuristic; branch score is not exact cyclomatic complexity"}


def analyze_text(text, language):
    counts, masked = lexical_lines(text, language)
    method = "heuristic" if language in SOURCE_LANGUAGES or language in {"YAML", "TOML"} else "unclassified"
    metrics = {}
    if language == "Python":
        try:
            counts = python_lines(text)
            metrics = python_metrics(text)
            method = "tokenized"
        except (SyntaxError, tokenize.TokenError, IndentationError, RecursionError):
            metrics = {"limitation": "Python parsing failed; lexical estimates used"}
            method = "heuristic"
    elif language in {"JavaScript", "TypeScript"}:
        depth = maximum = 0
        for char in masked:
            if char == "{":
                depth += 1
                maximum = max(maximum, depth)
            elif char == "}":
                depth = max(0, depth - 1)
        metrics = {"function_markers": len(re.findall(r"\bfunction\b|=>", masked)),
                   "branch_markers": len(re.findall(r"\b(?:if|for|while|case|catch)\b|&&|\|\|", masked)),
                   "max_brace_depth": maximum, "method": "lexical heuristic, not a parser or cyclomatic complexity"}
    return counts, method, metrics


def tech_stack(name, text):
    """Extract allowlisted structural facts; never report arbitrary config values."""
    tools, frameworks = set(), set()
    deps = set()
    if name == "package.json":
        data = json.loads(text)
        for key in ("dependencies", "devDependencies", "peerDependencies"):
            section = data.get(key, {})
            if isinstance(section, dict):
                deps.update(section)
        tools.add("npm-compatible package.json")
        for dep, label in {"react": "React", "vue": "Vue", "next": "Next.js", "express": "Express", "@angular/core": "Angular", "svelte": "Svelte"}.items():
            if dep in deps:
                frameworks.add(label)
        tools.update(t for d, t in {"vite": "Vite", "webpack": "Webpack", "typescript": "TypeScript compiler", "eslint": "ESLint"}.items() if d in deps)
    elif name in {"pyproject.toml", "Cargo.toml"}:
        data = tomllib.loads(text)
        if name == "Cargo.toml":
            tools.add("Cargo")
        else:
            tools.add("Python pyproject.toml")
            tool = data.get("tool", {})
            for key, label in {"poetry": "Poetry", "uv": "uv", "setuptools": "setuptools", "hatch": "Hatch"}.items():
                if key in tool:
                    tools.add(label)
            project = data.get("project", {})
            deps.update(re.split(r"[\s\[<>=!~;]", item.lower())[0] for item in project.get("dependencies", []) if isinstance(item, str))
            poetry = tool.get("poetry", {}).get("dependencies", {})
            if isinstance(poetry, dict):
                deps.update(k.lower() for k in poetry)
            backend = data.get("build-system", {}).get("build-backend", "")
            for key, label in {"setuptools": "setuptools", "hatchling": "Hatch", "flit": "Flit", "poetry": "Poetry"}.items():
                if isinstance(backend, str) and backend.startswith(key):
                    tools.add(label)
    elif name == "requirements.txt":
        tools.add("pip requirements")
        deps.update(re.split(r"[\s\[<>=!~;]", line.strip().lower())[0] for line in text.splitlines() if line.strip() and not line.lstrip().startswith(("#", "-")))
    elif name == "go.mod":
        tools.add("Go modules")
    elif name == "pom.xml":
        # XML entity declarations are unnecessary for dependency manifests.
        if re.search(r"<!\s*(?:DOCTYPE|ENTITY)", text, re.I):
            raise ValueError("XML declarations are unsupported")
        root = ET.fromstring(text)
        deps.update(e.text or "" for e in root.iter() if e.tag.rsplit("}", 1)[-1] == "artifactId")
        tools.add("Maven")
        if any(d.startswith("spring-boot") for d in deps):
            frameworks.add("Spring Boot")
    frameworks.update(label for dep, label in {"django": "Django", "flask": "Flask", "fastapi": "FastAPI"}.items() if dep in deps)
    return {"tools": sorted(tools), "frameworks": sorted(frameworks)}
