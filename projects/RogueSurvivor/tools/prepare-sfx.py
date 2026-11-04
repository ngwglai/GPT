"""Rebuild the selected CC0 SFX with ffmpeg; input archives stay outside the repository.
Usage: python tools/prepare-sfx.py /path/to/kenney-interface.zip /path/to/kenney-rpg.zip
Sources and license: SFX_CREDITS.md. No network download is required by this script.
"""
from pathlib import Path
import sys, zipfile, subprocess, tempfile
root = Path(__file__).resolve().parents[1]
archives = dict(zip(["interface", "rpg"], sys.argv[1:]))
if len(archives) != 2:
    raise SystemExit(__doc__)
items={
 'attack':('interface','Audio/pluck_001.ogg'),
 'impact':('interface','Audio/glass_004.ogg'),
 'fire':('interface','Audio/maximize_001.ogg'),
 'ice':('interface','Audio/glass_001.ogg'),
 'lance':('interface','Audio/maximize_003.ogg'),
 'ward':('interface','Audio/toggle_001.ogg'),
 'bloom':('interface','Audio/confirmation_003.ogg'),
 'storm':('interface','Audio/maximize_005.ogg'),
 'dash':('rpg','OGG/knifeSlice.ogg'),
 'hurt':('interface','Audio/drop_004.ogg'),
 'death':('interface','Audio/minimize_001.ogg'),
 'pickup':('interface','Audio/select_007.ogg'),
 'level':('interface','Audio/confirmation_001.ogg'),
 'card':('rpg','OGG/bookFlip3.ogg'),
 'rare':('interface','Audio/confirmation_002.ogg'),
 'chest':('interface','Audio/open_001.ogg'),
 'wave':('interface','Audio/bong_001.ogg'),
 'boss':('interface','Audio/question_004.ogg'),
 'warning':('interface','Audio/error_007.ogg'),
 'defeat':('interface','Audio/confirmation_004.ogg'),
 'victory':('interface','Audio/confirmation_004.ogg'),
 'failure':('interface','Audio/minimize_009.ogg'),
 'ui':('interface','Audio/click_003.ogg'),
}
out = root / 'public/audio/sfx'
out.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    raw = Path(tmp) / 'source.ogg'
    for name, (pack, path) in items.items():
        with zipfile.ZipFile(archives[pack]) as z:
            raw.write_bytes(z.read(path))
        filters = 'loudnorm=I=-20:TP=-3:LRA=9'
        if name == 'victory':
            filters = ('aresample=44100,asplit=3[a][b][c];'
                '[a]apad=pad_dur=0.12[a1];'
                '[b]asetrate=44100*1.122462,aresample=44100,apad=pad_dur=0.12[b1];'
                '[c]asetrate=44100*1.334840,aresample=44100,apad=pad_dur=0.3[c1];'
                '[a1][b1][c1]concat=n=3:v=0:a=1,loudnorm=I=-20:TP=-3:LRA=9')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw),
            '-map_metadata', '-1', '-ac', '1', '-ar', '44100',
            '-filter_complex' if name == 'victory' else '-af', filters,
            '-codec:a', 'libmp3lame', '-q:a', '5', str(out / f'{name}.mp3')], check=True)

for pack, archive in archives.items():
    with zipfile.ZipFile(archive) as z:
        name = 'License.txt' if pack == 'interface' else 'license.txt'
        (out / f'LICENSE-Kenney-{pack}.txt').write_bytes(z.read(name))
