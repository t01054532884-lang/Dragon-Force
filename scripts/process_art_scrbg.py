"""화면 배경 7장(2026-11-25, Higgsfield GPT Image 2.6, 로비 배경을 화풍 참고 그림으로, 9:16).
art-src/bg/hf-scrbg-<화면>.png → public/art/bg/scrbg-<화면>.webp (720×1280, 가운데 기준 채워 자름)
화면: missions(미션) · gifts(우편함=선물함) · pass(패스) · attendance(출석) · achievements(업적) · shop(상점) · lab(연구소)
+ (2026-11-26 2차) dragons(드래곤 둥지) · equip(무기고) · event(겨울 축제 마을)
원본 경로(art-src/)는 메인 저장소 폴더 — worktree에서 돌릴 때는 ART_SRC 환경변수로 지정."""
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('ART_SRC', ROOT / 'art-src')) / 'bg'
OUT = ROOT / 'public' / 'art' / 'bg'
OUT.mkdir(parents=True, exist_ok=True)
KEYS = ['missions', 'gifts', 'pass', 'attendance', 'achievements', 'shop', 'lab', 'dragons', 'equip', 'event']


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    im = im.convert('RGB')
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


for k in KEYS:
    p = SRC / f'hf-scrbg-{k}.png'
    if not p.exists():
        print('없음:', p)
        continue
    out = OUT / f'scrbg-{k}.webp'
    cover(Image.open(p), 720, 1280).save(out, 'WEBP', quality=80, method=6)
    print(out.name, f'{out.stat().st_size // 1024}KB')
