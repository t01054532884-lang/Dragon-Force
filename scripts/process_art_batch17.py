"""17차분(2026-11-23): 드래곤 패스 상자 3개(무료·프리미엄·로열) 한 장 → 따로 자르기.
원본: art-src/batch17/pass-chests.png(1254 투명, 가로로 3개) → public/art/pass/pass-<free|premium|royal>.webp 256
실행: py scripts/process_art_batch17.py
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch17' / 'pass-chests.png'
OUT = ROOT / 'public' / 'art' / 'pass'


def main() -> None:
    im = Image.open(SRC).convert('RGBA')
    a = im.getchannel('A')
    w, h = im.size
    cols = [any(a.getpixel((x, y)) > 20 for y in range(0, h, 3)) for x in range(w)]
    spans, start = [], None
    for x, on in enumerate(cols + [False]):
        if on and start is None:
            start = x
        elif not on and start is not None:
            if x - start > 40:
                spans.append((start, x))
            start = None
    assert len(spans) == 3, spans
    for name, (x0, x1) in zip(['free', 'premium', 'royal'], spans):
        fit_square(im.crop((x0, 0, x1, h)), 256, 0.03).save(OUT / f'pass-{name}.webp', 'WEBP', quality=88, method=4)
        print('가공', name, x0, x1)


if __name__ == '__main__':
    main()
