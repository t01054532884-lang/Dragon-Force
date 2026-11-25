"""필살기 컷신 그림·영상(2026-11-25, Higgsfield MCP, docs/ULTIMATE.md).
art-src/ult/hf-ult-bg-1.png          → public/art/ult/ult-bg.webp   (720×1280, 19종 공통 하늘 배경 — 영상 없는 드래곤의 대체 연출 바탕)
art-src/ult/hf-red-seedance-4s.mp4   → public/art/ult/ult-red.mp4   (Seedance 2.5 720×1280 4초, 소리 포함 — 그대로 복사)
영상 원본이 이미 720p·약 2.7MB라 다시 압축하지 않는다(이 PC에 ffmpeg 없음).
원본 경로(art-src/)는 메인 저장소 폴더 — worktree에서 돌릴 때는 ART_SRC 환경변수로 지정."""
import os
import shutil
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('ART_SRC', ROOT / 'art-src')) / 'ult'
OUT = ROOT / 'public' / 'art' / 'ult'
OUT.mkdir(parents=True, exist_ok=True)

VIDEOS = {'red': 'hf-red-seedance-4s.mp4'}


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert('RGB')
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


bg = SRC / 'hf-ult-bg-1.png'
if bg.exists():
    cover(Image.open(bg), 720, 1280).save(OUT / 'ult-bg.webp', 'WEBP', quality=85, method=6)
    print('ult-bg.webp', f'{(OUT / "ult-bg.webp").stat().st_size // 1024}KB')

for dragon, name in VIDEOS.items():
    p = SRC / name
    if p.exists():
        shutil.copyfile(p, OUT / f'ult-{dragon}.mp4')
        print(f'ult-{dragon}.mp4', f'{p.stat().st_size // 1024}KB')
