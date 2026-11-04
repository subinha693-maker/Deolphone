#!/usr/bin/env python3
"""게임 전체를 HTML 파일 하나로 묶는다 (CSS · JS · 이미지를 모두 안에 넣음).

사용법 (game 폴더에서):  python3 tools/bundle.py [출력경로]
  기본 출력: dist/game.html  — 이 파일 하나만 있으면 어디서든 열 수 있다 (폰에 보내기 · 공유용)
"""
import base64
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def uri(p: Path) -> str:
    mime = 'image/png' if p.suffix == '.png' else 'image/jpeg'
    return f'data:{mime};base64,' + base64.b64encode(p.read_bytes()).decode()


def main():
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'dist' / 'game.html'
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    css = (ROOT / 'css' / 'style.css').read_text(encoding='utf-8')
    for p in (ROOT / 'assets' / 'ui').glob('*.png'):
        css = css.replace('../assets/ui/' + p.name, uri(p))
    scripts = re.findall(r'<script src="([^"]+)"></script>', html)
    js = '\n'.join((ROOT / s).read_text(encoding='utf-8') for s in scripts)
    imgs = list((ROOT / 'assets' / 'portraits').glob('*.jpg')) + list((ROOT / 'assets' / 'jobs').glob('*.jpg'))
    for p in sorted(imgs, key=lambda p: -len(p.name)):
        rel = p.relative_to(ROOT).as_posix()
        js = js.replace("'" + rel + "'", "'" + uri(p) + "'")
    left = re.findall(r"'assets/(?:portraits|jobs)/[^']+'", js)
    if left:
        raise SystemExit('묶지 못한 이미지: ' + ', '.join(sorted(set(left))[:5]))
    head = html[html.index('<head>') + 6:html.index('<link rel="stylesheet" href="css/style.css">')]
    body = html[html.index('<body>') + 6:html.index('<!-- 데이터')]
    doc = (
        '<!doctype html>\n<html lang="ko">\n<head>' + head +
        '<style>\n' + css + '\n</style>\n</head>\n<body>' + body +
        '<script>\n' + js + '\n</script>\n</body>\n</html>\n'
    )
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(doc, encoding='utf-8')
    print(f'{out}  ({len(doc) / 1024 / 1024:.1f} MB, 스크립트 {len(scripts)}개)')


if __name__ == '__main__':
    main()
