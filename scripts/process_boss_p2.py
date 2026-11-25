"""보스 2페이즈 그림 20장(2026-11-25, Higgsfield GPT Image 2.6 · 1페이즈 그림을 참고 그림으로).
원본 art-src/enemies/hf-p2/<id>.png(1024 투명) → public/art/enemy/art-<텍스처>-p2.webp(512, 1페이즈와 같은 규칙: 투명 여백을 잘라 가장 긴 변을 꽉 채움).
실행: py -I scripts/process_boss_p2.py
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'enemies' / 'hf-p2'
OUT = ROOT / 'public' / 'art' / 'enemy'
SIZE = 512
PAD = 7

for f in sorted(SRC.glob('*.png')):
    im = Image.open(f).convert('RGBA')
    a = im.split()[-1].point(lambda v: 0 if v < 12 else v)
    im.putalpha(a)
    im = im.crop(a.getbbox())
    s = (SIZE - PAD * 2) / max(im.size)
    im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(im, ((SIZE - im.width) // 2, (SIZE - im.height) // 2), im)
    tex = 'graymane' if f.stem == 'graymane' else f'e-{f.stem}'
    out.save(OUT / f'art-{tex}-p2.webp', 'WEBP', quality=88, method=6)
    print(tex, im.size)
