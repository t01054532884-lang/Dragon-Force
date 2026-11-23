"""19차분(2026-11-24): 신규 9종 기본 공격 탄(그림 요청서 7 ②). 제작자 ChatGPT 이미지 공유 링크의 3×3 합본(1536×1024, 투명 배경).
칸마다 그림 영역만 잘라 256×256(가운데, 오른쪽 방향 유지) WebP로 저장 → public/art/proj/<이름>.webp"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'proj9' / 'sheet.png'
OUT = ROOT / 'public' / 'art' / 'proj'
NAMES = [
    ['proj-aurora', 'proj-mirror', 'proj-chrono'],
    ['proj-void', 'proj-sand', 'proj-steel'],
    ['proj-bloom', 'fx-sound-ring', 'fx-crimson-slash'],
]


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    bbox = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


sheet = Image.open(SRC).convert('RGBA')
cw, ch = sheet.width // 3, sheet.height // 3
OUT.mkdir(parents=True, exist_ok=True)
for r, row in enumerate(NAMES):
    for c, name in enumerate(row):
        cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
        out = OUT / f'{name}.webp'
        fit_square(cell, 256, 0.02).save(out, 'WEBP', quality=90, method=6)
        print(name, out.stat().st_size)
