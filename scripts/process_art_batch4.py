"""그림 4차분(2026-11-19 기획자 그림): 상자 개봉 연출용 본체·뚜껑 분리판 3종.

원본은 1254×1254 투명 PNG, 본체와 뚜껑이 같은 캔버스·같은 자리(겹치면 닫힌 상자)라 위치 보정 없이
같은 비율로 600×600으로 줄여 webp로 저장한다. 짝: 금색 = gold · 나무+쇠 = equipment · 보라 비늘 = dragon.
사용법: python scripts/process_art_batch4.py  (art-src/chests/ → public/art/chest/)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'chests'
OUT = ROOT / 'public' / 'art' / 'chest'
SIZE = 600

OUT.mkdir(parents=True, exist_ok=True)
for box in ('dragon', 'equipment', 'gold'):
    for part in ('body', 'lid'):
        im = Image.open(SRC / f'chest-{box}-{part}.png').convert('RGBA')
        # 가장자리 희미한 잡티(알파 12 이하)는 지운다
        r, g, b, a = im.split()
        a = a.point(lambda v: 0 if v <= 12 else v)
        im = Image.merge('RGBA', (r, g, b, a)).resize((SIZE, SIZE), Image.LANCZOS)
        im.save(OUT / f'chest-{box}-{part}.webp', 'WEBP', quality=90, method=6)
        print(box, part, (OUT / f'chest-{box}-{part}.webp').stat().st_size // 1024, 'KB')
