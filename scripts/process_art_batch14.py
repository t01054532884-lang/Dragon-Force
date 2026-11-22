"""신규 드래곤 9종 확정 초상(2026-11-22, docs/NEW_DRAGONS_ART_FEEDBACK.md) → 게임 초상.
원본: art-src/newdragons-final/portrait-<id>.png (1254×1254 투명)
결과: public/art/portrait-<id>.webp 384×384 — 기존 10종 초상과 같은 크기·여백(캐릭터 약 88%).
탑다운(전투): art-src/newdragons-top1/top-<id>.png → public/art/top/top-<id>.webp 384×384(기존 탑다운과 같은 여백 3%).
전용 스킬 배지: art-src/newdragons-sig1/sig-<id>.png → public/art/sig/sig-<id>.webp 256×256(기존 배지와 같은 4%).
게임에 연결(art.ts ART_FILES)은 코드에 들어간 드래곤만(지금 1묶음 샌드·스틸·블룸). 나머지 6종은 미리 가공만.
실행: py scripts/process_art_batch14.py
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'newdragons-final'
OUT = ROOT / 'public' / 'art'
IDS = ['sand', 'steel', 'bloom', 'howl', 'crimson', 'mirror', 'chrono', 'void', 'aurora']


def main() -> None:
    for i in IDS:
        src = SRC / f'portrait-{i}.png'
        if not src.exists():
            print('없음', src.name)
            continue
        fit_square(Image.open(src), 384, 0.06).save(OUT / f'portrait-{i}.webp', 'WEBP', quality=88, method=6)
        print('가공', f'portrait-{i}.webp')
        top = ROOT / 'art-src' / 'newdragons-top1' / f'top-{i}.png'
        if top.exists():
            fit_square(Image.open(top), 384, 0.03).save(OUT / 'top' / f'top-{i}.webp', 'WEBP', quality=88, method=6)
            print('가공', f'top/top-{i}.webp')
        sig = ROOT / 'art-src' / 'newdragons-sig1' / f'sig-{i}.png'
        if sig.exists():
            fit_square(Image.open(sig), 256, 0.04).save(OUT / 'sig' / f'sig-{i}.webp', 'WEBP', quality=88, method=6)
            print('가공', f'sig/sig-{i}.webp')


if __name__ == '__main__':
    main()
