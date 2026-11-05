"""Extract real drawn pose sequences; never synthesize motion by transforming one pose.
Usage: python tools/prepare-v16-characters.py ranger [knight mage]
Requires Pillow. Source: art-source/v1.6/<character>-source.png (8 columns, 7 rows).
GIFs are previews encoded from generated frame art, NOT native GIF-model output.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json
import statistics
import sys
import hashlib

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = dict(idle=8, run=12, dash=16, cast=12, hurt=20, defeat=6, revive=8)
SIZE = 192

def rgba_pixels(image):
    return image.get_flattened_data() if hasattr(image, "get_flattened_data") else image.getdata()

def prepare(character):
    image = Image.open(ROOT / f'art-source/v1.6/{character}-source.png').convert('RGBA')
    width, height = image.size
    pixels = []
    for r, g, b, _ in rgba_pixels(image):
        # Chroma-key cleanup also removes blended magenta edge pixels.
        dominance = min(r, b) - g
        alpha = 0 if dominance > 105 and r > 110 and b > 110 else 255
        if 45 < dominance <= 105 and r > 100 and b > 100:
            alpha = round(255 * (105 - dominance) / 60)
        pixels.append((r, g, b, alpha))
    image.putdata(pixels)
    cells = [[image.crop((round(col*width/8), round(row*height/7),
                          round((col+1)*width/8), round((row+1)*height/7)))
              for col in range(8)] for row in range(7)]
    idle_heights = [im.getbbox()[3] - im.getbbox()[1] for im in cells[0]]
    scale = 150 / statistics.median(idle_heights)
    out = ROOT / f'public/assets/v1.6/characters/{character}'
    out.mkdir(parents=True, exist_ok=True)
    report = {'source': list(image.size), 'scale': scale, 'actions': {}}
    contact = Image.new('RGBA', (SIZE*8, SIZE*7))
    for row, (action, fps) in enumerate(ACTIONS.items()):
        frames = []
        boxes = []
        for col, cell in enumerate(cells[row]):
            box = cell.getbbox()
            if box is None:
                raise ValueError(f'{character}/{action}/{col}: missing pose')
            if box[0] == 0 or box[2] == cell.width:
                raise ValueError(f'{character}/{action}/{col}: horizontal clipping')
            # Preserve cell-centred X; use the bottom of the actual pose as a foot baseline.
            resized = cell.resize((round(cell.width*scale), round(cell.height*scale)), Image.Resampling.LANCZOS)
            bottom = round(box[3]*scale)
            frame = Image.new('RGBA', (SIZE, SIZE))
            frame.alpha_composite(resized, (round((SIZE-resized.width)/2), 170-bottom))
            frame.putdata([(r, g, b, a) if a >= 4 else (0, 0, 0, 0) for r, g, b, a in rgba_pixels(frame)])
            bbox = frame.getbbox()
            if not bbox or bbox[0] < 2 or bbox[2] > SIZE-2 or bbox[1] < 2:
                raise ValueError(f'{character}/{action}/{col}: exceeds padded output')
            frames.append(frame)
            boxes.append(list(bbox))
            contact.alpha_composite(frame, (col*SIZE, row*SIZE))
        atlas = Image.new('RGBA', (SIZE*8, SIZE))
        for col, frame in enumerate(frames): atlas.alpha_composite(frame, (col*SIZE, 0))
        atlas.save(out / f'{action}.webp', lossless=True, method=6)
        # Transparent GIF proof-of-motion, separate from lossless runtime textures.
        gif_frames = []
        for frame in frames:
            pal = frame.convert('RGB').quantize(colors=255)
            pal = pal.convert('RGBA')
            pal.putalpha(frame.getchannel('A'))
            pal = pal.quantize(colors=255)
            # Canonical palette ordering preserves every quantized colour while making
            # GIF output independent of Pillow's internal colour-frequency ordering.
            colors = pal.getpalette('RGB')
            order = sorted(range(255), key=lambda i: tuple(colors[i*3:i*3+3]))
            lookup = [0] * 256
            for new, old in enumerate(order): lookup[old] = new
            lookup[255] = 255
            pal = pal.point(lookup)
            pal.putpalette([v for old in order for v in colors[old*3:old*3+3]] + [0, 0, 0])
            mask = frame.getchannel('A').point(lambda a: 255 if a < 128 else 0)
            pal.paste(255, mask=mask)
            gif_frames.append(pal)
        options = {'save_all': True, 'append_images': gif_frames[1:],
                   'duration': round(1000/fps), 'disposal': 2, 'transparency': 255,
                   'optimize': True, 'interlace': False}
        if action in ('idle', 'run'): options['loop'] = 0
        gif_frames[0].save(out / f'{action}.gif', **options)
        with Image.open(out / f'{action}.gif') as check:
            if check.n_frames != 8: raise ValueError('GIF dropped or reordered frames')
        hashes = [hashlib.sha256(frame.tobytes()).hexdigest() for frame in frames]
        if len(set(hashes)) < 4: raise ValueError('insufficient distinct generated poses')
        report['actions'][action] = {'frames': 8, 'fps': fps, 'boxes': boxes,
                                    'distinctFrames': len(set(hashes)),
                                    'heightRange': [min(b[3]-b[1] for b in boxes), max(b[3]-b[1] for b in boxes)]}
    contact.save(ROOT / f'art-source/v1.6/{character}-contact.webp', lossless=True)

    # Static fallback and consistent avatar use generated dedicated chibi art.
    first = contact.crop((0, 0, SIZE, SIZE))
    first.save(out / 'fallback.webp', lossless=True)
    avatar = first.crop((35, 12, 157, 134)).resize((256, 256), Image.Resampling.LANCZOS)
    avatar.save(out / 'avatar.webp', lossless=True)
    (ROOT / f'art-source/v1.6/{character}-qa.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
    print(character, '7 clips / 56 distinct generated frame slots prepared')

def portraits():
    image = Image.open(ROOT / 'art-source/v1.6/portraits-source.png').convert('RGBA')
    # Alpha-empty valleys between the three generated figures; never cut through a cape.
    for character, left, right in [('ranger', 0, 475), ('knight', 475, 1010), ('mage', 1010, 1536)]:
        crop = image.crop((left, 0, right, image.height))
        box = crop.getbbox()
        if not box: raise ValueError('missing portrait')
        crop = crop.crop(box)
        canvas = Image.new('RGBA', (crop.width+24, crop.height+24))
        canvas.alpha_composite(crop, (12, 12))
        canvas.save(ROOT / f'public/assets/v1.6/characters/{character}/portrait.webp', lossless=True, method=6)
    print('3 transparent full portraits extracted')

def check():
    results = []
    for character in ['ranger', 'knight', 'mage']:
        for action, fps in ACTIONS.items():
            path = ROOT / f'public/assets/v1.6/characters/{character}/{action}'
            with Image.open(path.with_suffix('.webp')) as source, Image.open(path.with_suffix('.gif')) as gif:
                source = source.convert('RGBA')
                if source.size != (SIZE*8, SIZE) or gif.n_frames != 8:
                    raise ValueError('incorrect atlas dimensions or GIF frame count')
                if (gif.info.get('loop') == 0) != (action in ('idle', 'run')):
                    raise ValueError('incorrect loop policy')
                errors = []
                hashes = []
                for index in range(8):
                    gif.seek(index)
                    frame = gif.convert('RGBA')
                    reference = source.crop((index*SIZE, 0, (index+1)*SIZE, SIZE))
                    mask = reference.getchannel('A').point(lambda a: 255 if a > 245 else 0)
                    difference = ImageChops.difference(reference.convert('RGB'), frame.convert('RGB'))
                    errors.append(sum(ImageStat.Stat(difference, mask).mean)/3)
                    hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
                error = sum(errors)/8
                if error > 12 or len(set(hashes)) < 4:
                    raise ValueError('GIF colour loss or missing motion')
                results.append({'character': character, 'action': action, 'frames': 8,
                                'fps': fps, 'distinctFrames': len(set(hashes)),
                                'opaqueColorMeanAbsoluteError': round(error, 2)})
    path = ROOT / 'validation/v1.6/gif-check.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2)+'\n')
    print('21 GIFs checked: frame counts, loops, distinct poses and colour fidelity')

if __name__ == '__main__':
    for character in sys.argv[1:] or ['ranger', 'knight', 'mage']:
        if character == 'check': check()
        elif character == 'portraits': portraits()
        else: prepare(character)

