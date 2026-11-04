#!/usr/bin/env python3
"""Cut the gothic-lolita UI reference images into reusable transparent UI pieces.

Output (assets/ui): dialog_box.png, name_tab.png, choice_light.png, choice_dark.png, divider.png
Placeholder text in the references ("Name", "Text...", "선택지 1") is painted over with the
surrounding fill colour so the game can render its own text.
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'tools', 'source')
OUT = os.path.join(ROOT, 'assets', 'ui')


def transparent_black(arr):
    """Flood-fill the near-black backdrop from the image edges and make it transparent."""
    c = arr[:, :, :3].astype(int)
    dark = c.max(axis=2) < 26
    lab, _ = ndimage.label(dark)
    border = set(np.unique(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # soften pixels bordering the backdrop
    edge = (~bg) & ndimage.binary_dilation(bg)
    alpha[edge] = 200
    return np.dstack([arr[:, :, :3], alpha])


def paint_over(arr, box, sample_at):
    """Fill box (x0,y0,x1,y1) with the median colour around sample_at (x, y)."""
    x0, y0, x1, y1 = box
    sx, sy = sample_at
    patch = arr[sy - 3:sy + 4, sx - 3:sx + 4, :3].reshape(-1, 3)
    col = np.median(patch, axis=0).astype(np.uint8)
    arr[y0:y1, x0:x1, :3] = col


def crop_save(arr, box, name):
    x0, y0, x1, y1 = box
    piece = transparent_black(arr[y0:y1, x0:x1].copy())
    ys, xs = np.nonzero(piece[:, :, 3])
    piece = piece[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    Image.fromarray(piece, 'RGBA').save(os.path.join(OUT, name), optimize=True)
    print(name, piece.shape[1], 'x', piece.shape[0])


def main():
    os.makedirs(OUT, exist_ok=True)
    dlg = np.array(Image.open(os.path.join(SRC, 'ui_dialog.png')).convert('RGB'))
    cho = np.array(Image.open(os.path.join(SRC, 'ui_choice.png')).convert('RGB'))

    # Dialog box without name tab (from the choice reference) — text area cleared
    paint_over(cho, (215, 690, 700, 750), (700, 770))
    crop_save(cho, (0, 560, 1672, 941), 'dialog_box.png')

    # Name tab (from the dialog reference) — "Name" cleared
    paint_over(dlg, (262, 585, 430, 632), (440, 608))
    crop_save(dlg, (180, 555, 545, 660), 'name_tab.png')

    # Choice buttons — labels cleared
    paint_over(cho, (760, 240, 910, 292), (720, 266))
    crop_save(cho, (380, 195, 1290, 350), 'choice_light.png')
    paint_over(cho, (760, 380, 910, 432), (720, 406))
    crop_save(cho, (420, 345, 1290, 480), 'choice_dark.png')

    # Decorative divider
    crop_save(cho, (580, 140, 1090, 195), 'divider.png')


if __name__ == '__main__':
    main()
