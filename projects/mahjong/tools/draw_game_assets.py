"""Regenerate the SVG marks and dice in web/assets using a local Noto Serif CJK font.

Example: python tools/draw_game_assets.py /path/NotoSerifCJK-Bold.ttc --font-index 2
Requires fontTools for the authoring step. Serving the assets needs only Python.
"""

import argparse
from pathlib import Path

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ttLib import TTFont

ASSETS = Path(__file__).resolve().parents[1] / "web" / "assets"
INK = "#233b3c"
JADE = "#23674d"
RUBY = "#a3322f"
BLUE = "#315c75"
CHINESE_NUMBERS = "一二三四五六七八九"
PIP_LAYOUTS = (
    ((25, 33),),
    ((16, 17), (34, 49)),
    ((13, 13), (25, 33), (37, 53)),
    ((14, 19), (36, 19), (14, 47), (36, 47)),
    ((12, 13), (38, 13), (25, 33), (12, 53), (38, 53)),
    tuple((x, y) for y in (10, 34, 52) for x in (13, 37)),
    ((10, 9), (25, 19), (40, 29), (13, 42), (37, 42), (13, 57), (37, 57)),
    tuple((x, y) for y in (9, 25, 41, 57) for x in (13, 37)),
    tuple((x, y) for y in (13, 33, 53) for x in (9, 25, 41)),
)


def write_svg(group, name, box, content):
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{box}">\n{content}\n</svg>\n'
    (ASSETS / group / f"{name}.svg").write_text(svg, encoding="utf-8")


def glyph(font, letter, x, y, width, height, color):
    glyphs = font.getGlyphSet()
    outline = glyphs[font.getBestCmap()[ord(letter)]]
    points = BoundsPen(glyphs)
    path = SVGPathPen(glyphs)
    outline.draw(points)
    outline.draw(path)
    left, bottom, right, top = points.bounds
    scale = min(width / (right - left), height / (top - bottom))
    dx = x - (left + right) * scale / 2
    dy = y + (bottom + top) * scale / 2
    return f'<path fill="{color}" stroke="{color}" stroke-width="18" stroke-linejoin="round" transform="translate({dx:.3f} {dy:.3f}) scale({scale:.5f} {-scale:.5f})" d="{path.getCommands()}"/>'


def circles(rank):
    radius = (22, 12, 10, 10, 9.5, 8.5, 7, 7.5, 7.3)[rank - 1]
    marks = []
    for i, (x, y) in enumerate(PIP_LAYOUTS[rank - 1]):
        if rank == 1 or (rank == 6 and i < 2) or (rank == 7 and i < 3) or (rank == 5 and i == 2) or (rank == 9 and 3 <= i < 6):
            ink = RUBY
        elif rank == 8 or (rank == 7 and i < 3) or rank in (2, 4, 6):
            ink = BLUE
        else:
            ink = JADE
        marks.append(
            f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{ink}"/>'
            f'<circle cx="{x}" cy="{y}" r="{radius * .62}" fill="none" stroke="#faf5df" stroke-width="{2.8 if rank == 1 else 1.4}"/>'
        )
    if rank == 1:
        marks.append('<circle cx="25" cy="33" r="5" fill="#faf5df"/><circle cx="25" cy="33" r="2.5" fill="#a3322f"/>')
    return "\n".join(marks)


BIRD = """
<path d="M7 19c8 1 12 7 16 13 1-8 7-11 13-10 1-7 5-13 10-13 3 0 4 2 3 5l-4 4c1 13-4 25-16 30-6 2-12 0-17-4l-9-4 11-2C7 34 5 28 7 19Z" fill="#1b5a42"/>
<path d="M13 25c5 12 13 15 20 12-5 5-13 6-19 2m16 9-4 9m9-11 2 11" fill="none" stroke="#157054" stroke-width="3" stroke-linecap="round"/>
<path d="M13 27c4 7 10 10 17 9-3 5-10 5-16 1" fill="#f0e4be"/>
<path d="m40 11 2-6 3 3 3-2v5Zm4 7 6-1-5 4Z" fill="#af3227"/>
<circle cx="45" cy="13" r="1.2" fill="#fff3d4"/>
"""
BAMBOO_LAYOUTS = {
    2: ((25, 17), (25, 49)),
    3: ((25, 16), (16, 46), (34, 46)),
    4: PIP_LAYOUTS[3],
    5: ((13, 17), (37, 17), (25, 33), (13, 49), (37, 49)),
    6: tuple((x,y) for y in (17,49) for x in (9,25,41)),
    7: ((25, 12), (11, 31), (25, 31), (39, 31), (11, 52), (25, 52), (39, 52)),
    8: tuple((x,y) for y in (17,49) for x in (9,19,31,41)),
    9: PIP_LAYOUTS[8],
}



# Four real bamboo stems per group: two upright outer stems and two crossing
# diagonals, with collars, flared ends and small cream node cuts. Bottom is a
# reflection of the complete upper group, leaving an eight-unit center gap.
def eight_bamboo():
    def stem(x1, y1, x2, y2):
        import math
        dx, dy = x2-x1, y2-y1
        length = math.hypot(dx, dy)
        angle = math.degrees(math.atan2(dy, dx)) - 90
        collars = "".join(
            f'<path d="M-2.1 {v:.2f}h4.2" stroke="{JADE}" stroke-width="1.8"/>'
            f'<path d="M-.9 {v-.35:.2f}h1.8" stroke="#fff2d2" stroke-width=".65"/>'
            for v in (length*.28, length*.68)
        )
        return (f'<g transform="translate({x1} {y1}) rotate({angle:.4f})">'
                f'<path d="M-1.4 0Q-2.3 {length/2:.2f} -1.4 {length:.2f}h2.8Q2.3 {length/2:.2f} 1.4 0Z" fill="{JADE}"/>'
                f'{collars}<ellipse cy="0" rx="3" ry="1.4" fill="{JADE}"/>'
                '<ellipse cy="0" rx="1.5" ry=".45" fill="#fff2d2"/>'
                f'<ellipse cy="{length:.2f}" rx="2.3" ry="1" fill="{JADE}"/></g>')
    group = (stem(9, 9, 9, 29) + stem(41, 9, 41, 29)
             + stem(10, 18, 40, 28) + stem(10, 28, 40, 18))
    return '<g data-bamboo-group="upper">'+group+'</g><g data-bamboo-group="lower" transform="translate(0 66) scale(1 -1)">'+group+'</g>'


def bamboo(rank):
    if rank == 8:
        return eight_bamboo()
    if rank == 1:
        return BIRD
    marks = []
    for i, (x, y) in enumerate(BAMBOO_LAYOUTS[rank]):
        ink = RUBY if (rank == 5 and i == 2) or (rank == 7 and i == 0) or (rank == 9 and i % 3 == 1) else JADE
        height = 12 if rank in (2,4,6) else 10 if rank == 8 else 8
        half = 6.5 if rank <= 5 else 4.3 if rank == 8 else 5.2
        angle = ([-18,18,-18,18,18,-18,18,-18][i]) if rank == 8 else 0
        marks.append(
            f'<g transform="translate({x} {y}) rotate({angle})" fill="{ink}">'
            f'<path d="M{-half} {-height}H{half}L{half*.78} -3 {half*.78} 3 {half} {height}H{-half}L{-half*.78} 3 {-half*.78} -3Z"/>'
            f'<path d="M{-half*.48} {-height * 0.58:.2f}H{half*.48}M{-half*.48} 0H{half*.48}M{-half*.48} {height * 0.58:.2f}H{half*.48}" '
            'stroke="#fff2d2" stroke-width="1.25" stroke-linecap="round"/></g>'
        )
    return "\n".join(marks)


WHITE_DRAGON = """
<path d="M10 11h30v44H10z" fill="none" stroke="#315c75" stroke-width="3.8"/>
<path d="M15 16h20v34H15z" fill="none" stroke="#315c75" stroke-width="1.9"/>
<path d="M15 21v-5h5m10 0h5v5m0 24v5h-5m-10 0h-5v-5" fill="none" stroke="#315c75" stroke-width="2.6"/>
"""
TILE_BACK = """
<defs><linearGradient id="jade" x2=".8" y2="1"><stop stop-color="#387e69"/><stop offset="1" stop-color="#103d36"/></linearGradient></defs>
<rect width="50" height="66" rx="5" fill="url(#jade)"/>
<rect x="4" y="4" width="42" height="58" rx="3" fill="none" stroke="#a2d3a7" opacity=".55"/>
<rect x="7" y="7" width="36" height="52" rx="2" fill="none" stroke="#9dc6a5" opacity=".28"/>
<path d="M25 18 38 33 25 48 12 33zM25 24l8 9-8 9-8-9z" fill="none" stroke="#afd2ab" opacity=".9"/>
<path d="m25 29 4 4-4 4-4-4z" fill="#c4d6a1"/>
<path d="M11 16v-5h5m18 0h5v5m0 34v5h-5m-18 0h-5v-5" fill="none" stroke="#afd2ab" stroke-width="1.5" opacity=".75"/>
"""
DICE_LAYOUTS = (
    ((16, 16),),
    ((9, 9), (23, 23)),
    ((8, 8), (16, 16), (24, 24)),
    ((9, 9), (23, 9), (9, 23), (23, 23)),
    ((8, 8), (24, 8), (16, 16), (8, 24), (24, 24)),
    tuple((x, y) for y in (8, 16, 24) for x in (9, 23)),
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("font")
    parser.add_argument("--font-index", type=int, default=-1)
    args = parser.parse_args()
    with TTFont(args.font, fontNumber=args.font_index) as font:
        for i, letter in enumerate(CHINESE_NUMBERS):
            wan = glyph(font, letter, 25, 15, 42, 22, INK)
            wan += "\n" + glyph(font, "萬", 25, 48, 42, 29, RUBY)
            write_svg("tiles", i, "0 0 50 66", wan)
            write_svg("tiles", i + 9, "0 0 50 66", circles(i + 1))
            write_svg("tiles", i + 18, "0 0 50 66", bamboo(i + 1))
        for i, letter in enumerate("東南西北中發"):
            color = RUBY if letter == "中" else JADE if letter == "發" else INK
            write_svg("tiles", i + 27, "0 0 50 66", glyph(font, letter, 25, 33, 44, 54, color))
    write_svg("tiles", 33, "0 0 50 66", WHITE_DRAGON)
    write_svg("tiles", "back", "0 0 50 66", TILE_BACK)
    for rank, points in enumerate(DICE_LAYOUTS, 1):
        fill = RUBY if rank in (1, 4) else INK
        radius = 4.2 if rank == 1 else 2.3
        marks = "\n".join(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}"/>' for x, y in points)
        write_svg("dice", rank, "0 0 32 32", marks)


if __name__ == "__main__":
    main()
