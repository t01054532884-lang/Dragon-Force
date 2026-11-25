"""필살기 컷신 그림·영상(2026-11-25, Higgsfield MCP, docs/ULTIMATE.md).
art-src/ult/hf-ult-bg-1.png          → public/art/ult/ult-bg.webp   (720×1280, 19종 공통 하늘 배경 — 영상 없는 드래곤의 대체 연출 바탕)
art-src/ult/hf-red-seedance-4s.mp4   → public/art/ult/ult-red.mp4   (Seedance 2.5 720×1280 4초, 소리 포함 — 그대로 복사)
art-src/ult/hf-<id>-video-1.mp4      → public/art/ult/ult-<id>.mp4  (나머지 18종, 같은 규격)
art-src/ult/hf-<id>-fx-1.png         → public/art/ult/ult-fx-<id>.webp (전장 효과, 폭 1024)
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


def fresh(src: Path, out: Path) -> bool:
    """결과가 원본보다 새것이면 건너뜀(webp 최고 압축이 느려서 다시 돌릴 때 바뀐 것만)"""
    return out.exists() and out.stat().st_mtime >= src.stat().st_mtime

OTHERS = 'blue yellow green sand steel white black stone bloom howl wind water crimson mirror chrono void aurora arcane'.split()
# 영상: 레드는 비교 때 받은 Seedance 4초, 나머지 18종(2026-11-25 밤)은 hf-<id>-video-1.mp4
VIDEOS = {'red': 'hf-red-seedance-4s.mp4', **{d: f'hf-{d}-video-1.mp4' for d in OTHERS}}
# 비슷한 4쌍 다시 만들기(2026-11-25 제작자 결정): 워터 심해의 격류·샌드 사막의 균열·아케인 마력 강림·블랙 그림자 포식은 2번째 판
REDONE = ['water', 'sand', 'arcane', 'black']
VIDEOS.update({d: f'hf-{d}-video-2.mp4' for d in REDONE})


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert('RGB')
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


bg = SRC / 'hf-ult-bg-1.png'
if bg.exists() and not fresh(bg, OUT / 'ult-bg.webp'):
    cover(Image.open(bg), 720, 1280).save(OUT / 'ult-bg.webp', 'WEBP', quality=85, method=6)
    print('ult-bg.webp', f'{(OUT / "ult-bg.webp").stat().st_size // 1024}KB')

# 필살기 전장 효과(섬광 뒤 화면 전체를 위→아래로 쓸고 지나가는 그림, 2026-11-25)
# 레드: 가로로 긴 불의 파도를 위아래 뒤집어 물마루가 아래(가는 쪽)로. 나머지 18종은 처음부터 아래쪽이 앞(진한 쪽)이 되게 요청해 그대로.
FX = {'red': ('hf-red-fx-wave-2.png', True), **{d: (f'hf-{d}-fx-1.png', False) for d in OTHERS}}
# 다시 만든 4종: 위에서 본 정사각(소용돌이·균열·마법진 — 돌리므로 가운데가 어긋나지 않게 자르지 않음)과 블랙 세로 날개(왼쪽 붙음, 잘라서 높이 1024)
FX.update({d: (f'hf-{d}-fx-2.png', False) for d in REDONE})
SQUARE = {'water', 'sand', 'arcane'}
for dragon, (name, flip) in FX.items():
    p = SRC / name
    if p.exists() and not fresh(p, OUT / f'ult-fx-{dragon}.webp'):
        im = Image.open(p).convert('RGBA')
        if flip:
            im = im.transpose(Image.FLIP_TOP_BOTTOM)
        if dragon in SQUARE:
            im = im.resize((1024, 1024), Image.LANCZOS)
            im.save(OUT / f'ult-fx-{dragon}.webp', 'WEBP', quality=85, method=6)
            print(f'ult-fx-{dragon}.webp', im.size)
            continue
        bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
        if bbox:
            im = im.crop(bbox)
        s = 1024 / (im.height if dragon == 'black' else im.width)
        im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
        im.save(OUT / f'ult-fx-{dragon}.webp', 'WEBP', quality=85, method=6)
        print(f'ult-fx-{dragon}.webp', im.size, f'{(OUT / f"ult-fx-{dragon}.webp").stat().st_size // 1024}KB')

for dragon, name in VIDEOS.items():
    p = SRC / name
    if p.exists() and not fresh(p, OUT / f'ult-{dragon}.mp4'):
        shutil.copyfile(p, OUT / f'ult-{dragon}.mp4')
        print(f'ult-{dragon}.mp4', f'{p.stat().st_size // 1024}KB')
