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
    ((17, 21), (33, 45)),
    ((14, 16), (25, 33), (36, 50)),
    ((15, 22), (35, 22), (15, 44), (35, 44)),
    ((14, 17), (36, 17), (25, 33), (14, 49), (36, 49)),
    tuple((x, y) for y in (15, 33, 51) for x in (16, 34)),
    ((11, 10), (25, 19), (39, 28), (15, 39), (35, 39), (15, 54), (35, 54)),
    tuple((x, y) for y in (12, 26, 40, 54) for x in (16, 34)),
    tuple((x, y) for y in (15, 33, 51) for x in (11, 25, 39)),
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
    return f'<path fill="{color}" transform="translate({dx:.3f} {dy:.3f}) scale({scale:.5f} {-scale:.5f})" d="{path.getCommands()}"/>'


def circles(rank):
    radius = (17, 9, 7.8, 7.2, 6.8, 6.6, 5.4, 5.6, 5.4)[rank - 1]
    marks = []
    for i, (x, y) in enumerate(PIP_LAYOUTS[rank - 1]):
        if rank == 1 or (rank == 5 and i == 2) or (rank == 9 and 3 <= i < 6):
            ink = RUBY
        elif rank == 8 or (rank == 7 and i < 3) or rank in (2, 4, 6):
            ink = BLUE
        else:
            ink = JADE
        marks.append(
            f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{ink}"/>'
            f'<circle cx="{x}" cy="{y}" r="{radius * .62}" fill="none" stroke="#faf5df" stroke-width="{2.2 if rank == 1 else 1.15}"/>'
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
    2: ((15, 33), (35, 33)),
    3: ((25, 16), (16, 46), (34, 46)),
    4: PIP_LAYOUTS[3],
    5: ((13, 17), (37, 17), (25, 33), (13, 49), (37, 49)),
    6: PIP_LAYOUTS[5],
    7: ((25, 12), (11, 31), (25, 31), (39, 31), (11, 52), (25, 52), (39, 52)),
    8: tuple((x, y) for y in (11, 26, 41, 56) for x in (15, 35)),
    9: PIP_LAYOUTS[8],
}


def bamboo(rank):
    if rank == 1:
        return BIRD
    marks = []
    for i, (x, y) in enumerate(BAMBOO_LAYOUTS[rank]):
        ink = RUBY if (rank == 5 and i == 2) or (rank == 7 and i == 0) or (rank == 9 and i % 3 == 1) else JADE
        height = 19 if rank == 2 else 7 if rank == 8 else 8
        half = 4.3 if rank <= 6 else 3.8
        angle = (12 if (i % 2) == ((i // 2) % 2) else -12) if rank == 8 else 0
        marks.append(
            f'<g transform="translate({x} {y}) rotate({angle})" fill="{ink}">'
            f'<path d="M{-half} {-height}H{half}L3 -3 3 3 {half} {height}H{-half}L-3 3 -3 -3Z"/>'
            f'<path d="M-2 {-height * 0.58:.2f}H2M-2 0H2M-2 {height * 0.58:.2f}H2" '
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
            wan = glyph(font, letter, 25, 20, 33, 22, INK)
            wan += "\n" + glyph(font, "萬", 25, 45, 34, 25, RUBY)
            write_svg("tiles", i, "0 0 50 66", wan)
            write_svg("tiles", i + 9, "0 0 50 66", circles(i + 1))
            write_svg("tiles", i + 18, "0 0 50 66", bamboo(i + 1))
        for i, letter in enumerate("東南西北中發"):
            color = RUBY if letter == "中" else JADE if letter == "發" else INK
            write_svg("tiles", i + 27, "0 0 50 66", glyph(font, letter, 25, 33, 39, 44, color))
    write_svg("tiles", 33, "0 0 50 66", WHITE_DRAGON)
    write_svg("tiles", "back", "0 0 50 66", TILE_BACK)
    for rank, points in enumerate(DICE_LAYOUTS, 1):
        fill = RUBY if rank in (1, 4) else INK
        radius = 4.2 if rank == 1 else 2.3
        marks = "\n".join(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}"/>' for x, y in points)
        write_svg("dice", rank, "0 0 32 32", marks)


if __name__ == "__main__":
    main()
