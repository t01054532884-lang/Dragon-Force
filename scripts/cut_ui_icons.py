"""기획자 UI 시안(art-src/*.png, 941×1672 통그림)에서 아이콘 타일을 잘라 타일 바탕을 지우고 아이콘만 투명 WebP로.

시안은 버튼·글자가 그림에 박힌 통그림이라 화면으로 그대로 쓸 수 없다. 틀·배너·버튼은 코드(src/ui/kit2.ts)로 만들고,
아이콘만 임시로 시안에서 떼어 쓴다. 깨끗한 아이콘 묶음(docs/ART_REQUEST_3.md)이 오면 교체.
- "!" 표시가 박힌 타일은 피하고 같은 아이콘이 "!" 없이 있는 시안에서 잘랐다.
- 참고 게임과 비슷해 보이는 것(파란 슬라임 프로필, 받침대 위 파란 수정 탭)은 쓰지 않는다.
실행: python scripts/cut_ui_icons.py
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square, remove_flat_background

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / 'art-src'
OUT = ROOT / 'public' / 'art' / 'ui'

M1 = '용의 신전 판타지 게임 로비-1.png'
M2 = '용암 왕국의 레드 드래곤 로비 set-2.png'
M4 = '화산성의 불꽃 드래곤 RPG UI-4.png'
M6 = '귀여운 레드 드래곤 컬렉션 화면-6.png'

# 키: (시안 파일, 타일 영역, 안쪽 여백) — 여백만큼 안쪽을 잘라 타일 테두리를 빼고, 남은 타일 바탕색을 지운다
ICONS = {
    'ic-mission': (M1, (15, 368, 132, 482), 16), 'ic-book': (M1, (15, 510, 132, 624), 16), 'ic-shop': (M1, (806, 228, 925, 342), 16),
    'ic-cards': (M1, (806, 510, 925, 624), 16), 'ic-target': (M1, (806, 650, 925, 764), 16),
    'ic-calendar': (M2, (805, 200, 918, 305), 15), 'ic-trophy': (M2, (805, 318, 918, 418), 14), 'ic-crystal': (M2, (805, 535, 918, 632), 14),
    'ic-cal-star': (M2, (25, 320, 135, 415), 14), 'ic-chest': (M4, (15, 295, 123, 395), 14), 'ic-laurel': (M4, (15, 410, 123, 510), 14),
    'ic-gift': (M4, (818, 175, 922, 275), 14), 'ic-upgrade': (M6, (810, 480, 925, 580), 15), 'ic-heart': (M6, (810, 760, 925, 860), 15),
    'ic-dragon': (M2, (180, 1525, 320, 1650), 12), 'ic-egg': (M2, (335, 1525, 465, 1650), 12), 'ic-banner': (M2, (640, 1520, 775, 1650), 10),
    'ic-swords': (M1, (400, 1545, 545, 1660), 14), 'ic-shield': (M1, (575, 1540, 745, 1665), 14), 'ic-gear': (M1, (765, 1540, 925, 1665), 16),
    'ic-portal': (M1, (722, 1295, 910, 1485), 26), 'ic-scroll': (M1, (48, 1330, 200, 1470), 10),
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    cache: dict[str, Image.Image] = {}
    for key, (src, box, pad) in ICONS.items():
        if src not in cache:
            cache[src] = Image.open(A / src).convert('RGB')
        crop = cache[src].crop((box[0] + pad, box[1] + pad, box[2] - pad, box[3] - pad))
        fit_square(remove_flat_background(crop, tol=26), 256).save(OUT / f'{key}.webp', 'WEBP', quality=90, method=6)
        print(key)


if __name__ == '__main__':
    main()
