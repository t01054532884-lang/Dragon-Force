"""그림 요청서 5 A-1: 전용 스킬 전투 효과 10장 가공(2026-11-21).
원본(우선): art-src/batch8-fx/<이름>.png — 제작자 1차 납품 묶음(Request5-part1, 1024x1024 투명, 바닥 효과는 투명도 일부 낮춤)
원본(대체): art-src/batch8-fx/raw-<n>.png — 공유 링크에서 받은 1254x1254(이름 붙이기 전)
결과: public/art/fx/<이름>.webp — 투명 여백을 잘라 정사각형 가운데 정렬, 512x512.
번개(fx-lightning-arc)는 줄기 아래 회색 안개 띠가 있어, 색이 거의 없는(채도 낮은) 픽셀의 투명도를 낮춘다.
실행: py scripts/process_art_batch8.py
"""
import colorsys
from pathlib import Path
from PIL import Image

SRC = Path('art-src/batch8-fx')
OUT = Path('public/art/fx')
NAMES = ['fx-light-shield', 'fx-ice-crystal', 'fx-shadow-orb', 'fx-rock-wave', 'fx-wind-blade',
         'fx-fire-ground', 'fx-lightning-arc', 'fx-poison-cloud', 'fx-wave', 'fx-arcane-bolt']
# 공유 링크 원본 번호(raw-<n>) → 이름(그림을 보고 맞춤). 납품 파일이 있으면 그쪽이 우선
RAW = {name: i + 1 for i, name in enumerate(NAMES)}
SIZE = 512


def fade_gray(im: Image.Image) -> Image.Image:
    """채도가 낮은 반투명 안개를 지운다(번개 줄기 아래 회색 띠)."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s < 0.18 and v < 0.93:
                px[x, y] = (r, g, b, int(a * 0.15))
    return im


def square_trim(im: Image.Image) -> Image.Image:
    alpha = im.getchannel('A').point(lambda a: 255 if a > 8 else 0)
    box = alpha.getbbox() or (0, 0, im.width, im.height)
    crop = im.crop(box)
    side = max(crop.width, crop.height)
    pad = int(side * 0.04)
    canvas = Image.new('RGBA', (side + pad * 2, side + pad * 2), (0, 0, 0, 0))
    canvas.alpha_composite(crop, ((canvas.width - crop.width) // 2, (canvas.height - crop.height) // 2))
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in NAMES:
        p = SRC / f'{name}.png'
        if not p.exists():
            p = SRC / f'raw-{RAW[name]}.png'
        if not p.exists():
            print('없음', name)
            continue
        im = Image.open(p).convert('RGBA')
        if name == 'fx-lightning-arc':
            im = fade_gray(im)
        im = square_trim(im)
        dst = OUT / f'{name}.webp'
        im.save(dst, 'WEBP', quality=88, method=4)
        print(f'{p.name} → {dst} ({dst.stat().st_size // 1024}KB)')


if __name__ == '__main__':
    main()
