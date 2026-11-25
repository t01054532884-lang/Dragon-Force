"""영어 그림 2장(2026-11-25, Higgsfield GPT Image 2.6 편집, 투명 배경으로 받음).
art-src/en/hf-logo-en-1.png          → public/art/logo-en.webp          (800×254, 한글 로고와 같은 크기)
art-src/en/hf-event-winter-en-1.png  → public/art/event-winter-en.webp  (879×299, 겨울 축제 배너와 같은 크기)
투명 여백을 자르고 비율을 지킨 채 칸 안에 가운데 맞춤(남는 곳은 투명). 다시 돌려도 됨.
원본 경로(art-src/)는 메인 저장소 폴더 — worktree에서 돌릴 때는 ART_SRC 환경변수로 지정."""
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('ART_SRC', ROOT / 'art-src')) / 'en'
OUT = ROOT / 'public' / 'art'

JOBS = [
    ('hf-logo-en-1.png', 'logo-en.webp', (800, 254)),
    ('hf-event-winter-en-1.png', 'event-winter-en.webp', (879, 299)),
]


def fit(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    s = min(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    canvas = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return canvas


for src, dst, (w, h) in JOBS:
    p = SRC / src
    if not p.exists():
        print('없음:', p)
        continue
    out = fit(Image.open(p), w, h)
    out.save(OUT / dst, 'WEBP', quality=90, method=6)
    print(dst, out.size, f'{(OUT / dst).stat().st_size // 1024}KB')
