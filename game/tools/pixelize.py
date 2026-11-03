#!/usr/bin/env python3
"""원본 일러스트(assets/source/*.jpg)를 게임용 픽셀 아트로 변환한다.

사용법 (game 폴더에서):
    python3 tools/pixelize.py

- assets/jobs/<id>.png       : 직업 카드용 전신 픽셀 일러스트 (72x120)
- assets/portraits/<id>.png  : 대화창 초상화용 흉상 픽셀 아트 (64x64)

크롭 위치나 해상도를 바꾸고 싶으면 아래 PORTRAIT_CROPS / 상수를 수정하고 다시 실행한다.
필요: Pillow (pip install pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source"
OUT_JOBS = ROOT / "assets" / "jobs"
OUT_PORTRAITS = ROOT / "assets" / "portraits"

CARD_SIZE = (72, 120)      # 원본 비율 768x1280 = 0.6
CARD_COLORS = 40
PORTRAIT_SIZE = 64
PORTRAIT_COLORS = 32

# 흉상 크롭 영역 (원본 768x1280 기준 left, top, size)
PORTRAIT_CROPS = {
    "mireille":   (215, 50, 360),
    "hero":       (110, 0, 420),
    "morganite":  (205, 20, 360),
    "aquamarine": (200, 0, 360),
    "amethyst":   (195, 10, 360),
    "heliodor":   (165, 10, 360),
    "ruby":       (170, 10, 360),
}

JOB_IDS = ["morganite", "aquamarine", "amethyst", "ruby", "heliodor"]


def pixelize(img: Image.Image, size, colors: int) -> Image.Image:
    small = img.resize(size, Image.BOX)
    q = small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return q.convert("RGB")


def main():
    OUT_JOBS.mkdir(parents=True, exist_ok=True)
    OUT_PORTRAITS.mkdir(parents=True, exist_ok=True)
    for name, (x, y, s) in PORTRAIT_CROPS.items():
        img = Image.open(SRC / f"{name}.jpg").convert("RGB")
        bust = img.crop((x, y, x + s, y + s))
        pixelize(bust, (PORTRAIT_SIZE, PORTRAIT_SIZE), PORTRAIT_COLORS).save(OUT_PORTRAITS / f"{name}.png")
        if name in JOB_IDS:
            pixelize(img, CARD_SIZE, CARD_COLORS).save(OUT_JOBS / f"{name}.png")
        print("ok", name)


if __name__ == "__main__":
    main()
