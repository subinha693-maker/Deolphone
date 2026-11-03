#!/usr/bin/env python3
"""원본 일러스트(assets/source/*.jpg)에서 초상화 · 직업 카드를 원본 화질로 잘라 낸다.

사용법 (game 폴더에서):  python3 tools/make_art.py
- assets/portraits/<id>.jpg : 대화창 · 상태창 초상화 (360x360)
- assets/jobs/<id>.jpg      : 직업 선택 카드 (전신, 480x800)
크롭 위치는 PORTRAIT_CROPS 를 고친다. 필요: Pillow
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "source"

PORTRAIT_SIZE = 360
CARD_SIZE = (480, 800)
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


def main():
    (ROOT / "assets" / "portraits").mkdir(parents=True, exist_ok=True)
    (ROOT / "assets" / "jobs").mkdir(parents=True, exist_ok=True)
    for name, (x, y, s) in PORTRAIT_CROPS.items():
        img = Image.open(SRC / f"{name}.jpg").convert("RGB")
        img.crop((x, y, x + s, y + s)).resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.LANCZOS) \
            .save(ROOT / "assets" / "portraits" / f"{name}.jpg", quality=88)
        if name in JOB_IDS:
            img.resize(CARD_SIZE, Image.LANCZOS).save(ROOT / "assets" / "jobs" / f"{name}.jpg", quality=86)
        print("ok", name)


if __name__ == "__main__":
    main()
