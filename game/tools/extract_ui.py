#!/usr/bin/env python3
"""UI 참고 이미지(assets/ui/source)에서 대화창 · 이름표 · 선택지 버튼 · 구분선을 잘라
배경(검정)을 투명하게 만들고 글자를 지운 뒤 assets/ui/ 에 저장한다.

사용법 (game 폴더에서):  python3 tools/extract_ui.py
필요: Pillow, numpy

CSS 에서는 border-image(9-슬라이스)로 늘려 쓴다. 슬라이스 값은 아래 SLICES 를 출력하므로
css/style.css 의 값과 맞춰야 한다.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "ui" / "source"
OUT = ROOT / "assets" / "ui"

BG_MAX = 26  # 이 값 이하 밝기의 검정은 배경으로 본다


def background_mask(rgb: np.ndarray) -> np.ndarray:
    """가장자리와 이어진 검정 영역 = 배경"""
    dark = (rgb.max(axis=2) <= BG_MAX).astype(np.uint8) * 255
    m = Image.fromarray(dark, "L").copy()
    w, h = m.size
    for xy in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        if m.getpixel(xy) == 255:
            ImageDraw.floodfill(m, xy, 128)
    return np.array(m) == 128


def component(fg: np.ndarray, seed) -> np.ndarray:
    """seed 와 이어진 전경 덩어리"""
    m = Image.fromarray(fg.astype(np.uint8) * 255, "L").copy()
    ImageDraw.floodfill(m, seed, 128)
    return np.array(m) == 128


def to_rgba(rgb, alpha_mask):
    a = np.dstack([rgb, np.where(alpha_mask, 255, 0)]).astype(np.uint8)
    # 검정 테두리 번짐(안티앨리어싱 잔여)을 반투명으로
    lum = rgb.max(axis=2)
    soft = alpha_mask & (lum < 60)
    a[..., 3][soft] = np.clip(lum[soft] * 4, 0, 255)
    return Image.fromarray(a, "RGBA")


def bbox(mask):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def copy_patch(rgb, dst, dx):
    """dst=(x0,y0,x1,y1) 영역을 가로로 dx 만큼 떨어진 깨끗한 영역으로 덮는다"""
    x0, y0, x1, y1 = dst
    rgb[y0:y1, x0:x1] = rgb[y0:y1, x0 + dx:x1 + dx]


def tile_columns(rgb, dst, src_x0, src_x1):
    """dst 영역을 src 열 묶음을 반복해 채운다 (세로 그라데이션 유지)"""
    x0, y0, x1, y1 = dst
    band = rgb[y0:y1, src_x0:src_x1]
    w = src_x1 - src_x0
    for x in range(x0, x1, w):
        n = min(w, x1 - x)
        rgb[y0:y1, x:x + n] = band[:, :n]


def save(img, name):
    # 용량을 줄이기 위해 128색 팔레트로 저장 (도트풍이라 화질 차이가 거의 없다)
    img = img.quantize(colors=128, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
    img.save(OUT / name, optimize=True)
    print("saved", name, img.size)


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    # ---- 1) 이름표가 붙은 대화창 (참고 이미지 1) ----
    rgb = np.array(Image.open(SRC / "ref_dialog_name.png").convert("RGB")).astype(np.int32)
    bg = background_mask(rgb)
    copy_patch(rgb, (222, 682, 410, 745), 520)       # "Text..."
    copy_patch(rgb, (1470, 812, 1515, 848), -220)     # ▼
    tile_columns(rgb, (212, 580, 490, 640), 248, 262)  # "Name" + 양옆 반짝이 (CSS 로 다시 그림)
    fg = ~bg
    x0, y0, x1, y1 = bbox(fg)
    img = to_rgba(rgb.clip(0, 255), fg).crop((x0, y0, x1, y1))
    save(img, "dialog_named.png")
    print("  dialog_named origin", (x0, y0))

    # ---- 2) 이름표 없는 대화창 + 선택지 (참고 이미지 2) ----
    rgb = np.array(Image.open(SRC / "ref_dialog_choice.png").convert("RGB")).astype(np.int32)
    bg = background_mask(rgb)
    fg = ~bg
    # 대화창
    copy_patch(rgb, (222, 690, 640, 748), 560)        # "선택지를 선택해 주세요."
    copy_patch(rgb, (1470, 815, 1515, 850), -220)     # ▼
    box = component(fg, (800, 760))
    bx = bbox(box)
    save(to_rgba(rgb.clip(0, 255), box).crop(bx), "dialog_plain.png")
    print("  dialog_plain origin", bx[:2])

    # 선택지 버튼: 글자 지우기 (가운데를 깨끗한 열로 채움)
    tile_columns(rgb, (700, 236, 980, 296), 680, 700)   # "선택지 1"
    tile_columns(rgb, (700, 376, 980, 436), 680, 700)   # "선택지 2"
    for name, seed in [("choice_light.png", (800, 230)), ("choice_dark.png", (800, 380))]:
        c = component(fg, seed)
        b = bbox(c)
        save(to_rgba(rgb.clip(0, 255), c).crop(b), name)
        print("  ", name, "origin", b[:2])

    # 구분선
    for name, rows in [("divider_top.png", (140, 190)), ("divider_bottom.png", (477, 514))]:
        sub = np.zeros_like(fg)
        sub[rows[0]:rows[1], 560:1110] = fg[rows[0]:rows[1], 560:1110]
        b = bbox(sub)
        save(to_rgba(rgb.clip(0, 255), sub).crop(b), name)


if __name__ == "__main__":
    main()
