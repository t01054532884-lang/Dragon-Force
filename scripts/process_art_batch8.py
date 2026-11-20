"""그림 요청서 5 A-1: 전용 스킬 전투 효과 10장 가공(2026-11-21).
원본: art-src/batch8-fx/raw-<n>.png (제작자 GPT 생성, 1254x1254 투명 PNG)
결과: public/art/fx/<이름>.webp — 투명 여백을 잘라 정사각형 가운데 정렬, 512x512.
실행: py scripts/process_art_batch8.py
"""
from pathlib import Path
from PIL import Image

SRC = Path('art-src/batch8-fx')
OUT = Path('public/art/fx')
# 원본 번호 → 게임 키(그림을 보고 맞춤)
MAP = {
    1: 'fx-light-shield',
    2: 'fx-ice-crystal',
    3: 'fx-shadow-orb',
    4: 'fx-rock-wave',
    5: 'fx-wind-blade',
    6: 'fx-fire-ground',
    7: 'fx-lightning-arc',
    8: 'fx-poison-cloud',
    9: 'fx-wave',
    10: 'fx-arcane-bolt',
}
SIZE = 512


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
    for n, name in MAP.items():
        p = SRC / f'raw-{n}.png'
        if not p.exists():
            print('없음', p)
            continue
        im = square_trim(Image.open(p).convert('RGBA'))
        dst = OUT / f'{name}.webp'
        im.save(dst, 'WEBP', quality=88, method=6)
        print(f'{p.name} → {dst} ({dst.stat().st_size // 1024}KB)')


if __name__ == '__main__':
    main()
