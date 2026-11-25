"""스킨 4번째 묶음(2026-11-25 밤, Higgsfield GPT Image 2.6, 투명 배경): 성야의 망토 · 극광 발자국 · 황금 종 발자국.
처리 방식은 scripts/process_art_batch22.py와 같다(망토 256 · 발자국 128 · 아이콘 256 = 둥근 보라 바탕 + 그림).
원본 art-src/skins/<아이디>.png 는 메인 저장소 폴더 — worktree에서 돌릴 때는 ART_SRC 환경변수로 지정."""
import os
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('ART_SRC', ROOT / 'art-src')) / 'skins'
OUT = ROOT / 'public' / 'art' / 'skin'
CAPES = ['cape-holy-night']
TRAILS = {'trail-aurora': 'aurora', 'trail-bell': 'bell'}


def fit_square(im, size, pad):
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def badge(size=256):
    b = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(b).rounded_rectangle((6, 6, size - 7, size - 7), radius=40, fill=(29, 23, 51, 255))
    return b


def save(im, name):
    out = OUT / f'{name}.webp'
    im.save(out, 'WEBP', quality=90, method=6)
    print(out.name, out.stat().st_size)


for c in CAPES:
    src = Image.open(SRC / f'{c}.png')
    save(fit_square(src, 256, 0.01), f'skin-cape-{c}')
    icon = badge()
    icon.alpha_composite(fit_square(src, 216, 0.02), (20, 20))
    save(icon, f'skin-icon-{c}')

for t, shape in TRAILS.items():
    src = fit_square(Image.open(SRC / f'{t}.png'), 128, 0.04)
    save(src, f'skin-trail-{shape}')
    icon = badge()
    for (x, y, s) in [(34, 150, 72), (90, 94, 86), (150, 34, 100)]:
        icon.alpha_composite(src.resize((s, s), Image.LANCZOS), (x, y))
    save(icon, f'skin-icon-{t}')
