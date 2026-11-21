"""v1.2 마지막 묶음(batch06, 2026-11-22): 어려움 모드 UI 5장.
원본: art-src/batch13-v12/HARD_MODE_UI/*.png — 합본 시트 1장을 잘라 만든 것이라(묶음 README) 정리가 필요하다.
- hard-clear-crown·fx-confetti: 시트의 회백색 배경이 반투명 안개로 남아 있음 → 채도가 낮고 밝은 반투명 픽셀을 지움
  (불투명한 흰 반짝임은 남김). 옆 칸 그림 조각도 잘라 냄(왕관 왼쪽 보라 막대, 폭죽 왼쪽 날개 조각).
- badge-hard·frame-hard: 가장자리·안쪽 안개도 같은 방식으로 지움.
- ui-boss-bar: 왼쪽 옆 칸의 금색 마름모·보라 점을 잘라 냄. 가운데 빈 막대 자리 크기를 출력해 코드에 맞춤.
결과: public/art/hard/<이름>.webp (badge 256, frame-hard 384×512, crown·confetti 512, boss bar 원본 비율 폭 768)
실행: py scripts/process_art_batch13.py
"""
from pathlib import Path

import numpy as np
from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch13-v12' / 'HARD_MODE_UI'
OUT = ROOT / 'public' / 'art' / 'hard'


def load(name: str) -> np.ndarray:
    return np.array(Image.open(SRC / f'{name}.png').convert('RGBA')).astype(np.float32)


def clear_haze(a: np.ndarray) -> np.ndarray:
    """채도 낮고 밝은 반투명 픽셀(시트 배경 안개)을 투명하게"""
    rgb = a[:, :, :3] / 255
    mx, mn = rgb.max(2), rgb.min(2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    haze = (sat < 0.16) & (mx > 0.5) & (a[:, :, 3] < 235)
    a[:, :, 3] = np.where(haze, 0, a[:, :, 3])
    # 남은 아주 옅은 잡티도 지움
    a[:, :, 3] = np.where(a[:, :, 3] < 14, 0, a[:, :, 3])
    return a


def cut_left(a: np.ndarray, x: int) -> np.ndarray:
    a[:, :x, 3] = 0
    return a


def to_img(a: np.ndarray) -> Image.Image:
    return Image.fromarray(a.clip(0, 255).astype(np.uint8), 'RGBA')


def frame_34(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    box = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    im = im.crop(box)
    w, h = size
    k = min(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    canvas = Image.new('RGBA', size, (0, 0, 0, 0))
    canvas.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
    return canvas


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # 배지·테두리도 가장자리·안쪽에 시트 배경 안개가 옅게 남아 있어 같은 방식으로 지운다
    fit_square(to_img(clear_haze(load('badge-hard'))), 256, 0.03).save(OUT / 'badge-hard.webp', 'WEBP', quality=90, method=6)
    frame_34(to_img(clear_haze(load('frame-hard'))), (384, 512)).save(OUT / 'frame-hard.webp', 'WEBP', quality=90, method=6)
    fit_square(to_img(clear_haze(cut_left(load('hard-clear-crown'), 160))), 512, 0.02).save(OUT / 'hard-clear-crown.webp', 'WEBP', quality=90, method=6)
    fit_square(to_img(clear_haze(cut_left(load('fx-confetti'), 220))), 512, 0.02).save(OUT / 'fx-confetti.webp', 'WEBP', quality=90, method=6)

    bar = to_img(cut_left(load('ui-boss-bar'), 150))
    bar = bar.crop(bar.getchannel('A').point(lambda v: 255 if v > 20 else 0).getbbox())
    bar = bar.resize((768, round(bar.height * 768 / bar.width)), Image.LANCZOS)
    bar.save(OUT / 'ui-boss-bar.webp', 'WEBP', quality=90, method=6)
    # 가운데 빈 자리(가로 가운데 줄·세로 가운데 줄에서 투명한 구간) — 코드의 체력 막대를 이 안에 맞춘다
    a = np.array(bar)[:, :, 3]
    cy, cx = a.shape[0] // 2, a.shape[1] // 2
    row, col = a[cy] < 40, a[:, cx] < 40
    l = cx
    while l > 0 and row[l - 1]:
        l -= 1
    r = cx
    while r < len(row) - 1 and row[r + 1]:
        r += 1
    t = cy
    while t > 0 and col[t - 1]:
        t -= 1
    b = cy
    while b < len(col) - 1 and col[b + 1]:
        b += 1
    print(f'보스 막대 틀 {bar.width}×{bar.height}, 빈 자리 x {l}~{r}, y {t}~{b}')
    print('가공 5장 → public/art/hard/')


if __name__ == '__main__':
    main()
