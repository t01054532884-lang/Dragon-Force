"""24차분~(2026-11-24, 그림 요청서 10): 단계별 로비 배경 · 전투 바닥 · 2~20단계 몬스터. 제작자 ChatGPT 공유 링크로 한 장씩.
art-src/stage/lobby-bg-<n>.png → public/art/stage/lobby-bg-<n>.jpg (1080×1920, 품질 85)
art-src/stage/floor-s<n>.png   → public/art/stage/floor-s<n>.webp (512)
art-src/enemies/art-e-<id>.png → public/art/enemy/art-e-<id>.webp (일반 256 · 엘리트 384 · 보스 512, 투명 여백 자름)
있는 원본만 처리한다(다시 돌려도 됨). 처리한 뒤 src/ui/art.ts STAGE_ART_READY에 번호·id를 적는다."""
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC_STAGE = ROOT / 'art-src' / 'stage'
SRC_ENEMY = ROOT / 'art-src' / 'enemies'
OUT_STAGE = ROOT / 'public' / 'art' / 'stage'
OUT_ENEMY = ROOT / 'public' / 'art' / 'enemy'
OUT_STAGE.mkdir(parents=True, exist_ok=True)


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    """비율을 지키며 w×h를 덮고 가운데를 자른다"""
    im = im.convert('RGB')
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def fit_square(im: Image.Image, size: int, pad: float = 0.02) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


for src in sorted(SRC_STAGE.glob('lobby-bg-*.png')):
    out = OUT_STAGE / f'{src.stem}.jpg'
    cover(Image.open(src), 1080, 1920).save(out, 'JPEG', quality=85, optimize=True, progressive=True)
    print(out.name, out.stat().st_size)

for src in sorted(SRC_STAGE.glob('floor-s*.png')):
    out = OUT_STAGE / f'{src.stem}.webp'
    Image.open(src).convert('RGB').resize((512, 512), Image.LANCZOS).save(out, 'WEBP', quality=88, method=6)
    print(out.name, out.stat().st_size)

# 몬스터 크기: 인자로 "id=size"를 주면 그 크기, 아니면 256
sizes = dict(a.split('=') for a in sys.argv[1:] if '=' in a)
for src in sorted(SRC_ENEMY.glob('art-e-*.png')) if SRC_ENEMY.exists() else []:
    out = OUT_ENEMY / f'{src.stem}.webp'
    fit_square(Image.open(src), int(sizes.get(src.stem[6:], 256))).save(out, 'WEBP', quality=88, method=6)
    print(out.name, out.stat().st_size)
