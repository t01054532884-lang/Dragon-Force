"""21차분(2026-11-24, 그림 요청서 7 ④): 진화·적중 효과 6장. 제작자 ChatGPT 공유 링크(1254, 투명 배경, 한 장씩).
art-src/fx6/<이름>.png → public/art/fx/<이름>.webp 256. (공유 링크의 순서와 그림이 달라 미러·오로라 이름을 그림 보고 바로잡음)"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'fx6'
OUT = ROOT / 'public' / 'art' / 'fx'
NAMES = ['fx-aurora-split', 'fx-mirror-bounce', 'fx-void-burst', 'fx-sand-pillar', 'fx-bloom-burst', 'fx-heal-flower']


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


for n in NAMES:
    out = OUT / f'{n}.webp'
    fit_square(Image.open(SRC / f'{n}.png'), 256, 0.02).save(out, 'WEBP', quality=88, method=6)
    print(out.name, out.stat().st_size)
