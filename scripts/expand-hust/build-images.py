#!/usr/bin/env python3
"""Build-time glyph image pipeline (D17).

For each character in selection.json, pick one representative HUST-OBC image,
normalize it to a clean ink-alpha mask, and write a small PNG plus a provenance
manifest consumed by the extractor.

Normalization (avoids the "rubbing sticker" look):
  grayscale -> polarity check -> ink-alpha ramp -> crop to ink bbox ->
  pad to square (~12% margin) -> resize to 128x128 -> RGBA(0,0,0,alpha).
The client tints this mask with the carve ink color, so font and image glyphs
share one visual style.

Deterministic: source priority X>G>Y>H>L, then a quality score, then filename.
No randomness. Re-running never overwrites selection.json.

Usage: python -I build-images.py [--hust DIR] [--out DIR]
"""
import argparse
import json
import os
import re
import sys
from datetime import date

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
PKG = os.path.abspath(os.path.join(HERE, "..", ".."))
ROOT = os.path.abspath(os.path.join(PKG, "..", ".."))
DEFAULT_HUST = os.path.join(ROOT, ".refs", "HUST-OBC", "HUST-OBC", "deciphered")

OUT_SIZE = 128
MARGIN = 0.12  # fraction of the ink bbox added as margin on each side
SOURCE_NAME = {
    "X": "新甲骨文编",
    "G": "国学大师",
    "Y": "殷契文渊",
    "H": "HWOBC",
    "L": "六位数字编码",
}
SOURCE_RANK = {"X": 0, "G": 1, "Y": 2, "H": 3, "L": 4}


def load_maps(hust):
    id2ch = json.load(open(os.path.join(hust, "ID_to_chinese.json"), encoding="utf-8"))
    ch2id = json.load(open(os.path.join(hust, "chinese_to_ID.json"), encoding="utf-8"))
    id2dir = {}
    for d in os.listdir(hust):
        if os.path.isdir(os.path.join(hust, d)):
            for part in d.split("_"):
                id2dir[part] = d
    return id2ch, ch2id, id2dir


def files_for(hust, id2dir, cid):
    d = id2dir.get(cid)
    if d is None:
        return []
    out = []
    for base in (os.path.join(hust, d), os.path.join(hust, d, cid)):
        if os.path.isdir(base):
            for f in os.listdir(base):
                if f.lower().endswith((".png", ".jpg")) and f"_{cid}_" in f:
                    out.append(os.path.join(base, f))
    return sorted(out)


def parse_name(path):
    name = os.path.basename(path)
    stem = os.path.splitext(name)[0]
    parts = stem.split("_", 2)
    src = parts[0]
    citation = parts[2] if len(parts) > 2 else ""
    collection = None
    group = None
    m = re.search(r"合(\d+)(.*)$", citation)
    if m:
        collection = m.group(1)
        group = m.group(2).strip() or None
    return src, citation, collection, group


def grayscale(path):
    return Image.open(path).convert("L")


def ink_alpha(im):
    """Return (alpha 'L' image, ink_ratio, bbox) with background transparent."""
    a = np.asarray(im, dtype=np.float32)
    h, w = a.shape
    border = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
    border_mean = float(border.mean())
    ink_level = float(np.percentile(a, 10))
    bg_level = float(np.percentile(a, 90))
    inverted = False
    if border_mean < 110 and ink_level > border_mean:
        # Dark background (rubbing): invert so ink becomes dark-on-light.
        a = 255 - a
        ink_level, bg_level = 255 - bg_level, 255 - ink_level
        inverted = True
    if bg_level <= ink_level:
        bg_level = ink_level + 1
    alpha = np.clip((bg_level - a) / (bg_level - ink_level) * 255, 0, 255).astype(np.uint8)
    mask = alpha > 30
    ink_count = int(mask.sum())
    ratio = ink_count / (w * h)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        bbox = None
    else:
        bbox = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return Image.fromarray(alpha, "L"), ratio, bbox, inverted


def quality_score(im, ratio, bbox):
    """Higher is better. Prefer moderate ink coverage and adequate resolution."""
    if bbox is None:
        return -1.0
    w, h = im.size
    bw, bh = bbox[2] - bbox[0], bbox[3] - bbox[1]
    if bw < 4 or bh < 4:
        return -1.0
    if ratio < 0.02 or ratio > 0.75:
        return -1.0
    # Resolution term: reward larger source images (sharper after upscale).
    res = min(w, h) / 60.0
    if res > 1.0:
        res = 1.0
    # Coverage term: peak around 0.30 ink ratio.
    cov = 1.0 - abs(ratio - 0.30) / 0.30
    if cov < 0:
        cov = 0
    return res * 0.6 + cov * 0.4


def pick_image(paths):
    scored = []
    for p in paths:
        src, citation, collection, group = parse_name(p)
        try:
            im = grayscale(p)
        except Exception:
            continue
        alpha, ratio, bbox, inverted = ink_alpha(im)
        q = quality_score(im, ratio, bbox)
        if q < 0:
            continue
        scored.append((SOURCE_RANK.get(src, 9), -q, os.path.basename(p), p,
                       src, citation, collection, group, im, alpha, bbox, inverted))
    if not scored:
        return None
    scored.sort(key=lambda t: (t[0], t[1], t[2]))
    return scored[0]


def normalize_to_png(alpha, bbox, dest):
    minx, miny, maxx, maxy = bbox
    crop = alpha.crop((minx, miny, maxx, maxy))
    bw, bh = crop.size
    side = int(max(bw, bh) * (1 + 2 * MARGIN))
    canvas = Image.new("L", (side, side), 0)
    canvas.paste(crop, ((side - bw) // 2, (side - bh) // 2))
    canvas = canvas.resize((OUT_SIZE, OUT_SIZE), Image.LANCZOS)
    # Gentle contrast curve so ink is solid but edges stay antialiased.
    canvas = canvas.point(lambda v: min(255, int((v / 255) ** 0.85 * 255)))
    rgba = Image.merge("RGBA", (Image.new("L", canvas.size, 0),
                                Image.new("L", canvas.size, 0),
                                Image.new("L", canvas.size, 0), canvas))
    rgba.save(dest, "PNG", optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--hust", default=DEFAULT_HUST)
    ap.add_argument("--out", default=os.path.join(PKG, "data"))
    args = ap.parse_args()

    sel = json.load(open(os.path.join(HERE, "selection.json"), encoding="utf-8"))
    chars = [(c, 1) for c in sel["tier1"]] + [(c, 2) for c in sel["tier2"]]
    id2ch, ch2id, id2dir = load_maps(args.hust)

    glyph_dir = os.path.join(args.out, "glyphs")
    os.makedirs(glyph_dir, exist_ok=True)

    glyphs = {}
    rejected = []
    for ch, tier in chars:
        cid = ch2id.get(ch)
        if cid is None:
            rejected.append((ch, "not-in-hust"))
            continue
        cid = str(cid)
        paths = files_for(args.hust, id2dir, cid)
        pick = pick_image(paths)
        if pick is None:
            rejected.append((ch, "no-quality-image"))
            continue
        _, _, _, path, src, citation, collection, group, im, alpha, bbox, inverted = pick
        hexname = format(ord(ch), "x")
        rel = f"glyphs/{hexname}.png"
        normalize_to_png(alpha, bbox, os.path.join(args.out, rel))
        glyphs[ch] = {
            "file": rel,
            "hustId": cid,
            "source": SOURCE_NAME.get(src, src),
            "sourceCode": src,
            "citation": citation,
            "collection": collection,
            "group": group,
            "tier": tier,
            "originalFile": os.path.basename(path),
            "inverted": inverted,
        }

    manifest = {
        "schemaVersion": 1,
        "generatedAt": date.today().isoformat(),
        "source": "HUST-OBC deciphered (arXiv 2401.15365)",
        "normalization": {"size": OUT_SIZE, "margin": MARGIN, "ink": "black-on-transparent"},
        "counts": {"selected": len(chars), "written": len(glyphs), "rejected": len(rejected)},
        "glyphs": glyphs,
    }
    with open(os.path.join(args.out, "hust-glyphs.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print(f"selected={len(chars)} written={len(glyphs)} rejected={len(rejected)}")
    if rejected:
        print("rejected:", ", ".join(f"{c}({r})" for c, r in rejected))
    by_src = {}
    for g in glyphs.values():
        by_src[g["sourceCode"]] = by_src.get(g["sourceCode"], 0) + 1
    print("by source:", json.dumps(by_src, sort_keys=True))
    inv = [c for c, g in glyphs.items() if g["inverted"]]
    print("inverted (dark-bg):", "".join(inv) or "none")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()