"""v1.2 이미지 요청서(개정) 3차 묶음 가공(2026-11-21): 기획자 압축 파일 DragonForce_v1.2_batch03(10장).
원본: art-src/batch10-v12/DragonForce_v1.2_batch03/{RUNES,SHOP}/*.png (1024×1024 투명, 2×5 시트에서 잘라 확대한 것)
- rune-<id>.png 5장 → art-src/sp-<id>.png로 복사(가공은 process_art_batch6.py가 sp-* 15장을 같은 방식으로)
- ui-rune-fragment → public/art/ui/ui-rune-fragment.webp 256
- chest-rune       → public/art/chest-rune.webp 512(장비·드래곤 상자와 같은 크기)
- gold-pack-s/m/l  → public/art/shop/gold-pack-<s|m|l>.webp 256
상자 여는 연출용 chest-rune-body·lid는 아직 안 왔다(지금은 도형 임시 그림).
실행: py scripts/process_art_batch10.py && py scripts/process_art_batch6.py
"""
import shutil
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch10-v12' / 'DragonForce_v1.2_batch03'
OUT = ROOT / 'public' / 'art'

RUNES = ['holyLight', 'ancientEye', 'starMana', 'treasure', 'resonance']
JOBS = [
    ('RUNES/ui-rune-fragment.png', 'ui/ui-rune-fragment.webp', 256),
    ('SHOP/chest-rune.png', 'chest-rune.webp', 512),
    ('SHOP/gold-pack-s.png', 'shop/gold-pack-s.webp', 256),
    ('SHOP/gold-pack-m.png', 'shop/gold-pack-m.webp', 256),
    ('SHOP/gold-pack-l.png', 'shop/gold-pack-l.webp', 256),
]


def main() -> None:
    for r in RUNES:
        shutil.copyfile(SRC / 'RUNES' / f'rune-{r}.png', ROOT / 'art-src' / f'sp-{r}.png')
    for src, rel, size in JOBS:
        out = OUT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        fit_square(Image.open(SRC / src), size, 0.04).save(out, 'WEBP', quality=88, method=6)
        print('가공', rel)
    print(f'룬 {len(RUNES)}장 → art-src/sp-*.png 복사 완료. 이어서 process_art_batch6.py 실행')


if __name__ == '__main__':
    main()
