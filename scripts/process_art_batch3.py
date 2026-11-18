"""그림 3차분(2026-11-18 저녁 기획자 그림) 가공: 전투용 탑다운 드래곤 4종 추가.

제작자 확인(2026-11-19): 보라 번개 탑다운(top-thunder-violet) = 블랙 드래곤.
짝: 블랙 = thunder-violet · 옐로 = storm-gold · 그린 = forest-green · 화이트 = light-gold.
원본 가장자리에 붙은 작은 파편(옆 칸 그림 조각)은 가장 큰 덩어리만 남겨 지운다.
사용법: python scripts/process_art_batch3.py  (art-src/dragons/ → public/art/top/)
"""
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'dragons'
OUT = ROOT / 'public' / 'art' / 'top'

TOPS = {
    'top-black': 'top-thunder-violet.png',
    'top-yellow': 'top-storm-gold.png',
    'top-green': 'top-forest-green.png',
    'top-white': 'top-light-gold.png',
}


def keep_main(im: Image.Image) -> Image.Image:
    """알파가 있는 덩어리 중 가장 큰 것(과 그 10% 이상 크기)만 남긴다"""
    im = im.convert('RGBA')
    a = np.array(im)
    mask = a[:, :, 3] > 20
    lab, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lab, range(1, n + 1))
        keep = {i + 1 for i, s in enumerate(sizes) if s >= sizes.max() * 0.1}
        a[~np.isin(lab, list(keep)), 3] = 0
    return Image.fromarray(a)


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    bbox = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for key, name in TOPS.items():
        out = OUT / f'{key}.webp'
        fit_square(keep_main(Image.open(SRC / name)), 384, 0.03).save(out, 'WEBP', quality=88, method=6)
        print(key, '←', name, out.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
