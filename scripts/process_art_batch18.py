"""18차분(2026-11-24): 신규 4종 기본 공격 카드 아이콘(그림 요청서 7 ①). 제작자 ChatGPT 이미지 공유 링크.
원본 art-src/basic4/basic-<id>.png (1254, 투명 배경, 금테 둥근 배지) → public/art/skill/basic-<id>.webp 256."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'basic4'
OUT = ROOT / 'public' / 'art' / 'skill'


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


for i in ['mirror', 'chrono', 'void', 'aurora']:
    out = OUT / f'basic-{i}.webp'
    fit_square(Image.open(SRC / f'basic-{i}.png'), 256, 0.008).save(out, 'WEBP', quality=90, method=6)
    print(out.name, out.stat().st_size)
