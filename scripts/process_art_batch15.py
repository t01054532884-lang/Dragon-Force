"""15차분(2026-11-22): 기본 공격 카드 아이콘 14 · 스킬 이펙트 4 · 마법진 5(개별 고해상도) · 스틸 배지(검이 떨어지는 그림) · 추가 이펙트 8.
원본: art-src/batch15/ (ChatGPT 공유 링크 4개에서 받음)
결과:
  skill/basic-<id>.webp 256 — 레벨업 카드의 기본 공격 아이콘(레드는 기존 skill-basic)
  fx/fx-fireball·fx-meteor-rock·fx-ice-shard·fx-arcane-orb.webp 256 — 브레스 불덩이·메테오 바위·얼음 파편·마력 구슬
  sigil/sigil-<id>.webp 512 — 합본에서 잘라 냈던 것을 개별 고해상도로 교체
  sig/sig-steel.webp 256
  fx/sigfx-<id>.webp 384 — 블루·옐로·윈드·화이트 전용 스킬 시전 연출(용 머리 그림)
실행: py scripts/process_art_batch15.py
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch15'
OUT = ROOT / 'public' / 'art'
BASIC = ['blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane', 'sand', 'steel', 'bloom', 'howl', 'crimson']
SIGFX = {'blue': 'c1', 'yellow': 'c3', 'wind': 'c5', 'white': 'c7'}


def save(im: Image.Image, rel: str) -> None:
    im.save(OUT / rel, 'WEBP', quality=88, method=6)
    print('가공', rel)


def main() -> None:
    for i in BASIC:
        save(fit_square(Image.open(SRC / f'basic-{i}.png'), 256, 0.008), f'skill/basic-{i}.webp')
    for k in ['fx-fireball', 'fx-meteor-rock', 'fx-ice-shard', 'fx-arcane-orb']:
        save(fit_square(Image.open(SRC / f'{k}.png'), 256, 0.03), f'fx/{k}.webp')
    for i in ['sand', 'steel', 'bloom', 'howl', 'crimson']:
        save(fit_square(Image.open(SRC / f'sigil-{i}.png'), 512, 0.015), f'sigil/sigil-{i}.webp')
    save(fit_square(Image.open(SRC / 'sig-steel.png'), 256, 0.04), 'sig/sig-steel.webp')
    for i, c in SIGFX.items():
        save(fit_square(Image.open(SRC / f'extra-{c}.png'), 384, 0.03), f'fx/sigfx-{i}.webp')


if __name__ == '__main__':
    main()
