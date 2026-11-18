"""그림 5차분(8단계 v2.0 묶음, 2026-11-19): 선물함·행동력·탐욕 아이콘, 로고, 타이틀 장식, 겨울 배너, 스톤·워터 탑다운, 상자 안쪽 빛 3종.

받은 PNG는 그림마다 "오른쪽 위 18%를 비우는" 여백이 들어 있어 아이콘이 왼쪽 아래로 치우쳐 있다.
게임 안에서는 화면 단위로 닫기 버튼 자리를 피하므로(레이아웃 담당), 아이콘·드래곤은 보이는 부분만 잘라
정사각 가운데에 다시 놓는다(기존 아이콘과 같은 규칙). 상자 빛은 상자와 같은 600 캔버스를 그대로 둔다.
사용법: python scripts/process_art_batch5.py  (art-src/stage8v2/ → public/art/)
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'stage8v2'
OUT = ROOT / 'public' / 'art'


def content(im: Image.Image) -> Image.Image:
    a = im.split()[3].point(lambda v: 255 if v > 12 else 0)
    return im.crop(a.getbbox())


def square(src: str, dst: str, size: int, margin: float) -> None:
    im = content(Image.open(SRC / src).convert('RGBA'))
    inner = int(size * (1 - 2 * margin))
    k = inner / max(im.size)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    c = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    c.alpha_composite(im, ((size - im.width) // 2, (size - im.height) // 2))
    save(c, dst)


def fit(src: str, dst: str, max_w: int) -> None:
    """보이는 부분만 잘라 가로 max_w로(비율 유지)"""
    im = content(Image.open(SRC / src).convert('RGBA'))
    k = min(1, max_w / im.width)
    save(im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS), dst)


def save(im: Image.Image, dst: str) -> None:
    p = OUT / dst
    p.parent.mkdir(parents=True, exist_ok=True)
    im.save(p, 'WEBP', quality=90, method=6)
    print(dst, im.size, p.stat().st_size // 1024, 'KB')


square('ui-mailbox.png', 'ui/ui-mailbox.webp', 256, 0.03)
square('ui-energy.png', 'ui/ui-energy.webp', 256, 0.03)
square('passive-greed.png', 'skill/passive-greed.webp', 256, 0.02)
square('dragon-stone-topdown.png', 'top/top-stone.webp', 384, 0.02)
square('dragon-water-topdown.png', 'top/top-water.webp', 384, 0.02)
fit('logo-ko.png', 'logo-ko.webp', 800)
fit('event-winter.png', 'event-winter.webp', 880)
fit('title-background.png', 'title-deco.webp', 720)
for c in ('blue', 'purple', 'gold'):
    im = Image.open(SRC / f'chest-inner-light-{c}.png').convert('RGBA')
    save(im, f'chest/chest-inner-{c}.webp')
