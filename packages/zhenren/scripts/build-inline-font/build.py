#!/usr/bin/env python3
"""Build the ZhenrenInline derivative font (D21 / D25).

Remaps the Oracular oracle glyphs to the Private Use Area so they can be
inlined in assistant prose without colliding with normal Han codepoints, and
embeds the D17 HUST-OBC image glyphs as an sbix bitmap strike.

This is a BUILD-TIME tool. It is never imported by the plugin runtime.

Outputs (all under packages/zhenren/data):
  fonts/zhenren-inline.woff2   renamed OFL derivative (PUA cmap + sbix)
  fonts/ZhenrenInline-OFL.txt  OFL-1.1 full text + derivative notice
  inline-map.json              glyphChar -> PUA char (consumed by extraction)

Determinism: font glyphs are assigned PUA in ascending source-codepoint order
(U+E000..), image glyphs follow (U+E591..). The same inputs always produce the
same map. The original Oracular font is never modified.

License: Oracular is OFL-1.1 with no Reserved Font Name declaration; the
derivative is renamed per OFL convention and keeps the original copyright.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables._g_l_y_f import Glyph as GlyfGlyph
from fontTools.ttLib.tables._s_b_i_x import Strike
from fontTools.ttLib.tables.sbixGlyph import Glyph as SbixGlyph

HERE = Path(__file__).resolve().parent
DATA = HERE.parent.parent / "data"
FONT_IN = DATA / "fonts" / "orac.woff2"
FONT_OUT = DATA / "fonts" / "zhenren-inline.woff2"
OFL_OUT = DATA / "fonts" / "ZhenrenInline-OFL.txt"
MAP_OUT = DATA / "inline-map.json"
HUST = DATA / "hust-glyphs.json"
# Reference OFL body shipped with the yigezi snapshot (header is wrong; we
# replace it with the correct Oracular copyright below).
OFL_REF = HERE.parent.parent.parent.parent / ".refs" / "yigezi-main" / "licenses" / "OFL-1.1.txt"

PUA_START = 0xE000
PUA_END = 0xF8FF
FAMILY = "ZhenrenInline"
COPYRIGHT = "Copyright (c) Peichao, Qin, 2023. All rights reserved."
OFL_MARKER = "This Font Software is licensed under the SIL Open Font License, Version 1.1."
# sbix strike: images are normalized to 128x128 (see hust-glyphs.json).
STRIKE_PPEM = 128
STRIKE_RES = 72
# Lower the bitmap slightly below the baseline so a square glyph sits in the
# CJK em box (ascent ~0.88em). Offsets are pixels at the strike ppem.
ORIGIN_OFFSET_Y = -16


def ofl_body() -> str:
    """Return the OFL-1.1 body, split on the license marker."""
    text = OFL_REF.read_text(encoding="utf-8")
    idx = text.find(OFL_MARKER)
    if idx < 0:
        raise SystemExit("OFL reference missing license marker; cannot split body")
    return text[idx:].strip()


def write_derivative_ofl() -> None:
    notice = (
        f"{FAMILY} is a renamed derivative of the Oracular font.\n"
        f"Original font: {COPYRIGHT}\n"
        "Derivative: cmap remapped to the Unicode Private Use Area "
        "(U+E000-U+F8FF) and HUST-OBC image glyphs embedded as an sbix strike, "
        "for inline rendering in the zhenren dsh plugin. The original Oracular "
        "font is distributed unmodified alongside this derivative.\n"
        "Oracular's name table declares no Reserved Font Name; the rename "
        "follows OFL-1.1 convention. This derivative is licensed under the "
        "SIL Open Font License, Version 1.1, reproduced below.\n\n"
    )
    OFL_OUT.write_text(notice + ofl_body() + "\n", encoding="utf-8")


def rename_font(font: TTFont) -> None:
    name = font["name"]
    # Windows Unicode BMP names (platform 3, encoding 1, lang 0x409).
    for name_id, value in (
        (1, FAMILY),
        (4, FAMILY),
        (6, FAMILY),
        (16, FAMILY),
        (3, f"{FAMILY}; derivative of Oracular"),
    ):
        name.setName(value, name_id, 3, 1, 0x409)
    # Keep the original copyright (nameID 0) verbatim; add license metadata.
    name.setName(COPYRIGHT, 0, 3, 1, 0x409)
    name.setName(
        "This font is a renamed OFL-1.1 derivative of Oracular. "
        "See ZhenrenInline-OFL.txt for the full license and derivative notice.",
        13, 3, 1, 0x409,
    )
    name.setName("https://openfontlicense.org", 14, 3, 1, 0x409)


def main() -> None:
    font = TTFont(FONT_IN)
    cmap = font.getBestCmap()
    font_chars = sorted(cmap.keys())  # ascending source codepoint
    upem = font["head"].unitsPerEm

    hust = json.loads(HUST.read_text(encoding="utf-8"))
    image_chars = sorted(hust["glyphs"].keys(), key=lambda c: ord(c))

    # --- PUA assignment (deterministic) -----------------------------------
    inline_map: dict[str, str] = {}
    pua_to_glyph: dict[int, str] = {}
    next_pua = PUA_START
    for cp in font_chars:
        if next_pua > PUA_END:
            raise SystemExit("PUA range exhausted by font glyphs")
        inline_map[chr(cp)] = chr(next_pua)
        pua_to_glyph[next_pua] = cmap[cp]  # existing uniXXXX glyph name
        next_pua += 1
    font_pua_end = next_pua - 1

    # --- image glyphs: empty outline + hmtx + sbix bitmap -----------------
    glyf = font["glyf"]
    hmtx = font["hmtx"]
    strike = Strike(ppem=STRIKE_PPEM, resolution=STRIKE_RES)
    image_added = 0
    image_failed: list[str] = []
    for ch in image_chars:
        if next_pua > PUA_END:
            raise SystemExit("PUA range exhausted by image glyphs")
        meta = hust["glyphs"][ch]
        png_path = DATA / meta["file"]
        glyph_name = f"img{ord(ch):04x}"
        try:
            png = png_path.read_bytes()
            if glyph_name not in glyf:
                empty = GlyfGlyph()
                empty.numberOfContours = 0
                # glyf.__setitem__ appends to glyf.glyphOrder automatically.
                glyf[glyph_name] = empty
                hmtx[glyph_name] = (upem, 0)
            strike.glyphs[glyph_name] = SbixGlyph(
                glyphName=glyph_name,
                originOffsetX=0,
                originOffsetY=ORIGIN_OFFSET_Y,
                graphicType="png",
                imageData=png,
            )
            pua_to_glyph[next_pua] = glyph_name
            inline_map[ch] = chr(next_pua)
            next_pua += 1
            image_added += 1
        except Exception as exc:  # per-glyph degradation (D21)
            image_failed.append(f"{ch}: {exc}")

    # glyf.__setitem__ maintained glyf.glyphOrder as glyphs were added; sync
    # the font-level order and maxp to match (maxp.recalc reads len(glyf)).
    font.setGlyphOrder(glyf.glyphOrder)
    font["maxp"].numGlyphs = len(glyf.glyphOrder)

    # --- replace cmap with PUA-only mappings ------------------------------
    # Reuse an existing, properly-constructed subtable and swap its mapping;
    # this avoids rebuilding a format-specific subtable from scratch.
    cmap_table = font["cmap"]
    sub = None
    for t in cmap_table.tables:
        if t.platformID == 3 and t.platEncID in (1, 10):
            sub = t
            break
    if sub is None:
        sub = cmap_table.tables[0]
    sub.cmap = dict(pua_to_glyph)
    cmap_table.tables = [sub]

    # --- attach sbix strike ----------------------------------------------
    if strike.glyphs:
        sbix = newTable("sbix")
        sbix.version = 1
        sbix.strikes = {STRIKE_PPEM: strike}
        font["sbix"] = sbix

    # --- strip vertical metrics ------------------------------------------
    # The derivative is horizontal-only inline rendering; vmtx/vhea are unused.
    # Oracular's vmtx covers the original 1,316 glyphs, but the image glyphs
    # above raised numGlyphs to 1,519 without extending vmtx, so Chrome's OTS
    # sanitizer rejects the whole font ("vmtx: Failed to read side bearing").
    # Dropping both tables removes the inconsistency instead of rebuilding
    # metrics we never read. hmtx was extended per-glyph above, so it stays.
    for tag in ("vmtx", "vhea"):
        if tag in font:
            del font[tag]

    rename_font(font)
    font.save(FONT_OUT)

    MAP_OUT.write_text(
        json.dumps(inline_map, ensure_ascii=False, indent=0, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    write_derivative_ofl()

    print(f"font glyphs mapped : {len(font_chars)} (U+{PUA_START:04X}-U+{font_pua_end:04X})")
    print(f"image glyphs added : {image_added} (sbix ppem {STRIKE_PPEM})")
    print(f"inline-map entries : {len(inline_map)}")
    print(f"derivative bytes   : {FONT_OUT.stat().st_size}")
    if image_failed:
        print("image failures (inline omitted):")
        for line in image_failed:
            print("  " + line)
    # Sanity: every map value is a single PUA char, all unique.
    vals = list(inline_map.values())
    assert len(set(vals)) == len(vals), "PUA collision in inline-map"
    assert all(PUA_START <= ord(v) <= PUA_END and len(v) == 1 for v in vals)
    print("OK: PUA uniqueness + range verified")


if __name__ == "__main__":
    sys.exit(main())