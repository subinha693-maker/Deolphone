#!/usr/bin/env python3
"""쯔꾸르풍 SD 도트 캐릭터 생성기 (v2: 48x48 칸, 4방향 x 3프레임 걷기)
------------------------------------------------------------
쯔꾸르 MV 캐릭터 시트 규격(48x48 칸)과 같은 비율:
  - 머리(머리카락 포함)가 키의 60% 정도인 큰 SD 비율
  - 머리카락: 하이라이트 · 기본 · 그림자 · 깊은 그림자 + 결 표현
  - 큰 눈(5x5) + 흰 하이라이트, 볼터치, 진한 색 외곽선(검정이 아닌 같은 계열)
  - 방향: down(정면) · left(왼쪽) · up(뒷모습). right 는 게임에서 left 를 좌우 반전해 쓴다.
  - 프레임: 0 · 1(서 있음) · 2  → 걷기 순서는 0,1,2,1

캐릭터는 '종이 인형' 방식으로 조립한다:
  behind(뒷머리 · 망토) → body(다리 · 치마 · 몸통 · 팔) → face → head(앞머리 · 장식)
  뒷모습(up)에서는 behind 를 몸 위에 그린다.

사용법 (game 폴더에서):  python3 tools/dots.py
  → js/render/dots.js       (게임용 도트 데이터)
  → tools/dots_preview.png  (확대 미리보기: 캐릭터마다 4방향 x 3프레임)
"""
from pathlib import Path
from PIL import Image, ImageDraw
import colorsys, json

ROOT = Path(__file__).resolve().parent.parent
W, H = 48, 48
MX = W - 1  # 좌우 대칭 기준: x ↔ 47-x


# ------------------------------------------------------------
# 색 도구
# ------------------------------------------------------------
def hx(c):
    c = c.lstrip('#')
    return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))


def tohex(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(round(v)))) for v in rgb)


def hsv_adj(c, dh=0.0, ds=0.0, dv=0.0):
    r, g, b = [v / 255 for v in hx(c)]
    h, s, v = colorsys.rgb_to_hsv(r, g, b)
    h = (h + dh) % 1
    s = min(1, max(0, s + ds))
    v = min(1, max(0, v + dv))
    return tohex([x * 255 for x in colorsys.hsv_to_rgb(h, s, v)])


def mix(a, b, k):
    a, b = hx(a), hx(b)
    return tohex([a[i] * (1 - k) + b[i] * k for i in range(3)])


OL_BASE = '#2a1622'


class Mat:
    """재질 = 5톤 팔레트 (하이라이트 h / 기본 b / 그림자 s / 깊은 그림자 d / 외곽선 o)"""

    def __init__(self, base, h=None, s=None, d=None, o=None):
        self.b = base
        # 그림자는 붉은 보라 쪽으로, 하이라이트는 따뜻하고 밝게 (쯔꾸르 도트 느낌)
        self.h = h or hsv_adj(mix(base, '#fff6f0', 0.35), ds=-0.05)
        self.s = s or hsv_adj(mix(base, '#5a2a4a', 0.22), dv=-0.08)
        self.d = d or hsv_adj(mix(base, '#3a1530', 0.42), dv=-0.12)
        self.o = o or mix(self.d, OL_BASE, 0.55)

    def tone(self, t):
        return {'h': self.h, 'b': self.b, 's': self.s, 'd': self.d, 'o': self.o}[t]


# ------------------------------------------------------------
# 래스터
# ------------------------------------------------------------
class Layer:
    def __init__(self, name, mat, outline=True, shade=True, hl=False, casts=False, group=None):
        self.name, self.mat = name, mat
        self.group = group or name
        self.outline, self.shade, self.hl, self.casts = outline, shade, hl, casts


class Sprite:
    def __init__(self):
        self.cells = [[None] * W for _ in range(H)]   # (tone or color, layer, z)
        self.z = 0
        self.L = None

    def use(self, name, mat, **kw):
        self.z += 1
        self.L = Layer(name, mat, **kw)
        return self.L

    def px(self, x, y, t='b'):
        if 0 <= x < W and 0 <= y < H:
            self.cells[y][x] = (t, self.L, self.z)

    def get(self, x, y):
        return self.cells[y][x] if 0 <= x < W and 0 <= y < H else None

    def erase(self, x, y):
        if 0 <= x < W and 0 <= y < H:
            self.cells[y][x] = None

    def _mask(self, fn):
        m = Image.new('1', (W, H), 0)
        fn(ImageDraw.Draw(m))
        return [(x, y) for y in range(H) for x in range(W) if m.getpixel((x, y))]

    def ellipse(self, box, t='b', ymin=-99, ymax=99, xmin=-99, xmax=99):
        for x, y in self._mask(lambda d: d.ellipse(box, fill=1)):
            if ymin <= y <= ymax and xmin <= x <= xmax:
                self.px(x, y, t)

    def poly(self, pts, t='b', mirror=False):
        pts = [tuple(p) for p in pts]
        for x, y in self._mask(lambda d: d.polygon(pts, fill=1)):
            self.px(x, y, t)
        if mirror:
            self.poly([(MX - x, y) for x, y in pts], t)

    def rect(self, x0, y0, x1, y1, t='b', mirror=False):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.px(x, y, t)
                if mirror:
                    self.px(MX - x, y, t)

    def pts(self, coords, t='b', mirror=False):
        for x, y in coords:
            self.px(x, y, t)
            if mirror:
                self.px(MX - x, y, t)

    def retone(self, cond, t):
        """현재 레이어 픽셀 중 cond(x,y) 를 만족하는 곳의 톤 변경"""
        for y in range(H):
            for x in range(W):
                c = self.cells[y][x]
                if c and c[1] is self.L and cond(x, y):
                    self.cells[y][x] = (t, c[1], c[2])

    def finish(self):
        g = self.cells
        out = [[None] * W for _ in range(H)]

        def outside(n, L, z):
            return n is None or (n[1] is not L and n[2] < z and n[1].group != L.group)

        for y in range(H):
            for x in range(W):
                c = g[y][x]
                if not c:
                    continue
                t, L, z = c
                if t.startswith('#'):
                    out[y][x] = t
                    continue
                m = L.mat
                if L.outline and any(outside(self.get(x + dx, y + dy), L, z)
                                     for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                    out[y][x] = m.o
                    continue
                if t == 'b':
                    up = self.get(x, y - 1)
                    # 위쪽 레이어가 드리우는 그림자 (앞머리 아래 이마, 머리카락 아래 옷)
                    if up and up[1] is not L and up[2] > z and up[1].casts and up[1].group != L.group:
                        t = 's'
                    elif L.shade and (outside(self.get(x + 1, y), L, z) or outside(self.get(x, y + 1), L, z)
                                      or outside(self.get(x + 2, y), L, z)):
                        t = 's'
                    elif L.hl and (outside(self.get(x - 1, y), L, z) or outside(self.get(x, y - 1), L, z)):
                        t = 'h'
                out[y][x] = m.tone(t)
        return out


# ------------------------------------------------------------
# 공통 부품 (방향 d: down / left / up, 프레임 f: 0 1 2)
# ------------------------------------------------------------
class C:
    def __init__(self, s, d, f, blink=False):
        self.s, self.d, self.f, self.blink = s, d, f, blink

    @property
    def down(self): return self.d == 'down'

    @property
    def left(self): return self.d == 'left'

    @property
    def up(self): return self.d == 'up'

    def swing(self):
        """팔 흔들기 오프셋 (왼팔, 오른팔)"""
        return {0: (1, -1), 1: (0, 0), 2: (-1, 1)}[self.f]


SKIN = Mat('#fde6da', h='#fff4ee', s='#f3c2b8', d='#e09c98', o='#a8676d')
BLUSH = '#f7a5b4'
BLUSH_L = '#fbc6cf'
MOUTH = '#b8556a'


def face(c, skin=SKIN):
    s = c.s
    if c.up:
        s.use('neck', skin, casts=False)
        s.rect(21, 31, 26, 33)
        return
    s.use('face', skin, hl=False)
    if c.down:
        s.ellipse((11, 11, 36, 32))
    else:
        s.ellipse((9, 11, 32, 32))
        s.rect(26, 22, 29, 29)            # 귀 쪽 볼
    s.use('neck', skin)
    if c.down:
        s.rect(21, 32, 26, 34)
    else:
        s.rect(21, 32, 25, 34)


def eyes(c, dk, md, lt, lash='#3a1a2c', style='round', which='both'):
    """큰 눈 5x5 (+ 위 속눈썹). style: round | sharp | sleepy | soft"""
    s = c.s
    if c.up:
        return
    s.use('eyes', Mat(md), outline=False, shade=False)
    if c.down:
        spots = [(15, 'L'), (28, 'R')]
    else:
        spots = [(12, 'S')]
    for ex, side in spots:
        if which == 'left' and side == 'R':
            continue
        if which == 'right' and side == 'L':
            continue
        w = 5 if side != 'S' else 4
        if c.blink:
            s.pts([(ex, 24), (ex + w - 1, 24)], lash)
            s.pts([(x, 25) for x in range(ex + 1, ex + w - 1)], lash)
            continue
        # 속눈썹 (위) + 바깥쪽 꼬리
        s.pts([(x, 21) for x in range(ex, ex + w)], lash)
        outer = ex - 1 if side in ('L', 'S') else ex + w
        s.pts([(outer, 22)], lash)
        if style == 'sharp':
            s.pts([(outer, 21), (outer + (-1 if side in ('L', 'S') else 1), 21)], lash)
        if style == 'sleepy':
            s.pts([(x, 22) for x in range(ex, ex + w)], lash)
        rows = [
            [dk] * w,
            [dk, '#ffffff', '#ffffff', md, dk][:w] if w == 5 else [dk, '#ffffff', md, dk],
            [dk, '#ffffff', md, md, dk][:w] if w == 5 else [dk, md, md, dk],
            [md, md, lt, lt, md][:w] if w == 5 else [md, lt, lt, md],
            [None, lt, lt, lt, None][:w] if w == 5 else [None, lt, lt, None],
        ]
        if style == 'sleepy':
            rows[1] = [dk] * w
        for i, row in enumerate(rows):
            for j, col in enumerate(row):
                if col:
                    s.pts([(ex + j, 22 + i)], col)


def blush_mouth(c, mouth='smile'):
    s = c.s
    if c.up:
        return
    s.use('blush', Mat(BLUSH), outline=False, shade=False)
    if c.down:
        s.pts([(13, 28), (14, 28), (15, 28)], BLUSH, mirror=True)
        s.pts([(14, 28)], BLUSH_L, mirror=True)
        mx = 23
    else:
        s.pts([(11, 28), (12, 28), (13, 28)], BLUSH)
        s.pts([(12, 28)], BLUSH_L)
        mx = 11
    if mouth == 'smile':
        s.pts([(mx, 30), (mx + 1, 30)], MOUTH)
    elif mouth == 'flat':
        s.pts([(mx, 30)] + ([(mx + 1, 30)] if c.down else []), mix(MOUTH, '#fde6da', 0.3))
    elif mouth == 'smirk':
        s.pts([(mx + 1, 30), (mx + 2, 29)] if c.down else [(mx, 30)], MOUTH)
    elif mouth == 'open':
        s.pts([(mx, 30), (mx + 1, 30), (mx, 31), (mx + 1, 31)] if c.down else [(mx, 30), (mx, 31)], MOUTH)


def legs(c, sock=None, shoe=None, top=41, sock_top=None, boot_top=None):
    """다리 + 신발. 걷기 프레임에 따라 한쪽 다리가 들린다."""
    s = c.s
    shoe = shoe or Mat('#5a3a3a')
    if c.left:
        # 옆모습: 앞다리 / 뒷다리
        if c.f == 1:
            legs_x = [(22, 0), (25, 0)]
        elif c.f == 0:
            legs_x = [(18, 0), (28, -1)]
        else:
            legs_x = [(28, 0), (18, -1)]
    else:
        lift = {0: (-2, 0), 1: (0, 0), 2: (0, -2)}[c.f]
        legs_x = [(18, lift[0]), (26, lift[1])]
    for i, (lx, dy) in enumerate(legs_x):
        w = 4 if not c.left else 3
        s.use('leg%d' % i, SKIN)
        s.rect(lx, top + dy, lx + w - 1, 44 + dy)
        if sock:
            s.use('sock%d' % i, sock)
            s.rect(lx, (sock_top or top) + dy, lx + w - 1, 44 + dy)
        s.use('shoe%d' % i, shoe)
        if boot_top:
            s.rect(lx, boot_top + dy, lx + w - 1, 44 + dy)
        if c.left:
            s.rect(lx - 1, 45 + dy, lx + w - 1, 46 + dy)
        else:
            s.rect(lx, 45 + dy, lx + w - 1, 46 + dy)


def torso(c, mat, top=33, bot=41, name='torso', casts=False):
    s = c.s
    s.use(name, mat, hl=True, casts=casts)
    if c.left:
        s.poly([(19, top), (28, top), (29, bot), (18, bot)])
    else:
        s.poly([(17, top), (30, top), (31, bot), (16, bot)])


def arms(c, sleeve, top=34, bot=39, style='normal', puff=None, glove=None):
    """팔. style: normal | wide(종 모양 소매) ; puff: 어깨 퍼프 재질"""
    s = c.s
    sl, sr = c.swing()
    hand = glove or SKIN
    if c.left:
        ax = 22 + (sl if c.f != 1 else 0)
        s.use('arm', sleeve, hl=True)
        if style == 'wide':
            s.poly([(ax, top), (ax + 3, top), (ax + 5, bot + 2), (ax - 2, bot + 2)])
        else:
            s.rect(ax, top, ax + 2, bot)
        s.use('hand', hand)
        s.rect(ax, bot + 1, ax + 2, bot + 2)
        if puff:
            s.use('puff', puff, hl=True)
            s.ellipse((ax - 2, top - 2, ax + 4, top + 3))
        return
    for side, off in (('L', sl), ('R', sr)):
        x0 = 13 if side == 'L' else 32
        s.use('arm' + side, sleeve, hl=True)
        if style == 'wide':
            if side == 'L':
                s.poly([(15, top), (17, top), (16, bot + 2 + off), (11, bot + 2 + off)])
            else:
                s.poly([(MX - 15, top), (MX - 17, top), (MX - 16, bot + 2 + off), (MX - 11, bot + 2 + off)])
        else:
            s.rect(x0, top + off, x0 + 2, bot + off)
        s.use('hand' + side, hand)
        s.rect(x0, bot + 1 + off, x0 + 2, bot + 2 + off)
        if puff:
            s.use('puff' + side, puff, hl=True)
            if side == 'L':
                s.ellipse((12, top - 2, 18, top + 3))
            else:
                s.ellipse((MX - 18, top - 2, MX - 12, top + 3))


def skirt(c, mat, top=38, bot=43, flare=4, name='skirt', hem=None, pleats=None):
    s = c.s
    s.use(name, mat, hl=True)
    if c.left:
        s.poly([(18, top), (29, top), (30 + flare - 1, bot), (17 - flare + 1, bot)])
    else:
        s.poly([(16, top), (31, top), (31 + flare, bot), (16 - flare, bot)])
    if pleats:
        xs = [19, 23, 27] if c.left else [17, 21, 26, 30]
        for x in xs:
            s.retone(lambda xx, yy, x=x: xx == x and yy > top + 1, pleats)
    if hem:
        s.use(name + 'hem', hem, hl=False)
        if c.left:
            s.rect(17 - flare + 1, bot - 1, 30 + flare - 1, bot)
        else:
            s.rect(16 - flare, bot - 1, 31 + flare, bot)
        x0 = (17 - flare + 1) if c.left else (16 - flare)
        x1 = (30 + flare - 1) if c.left else (31 + flare)
        for x in range(x0, x1 + 1, 2):
            s.px(x, bot + 1, 'b')


def hair_cap(c, mat, bangs, side_locks=None, part=None, shine=True, top=3):
    """머리 윗부분 + 앞머리 + 옆머리 (한 레이어, 내부 외곽선 없음)
    bangs: down 시점 앞머리 행 목록 (13행부터, 행별 [x0,x1] 구간)"""
    s = c.s
    s.use('hair', mat, casts=True, group='hair')
    box = (7, top, 40, 33)
    if c.down:
        s.ellipse(box, ymax=12)
        for i, segs in enumerate(bangs):
            for x0, x1 in segs:
                s.rect(x0, 13 + i, x1, 13 + i)
        if side_locks:
            s.poly(side_locks, mirror=True)
    elif c.left:
        s.ellipse(box, ymax=12)
        s.ellipse(box, xmin=24)
        # 옆모습 앞머리: 이마를 덮고 끝이 뾰족하게
        s.poly([(8, 12), (24, 12), (24, 19), (21, 17), (19, 20), (16, 16), (13, 19), (11, 15), (9, 18)])
        # 귀 앞 옆머리
        s.poly([(23, 13), (28, 13), (27, 31), (24, 33), (23, 25)])
    else:
        s.ellipse(box)
        s.rect(10, 18, 37, 33)
    if shine:
        # 천사 링 하이라이트
        for x in range(10, 38):
            if c.left and x > 30:
                continue
            k = (x - 23.5) / 14
            y = round(8 + k * k * 4)
            if (x + y) % 5 == 4:
                continue
            for yy in (y, y + 1):
                cc = s.get(x, yy)
                if cc and cc[1] is s.L:
                    s.px(x, yy, 'h')
        # 결: 드문드문 짧은 그림자 + 아래로 갈수록 어둡게
        for x in (11, 17, 29, 35):
            for y in range(13 + (x % 3), 22 + (x % 5)):
                cc = s.get(x, y)
                if cc and cc[1] is s.L and cc[0] == 'b':
                    s.px(x, y, 's')
        s.retone(lambda x, y: y >= 30, 's')
    if part is not None and not c.up:
        px = part if c.down else 14
        for y in range(4, 13):
            cc = s.get(px, y)
            if cc and cc[1] is s.L:
                s.px(px, y, 'd')


def hair_back(c, mat, length=40, width=2, tips=True, name='hairback', tint=None):
    """뒷머리 (down/left: 몸 뒤, up: 몸 위)"""
    s = c.s
    s.use(name, mat, casts=True, group='hair')
    if c.down or c.up:
        s.poly([(10, 12), (37, 12), (40 + width, length - 6), (37 + width // 2, length),
                (10 - width // 2, length), (7 - width, length - 6)])
        if c.up:
            s.ellipse((7, 3, 40, 33))
    else:
        s.poly([(18, 10), (38, 12), (40 + width, length - 6), (36, length), (24, length), (22, 30)])
    # 머리끝 갈라짐
    if tips:
        for x in range(0, W):
            for y in range(length - 3, length + 1):
                cc = s.get(x, y)
                if cc and cc[1] is s.L and (x % 4 == 0 or (x % 4 == 1 and y >= length - 1)):
                    s.erase(x, y)
    # 아래로 갈수록 어둡게 + 결
    s.retone(lambda x, y: y > length - 14 and (x * 7 + y) % 9 == 0, 's')
    s.retone(lambda x, y: y > length - 9, 's')
    s.retone(lambda x, y: y > length - 4, 'd')
    if tint:
        s.retone(lambda x, y: y > length - 4, 'd')


def bow(c, x, y, mat, flip=False, knot=None):
    """리본 9x6"""
    s = c.s
    s.use('bow', mat, hl=True)
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
                s.pts([(xx, y + dy)], knot or mat.d)
            else:
                s.px(xx, y + dy, ch)


# ------------------------------------------------------------
# 캐릭터 정의: behind(c), body(c), head(c), face_info
# ------------------------------------------------------------
class Char:
    dirs = ('down', 'left', 'up')
    eye = ('#5a2a20', '#9a4a34', '#e0905e')
    eye_style = 'round'
    mouth = 'flat'
    skin = SKIN

    def behind(self, c): pass
    def body(self, c): pass
    def head(self, c): pass


# ---- 클레어 (평상복): 갈색 롱 웨이브 + 높은 포니테일, 하트 핀, 크림 니트, 체크 스커트, 부츠 ----
class Claire(Char):
    HAIR = Mat('#7a4636', h='#b67a5e', s='#5e3226', d='#43211a', o='#2e1612')
    eye = ('#4e2218', '#8e4630', '#d9875a')

    def behind(self, c):
        hair_back(c, self.HAIR, length=43, width=3)
        s = c.s
        s.use('pony', self.HAIR, casts=True, group='hair')
        if c.down:
            s.poly([(30, 2), (37, 0), (40, 6), (41, 18), (39, 24), (36, 14)])
        elif c.left:
            s.poly([(30, 2), (38, 0), (43, 8), (44, 22), (41, 30), (38, 16)])
        else:
            s.poly([(20, 1), (27, 1), (29, 12), (26, 26), (21, 26), (18, 12)])

    def body(self, c):
        legs(c, None, Mat('#6a3c2c'), top=41, boot_top=42)
        skirt(c, Mat('#a8474a'), top=38, bot=43, flare=4, pleats='s')
        s = c.s
        # 체크 무늬 (금색 선)
        s.retone(lambda x, y: (x % 4 == 1 and y > 38) or y == 41, 'h')
        torso(c, Mat('#f1e3c6'), top=32, bot=39, name='sweater', casts=True)
        s.retone(lambda x, y: (x + y) % 4 == 0 and 34 <= y <= 38, 's')   # 꽈배기 니트 결
        s.use('belt', Mat('#7a2e34'))
        if c.left:
            s.rect(18, 38, 29, 38)
        else:
            s.rect(16, 38, 31, 38)
        arms(c, Mat('#f1e3c6'), top=33, bot=39)
        if not c.up:
            s.use('collar', Mat('#e6d3ac'), outline=False)
            s.rect(20, 32, 27, 33) if c.down else s.rect(21, 32, 26, 33)
            s.use('necklace', Mat('#b5453c'), outline=False, shade=False)
            if c.down:
                s.pts([(23, 35), (24, 35), (23, 36), (24, 36)], '#c4473c')
                s.pts([(23, 35)], '#f08a7a')

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 21), (23, 38)], [(9, 19), (24, 38)],
                        [(9, 17), (26, 37)], [(9, 15), (29, 37)], [(10, 13), (32, 37)], [(10, 11), (34, 37)]],
                 side_locks=[(7, 12), (12, 12), (12, 30), (10, 38), (7, 34)], part=22)
        s = c.s
        if not c.up:
            # 하트 머리핀
            s.use('pin', Mat('#f2b448'), outline=False, shade=False)
            hp = (33, 15) if c.down else (17, 14)
            x, y = hp
            s.pts([(x, y), (x + 2, y), (x, y + 1), (x + 1, y + 1), (x + 2, y + 1), (x + 1, y + 2)], '#f6c050')
            s.pts([(x, y)], '#fff0b8')
        # 포니테일 곱창 끈
        s.use('scrunchie', Mat('#c97a5a'), hl=True)
        if c.down:
            s.ellipse((29, 1, 35, 5))
        elif c.left:
            s.ellipse((29, 1, 35, 5))
        else:
            s.ellipse((20, 0, 27, 4))


# ---- 메이어: 보랏빛 윤기의 검은 단발, 보라 눈, 은 단추 더블 롱코트, 장갑, 부츠 ----
class Mayer(Char):
    HAIR = Mat('#2a2236', h='#7d5aa8', s='#1c1626', d='#120e18', o='#0b0810')
    eye = ('#3e2a6e', '#7a5ac0', '#c8b4f2')
    eye_style = 'sharp'
    mouth = 'flat'
    COAT = Mat('#3a3150', h='#5e5276', s='#2a2340', d='#1c1830', o='#120f1e')

    def behind(self, c):
        hair_back(c, self.HAIR, length=33, width=1, tips=True)

    def body(self, c):
        s = c.s
        legs(c, Mat('#2a2434'), Mat('#1c1820'), top=42, sock_top=42, boot_top=43)
        # 롱코트 (무릎 아래까지)
        s.use('coat', self.COAT, hl=True, casts=True)
        if c.left:
            s.poly([(19, 32), (28, 32), (31, 44), (16, 44)])
        else:
            s.poly([(16, 32), (31, 32), (34, 44), (13, 44)])
        if c.down:
            # 앞 여밈 + 은 단추 두 줄
            s.retone(lambda x, y: x == 23 and y > 33, 'd')
            for y in (35, 38, 41):
                s.pts([(20, y), (27, y)], '#c8cad8')
                s.pts([(20, y + 1), (27, y + 1)], '#7d7f92')
            # 밑단 은실 자수
            s.pts([(15, 42), (17, 41), (30, 41), (32, 42)], '#9a8fb8')
            # 벨트
            s.use('belt', Mat('#1e1a28'), outline=False)
            s.rect(16, 37, 31, 37)
        elif c.up:
            s.retone(lambda x, y: x == 23 and y > 38, 'd')
            s.use('belt', Mat('#1e1a28'), outline=False)
            s.rect(16, 37, 31, 37)
            s.pts([(22, 37), (25, 37)], '#7aa0b0')
        else:
            s.pts([(19, 35), (19, 38), (19, 41)], '#c8cad8')
            s.use('belt', Mat('#1e1a28'), outline=False)
            s.rect(18, 37, 29, 37)
        arms(c, self.COAT, top=33, bot=40, glove=Mat('#241e2c'))
        if not c.up:
            # 하이넥 칼라 + 목걸이
            s.use('collar', Mat('#2e2640'), hl=True)
            s.rect(20, 31, 27, 33) if c.down else s.rect(20, 31, 26, 33)
            s.use('gem', Mat('#8a6ad0'), outline=False, shade=False)
            if c.down:
                s.pts([(21, 34), (26, 34), (22, 35), (25, 35)], '#a9adc0')
                s.pts([(23, 36), (24, 36)], '#9a7ae0')
                s.pts([(23, 36)], '#d8c8ff')

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 38)], [(9, 25), (27, 38)], [(9, 24), (29, 38)],
                        [(9, 22), (31, 38)], [(9, 20), (33, 38)], [(9, 13), (17, 18), (35, 38)]],
                 side_locks=[(7, 12), (12, 12), (13, 33), (9, 34), (7, 26)], part=28)
        s = c.s
        if not c.up:
            # 은빛 별 머리핀 (오른쪽)
            s.use('clip', Mat('#d0d4e4'), outline=False, shade=False)
            x, y = (34, 16) if c.down else (20, 15)
            s.pts([(x + 1, y), (x, y + 1), (x + 1, y + 1), (x + 2, y + 1), (x + 1, y + 2)], '#e4e8f4')
            s.pts([(x + 1, y + 1)], '#a98ae8')


# ---- 미레유: 검은 생머리, 깃털 장식 하프 마스크, 흰 케이프 드레스 (정면만) ----
class Mireille(Char):
    dirs = ('down',)
    HAIR = Mat('#1e1b26', h='#56506a', s='#14121a', d='#0c0b10', o='#08070b')
    eye = ('#6a4a1e', '#b88a3a', '#ecc870')
    eye_style = 'soft'
    mouth = 'smirk'
    WHITE = Mat('#fbfaff', h='#ffffff', s='#d6d3e4', d='#aeaac2', o='#6c6884')

    def behind(self, c):
        hair_back(c, self.HAIR, length=46, width=4)

    def body(self, c):
        s = c.s
        legs(c, Mat('#2a2530'), Mat('#18151c'), top=42, sock_top=42)
        skirt(c, self.WHITE, top=37, bot=45, flare=5, hem=Mat('#ffffff', s='#dcd8e8', o='#6c6884'))
        torso(c, self.WHITE, top=32, bot=39, name='bodice')
        s.pts([(23, 34), (24, 35), (23, 36), (24, 37)], '#b8b4c9')
        # 케이프
        s.use('cape', Mat('#f7f6fc', s='#d4d1e2', o='#6c6884'), hl=True)
        s.poly([(18, 31), (29, 31), (36, 36), (36, 39), (11, 39), (11, 36)])
        arms(c, self.WHITE, top=36, bot=40, glove=Mat('#ffffff', s='#e0deea', o='#6c6884'))
        s.use('collar', self.WHITE)
        s.rect(20, 30, 27, 32)
        s.use('brooch', Mat('#8b93ad'), outline=False, shade=False)
        s.pts([(23, 33), (24, 33), (23, 34), (24, 34)], '#8b93ad')
        s.pts([(23, 33)], '#e8ecf6')

    def head(self, c):
        s = c.s
        # 가면 (화면 왼쪽 눈 위)
        s.use('mask', Mat('#f4f2f8', s='#d6d3e2', o='#6c6884'))
        s.poly([(11, 18), (22, 18), (22, 27), (18, 29), (11, 27)])
        s.pts([(15, 23), (16, 23), (17, 23), (18, 23), (16, 24), (17, 24)], '#4c485c')
        s.pts([(13, 20), (19, 20)], '#bfbccd')
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 12), (17, 38)], [(9, 11), (21, 38)], [(25, 38)],
                        [(28, 38)], [(30, 37)], [(32, 37)]],
                 side_locks=[(7, 12), (11, 12), (11, 36), (7, 38)], part=16)
        # 깃털
        s.use('feather', Mat('#ffffff', s='#d9d7e4', o='#8a86a0'))
        s.poly([(8, 3), (11, 0), (14, 4), (12, 13), (9, 14)])
        s.pts([(11, 3), (11, 6), (11, 9)], 's')


# ---- 변신 공통: 하트 · 별 등 장식만 다르게 ----
class Morganite(Char):
    HAIR = Mat('#f59ec4', h='#ffd6e8', s='#e0779f', d='#c25a86', o='#8c3a62')
    eye = ('#b22a5e', '#e8578a', '#ffb0cc')
    mouth = 'smile'
    DRESS = Mat('#f6a8c8', h='#ffd4e6', s='#e0809f', o='#9a4068')
    WHITE = Mat('#fff3f8', h='#ffffff', s='#f2cfe0', o='#a8668a')

    def behind(self, c):
        s = c.s
        hair_back(c, self.HAIR, length=36, width=1)
        # 바닥까지 닿는 트윈테일
        s.use('twin', self.HAIR, casts=True, group='hair')
        if c.left:
            s.poly([(33, 6), (40, 8), (43, 24), (42, 40), (38, 46), (35, 32), (34, 16)])
        else:
            s.poly([(6, 6), (11, 8), (11, 22), (9, 36), (6, 46), (2, 40), (1, 24), (3, 12)], mirror=True)
        s.retone(lambda x, y: x % 3 == 0 and y > 14, 's')
        s.retone(lambda x, y: y > 40, 'd')

    def body(self, c):
        s = c.s
        legs(c, Mat('#ffffff', s='#e8dde6'), Mat('#ef7aa6'), top=42, sock_top=43)
        skirt(c, self.DRESS, top=37, bot=43, flare=5, hem=self.WHITE)
        s.use('skirt2', Mat('#f07aa8'), outline=False)
        if c.left:
            s.rect(16, 40, 31, 40)
        else:
            s.rect(13, 40, 34, 40)
        torso(c, Mat('#f27aa6', h='#ff9ec0', s='#d45a88'), top=32, bot=38, name='corset')
        if c.down:
            s.use('heart', Mat('#ffd6e6'), outline=False, shade=False)
            s.pts([(22, 34), (25, 34), (21, 35), (22, 35), (23, 35), (24, 35), (25, 35), (26, 35),
                   (22, 36), (23, 36), (24, 36), (25, 36), (23, 37), (24, 37)], '#ffd0e2')
            s.pts([(22, 35)], '#ffffff')
        arms(c, self.WHITE, top=35, bot=39, puff=self.WHITE)
        if not c.up:
            s.use('choker', Mat('#e2386f'), outline=False)
            s.rect(21, 32, 26, 32) if c.down else s.rect(21, 32, 25, 32)

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 38)], [(9, 17), (20, 27), (30, 38)],
                        [(9, 15), (21, 26), (32, 38)], [(9, 13), (22, 25), (34, 38)], [(9, 11), (36, 38)]],
                 side_locks=[(7, 12), (11, 12), (12, 30), (9, 34)])
        s = c.s
        # 하트 아호게
        s.use('ahoge', self.HAIR, group='hair')
        s.pts([(21, 0), (25, 0), (20, 1), (22, 1), (24, 1), (26, 1), (21, 2), (25, 2), (22, 3), (24, 3), (23, 4)])
        # 큰 리본 + 하트 보석 (트윈테일 뿌리)
        if c.left:
            bow(c, 31, 4, Mat('#ec5a8e', h='#ff9ec0'), knot='#ffd0e2')
        else:
            bow(c, 0, 4, Mat('#ec5a8e', h='#ff9ec0'), knot='#ffd0e2')
            bow(c, 39, 4, Mat('#ec5a8e', h='#ff9ec0'), knot='#ffd0e2', flip=True)


class Aquamarine(Char):
    HAIR = Mat('#dde2ee', h='#ffffff', s='#b4bcd2', d='#8e98b4', o='#5c6584')
    eye = ('#21539e', '#3f86d6', '#a6d2ff')
    WHITE = Mat('#f6f8fe', h='#ffffff', s='#cfd8ec', o='#5c6a92')
    VEIL = Mat('#cbd6ec', h='#e8eefa', s='#a6b6d8', d='#8798c4', o='#4f5d88')

    def behind(self, c):
        s = c.s
        # 길게 끌리는 베일 (안감은 별이 박힌 짙은 파랑)
        s.use('veil', self.VEIL, casts=True)
        if c.left:
            s.poly([(20, 10), (36, 10), (44, 30), (45, 47), (26, 47), (24, 30)])
        else:
            s.poly([(12, 10), (35, 10), (44, 32), (46, 47), (1, 47), (3, 32)])
        s.use('lining', Mat('#2a52b4', h='#4a78d8', s='#1c3a8c', o='#14285e'), outline=True)
        if c.up:
            pass
        elif c.left:
            s.poly([(38, 30), (44, 36), (45, 47), (39, 47)])
        else:
            s.poly([(4, 36), (10, 38), (10, 47), (2, 47)], mirror=True)
        s.pts([(5, 41), (7, 45), (40, 43), (42, 39)], '#d8e8ff')
        hair_back(c, self.HAIR, length=31, width=0, tips=False)

    def body(self, c):
        s = c.s
        legs(c, None, Mat('#d6e2f5', s='#aabbd8'), top=41)
        s.use('anklet', Mat('#9cc4ff'), outline=False, shade=False)
        s.pts([(18, 43), (21, 43), (26, 43), (29, 43)], '#8ab8ff')
        skirt(c, self.WHITE, top=36, bot=41, flare=4, hem=Mat('#8fb2ec', s='#6a8fd6', o='#3e5a9e'))
        torso(c, self.WHITE, top=32, bot=37, name='bodice')
        if c.down:
            s.use('butterfly', Mat('#b8c6e6', s='#8e9ec4', o='#4f5d84'), shade=False)
            s.poly([(18, 33), (23, 35), (20, 38)])
            s.poly([(29, 33), (24, 35), (27, 38)])
            s.pts([(23, 35), (24, 35), (23, 36), (24, 36)], '#3a72d8')
        arms(c, Mat('#e6edf9', s='#c0cce6'), top=33, bot=39)

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 38)], [(9, 38)], [(9, 38)],
                        [(10, 13), (15, 18), (20, 22), (25, 27), (29, 32), (34, 37)]],
                 side_locks=[(7, 12), (13, 12), (13, 32), (8, 33)])
        s = c.s
        if c.up:
            return
        # 티아라
        s.use('tiara', Mat('#e9eef8', s='#b7c1d8', o='#6c7389'))
        s.rect(14, 6, 33, 6) if c.down else s.rect(9, 6, 24, 6)
        cx = 23 if c.down else 16
        s.pts([(cx - 5, 5), (cx, 3), (cx + 1, 3), (cx + 6, 5), (cx, 4), (cx + 1, 4)])
        s.pts([(cx, 5), (cx + 1, 5)], '#4a8fd8')
        # 나비 머리장식
        s.use('butterfly2', Mat('#7fa6ec', h='#c4d8ff', s='#4f7ccf', o='#2c3f78'))
        bx = 34 if c.down else 24
        s.poly([(bx, 2), (bx + 7, 0), (bx + 6, 7), (bx + 1, 8)])
        s.poly([(bx + 1, 8), (bx + 8, 8), (bx + 5, 12)])
        s.pts([(bx + 3, 3), (bx + 4, 4)], '#eef4ff')


class Amethyst(Char):
    HAIR = Mat('#b79ee6', h='#e6dbfa', s='#9478cc', d='#7458ae', o='#4e3a80')
    eye = ('#4e348e', '#8462cc', '#d4c2ff')
    eye_style = 'sleepy'
    WHITE = Mat('#fbf8ff', h='#ffffff', s='#ddd2f4', o='#6c56a0')

    def behind(self, c):
        s = c.s
        hair_back(c, self.HAIR, length=44, width=5)
        s.retone(lambda x, y: (x + y // 3) % 4 == 0 and y > 18, 's')   # 웨이브
        # 별 리본 띠
        s.use('ribbon', self.WHITE, casts=False)
        if not c.left:
            s.poly([(14, 38), (18, 38), (16, 47), (12, 46)], mirror=True)
            s.pts([(15, 42)], '#e8c66a', mirror=True)

    def body(self, c):
        s = c.s
        legs(c, Mat('#ffffff', s='#e6def4'), Mat('#6b4bb8'), top=42, sock_top=43)
        skirt(c, Mat('#7e5cc8', h='#a080e0'), top=39, bot=44, flare=6, name='sk3')
        skirt(c, Mat('#b9a0ee'), top=37, bot=42, flare=5, name='sk2')
        skirt(c, self.WHITE, top=35, bot=39, flare=3, name='sk1')
        s.pts([(18, 37), (24, 38), (29, 37)], '#e8c66a')
        torso(c, self.WHITE, top=32, bot=36, name='bodice')
        arms(c, Mat('#f3eefc', s='#d4c8ee'), top=35, bot=39, puff=Mat('#ffffff', s='#e0d6f6', o='#6c56a0'))
        if not c.up:
            # 목 리본
            s.use('neckbow', Mat('#6b4bb8', h='#9a7ae0'))
            if c.down:
                s.poly([(19, 31), (23, 33), (19, 35)], mirror=True)
                s.pts([(23, 33), (24, 33)], '#e8c66a')
            else:
                s.poly([(20, 31), (23, 33), (20, 35)])

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 20), (23, 38)], [(9, 18), (21, 21), (25, 38)],
                        [(9, 16), (28, 38)], [(9, 13), (31, 38)], [(9, 11), (34, 38)]],
                 side_locks=[(7, 12), (12, 12), (13, 32), (10, 38), (7, 33)], part=22)
        s = c.s
        # 똥머리
        s.use('bun', self.HAIR, hl=True, group='hair')
        if c.left:
            s.ellipse((30, 0, 39, 9))
        else:
            s.ellipse((4, 1, 13, 10))
            s.ellipse((34, 1, 43, 10))
        s.use('bunbow', Mat('#6b4bb8'))
        if not c.left:
            s.pts([(12, 9), (13, 10), (14, 9)], mirror=True)
        # 하트 아호게
        s.use('ahoge', self.HAIR, group='hair')
        s.pts([(21, 0), (25, 0), (20, 1), (22, 1), (24, 1), (26, 1), (21, 2), (25, 2), (22, 3), (24, 3), (23, 4)])
        if not c.up:
            # 초승달 핀
            s.use('moon', Mat('#f0cf6a', s='#c9a23e', o='#8a6a2a'))
            x, y = (31, 13) if c.down else (17, 12)
            s.pts([(x + 1, y), (x, y + 1), (x, y + 2), (x + 1, y + 3), (x + 2, y + 3)])


class Ruby(Char):
    HAIR = Mat('#4e2a2c', h='#8a5050', s='#3a1e22', d='#28141a', o='#180a10')
    eye = ('#76141e', '#c0303a', '#ff8a8f')
    eye_style = 'sharp'
    BLACK = Mat('#2e2733', h='#4a4052', s='#1e1a24', d='#141018', o='#0c090e')
    RED = Mat('#c4283a', h='#e85a68', s='#951b2b', o='#5c0f1a')

    def behind(self, c):
        hair_back(c, self.HAIR, length=45, width=3)

    def body(self, c):
        s = c.s
        legs(c, Mat('#2a1c24'), Mat('#3a1a22'), top=42, sock_top=42, boot_top=43)
        skirt(c, self.BLACK, top=37, bot=45, flare=6, hem=self.RED)
        s.pts([(13, 41), (18, 39), (29, 39), (34, 41)], '#c9a24a')
        torso(c, self.BLACK, top=32, bot=38, name='corset')
        if c.down:
            s.pts([(20, 34), (21, 35), (26, 35), (27, 34), (22, 36), (25, 36), (23, 37), (24, 37)], '#5a4c62')
        arms(c, self.BLACK, top=33, bot=39, style='wide')
        s.use('lining', self.RED)
        if c.down or c.up:
            s.rect(11, 40, 15, 41, mirror=True)
        if not c.up:
            s.use('rose', Mat('#d6283c', h='#ff6a78', s='#9c1a2c', o='#5a0e18'), hl=True)
            if c.down:
                s.ellipse((21, 31, 26, 35))
            else:
                s.ellipse((19, 31, 23, 35))

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 38)], [(9, 38)], [(9, 20), (22, 25), (27, 38)],
                        [(9, 17), (30, 38)], [(9, 13), (34, 38)]],
                 side_locks=[(7, 12), (12, 12), (12, 34), (8, 36)])
        s = c.s
        if c.up:
            s.use('tiara', Mat('#e2b84e', s='#b08a2c', o='#6e5218'))
            s.rect(12, 5, 35, 5)
            return
        s.use('tiara', Mat('#e2b84e', h='#fff0a8', s='#b08a2c', o='#6e5218'))
        if c.down:
            s.rect(13, 6, 34, 7)
            s.pts([(14, 5), (18, 4), (22, 2), (23, 1), (24, 1), (25, 2), (29, 4), (33, 5)])
            s.rect(22, 3, 25, 5)
            s.pts([(23, 4), (24, 4), (23, 5), (24, 5)], '#e0283c')
            s.pts([(23, 4)], '#ff9aa4')
        else:
            s.rect(9, 6, 24, 7)
            s.pts([(13, 4), (16, 2), (17, 2), (20, 4)])
            s.pts([(16, 4), (17, 4)], '#e0283c')


class Heliodor(Char):
    HAIR = Mat('#c99a72', h='#f0cfa4', s='#a87a56', d='#86603e', o='#5a3e26')
    eye = ('#7a4e14', '#c08a2a', '#f6d07a')
    DRESS = Mat('#5c3828', h='#7e5040', s='#42271c', o='#22120c')
    GOLD = Mat('#f0bf3c', h='#ffe39a', s='#d49a22', d='#b07a14', o='#7a5210')

    def behind(self, c):
        s = c.s
        s.use('veil', Mat('#fbf3e4', h='#ffffff', s='#e8d8bc', o='#9c8462'), casts=True)
        if c.left:
            s.poly([(14, 4), (34, 4), (42, 26), (40, 34), (26, 34)])
        else:
            s.poly([(9, 4), (38, 4), (44, 28), (41, 36), (6, 36), (3, 28)])
        s.retone(lambda x, y: (x + y) % 6 == 0, 's')
        hair_back(c, self.HAIR, length=42, width=4)
        s.retone(lambda x, y: (x + y // 3) % 5 == 0 and y > 16, 's')

    def body(self, c):
        s = c.s
        s.use('shoe', self.DRESS)
        s.rect(17, 45, 21, 46)
        s.rect(26, 45, 30, 46)
        skirt(c, self.DRESS, top=37, bot=45, flare=5)
        s.pts([(14, 43), (16, 41), (31, 41), (33, 43)], '#b08a4a')
        if not c.up:
            s.use('apron', Mat('#f6eed8', s='#e0d3b2', o='#8e7a56'), hl=True)
            if c.down:
                s.poly([(18, 37), (29, 37), (31, 43), (16, 43)])
                s.pts([(23, 39), (24, 39), (23, 41), (24, 41)], '#c9a24a')
            else:
                s.poly([(14, 37), (19, 37), (19, 43), (13, 43)])
        torso(c, Mat('#4a2c20', s='#36201a', o='#1e110c'), top=32, bot=38, name='bodice')
        s.use('sash', self.GOLD)
        s.rect(16, 37, 31, 37) if not c.left else s.rect(18, 37, 29, 37)
        # 황금 숄
        s.use('shawl', self.GOLD, hl=True)
        if c.left:
            s.poly([(19, 31), (28, 31), (30, 38), (27, 45), (24, 45), (24, 37)])
        else:
            s.poly([(17, 31), (12, 35), (10, 46), (14, 46), (16, 38)])
            s.poly([(30, 31), (35, 35), (37, 46), (33, 46), (31, 38)])
            if c.up:
                s.poly([(16, 31), (31, 31), (31, 38), (16, 38)])
        s.retone(lambda x, y: y >= 45, 'd')
        s.use('hand', SKIN)
        if c.down:
            s.rect(15, 39, 16, 40, mirror=True)
        if not c.up:
            s.use('neckbow', Mat('#5a3626'))
            if c.down:
                s.poly([(19, 31), (23, 32), (19, 34)], mirror=True)
            s.use('bell', Mat('#f2c84a', h='#fff2b0', s='#c99a2a', o='#7a5a14'))
            bx = 23 if c.down else 20
            s.rect(bx, 33, bx + 1, 35)
            s.pts([(bx - 1, 35), (bx + 2, 35)])

    def head(self, c):
        hair_cap(c, self.HAIR,
                 bangs=[[(9, 38)], [(9, 38)], [(9, 21), (24, 38)], [(9, 19), (25, 28), (30, 38)],
                        [(9, 16), (31, 38)], [(9, 13), (33, 38)], [(10, 11), (35, 37)]],
                 side_locks=[(7, 12), (12, 12), (13, 30), (9, 36), (6, 30)], top=4)
        s = c.s
        s.use('lace', Mat('#fffaf0', s='#eadcc0', o='#9c8462'))
        if c.left:
            s.rect(10, 4, 30, 5)
        else:
            s.rect(12, 4, 35, 5)
            for x in range(12, 36, 2):
                s.px(x, 3, 'b')
        s.use('hbow', Mat('#5a3626', h='#7e5040'))
        if c.down:
            bow(c, 31, 0, Mat('#5a3626', h='#8a5a40'), knot='#e8b830')
        elif c.left:
            bow(c, 25, 0, Mat('#5a3626', h='#8a5a40'), knot='#e8b830')


CHARACTERS = {
    'hero': Claire(),
    'mayer': Mayer(),
    'mireille': Mireille(),
    'morganite': Morganite(),
    'aquamarine': Aquamarine(),
    'amethyst': Amethyst(),
    'ruby': Ruby(),
    'heliodor': Heliodor(),
}

CODES = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!#$%&()*+,-/:;<=>?@[]^_{|}~'


def render(ch, d, f, blink=False):
    s = Sprite()
    c = C(s, d, f, blink)
    if d != 'up':
        ch.behind(c)
    ch.body(c)
    if d == 'up':
        ch.behind(c)
    face(c, ch.skin)
    eyes(c, *ch.eye, style=ch.eye_style, which='right' if isinstance(ch, Mireille) else 'both')
    blush_mouth(c, ch.mouth)
    ch.head(c)
    return s.finish()


def main():
    data = {}
    sheet_rows = []
    for cid, ch in CHARACTERS.items():
        frames = {}
        for d in ch.dirs:
            for f in (0, 1, 2):
                frames['%s%d' % (d, f)] = render(ch, d, f)
        frames['blink'] = render(ch, 'down', 1, blink=True)
        frames['idle'] = frames['down1']
        palette, enc = [], {}
        for name, grid in frames.items():
            rows = []
            for row in grid:
                line = ''
                for col in row:
                    if col is None:
                        line += '.'
                        continue
                    if col not in palette:
                        palette.append(col)
                    line += CODES[palette.index(col)]
                rows.append(line)
            enc[name] = rows
        assert len(palette) <= len(CODES), (cid, len(palette))
        data[cid] = {'w': W, 'h': H, 'dirs': list(ch.dirs), 'palette': palette, 'frames': enc}
        sheet_rows.append((cid, frames, ch.dirs))

    js = ('/* 자동 생성 파일 — tools/dots.py 를 수정하고 다시 실행할 것 */\n'
          'window.WS = window.WS || {};\n'
          'WS.DOTS = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    (ROOT / 'js' / 'render' / 'dots.js').write_text(js, encoding='utf-8')

    # 미리보기: 캐릭터마다 한 줄 (down 0 1 2 | left 0 1 2 | up 0 1 2)
    z = 4
    cols = 9
    sheet = Image.new('RGBA', (cols * W * z, len(sheet_rows) * H * z), (238, 232, 236, 255))
    for r, (cid, frames, dirs) in enumerate(sheet_rows):
        i = 0
        for d in ('down', 'left', 'up'):
            for f in (0, 1, 2):
                key = '%s%d' % (d, f)
                if key in frames:
                    img = Image.new('RGBA', (W, H), (0, 0, 0, 0))
                    for y, row in enumerate(frames[key]):
                        for x, col in enumerate(row):
                            if col:
                                img.putpixel((x, y), hx(col) + (255,))
                    sheet.alpha_composite(img.resize((W * z, H * z), Image.NEAREST), (i * W * z, r * H * z))
                i += 1
    sheet.save(ROOT / 'tools' / 'dots_preview.png')
    print('ok', {k: len(v['palette']) for k, v in data.items()})


if __name__ == '__main__':
    main()
