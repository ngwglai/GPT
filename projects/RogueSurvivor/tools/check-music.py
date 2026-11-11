"""Optional local full-decode/EBU R128 audit. Requires FFmpeg/ffprobe, no Python packages.
Run from the game directory: python tools/check-music.py --output /tmp/music.json
The report includes only public resource identifiers and selected technical metadata.
"""
import argparse
import concurrent.futures
import hashlib
import json
import pathlib
import re
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[1] / 'public/audio'

def inspect(track):
    path = ROOT / f'battle-{track}.mp3'
    info = json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(path)
    ]))
    run = subprocess.run([
        'ffmpeg', '-nostdin', '-hide_banner', '-i', str(path), '-af',
        'ebur128=peak=true', '-f', 'null', '-'
    ], check=True, capture_output=True, text=True)
    summary = run.stderr.rsplit('Summary:', 1)[-1]
    loud = float(re.search(r'I:\s*([-\d.]+) LUFS', summary)[1])
    peak = float(re.search(r'Peak:\s*([-\d.]+) dBFS', summary)[1])
    stream, fmt = info['streams'][0], info['format']
    assert stream['codec_name'] == 'mp3' and float(fmt['duration']) > 0
    return dict(id=track, file=path.name, title=fmt.get('tags', {}).get('title'),
        seconds=float(fmt['duration']), bytes=path.stat().st_size,
        codec=stream['codec_name'], sampleRate=int(stream['sample_rate']),
        channels=stream['channels'], integratedLUFS=loud, truePeakDBFS=peak,
        gain=round(min(1, 10**((-16-loud)/20), 10**((-1-peak)/20)), 4),
        sha256=hashlib.sha256(path.read_bytes()).hexdigest())

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        rows = list(executor.map(inspect, range(1, 13)))
    pathlib.Path(args.output).write_text(json.dumps(rows, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    print(f'{len(rows)} tracks fully decoded; report written.')
