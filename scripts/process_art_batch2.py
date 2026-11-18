"""기획자 그림 2차분(2026-11-18 오후, 그림 요청서 3) → public/art/ (+ 앱 아이콘은 store/).

- 앱 아이콘: 둥근 모서리 바깥이 검게 칠해져 있음 → 애플은 꽉 찬 정사각형을 받아 직접 깎으므로, 검은 모서리를 주변 색으로 메워 꽉 채운다.
- 스킬 아이콘 14장: 배지 틀 포함. 앞의 4장(기본·브레스·얼음·심장)은 모서리가 검정 → 둥근 사각 모양으로 잘라 투명하게.
- 장비 16장: 슬롯 4종 × 등급 4색(일반·희귀·영웅·전설)으로 와서 등급별로 씀.
- 전투용 탑다운 드래곤: 짝이 확실한 4장만(레드·블루·윈드·아케인). 나머지는 제작자 확인 뒤.
실행: python scripts/process_art_batch2.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'public' / 'art'
STORE = ROOT / 'store'

P3 = 'ChatGPT 이미지 2026년 11월 18일 오후 03_'
P4 = 'ChatGPT 이미지 2026년 11월 18일 오후 04_'

APP_ICON = P3 + '43_12-1.png'

# 모서리가 검은 둥근 타일(투명 아님)
TILE_SKILLS = {
    'skill-basic': P3 + '43_20-2.png',  # 추적 화염탄
    'skill-breath': P3 + '43_25-3.png',
    'skill-ice': P3 + '43_31-4.png',
    'passive-heart': P3 + '43_36-5.png',
}
# 이미 투명 배경
SKILLS = {
    'skill-lightning': 'skill-lightning-breath.png',
    'skill-meteor': 'skill-meteor.png',
    'skill-orb': 'skill-orb.png',
    'skill-wind': 'skill-wing-storm.png',
    'passive-scale': 'skill-dragon-scales.png',
    'passive-amp': 'skill-magic-amplify.png',
    'passive-clock': 'skill-ancient-clock.png',
    'passive-eye': 'skill-dragon-eye.png',
    'passive-wings': 'skill-storm-wings.png',
    'passive-reach': 'skill-magic-expansion.png',
}
# 장비: 슬롯 → [일반, 희귀, 영웅, 전설]
EQUIPS = {
    'weapon': [P4 + '13_42-1.png', P4 + '13_47-2.png', P4 + '13_57-4.png', P4 + '14_07-5.png'],  # 발톱 장식
    'armor': [P4 + '13_52-3.png', P4 + '14_12-6.png', P4 + '14_16-7.png', P4 + '14_20-8.png'],  # 비늘 갑주
    'necklace': [P4 + '16_57-1.png', P4 + '17_01-2.png', P4 + '17_05-3.png', P4 + '17_10-4.png'],
    'ring': [P4 + '17_14-5.png', P4 + '17_19-6.png', P4 + '17_26-7.png', P4 + '17_32-8.png'],
}
RARITIES = ['common', 'rare', 'epic', 'legendary']
TOPS = {
    'top-red': '용암 균열의 붉은 드래곤-1.png',
    'top-blue': '빙결 수정 날개 아이스 드래곤-2.png',
    'top-arcane': '보라빛 마법 드래곤 날개 펼침-5.png',
    'top-wind': '청록빛 바람의 용_sprite-6.png',
}


def corner_mask(im: Image.Image, thresh: int = 28) -> np.ndarray:
    """네 모서리에서 이어진 거의 검은 영역(True)."""
    w, h = im.size
    work = im.convert('RGB').copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(work, seed, (255, 0, 255), thresh=thresh)
    a = np.asarray(work)
    m = (a[..., 0] == 255) & (a[..., 1] == 0) & (a[..., 2] == 255)
    # 모서리 근처(가장자리 22% 안)만 인정 → 그림 속 어두운 부분으로 번지는 것 방지
    yy, xx = np.mgrid[0:h, 0:w]
    near = (np.minimum(xx, w - 1 - xx) < w * 0.22) & (np.minimum(yy, h - 1 - yy) < h * 0.22)
    return m & near


def box(a: np.ndarray, r: int) -> np.ndarray:
    """2차원 상자 평균(가장자리는 0으로 채움) — float 배열용"""
    k = 2 * r + 1
    for ax in (0, 1):
        pad = [(0, 0)] * a.ndim
        pad[ax] = (r + 1, r)
        c = np.cumsum(np.pad(a, pad), axis=ax)
        a = (np.take(c, range(k, c.shape[ax]), axis=ax) - np.take(c, range(0, c.shape[ax] - k), axis=ax)) / k
    return a


def fill_corners(im: Image.Image) -> Image.Image:
    """검은 모서리를 주변 색으로 메워 꽉 찬 정사각형으로(push-pull 확산)."""
    rgb = np.asarray(im.convert('RGB')).astype(np.float32)
    bad = corner_mask(im)
    bad = np.asarray(Image.fromarray(bad.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0  # 안티에일리어싱 띠까지
    valid = (~bad).astype(np.float32)
    img = rgb * valid[..., None]
    for r in (4, 8, 16, 32, 64):
        while True:
            num = np.stack([box(img[..., c], r) for c in range(3)], -1)
            den = box(valid, r)
            grow = (valid == 0) & (den > 1e-3)
            if not grow.any():
                break
            img[grow] = num[grow] / den[grow][..., None]
            valid = np.where(grow, 1.0, valid).astype(np.float32)
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    # 메운 부분만 살짝 흐리게 섞어 경계가 티 나지 않게
    soft = out.filter(ImageFilter.GaussianBlur(6))
    m = Image.fromarray((bad * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4))
    return Image.composite(soft, out, m)


def rounded_cut(im: Image.Image) -> Image.Image:
    """검은 모서리를 투명하게: 모서리에서 이어진 검정만 지운다."""
    bad = corner_mask(im)
    alpha = Image.fromarray(((~bad) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out


def webp(im: Image.Image, rel: str, size: int, pad: float) -> str:
    path = OUT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    fit_square(im, size, pad).save(path, 'WEBP', quality=88, method=6)
    return rel


def main() -> None:
    done: dict[str, str] = {}
    STORE.mkdir(exist_ok=True)
    icon = fill_corners(Image.open(SRC / APP_ICON))
    icon = icon.crop((6, 6, icon.width - 6, icon.height - 6)).resize((1024, 1024), Image.LANCZOS)  # 위·아래 가장자리 1~2px 검은 띠 제거
    icon.save(STORE / 'app-icon-v2.png', optimize=True)
    icon.resize((600, 600), Image.LANCZOS).save(STORE / 'toss-logo-600-v2.png', optimize=True)
    print('앱 아이콘 → store/app-icon-v2.png')

    for key, name in TILE_SKILLS.items():
        done[key] = webp(rounded_cut(Image.open(SRC / name)), f'skill/{key}.webp', 256, 0.02)
    for key, name in SKILLS.items():
        done[key] = webp(Image.open(SRC / name), f'skill/{key}.webp', 256, 0.02)
    for slot, files in EQUIPS.items():
        for rar, name in zip(RARITIES, files):
            key = f'equip-{slot}-{rar}'
            done[key] = webp(Image.open(SRC / name), f'equip/{key}.webp', 256, 0.05)
    for key, name in TOPS.items():
        done[key] = webp(Image.open(SRC / name), f'top/{key}.webp', 384, 0.03)
    total = sum((OUT / v).stat().st_size for v in done.values()) // 1024
    print(len(done), '장,', total, 'KB')


if __name__ == '__main__':
    main()
