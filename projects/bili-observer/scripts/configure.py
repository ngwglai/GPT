"""Hidden local prompts; upload secrets via Wrangler stdin, never command arguments."""
import argparse
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--local', action='store_true', help='write ignored .dev.vars instead of Cloudflare Secrets')
    parser.add_argument('--token-only', action='store_true', help='only set the independent MCP token')
    parser.add_argument('--cookie-only', action='store_true', help='only update Bilibili cookies; preserve MCP token')
    args = parser.parse_args()
    if args.token_only and args.cookie_only:
        parser.error('choose only one of --token-only and --cookie-only')
    if not sys.stdin.isatty():
        parser.error('interactive terminal required to prevent echoed credentials')
    os.chdir(Path(__file__).resolve().parents[1])
    values = {}
    if not args.cookie_only:
        token = getpass.getpass('MCP access token (>=32 chars; blank generates one): ') or secrets.token_urlsafe(32)
        if not re.fullmatch(r'[A-Za-z0-9._~-]{32,256}', token):
            parser.error('token must be 32-256 URL-safe characters')
        values['MCP_ACCESS_TOKEN'] = token
    if not args.token_only:
        session = getpass.getpass('SESSDATA value: ').strip()
        csrf = getpass.getpass('bili_jct value: ').strip()
        buvid = getpass.getpass('buvid3 value (optional): ').strip()
        if not session or re.search(r'[;\s]', session) or not re.fullmatch(r'[a-fA-F0-9]{32}', csrf):
            parser.error('invalid cookie format; enter only the values, not full Cookie headers')
        values.update(BILI_SESSDATA=session, BILI_JCT=csrf)
        if buvid:
            if re.search(r'[;\s]', buvid):
                parser.error('invalid buvid3')
            values['BILI_BUVID3'] = buvid
    if args.local:
        path = Path('.dev.vars')
        previous = {}
        if path.exists():
            for line in path.read_text(encoding='utf-8').splitlines():
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    previous[key] = value
        previous.update({k: json.dumps(v) for k, v in values.items()})
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        if os.name != 'nt':
            os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as handle:
            handle.write(''.join(f'{k}={v}\n' for k, v in previous.items()))
        print('Saved to ignored .dev.vars. On Windows, restrict file ACL to your account.')
    else:
        # npm exec locates the project's pinned Wrangler on Windows and POSIX.
        npm = shutil.which('npm')
        if not npm:
            parser.error('install Node.js/npm and run npm ci first')
        result = subprocess.run([npm, 'exec', '--', 'wrangler', 'secret', 'bulk'], input=json.dumps(values), text=True, capture_output=True)
        if result.returncode:
            print('Secret upload failed. Run npm exec -- wrangler whoami, check account permissions, then retry. Credentials were not printed.', file=sys.stderr)
            return 1
        print('Cloudflare Secrets updated. No cookie values printed.')
    if 'MCP_ACCESS_TOKEN' in values:
        # An explicit local-only option; token is never printed by default.
        if input('Show MCP token once in this local terminal for client configuration? [y/N] ').strip().lower() == 'y':
            print(values['MCP_ACCESS_TOKEN'])
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
