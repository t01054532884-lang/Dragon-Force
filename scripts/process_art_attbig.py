"""출석 큰 보상 강조 그림 3장(2026-11-25, Higgsfield GPT Image 2.6, 투명 배경).
art-src/ui/hf-att-big-frame.png → public/art/ui/att-big-frame.webp (480×400, 7·14·21·28일 금테 카드)
art-src/ui/hf-att-rays.png      → public/art/ui/att-rays.webp      (256, 아이콘 뒤에서 도는 빛살)
art-src/ui/hf-att-ruby-hoard.png → public/art/ui/att-ruby-hoard.webp (256, 큰 루비 보상 아이콘)
원본 경로(art-src/)는 메인 저장소 폴더 — worktree에서 돌릴 때는 ART_SRC 환경변수로 지정."""
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('ART_SRC', ROOT / 'art-src')) / 'ui'
OUT = ROOT / 'public' / 'art' / 'ui'


def crop_alpha(im):
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def square(im, size, pad=0.03):
    im = crop_alpha(im)
    side = int(max(im.size) / (1 - 2 * pad))
    c = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    c.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return c.resize((size, size), Image.LANCZOS)


jobs = [
    ('hf-att-big-frame.png', 'att-big-frame.webp', lambda im: crop_alpha(im).resize((480, 400), Image.LANCZOS)),
    ('hf-att-rays.png', 'att-rays.webp', lambda im: Image.open(SRC / 'hf-att-rays.png').convert('RGBA').resize((256, 256), Image.LANCZOS)),
    ('hf-att-ruby-hoard.png', 'att-ruby-hoard.webp', lambda im: square(im, 256)),
]
for src, dst, fn in jobs:
    p = SRC / src
    if not p.exists():
        print('없음:', p)
        continue
    out = fn(Image.open(p))
    out.save(OUT / dst, 'WEBP', quality=88, method=6)
    print(dst, out.size, f'{(OUT / dst).stat().st_size // 1024}KB')
