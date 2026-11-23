"""22차분(2026-11-24, 그림 요청서 7 ⑤): 스킨 망토 3 · 발자국 6. 제작자 ChatGPT 공유 링크(1254, 투명 배경, 한 장씩).
art-src/skins/<스킨 아이디>.png →
- public/art/skin/skin-cape-<아이디>.webp 256 (전투 중 드래곤 아래층, 어깨가 위)
- public/art/skin/skin-trail-<모양>.webp 128 (발자국 한 개)
- public/art/skin/skin-icon-<아이디>.webp 256 (룰렛·장비 칸 아이콘 — 위 그림으로 AI가 만듦: 둥근 보라 바탕 + 망토 / 발자국 3개 비스듬히)"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'skins'
OUT = ROOT / 'public' / 'art' / 'skin'
CAPES = ['cape-ember-king', 'cape-frost-crown', 'cape-starlight']
TRAILS = {'trail-flame': 'flame', 'trail-frost': 'frost', 'trail-star': 'star', 'trail-petal': 'petal', 'trail-spark': 'spark', 'trail-shadow': 'shadow'}


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def badge(size: int = 256) -> Image.Image:
    b = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(b).rounded_rectangle((6, 6, size - 7, size - 7), radius=40, fill=(29, 23, 51, 255))
    return b


OUT.mkdir(parents=True, exist_ok=True)


def save(im: Image.Image, name: str) -> None:
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
