#!/usr/bin/env python3
"""Cut the character sprite sheets in tools/source into transparent animation frames.

Output:
  assets/sprites/<id>.png      — horizontal atlas with every frame
  js/data/spriteData.js        — frame rectangles and anchors (MG.SPRITE_DATA)

Usage: python3 tools/extract_sprites.py   (run from the magical-roguelike folder)
Needs: pillow, numpy, scipy
"""
import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'source')
OUT_IMG = os.path.join(ROOT, 'assets', 'sprites')
OUT_JS = os.path.join(ROOT, 'js', 'data', 'spriteData.js')

SCALE = 0.5  # frames are stored at half size and drawn with nearest-neighbour for a pixel look

# Sheets have two slightly different layouts (offset of ~2px). (top, bottom) of each row box.
LAYOUT_A = {'idle': (33, 200), 'walk': (243, 412), 'melee': (455, 629),
            'spin': (673, 846), 'proj': (890, 1074), 'hurt': (1118, 1332)}
LAYOUT_B = {k: (a - 2, b - 2) for k, (a, b) in LAYOUT_A.items()}

CELLS = {
    'idle': [(0, 270)],
    'walk': [(10, 275), (275, 525), (525, 790)],
    'melee': [(2, 200), (200, 400), (400, 600), (600, 798)],
    'spin': [(2, 200), (200, 400), (400, 600), (600, 798)],
    'proj': [(2, 200), (200, 400), (400, 600), (600, 798)],
    'hurt': [(10, 275), (275, 525), (525, 790)],
}

def auto_layout(fname):
    """Find the six row titles (dark text at the left edge) and derive the row bands."""
    im = np.array(Image.open(os.path.join(SRC, fname)).convert('RGB')).astype(int)
    g = im.mean(axis=2)
    dark = (g[:, 8:60] < 70).sum(axis=1)
    groups = []
    for y in [y for y in range(len(dark)) if dark[y] > 3]:
        if groups and y - groups[-1][-1] <= 4:
            groups[-1].append(y)
        else:
            groups.append([y])
    expected = [0, 215, 430, 645, 865, 1090]
    titles = []
    for e in expected:
        cand = [gr for gr in groups if gr[-1] - gr[0] > 8 and abs(gr[0] - e) < 30]
        titles.append(cand[0])
    names = ['idle', 'walk', 'melee', 'spin', 'proj', 'hurt']
    out = {}
    for i, n in enumerate(names):
        top = titles[i][-1] + 5
        bot = titles[i + 1][0] - 4 if i + 1 < len(titles) else im.shape[0] - 1
        out[n] = (top, bot)
    return out


CHECKER_SHEETS = {'elysia', 'cecilia', 'nero'}

SHEETS = {
    'amore': ('sheet_amore.png', LAYOUT_A),
    'luna': ('sheet_luna.png', LAYOUT_A),
    'sylphy': ('sheet_sylphy.png', LAYOUT_A),
    'rozel': ('sheet_rozel.png', LAYOUT_B),
    'bella': ('sheet_bella.png', LAYOUT_B),
    'cheongryeon': ('sheet_cheongryeon.png', LAYOUT_B),
    'serin': ('sheet_serin.png', 'auto'),
    'noa': ('sheet_noa.png', 'auto'),
    'elysia': ('sheet_elysia.png', 'auto'),
    'cecilia': ('sheet_cecilia.png', 'auto'),
    'nero': ('sheet_nero.png', 'auto'),
}


def remove_background(cell, checker=False):
    """cell: HxWx3 uint8. Returns RGBA with the paper/grid background made transparent."""
    c = cell.astype(int)
    g = c.mean(axis=2)
    sat = c.max(axis=2) - c.min(axis=2)
    h, w = g.shape
    bg_like = (g >= 176) & (sat < 24)
    if checker:
        # baked 'transparency' checkerboard: pure greys (255 / ~212) only, so pale hair and skin survive
        bg_like = (g >= 200) & (sat <= 7)
    # straight grid lines that are darker than the paper: wipe them where they are grey
    greyish = (sat < 24) & (g >= 120) & (g < 236)
    for x in range(w):
        if greyish[:, x].mean() > 0.45:
            bg_like[:, x] |= greyish[:, x]
    for y in range(h):
        if greyish[y, :].mean() > 0.45:
            bg_like[y, :] |= greyish[y, :]
    # flood fill background from the cell border
    lab, _ = ndimage.label(bg_like)
    border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    fg = ~bg
    # drop tiny specks and the text labels ("Walk 1", "Attack 2"...) at the top of a box
    flab, n = ndimage.label(fg)
    keep = np.zeros_like(fg)
    for i, sl in enumerate(ndimage.find_objects(flab), start=1):
        comp = flab[sl] == i
        area = int(comp.sum())
        y0, y1 = sl[0].start, sl[0].stop
        if area < 12:
            continue
        if y1 < 30 and (y1 - y0) < 22 and area < 900:
            continue  # label text
        keep[sl] |= comp
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    # soften the edge pixels that were near-white (anti-aliased halo)
    edge = keep & ~ndimage.binary_erosion(keep)
    soft = edge & (g > 215) & (sat < 30)
    alpha[soft] = 110
    rgba = np.dstack([cell, alpha])
    return rgba, keep


def extract(char_id, fname, layout, checker=False):
    im = np.array(Image.open(os.path.join(SRC, fname)).convert('RGB'))
    H = im.shape[0]
    frames = {}
    images = []
    for anim, (top, bot) in layout.items():
        bot = min(bot, H - 1)
        floor = bot  # anchor line = bottom of the row box
        frames[anim] = []
        for (x0, x1) in CELLS[anim]:
            cell = im[top:bot, x0:x1]
            rgba, keep = remove_background(cell, checker)
            ys, xs = np.nonzero(keep)
            if len(xs) == 0:
                continue
            bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
            crop = Image.fromarray(rgba[by0:by1, bx0:bx1], 'RGBA')
            cw, ch = crop.size
            crop = crop.resize((max(1, round(cw * SCALE)), max(1, round(ch * SCALE))), Image.LANCZOS)
            anchor_x = (x0 + x1) / 2 - x0  # cell centre
            frames[anim].append({
                'img': crop,
                'ox': round((bx0 - anchor_x) * SCALE),        # offset from anchor (feet centre)
                'oy': round((by0 - (floor - top)) * SCALE),
            })
            images.append(crop)
    # pack into one horizontal atlas
    total_w = sum(f['img'].size[0] + 2 for a in frames.values() for f in a)
    max_h = max(f['img'].size[1] for a in frames.values() for f in a)
    atlas = Image.new('RGBA', (total_w, max_h), (0, 0, 0, 0))
    meta = {}
    x = 0
    for anim, lst in frames.items():
        meta[anim] = []
        for f in lst:
            w, h = f['img'].size
            atlas.paste(f['img'], (x, 0))
            meta[anim].append({'x': x, 'y': 0, 'w': w, 'h': h, 'ox': f['ox'], 'oy': f['oy']})
            x += w + 2
    atlas.save(os.path.join(OUT_IMG, char_id + '.png'), optimize=True)
    return meta


def main():
    os.makedirs(OUT_IMG, exist_ok=True)
    data = {}
    for cid, (fname, layout) in SHEETS.items():
        checker = cid in CHECKER_SHEETS
        if layout == 'auto':
            layout = auto_layout(fname)
        data[cid] = extract(cid, fname, layout, checker)
        print(cid, {k: len(v) for k, v in data[cid].items()})
    with open(OUT_JS, 'w', encoding='utf-8') as fp:
        fp.write('// Generated by tools/extract_sprites.py — do not edit by hand.\n')
        fp.write('window.MG = window.MG || {};\n')
        fp.write('window.MG.SPRITE_DATA = ' + json.dumps(data, separators=(',', ':')) + ';\n')
    print('wrote', OUT_JS)


if __name__ == '__main__':
    sys.exit(main())
