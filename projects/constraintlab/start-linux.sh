#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/python -m pip install -e .
npm --prefix frontend ci
npm --prefix frontend run build
printf 'Open http://127.0.0.1:8765 after the server starts.\n'
exec .venv/bin/python -m constraintlab.cli --serve
