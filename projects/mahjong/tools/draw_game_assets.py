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
    ((12, 13), (25, 22), (38, 13), (13, 34), (37, 34), (13, 52), (37, 52)),
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
    radius = (15, 7.5, 6.5, 6.7, 5.6, 5.3, 4.7, 4.6, 4.5)[rank - 1]
    marks = []
    for i, (x, y) in enumerate(PIP_LAYOUTS[rank - 1]):
        ink = RUBY if rank == 1 or (rank == 5 and i == 2) else BLUE if i % 3 == 0 else JADE
        marks.append(
            f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{ink}"/>'
            f'<circle cx="{x}" cy="{y}" r="{radius * .62}" fill="none" stroke="#faf5df" stroke-width="{1.4 if rank == 1 else .8}"/>'
        )
    if rank == 1:
        marks.append('<circle cx="25" cy="33" r="5" fill="#faf5df"/><circle cx="25" cy="33" r="2.5" fill="#a3322f"/>')
    return "\n".join(marks)


BIRD = """
<path d="M29 53q-5-1-8-7C11 45 8 34 9 22l10 8q0-8 3-11l4 10c5-1 9 1 11 5 4-6 1-12 4-17 3-5 9-4 8 1l-5 5c2 15-2 26-15 30Z" fill="#23674d"/>
<path d="M12 31q8 11 18 10-7 2-12-1m9 10-4 8m8-7 1 5" fill="none" stroke="#8ab386" stroke-width="2" stroke-linecap="round"/>
<path d="m43 15 3-5 1 4 3-3-1 6-6 2Z" fill="#a3322f"/>
<circle cx="45.5" cy="18" r="1" fill="#f7efd7"/>
"""
BAMBOO_LAYOUTS = {
    2: ((25, 19), (25, 47)),
    3: ((25, 16), (16, 46), (34, 46)),
    4: PIP_LAYOUTS[3],
    5: ((13, 17), (37, 17), (25, 33), (13, 49), (37, 49)),
    6: PIP_LAYOUTS[5],
    7: ((25, 12), (12, 29), (25, 29), (38, 29), (12, 49), (25, 49), (38, 49)),
    8: PIP_LAYOUTS[7],
    9: PIP_LAYOUTS[8],
}


def bamboo(rank):
    if rank == 1:
        return BIRD
    marks = []
    for i, (x, y) in enumerate(BAMBOO_LAYOUTS[rank]):
        ink = RUBY if (rank == 5 and i == 2) or (rank == 7 and i == 0) or (rank == 9 and i % 3 == 1) else JADE
        marks.append(
            f'<g transform="translate({x} {y})" fill="{ink}">'
            '<rect x="-3.7" y="-7" width="7.4" height="14" rx="2.8"/>'
            '<path d="M-2.7 0H2.7" stroke="#f7efd7" stroke-width="1"/>'
            '</g>'
        )
    return "\n".join(marks)


WHITE_DRAGON = """
<path d="M13 12h24v42H13z" fill="none" stroke="#315c75" stroke-width="2.8"/>
<path d="M17 16h16v34H17z" fill="none" stroke="#315c75" stroke-width="1.1"/>
<path d="M17 20v-4h4m8 0h4v4m0 26v4h-4m-8 0h-4v-4" fill="none" stroke="#315c75" stroke-width="2.6"/>
"""
TILE_BACK = """
<defs><linearGradient id="jade" x2=".8" y2="1"><stop stop-color="#387e69"/><stop offset="1" stop-color="#103d36"/></linearGradient></defs>
<rect width="50" height="66" rx="5" fill="url(#jade)"/>
<rect x="4" y="4" width="42" height="58" rx="3" fill="none" stroke="#a2d3a7" opacity=".55"/>
<rect x="7" y="7" width="36" height="52" rx="2" fill="none" stroke="#9dc6a5" opacity=".28"/>
<path d="M25 18 38 33 25 48 12 33zM25 24l8 9-8 9-8-9z" fill="none" stroke="#afd2ab" opacity=".9"/>
<path d="m25 29 4 4-4 4-4-4z" fill="#c4d6a1"/>
<path d="M11 16v-5h5m18 0h5v5m0 34v5h-5m-18 0h-5v-5" fill="none" stroke="#afd2ab" opacity=".65"/>
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
            wan = glyph(font, letter, 25, 21, 29, 20, INK)
            wan += "\n" + glyph(font, "萬", 25, 44, 29, 23, RUBY)
            write_svg("tiles", i, "0 0 50 66", wan)
            write_svg("tiles", i + 9, "0 0 50 66", circles(i + 1))
            write_svg("tiles", i + 18, "0 0 50 66", bamboo(i + 1))
        for i, letter in enumerate("東南西北中發"):
            color = RUBY if letter == "中" else JADE if letter == "發" else INK
            write_svg("tiles", i + 27, "0 0 50 66", glyph(font, letter, 25, 33, 35, 38, color))
    write_svg("tiles", 33, "0 0 50 66", WHITE_DRAGON)
    write_svg("tiles", "back", "0 0 50 66", TILE_BACK)
    for rank, points in enumerate(DICE_LAYOUTS, 1):
        fill = RUBY if rank in (1, 4) else INK
        radius = 4.2 if rank == 1 else 2.3
        marks = "\n".join(f'<circle cx="{x}" cy="{y}" r="{radius}" fill="{fill}"/>' for x, y in points)
        write_svg("dice", rank, "0 0 32 32", marks)


if __name__ == "__main__":
    main()
