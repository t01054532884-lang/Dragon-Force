"""1단계 적 5종 · 보스·엘리트 얼굴 3 · 잿빛 바닥 → public/art/ (기획자 요청 5, 2026-11-20).

원본(기획자 그림, 2026-11-18): art-src/enemies/*.png(옆모습, 머리 오른쪽, 투명) · art-src/portraits/*.png · art-src/floor/battle-floor-ash-seamless.png
- 적: 보이는 부분만 잘라 정사각 가운데에 → 일반 256, 엘리트·보스 384 (게임에서 반지름에 맞춰 표시, 좌우만 뒤집음)
- 얼굴: 256 (보스 경고·체력바 옆, 아직 화면 연결 전)
- 바닥: 512 이음새 없는 반복 무늬(1단계 잿빛 숲 투기장)
실행: python scripts/process_art_batch7.py  (art-src 경로를 첫 인자로 줄 수 있음)
"""
import sys
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'art-src'
OUT = ROOT / 'public' / 'art'

# 게임 그림 키(src/data/enemies.ts의 texture) → 원본 파일, 출력 크기
ENEMIES = {
    'wolf': ('enemy-wolf.png', 256),
    'boar': ('enemy-boar.png', 256),
    'moonfang': ('enemy-moonfang.png', 384),
    'matriarch': ('enemy-ironmother.png', 384),
    'graymane': ('enemy-graymane-boss.png', 384),
}
FACES = {'graymane': 'portrait-graymane-boss.png', 'moonfang': 'portrait-moonfang.png', 'matriarch': 'portrait-ironmother.png'}


def main() -> None:
    (OUT / 'enemy').mkdir(parents=True, exist_ok=True)
    done = {}
    for key, (name, size) in ENEMIES.items():
        src = SRC / 'enemies' / name
        if not src.exists():
            print('없음', src)
            continue
        rel = f'enemy/art-{key}.webp'
        fit_square(Image.open(src), size, 0.03).save(OUT / rel, 'WEBP', quality=88, method=6)
        done[f'art-{key}'] = rel
    for key, name in FACES.items():
        src = SRC / 'portraits' / name
        if src.exists():
            rel = f'enemy/face-{key}.webp'
            fit_square(Image.open(src), 256, 0.03).save(OUT / rel, 'WEBP', quality=88, method=6)
            done[f'face-{key}'] = rel
    fl = SRC / 'floor' / 'battle-floor-ash-seamless.png'
    if fl.exists():
        Image.open(fl).convert('RGB').resize((512, 512), Image.LANCZOS).save(OUT / 'floor-ash.webp', 'WEBP', quality=86, method=6)
        done['floor-ash'] = 'floor-ash.webp'
    total = sum((OUT / v).stat().st_size for v in done.values()) // 1024
    print(len(done), '장,', total, 'KB')
    print('ART_FILES =', done)


if __name__ == '__main__':
    main()
