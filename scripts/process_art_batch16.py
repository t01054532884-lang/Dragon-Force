"""16차분(2026-11-23): 상점 패키지 그림 4장 · 장비/룬 개봉권 아이콘 2장.
원본: art-src/batch16/ → public/art/shop/pkg-*.webp 384 · public/art/ui-ticket-equip·rune.webp 256
실행: py scripts/process_art_batch16.py
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch16'
OUT = ROOT / 'public' / 'art'


def main() -> None:
    for k in ['pkg-dragon', 'pkg-gear', 'pkg-rune', 'pkg-mega']:
        fit_square(Image.open(SRC / f'{k}.png'), 384, 0.03).save(OUT / 'shop' / f'{k}.webp', 'WEBP', quality=86, method=4)
        print('가공', k)
    for k in ['ui-ticket-equip', 'ui-ticket-rune']:
        fit_square(Image.open(SRC / f'{k}.png'), 256, 0.03).save(OUT / f'{k}.webp', 'WEBP', quality=88, method=4)
        print('가공', k)


if __name__ == '__main__':
    main()
