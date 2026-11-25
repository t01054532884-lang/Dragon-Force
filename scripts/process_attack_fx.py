"""맵 테마 공격 효과(B안, 2026-11-25, Higgsfield GPT Image 2.6): 원본 art-src/fx-atk/*.png(1024 투명)
→ public/art/fx/atk-s<단계>.webp(바닥 효과, 투명 여백을 잘라 정사각형 384) · shot-<종류>.webp(탄, 오른쪽을 향함, 가로 192).
실행: py -I scripts/process_attack_fx.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'fx-atk'
OUT = ROOT / 'public' / 'art' / 'fx'

def trim(im):
    a = im.split()[-1].point(lambda v: 0 if v < 10 else v)
    im.putalpha(a)
    return im.crop(a.getbbox())

for f in sorted(SRC.glob('*.png')):
    im = trim(Image.open(f).convert('RGBA'))
    if f.stem.startswith('atk-'):
        side = max(im.size)
        sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
        im = sq.resize((384, 384), Image.LANCZOS)
    else:
        w = 192
        im = im.resize((w, max(1, round(im.height * w / im.width))), Image.LANCZOS)
    im.save(OUT / f'{f.stem}.webp', 'WEBP', quality=86, method=4)
    print(f.stem, im.size)
