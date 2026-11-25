"""행동력 구매 창 그림 2장(2026-11-26, Higgsfield · 우리 행동력 아이콘 ui-energy를 참고 그림으로).
원본 art-src/stamina/*.png → public/art/ui/<이름>.webp(투명 여백 잘라 정사각형 256).
실행: py -I scripts/process_stamina_shop.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
for name in ['stamina-pack', 'stamina-free']:
    im = Image.open(ROOT / 'art-src' / 'stamina' / f'{name}.png').convert('RGBA')
    a = im.split()[-1].point(lambda v: 0 if v < 10 else v)
    im.putalpha(a)
    im = im.crop(a.getbbox())
    side = max(im.size)
    sq = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    sq.paste(im, ((side - im.width) // 2, (side - im.height) // 2), im)
    sq.resize((256, 256), Image.LANCZOS).save(ROOT / 'public' / 'art' / 'ui' / f'{name}.webp', 'WEBP', quality=88, method=4)
    print(name)
