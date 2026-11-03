#!/usr/bin/env python3
"""쯔꾸르풍 SD 도트 캐릭터 생성기
------------------------------------------------------------
각 캐릭터를 레이어(뒷머리 → 몸/옷 → 얼굴 → 앞머리 → 장식) 순서로 그린 뒤
  - 레이어 경계에 자동 외곽선(같은 계열의 진한 색, selout)
  - 아래·오른쪽 가장자리에 자동 음영
을 적용해 32x48 스프라이트를 만든다.

사용법 (game 폴더에서):  python3 tools/dots.py
  → js/render/dots.js       (게임에서 쓰는 도트 데이터)
  → tools/dots_preview.png  (확인용 확대 미리보기)

캐릭터를 고치려면 아래 draw_* 함수를 수정하고 다시 실행한다.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import colorsys, json

ROOT = Path(__file__).resolve().parent.parent
W, H = 32, 48


def hx(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def tohex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in rgb)


def shade(c, dv=-0.16, ds=0.06, dh=0.0):
    r, g, b = [v / 255 for v in hx(c)]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    # 그림자는 살짝 보라/붉은 쪽으로 (쯔꾸르 도트 느낌)
    h = (h + dh) % 1
    s = min(1, max(0, s + ds))
    v = min(1, max(0, v + dv))
    return tohex([x * 255 for x in colorsys.hsv_to_rgb(h, s, v)])


def outline_of(c):
    r, g, b = hx(c)
    o = hx('#2b1b2a')
    k = 0.62
    return tohex([r * (1 - k) + o[0] * k, g * (1 - k) + o[1] * k, b * (1 - k) + o[2] * k])


class Layer:
    def __init__(self, name, base, outline=True, autoshade=True, ol=None, sh=None):
        self.name = name
        self.base = base
        self.outline = outline
        self.autoshade = autoshade
        self.ol = ol or outline_of(base)
        self.sh = sh or shade(base)


class Sprite:
    def __init__(self):
        self.cells = [[None] * W for _ in range(H)]   # (color, layer, z, tone)
        self.z = 0
        self.layer = None

    def use(self, layer):
        self.z += 1
        self.layer = layer
        return self

    # ---- 기본 도형 ----
    def px(self, x, y, color=None, tone='b'):
        if 0 <= x < W and 0 <= y < H:
            L = self.layer
            c = color or (L.base if tone == 'b' else L.sh if tone == 's' else L.ol)
            self.cells[y][x] = (c, L, self.z, tone if color is None else 'x')

    def erase(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            self.cells[y][x] = None

    def mask(self, draw_fn):
        m = Image.new('1', (W, H), 0)
        draw_fn(ImageDraw.Draw(m))
        return [(x, y) for y in range(H) for x in range(W) if m.getpixel((x, y))]

    def ellipse(self, box, color=None, tone='b', mirror=False, ymax=99):
        for x, y in self.mask(lambda d: d.ellipse(box, fill=1)):
            if y <= ymax:
                self.px(x, y, color, tone)

    def poly(self, pts, color=None, tone='b', mirror=False):
        pts = [tuple(p) for p in pts]
        for x, y in self.mask(lambda d: d.polygon(pts, fill=1)):
            self.px(x, y, color, tone)
        if mirror:
            self.poly([(W - 1 - x, y) for x, y in pts], color, tone)

    def rect(self, x0, y0, x1, y1, color=None, tone='b', mirror=False):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, color, tone)
                if mirror:
                    self.px(W - 1 - x, y, color, tone)

    def pts(self, coords, color=None, tone='b', mirror=False):
        for x, y in coords:
            self.px(x, y, color, tone)
            if mirror:
                self.px(W - 1 - x, y, color, tone)

    def rows(self, x0, y0, rows, colors, mirror=False):
        """문자 지도로 직접 찍기. colors: 문자 → 색 (또는 'b','s','o' 톤)"""
        for dy, row in enumerate(rows):
            for dx, ch in enumerate(row):
                if ch == '.' or ch == ' ':
                    continue
                v = colors[ch]
                if v in ('b', 's', 'o'):
                    self.px(x0 + dx, y0 + dy, None, v)
                else:
                    self.px(x0 + dx, y0 + dy, v)
                if mirror:
                    xx = W - 1 - (x0 + dx)
                    if v in ('b', 's', 'o'):
                        self.px(xx, y0 + dy, None, v)
                    else:
                        self.px(xx, y0 + dy, v)

    # ---- 마무리: 음영 · 외곽선 ----
    def finish(self):
        g = self.cells
        out = [[None] * W for _ in range(H)]

        def at(x, y):
            return g[y][x] if 0 <= x < W and 0 <= y < H else None

        for y in range(H):
            for x in range(W):
                c = g[y][x]
                if not c:
                    continue
                color, L, z, tone = c
                if L.outline:
                    edge = False
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        n = at(x + dx, y + dy)
                        if n is None or (n[1] is not L and n[2] < z):
                            edge = True
                    if edge:
                        out[y][x] = L.ol
                        continue
                if L.autoshade and tone == 'b':
                    n1, n2 = at(x + 1, y), at(x, y + 1)
                    n3 = at(x + 2, y)
                    if any(n is None or (n[1] is not L and n[2] < z) for n in (n1, n2)) or \
                            (n3 is None or (n3[1] is not L and n3[2] < z)):
                        out[y][x] = L.sh
                        continue
                out[y][x] = color
        return out


# ============================================================
# 공통 부품
# ============================================================
SKIN = '#fde7dc'
SKIN_SH = '#f2c4ba'
BLUSH = '#f6a9b4'
MOUTH = '#c56a78'


def face(s, skin=SKIN):
    s.use(Layer('face', skin, sh=SKIN_SH, ol='#b0767a'))
    s.ellipse((8, 9, 23, 23))
    s.rect(9, 20, 22, 21)
    # 목
    s.rect(14, 23, 17, 24)


def eyes(s, dark, mid, light, lash='#3a2232', closed=False, style='round', only=None):
    """눈: 왼눈 10~13, 오른눈 18~21 열 / 15~19 행"""
    s.use(Layer('eyes', dark, outline=False, autoshade=False))
    for ex in (10, 18):
        if only == 'right' and ex == 10:
            continue
        if only == 'left' and ex == 18:
            continue
        if closed:
            s.pts([(ex, 17), (ex + 1, 18), (ex + 2, 18), (ex + 3, 17)], lash)
            continue
        # 속눈썹
        s.pts([(ex, 15), (ex + 1, 15), (ex + 2, 15), (ex + 3, 15)], lash)
        outer = ex - 1 if ex == 10 else ex + 4
        s.pts([(outer, 15)], lash)
        if style == 'sharp':
            s.pts([(outer, 14)], lash)
        # 눈동자
        s.pts([(ex, 16), (ex + 3, 16), (ex, 17), (ex + 3, 17)], dark)
        s.pts([(ex + 1, 16), (ex + 2, 16)], dark)
        s.pts([(ex + 1, 17), (ex + 2, 17)], mid)
        s.pts([(ex, 18), (ex + 3, 18)], mid)
        s.pts([(ex + 1, 18), (ex + 2, 18)], light)
        s.pts([(ex + 1, 19), (ex + 2, 19)], light if style != 'sleepy' else mid)
        # 하이라이트
        s.pts([(ex + 1, 16)], '#ffffff')
        s.pts([(ex + 2, 18)], '#fff6fb')


def blush_mouth(s, mouth='smile'):
    s.use(Layer('blush', BLUSH, outline=False, autoshade=False))
    s.pts([(9, 20), (10, 20), (21, 20), (22, 20)], BLUSH)
    if mouth == 'smile':
        s.pts([(15, 21), (16, 21)], MOUTH)
    elif mouth == 'flat':
        s.pts([(15, 21)], MOUTH)
    elif mouth == 'smirk':
        s.pts([(16, 21), (17, 21)], MOUTH)


def legs(s, sock, shoe, top=37, sock_top=None, gap=True):
    s.use(Layer('legs', SKIN, sh=SKIN_SH, ol='#b0767a'))
    s.rect(12, top, 14, 43)
    s.rect(17, top, 19, 43)
    if sock:
        s.use(Layer('sock', sock))
        st = sock_top or 40
        s.rect(12, st, 14, 43)
        s.rect(17, st, 19, 43)
    s.use(Layer('shoe', shoe))
    s.rect(11, 44, 14, 46)
    s.rect(17, 44, 20, 46)


def arms(s, sleeve, y0=26, y1=32, hand_y=33, x=9):
    # 팔은 몸통 옆에 2px 로 붙여 그린다 (바깥쪽만 외곽선)
    s.use(Layer('arm', sleeve, autoshade=False))
    s.rect(x - 1, y0, x, y1, mirror=True)
    s.use(Layer('hand', SKIN, sh=SKIN_SH, ol='#b0767a', autoshade=False))
    s.rect(x - 1, hand_y, x, hand_y + 1, mirror=True)


def hair_strands(s, xs, y0, y1, tone='s'):
    for x in xs:
        for y in range(y0, y1):
            c = s.cells[y][x]
            if c and c[1] is s.layer:
                s.px(x, y, None, tone)


def cap(s, color, bang_rows, sh=None, ol=None, side=None, highlight=None, top=2, y0=10):
    """머리 윗부분(정수리) + 옆머리 + 앞머리를 한 레이어로 그린다 (내부 외곽선이 생기지 않게)
    bang_rows: y0 행부터 아래로, 행별 [x0,x1] 구간 목록"""
    s.use(Layer('hairtop', color, sh=sh, ol=ol))
    s.ellipse((7, top, 24, 18), ymax=y0 - 1)
    for i, segs in enumerate(bang_rows):
        for x0, x1 in segs:
            s.rect(x0, y0 + i, x1, y0 + i)
    if side:  # 얼굴 옆으로 내려오는 옆머리 (좌우 대칭)
        s.poly(side, mirror=True)
    hl = shade(color, dv=0.13, ds=-0.14)
    for x, y in (highlight or [(10, 5), (11, 4), (12, 4), (13, 4), (18, 4), (19, 4), (20, 5)]):
        s.px(x, y, hl)


def bow(s, x, y, color, knot=None, flip=False):
    """작은 리본 (9x6)"""
    s.use(Layer('bow', color))
    rows = ['.bb...bb.',
            'bbbb.bbbb',
            'bbsbkbsbb',
            'bbbb.bbbb',
            '.bs...sb.',
            '.s.....s.']
    for dy, r in enumerate(rows):
        for dx, ch in enumerate(r):
            if ch == '.':
                continue
            xx = x + (8 - dx if flip else dx)
            if ch == 'k':
                s.px(xx, y + dy, knot or shade(color, dv=-0.25))
            else:
                s.px(xx, y + dy, None, 'b' if ch == 'b' else 's')


# ============================================================
# 캐릭터
# ============================================================

def draw_hero(s, blink=False):
    """주인공: 갈색 긴 머리 + 한쪽 높은 포니테일, 하트 핀, 크림 니트, 붉은 체크 스커트, 갈색 부츠"""
    HAIR = '#7a4a36'
    # 뒷머리 (어깨 아래까지)
    s.use(Layer('hairback', HAIR))
    s.poly([(7, 12), (24, 12), (26, 30), (22, 34), (9, 34), (5, 30)])
    # 포니테일 (왼쪽 위에서 흘러내림)
    s.poly([(3, 6), (8, 4), (8, 12), (5, 22), (4, 31), (2, 34), (1, 26), (2, 16)])
    hair_strands(s, [4, 7, 24], 14, 33)
    legs(s, None, '#6a3c2c', top=37)
    s.use(Layer('boots', '#6a3c2c'))
    s.rect(12, 40, 14, 46)
    s.rect(17, 40, 19, 46)
    s.pts([(13, 41), (13, 43), (18, 41), (18, 43)], '#d9b48a')
    # 스커트 (체크)
    s.use(Layer('skirt', '#a8474a'))
    s.poly([(10, 31), (21, 31), (24, 38), (7, 38)])
    for x in (10, 14, 18, 22):
        for y in range(31, 39):
            c = s.cells[y][x]
            if c and c[1] is s.layer:
                s.px(x, y, '#d89b62')
    for x in range(8, 24):
        c = s.cells[35][x]
        if c and c[1] is s.layer:
            s.px(x, 35, '#7c2f36')
    # 니트
    s.use(Layer('sweater', '#f3e6cb'))
    s.poly([(11, 24), (20, 24), (22, 27), (22, 32), (9, 32), (9, 27)])
    s.rect(13, 22, 18, 24)  # 터틀넥
    for x in (12, 15, 16, 19):
        for y in (26, 28, 30):
            s.px(x, y, '#dccaa4')
    arms(s, '#f3e6cb', y0=25, y1=32, hand_y=33)
    s.use(Layer('neck', '#e6d4ae', outline=False, autoshade=False))
    s.rect(13, 23, 18, 23)
    # 목걸이
    s.pts([(15, 25), (16, 25)], '#b56a3c')
    face(s)
    eyes(s, '#6a2f22', '#a5533a', '#e2905e', closed=blink)
    blush_mouth(s, 'flat')
    # 앞머리 (살짝 흐트러진)
    cap(s, HAIR, [[(8, 23)], [(8, 14), (16, 23)], [(8, 12), (17, 23)], [(8, 11), (19, 23)], [(8, 9), (21, 23)]],
        side=[(7, 10), (9, 10), (9, 18), (7, 21)])
    # 하트 머리핀 + 포니테일 끈
    s.use(Layer('pin', '#f0b04a', outline=False, autoshade=False))
    s.pts([(20, 10), (22, 10), (20, 11), (21, 11), (22, 11), (21, 12)], '#f0b04a')
    s.pts([(4, 6), (5, 6), (4, 7), (5, 7)], '#c0392b')


def draw_mireille(s, blink=False):
    """미레유: 검은 생머리, 깃털 장식 하프 마스크, 흰 케이프 드레스, 장갑, 브로치"""
    HAIR = '#1e1b26'
    s.use(Layer('hairback', HAIR, sh='#14121a'))
    s.poly([(6, 12), (25, 12), (27, 42), (23, 44), (8, 44), (4, 42)])
    hair_strands(s, [6, 9, 22, 25], 18, 43, tone='s')
    legs(s, '#2a2530', '#18151c', top=40, sock_top=40)
    # 드레스 (긴 치마, 프릴)
    s.use(Layer('dress', '#fbfaff', sh='#d9d6e6', ol='#7d7891'))
    s.poly([(10, 30), (21, 30), (25, 41), (6, 41)])
    s.use(Layer('frill', '#ffffff', sh='#dedbe9', ol='#7d7891'))
    s.rect(6, 39, 25, 41)
    for x in range(6, 26, 2):
        s.px(x, 41, '#c9c5d8')
    # 상의 + 코르셋 끈
    s.use(Layer('bodice', '#ffffff', sh='#dcd9e8', ol='#7d7891'))
    s.poly([(11, 24), (20, 24), (21, 31), (10, 31)])
    s.pts([(15, 26), (16, 27), (15, 28), (16, 29), (15, 30)], '#b8b4c9')
    # 체인 장식
    s.pts([(18, 31), (19, 32), (20, 33), (21, 34), (21, 35)], '#a6abbf')
    # 케이프 (넓은 소매처럼 양옆으로)
    s.use(Layer('cape', '#f7f6fc', sh='#d4d1e2', ol='#7d7891'))
    s.poly([(12, 23), (19, 23), (24, 26), (25, 31), (21, 30), (10, 30), (6, 31), (7, 26)])
    for x in (9, 13, 18, 22):
        s.px(x, 28, '#c4c0d6')
    # 장갑 낀 손
    s.use(Layer('glove', '#ffffff', sh='#e0deea', ol='#7d7891'))
    s.rect(6, 32, 7, 33)
    s.rect(24, 32, 25, 33)
    # 하이넥 칼라 + 브로치
    s.use(Layer('collar', '#ffffff', sh='#dddbe8', ol='#7d7891'))
    s.rect(13, 21, 18, 24)
    s.use(Layer('brooch', '#8b93ad', outline=False, autoshade=False))
    s.pts([(15, 24), (16, 24), (15, 25), (16, 25)], '#8b93ad')
    s.pts([(15, 24)], '#dfe3ef')
    face(s, skin='#fbece6')
    # 오른쪽 눈만 보인다 (왼쪽은 가면) — 미레유는 눈을 깜빡이지 않는다
    eyes(s, '#7a5a26', '#b88a3a', '#e8c46a', only='right')
    blush_mouth(s, 'smirk')
    # 가면 (화면 왼쪽 눈)
    s.use(Layer('mask', '#f4f2f8', sh='#d6d3e2', ol='#77728a'))
    s.poly([(8, 13), (15, 13), (15, 19), (12, 21), (8, 19)])
    s.pts([(10, 16), (11, 16), (12, 16), (11, 17)], '#5c586c')
    s.pts([(9, 14), (13, 14)], '#bfbccd')
    # 머리 윗부분 + 앞머리 (가면 위로 살짝 덮임)
    cap(s, HAIR, [[(8, 23)], [(8, 23)], [(8, 9), (13, 23)], [(8, 8), (16, 23)], [(19, 23)]],
        sh='#14121a', side=[(6, 10), (9, 10), (8, 23), (6, 25)])
    # 깃털 장식
    s.use(Layer('feather', '#ffffff', sh='#d9d7e4', ol='#8a86a0'))
    s.poly([(6, 2), (8, 0), (10, 3), (9, 9), (7, 10)])
    s.pts([(8, 2), (8, 4), (8, 6)], '#b9b5ca')


def draw_morganite(s, blink=False):
    """핑크 모르가나이트: 땅까지 닿는 분홍 트윈테일, 하트 보석 리본, 하트 코르셋, 퍼프 소매"""
    HAIR = '#f6a3c6'
    s.use(Layer('twin', HAIR))
    for side in (0, 1):
        pts = [(5, 8), (8, 10), (7, 20), (6, 32), (5, 42), (2, 45), (1, 36), (1, 22), (2, 12)]
        if side:
            pts = [(W - 1 - x, y) for x, y in pts]
        s.poly(pts)
    hair_strands(s, [3, 28], 14, 43)
    s.use(Layer('hairback', HAIR))
    s.poly([(7, 12), (24, 12), (24, 28), (7, 28)])
    legs(s, '#ffffff', '#f07aa8', top=37, sock_top=39)
    s.use(Layer('shoebow', '#e2386f', outline=False, autoshade=False))
    s.pts([(12, 43), (14, 43), (17, 43), (19, 43)], '#e2386f')
    # 스커트: 여러 겹 프릴
    s.use(Layer('skirt', '#f9b8d2'))
    s.poly([(10, 30), (21, 30), (25, 37), (6, 37)])
    s.use(Layer('frill', '#fff1f7', sh='#f4cfe0'))
    s.rect(6, 36, 25, 38)
    for x in range(6, 26, 2):
        s.px(x, 38, '#f2b3cd')
    s.use(Layer('skirt2', '#f48fb8'))
    s.rect(8, 33, 23, 34)
    # 코르셋 (하트)
    s.use(Layer('corset', '#f57fae'))
    s.poly([(11, 24), (20, 24), (21, 31), (10, 31)])
    s.pts([(15, 27), (16, 27), (14, 26), (17, 26), (15, 28), (16, 28)], '#ffd6e6')
    s.pts([(11, 31), (20, 31)], '#f2cf7a')
    # 퍼프 소매
    s.use(Layer('puff', '#fff4f8', sh='#f6d3e2'))
    s.ellipse((6, 23, 11, 28))
    s.ellipse((20, 23, 25, 28))
    arms(s, '#ffffff', y0=29, y1=31, hand_y=32, x=8)
    face(s)
    eyes(s, '#c2386a', '#ea5f8f', '#ffb1cc', closed=blink)
    blush_mouth(s, 'smile')
    # 초커 하트
    s.use(Layer('choker', '#e2386f', outline=False, autoshade=False))
    s.rect(14, 23, 17, 23)
    s.pts([(15, 24), (16, 24)], '#ff7aa8')
    cap(s, HAIR, [[(7, 24)], [(7, 24)], [(7, 11), (13, 18), (20, 24)], [(7, 10), (14, 17), (21, 24)], [(7, 8), (15, 16), (23, 24)]])
    # 하트 아호게
    s.use(Layer('ahoge', HAIR))
    s.pts([(14, 1), (16, 1), (13, 2), (15, 2), (17, 2), (14, 3), (16, 3), (15, 4)])
    # 큰 리본 (양쪽) + 하트 보석
    bow(s, 0, 3, '#ec5a8e', knot='#ffd0e2')
    bow(s, 23, 3, '#ec5a8e', knot='#ffd0e2', flip=True)


def draw_aquamarine(s, blink=False):
    """아쿠아 마린: 은발 단발(일자 앞머리), 나비 머리장식 + 티아라, 별빛 안감 베일, 나비 가슴장식"""
    HAIR = '#dfe3ee'
    # 긴 베일/망토 (뒤)
    s.use(Layer('veil', '#cfd9ec', sh='#a9b9d8', ol='#5a6a92'))
    s.poly([(8, 9), (23, 9), (28, 30), (30, 46), (19, 46), (12, 46), (1, 46), (3, 30)])
    s.use(Layer('lining', '#2f56b8', sh='#213f8f', ol='#1b2f6a'))
    s.poly([(5, 33), (9, 34), (10, 46), (2, 46)])
    s.poly([(26, 33), (22, 34), (21, 46), (29, 46)])
    s.pts([(4, 38), (6, 42), (8, 37), (25, 39), (27, 43), (23, 41)], '#cfe1ff')
    s.use(Layer('hairback', HAIR, sh='#b8bfd2', ol='#6c7389'))
    s.poly([(7, 11), (24, 11), (25, 24), (6, 24)])
    legs(s, None, '#d6e2f5', top=36)
    # 발목 장식
    s.use(Layer('anklet', '#9cc4ff', outline=False, autoshade=False))
    s.pts([(12, 42), (14, 42), (17, 42), (19, 42)], '#9cc4ff')
    # 짧은 드레스
    s.use(Layer('dress', '#f6f8fe', sh='#cfd8ec', ol='#6c7aa0'))
    s.poly([(10, 29), (21, 29), (24, 35), (7, 35)])
    s.use(Layer('petticoat', '#8fb2ec', sh='#6a8fd6', ol='#3e5a9e'))
    s.rect(7, 35, 24, 36)
    s.use(Layer('bodice', '#ffffff', sh='#d8dff0', ol='#6c7aa0'))
    s.poly([(11, 23), (20, 23), (21, 30), (10, 30)])
    # 나비 가슴장식
    s.use(Layer('butterfly', '#b9c6e3', sh='#8e9ec4', ol='#4f5d84'))
    s.poly([(10, 24), (15, 26), (12, 29)])
    s.poly([(21, 24), (16, 26), (19, 29)])
    s.pts([(15, 26), (16, 26), (15, 27), (16, 27)], '#3a72d8')
    arms(s, '#e8eef9', y0=25, y1=31, hand_y=32)
    face(s)
    eyes(s, '#2b5fb8', '#4a8fd8', '#a8d4ff', closed=blink)
    blush_mouth(s, 'flat')
    # 단발 + 일자 앞머리
    cap(s, HAIR, [[(7, 24)], [(7, 24)], [(7, 24)], [(7, 24)], [(8, 10), (12, 13), (15, 16), (18, 19), (21, 23)]],
        sh='#b8bfd2', ol='#6c7389', side=[(6, 10), (10, 10), (10, 24), (6, 25)])
    # 티아라
    s.use(Layer('tiara', '#e9eef8', sh='#b7c1d8', ol='#6c7389'))
    s.rect(10, 4, 21, 4)
    s.pts([(12, 3), (15, 2), (16, 2), (19, 3)])
    s.pts([(15, 3), (16, 3)], '#4a8fd8')
    # 나비 머리장식 (오른쪽)
    s.use(Layer('hbutterfly', '#7fa6ec', sh='#4f7ccf', ol='#2c3f78'))
    s.poly([(22, 1), (27, 0), (26, 5), (23, 6)])
    s.poly([(23, 6), (28, 6), (26, 9)])
    s.pts([(24, 2), (25, 3)], '#e6f0ff')


def draw_amethyst(s, blink=False):
    """퍼플 애머시스트: 라벤더 웨이브 롱헤어 + 양쪽 똥머리, 초승달 핀, 별 리본, 겹프릴 드레스"""
    HAIR = '#b9a0e6'
    s.use(Layer('hairback', HAIR))
    s.poly([(6, 10), (25, 10), (29, 22), (27, 34), (29, 40), (24, 42), (20, 36), (11, 36), (7, 42), (2, 40), (4, 34), (2, 22)])
    hair_strands(s, [4, 8, 23, 27], 20, 40)
    # 별 리본 띠 (스커트 뒤로 늘어짐)
    s.use(Layer('ribbon', '#f7f1ff', sh='#d9caf4', ol='#7a62a8'))
    s.poly([(9, 34), (12, 34), (11, 44), (8, 42)])
    s.poly([(22, 34), (19, 34), (20, 44), (23, 42)])
    s.pts([(10, 38), (21, 38)], '#e8c66a')
    legs(s, '#ffffff', '#6b4bb8', top=37, sock_top=39)
    s.use(Layer('shoebow', '#8a6ad0', outline=False, autoshade=False))
    s.pts([(12, 40), (13, 41), (14, 40), (17, 40), (18, 41), (19, 40)], '#8a6ad0')
    # 겹프릴 스커트 (아래로 갈수록 진한 보라)
    s.use(Layer('skirt3', '#7e5cc8'))
    s.poly([(8, 33), (23, 33), (26, 38), (5, 38)])
    s.use(Layer('skirt2', '#b9a0ee'))
    s.poly([(9, 31), (22, 31), (25, 36), (6, 36)])
    s.use(Layer('skirt1', '#fbf8ff', sh='#ddd2f4', ol='#7a62a8'))
    s.poly([(10, 29), (21, 29), (23, 33), (8, 33)])
    s.pts([(11, 31), (16, 32), (20, 31)], '#e8c66a')
    s.use(Layer('bodice', '#fbf8ff', sh='#ddd2f4', ol='#7a62a8'))
    s.poly([(11, 23), (20, 23), (21, 30), (10, 30)])
    s.pts([(13, 27), (18, 26), (15, 29)], '#e8c66a')
    # 퍼프 소매
    s.use(Layer('puff', '#ffffff', sh='#e0d6f6', ol='#7a62a8'))
    s.ellipse((6, 23, 10, 27))
    s.ellipse((21, 23, 25, 27))
    arms(s, '#f3eefc', y0=28, y1=31, hand_y=32, x=8)
    face(s)
    eyes(s, '#5a3fa0', '#8a6ad0', '#d6c4ff', closed=blink, style='sleepy')
    blush_mouth(s, 'flat')
    # 목 리본
    s.use(Layer('neckbow', '#6b4bb8'))
    s.poly([(12, 22), (15, 24), (12, 26)])
    s.poly([(19, 22), (16, 24), (19, 26)])
    s.pts([(15, 24), (16, 24)], '#e8c66a')
    cap(s, HAIR, [[(7, 24)], [(7, 24)], [(7, 12), (14, 24)], [(7, 10), (15, 15), (18, 24)], [(7, 8), (20, 24)]])
    # 똥머리
    s.use(Layer('bun', HAIR))
    s.ellipse((3, 1, 9, 7))
    s.ellipse((22, 1, 28, 7))
    s.pts([(5, 2), (6, 2), (24, 2), (25, 2)], '#ddd0f6')
    # 똥머리 리본 + 하트 아호게
    s.use(Layer('bunbow', '#6b4bb8'))
    s.pts([(8, 6), (9, 7), (22, 6), (23, 7)])
    s.use(Layer('ahoge', HAIR))
    s.pts([(14, 0), (16, 0), (13, 1), (15, 1), (17, 1), (14, 2), (16, 2), (15, 3)])
    # 초승달 핀
    s.use(Layer('moon', '#f0cf6a', sh='#c9a23e', ol='#8a6a2a'))
    s.pts([(20, 8), (21, 9), (21, 10), (20, 11), (19, 9)])


def draw_ruby(s, blink=False):
    """로즈 루비: 짙은 갈색 생머리, 금 티아라, 검정 고딕 드레스 + 붉은 프릴, 넓은 소매, 장미"""
    HAIR = '#4e2c2c'
    s.use(Layer('hairback', HAIR, sh='#3a1f22'))
    s.poly([(6, 11), (25, 11), (27, 40), (22, 42), (9, 42), (4, 40)])
    hair_strands(s, [6, 10, 21, 25], 18, 41, tone='s')
    legs(s, '#2a1c24', '#3a1a22', top=40, sock_top=40)
    s.use(Layer('bootlace', '#c4283a', outline=False, autoshade=False))
    s.pts([(13, 42), (18, 42)], '#c4283a')
    # 긴 스커트 + 붉은 밑단 프릴
    s.use(Layer('skirt', '#2e2733', sh='#1e1a24', ol='#120e15'))
    s.poly([(10, 29), (21, 29), (26, 40), (5, 40)])
    s.use(Layer('frill', '#c4283a', sh='#951b2b', ol='#5c0f1a'))
    s.rect(5, 39, 26, 41)
    for x in range(5, 27, 2):
        s.px(x, 41, '#e0485a')
    s.pts([(8, 35), (12, 33), (19, 33), (23, 35)], '#c9a24a')  # 금장식
    # 코르셋 (교차 끈)
    s.use(Layer('corset', '#2b2430', sh='#1c1820', ol='#120e15'))
    s.poly([(11, 23), (20, 23), (21, 30), (10, 30)])
    s.pts([(13, 25), (14, 26), (17, 26), (18, 25), (15, 27), (16, 27), (14, 28), (17, 28)], '#4a3f52')
    s.pts([(11, 29), (20, 29)], '#c9a24a')
    # 넓은 소매 (붉은 안감)
    s.use(Layer('sleeve', '#2e2733', sh='#1e1a24', ol='#120e15'))
    s.poly([(10, 23), (6, 30), (4, 35), (9, 35), (10, 28)])
    s.poly([(21, 23), (25, 30), (27, 35), (22, 35), (21, 28)])
    s.use(Layer('lining', '#b0233a', sh='#7e1628', ol='#4c0c18'))
    s.poly([(5, 33), (9, 33), (9, 35), (4, 35)])
    s.poly([(26, 33), (22, 33), (22, 35), (27, 35)])
    face(s, skin='#fbe4dc')
    eyes(s, '#7e1622', '#c0303a', '#ff8a8f', closed=blink, style='sharp')
    blush_mouth(s, 'flat')
    # 칼라 + 장미
    s.use(Layer('collar', '#1c1820', ol='#0d0a0f'))
    s.rect(13, 22, 18, 23)
    s.use(Layer('rose', '#d6283c', sh='#9c1a2c', ol='#5a0e18'))
    s.ellipse((13, 23, 17, 27))
    s.pts([(14, 24), (15, 25)], '#ff6a78')
    cap(s, HAIR, [[(7, 24)], [(7, 24)], [(7, 24)], [(7, 13), (15, 16), (18, 24)], [(7, 9), (22, 24)]],
        sh='#3a1f22', side=[(6, 10), (9, 10), (8, 23), (6, 25)])
    # 금 티아라 + 루비
    s.use(Layer('tiara', '#e2b84e', sh='#b08a2c', ol='#6e5218'))
    s.rect(9, 4, 22, 5)
    s.pts([(10, 3), (13, 2), (15, 1), (16, 1), (18, 2), (21, 3)])
    s.pts([(15, 3), (16, 3), (15, 4), (16, 4)], '#e0283c')
    s.pts([(15, 3)], '#ff8a96')


def draw_heliodor(s, blink=False):
    """옐로 헬리오도르: 연갈색 웨이브 + 레이스 베일·리본, 황금 숄, 짙은 갈색 롱드레스, 크림 앞치마, 종"""
    HAIR = '#c99b74'
    # 레이스 베일 (뒤)
    s.use(Layer('veil', '#fbf3e4', sh='#e8d8bc', ol='#9c8462'))
    s.poly([(6, 4), (25, 4), (29, 26), (26, 30), (5, 30), (2, 26)])
    for y in range(8, 30, 3):
        s.px(3 if y % 2 else 4, y, '#e2cfae')
        s.px(28 if y % 2 else 27, y, '#e2cfae')
    s.use(Layer('hairback', HAIR))
    s.poly([(7, 11), (24, 11), (27, 26), (25, 38), (21, 36), (10, 36), (6, 38), (4, 26)])
    hair_strands(s, [7, 24], 16, 36)
    # 롱 드레스
    s.use(Layer('dress', '#5c3828', sh='#42271c', ol='#26150f'))
    s.poly([(10, 29), (21, 29), (25, 45), (6, 45)])
    s.pts([(8, 41), (9, 38), (22, 39), (23, 42), (10, 43)], '#a9824a')  # 덩굴 무늬
    s.use(Layer('shoe', '#5c3828', sh='#42271c', ol='#26150f'))
    s.rect(11, 45, 14, 46)
    s.rect(17, 45, 20, 46)
    # 앞치마
    s.use(Layer('apron', '#f6eed8', sh='#e0d3b2', ol='#8e7a56'))
    s.poly([(11, 29), (20, 29), (22, 35), (18, 37), (13, 37), (9, 35)])
    s.pts([(15, 31), (16, 31), (15, 33), (16, 33)], '#c9a24a')
    # 상의
    s.use(Layer('bodice', '#4a2c20', sh='#36201a', ol='#1e110c'))
    s.poly([(11, 23), (20, 23), (21, 30), (10, 30)])
    s.use(Layer('sash', '#e8b830', sh='#c29420', ol='#7a5a14'))
    s.rect(10, 29, 21, 30)
    # 황금 숄 (양 팔에 걸침)
    s.use(Layer('shawl', '#f0bf3c', sh='#d49a22', ol='#8a5e12'))
    s.poly([(10, 23), (5, 27), (3, 40), (7, 41), (9, 30)])
    s.poly([(21, 23), (26, 27), (28, 40), (24, 41), (22, 30)])
    s.pts([(4, 40), (5, 41), (6, 41), (25, 41), (26, 41), (27, 40)], '#c98a1a')
    s.use(Layer('hand', SKIN, sh=SKIN_SH, ol='#b0767a'))
    s.rect(8, 31, 9, 32)
    s.rect(22, 31, 23, 32)
    face(s)
    eyes(s, '#8a5a1a', '#c08a2a', '#f2cc6a', closed=blink)
    blush_mouth(s, 'flat')
    # 목 리본 + 종
    s.use(Layer('neckbow', '#5a3626'))
    s.poly([(12, 22), (15, 23), (12, 25)])
    s.poly([(19, 22), (16, 23), (19, 25)])
    s.use(Layer('bell', '#f2c84a', sh='#c99a2a', ol='#7a5a14'))
    s.rect(15, 24, 16, 26)
    s.pts([(14, 26), (17, 26)])
    cap(s, HAIR, [[(7, 24)], [(7, 24)], [(7, 11), (14, 24)], [(7, 10), (15, 18), (20, 24)], [(7, 8), (21, 24)]],
        side=[(6, 10), (9, 10), (9, 20), (6, 22)], top=3)
    # 레이스 머리장식 + 갈색 리본
    s.use(Layer('lace', '#fffaf0', sh='#eadcc0', ol='#9c8462'))
    s.rect(9, 3, 22, 4)
    for x in range(9, 23, 2):
        s.px(x, 2, None, 'b')
    s.use(Layer('hbow', '#5a3626', sh='#42271c', ol='#26150f'))
    s.poly([(18, 3), (22, 0), (23, 6)])
    s.poly([(24, 3), (28, 1), (27, 7)])
    s.pts([(23, 3), (23, 4)], '#e8b830')


CHARACTERS = {
    'hero': draw_hero,
    'mireille': draw_mireille,
    'morganite': draw_morganite,
    'aquamarine': draw_aquamarine,
    'amethyst': draw_amethyst,
    'ruby': draw_ruby,
    'heliodor': draw_heliodor,
}

CODES = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~'


def build(fn, blink):
    s = Sprite()
    fn(s, blink=blink)
    return s.finish()


def main():
    data = {}
    previews = []
    for cid, fn in CHARACTERS.items():
        frames = {'idle': build(fn, False), 'blink': build(fn, True)}
        palette = []
        enc = {}
        for name, grid in frames.items():
            rows = []
            for row in grid:
                line = ''
                for c in row:
                    if c is None:
                        line += '.'
                        continue
                    if c not in palette:
                        palette.append(c)
                    line += CODES[palette.index(c)]
                rows.append(line)
            enc[name] = rows
        assert len(palette) <= len(CODES), cid
        data[cid] = {'w': W, 'h': H, 'palette': palette, 'frames': enc}
        img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        for y, row in enumerate(frames['idle']):
            for x, c in enumerate(row):
                if c:
                    img.putpixel((x, y), hx(c) + (255,))
        previews.append(img)

    js = ('/* 자동 생성 파일 — tools/dots.py 를 수정하고 다시 실행할 것 */\n'
          'window.WS = window.WS || {};\n'
          'WS.DOTS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    (ROOT / 'js' / 'render' / 'dots.js').write_text(js, encoding='utf-8')

    z = 8
    sheet = Image.new('RGBA', (len(previews) * (W + 4) * z, H * z), (247, 246, 244, 255))
    for i, im in enumerate(previews):
        sheet.alpha_composite(im.resize((W * z, H * z), Image.NEAREST), (i * (W + 4) * z, 0))
    sheet.save(ROOT / 'tools' / 'dots_preview.png')
    print('ok', list(data))


if __name__ == '__main__':
    main()
