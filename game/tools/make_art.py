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

# 표정 시트 → 표정별 초상화  (원본 시트 기준 left, top, size)
#   assets/portraits/<캐릭터>_<표정>.jpg  — characters.js 의 expressions 와 이름을 맞춘다
EXPRESSION_SHEETS = {
    "claire": ("claire_sheet.png", {
        "normal":      (430, 40, 245),
        "embarrassed": (697, 40, 245),
        "confused":    (977, 40, 245),
        "surprised":   (1257, 40, 245),
        "happy":       (432, 412, 245),
        "closed":      (712, 412, 245),
        "annoyed":     (988, 412, 245),
        "sulky":       (1266, 412, 245),
    }),
    "mayer": ("mayer_sheet.png", {
        "normal":    (714, 24, 186),
        "serious":   (914, 24, 186),
        "smile":     (1112, 24, 186),
        "gentle":    (714, 241, 186),
        "happy":     (914, 241, 186),
        "talk":      (1112, 241, 186),
        "surprised": (714, 457, 186),
        "troubled":  (914, 457, 186),
        "closed":    (1112, 457, 186),
    }),
}
# 클로즈업 연출용 큰 그림 (left, top, right, bottom)
CLOSEUPS = {
    "mayer": ("mayer_sheet.png", (362, 22, 692, 690)),
}


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
    for who, (sheet, exprs) in EXPRESSION_SHEETS.items():
        img = Image.open(SRC / sheet).convert("RGB")
        for expr, (x, y, sz) in exprs.items():
            img.crop((x, y, x + sz, y + sz)).resize((PORTRAIT_SIZE, PORTRAIT_SIZE), Image.LANCZOS) \
                .save(ROOT / "assets" / "portraits" / f"{who}_{expr}.jpg", quality=88)
        print("ok expressions", who, len(exprs))
    for who, (sheet, box) in CLOSEUPS.items():
        img = Image.open(SRC / sheet).convert("RGB").crop(box)
        img.resize((360, round(360 * img.height / img.width)), Image.LANCZOS) \
            .save(ROOT / "assets" / "portraits" / f"{who}_closeup.jpg", quality=86)
        print("ok closeup", who)


if __name__ == "__main__":
    main()
