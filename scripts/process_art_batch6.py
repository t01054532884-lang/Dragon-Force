"""그림 요청서 4(docs/ART_REQUEST_4.md) 가공: art-src/의 원본 → public/art/ 투명 WebP 256×256.

받은 것만 처리하고 없는 파일은 건너뛴다(일부만 와도 실행 가능).
- 특수 스킬 15종  art-src/sp-<id>.png      → public/art/special/sp-<id>.webp
- 전용 액티브 10종 art-src/sig-<dragon>.png → public/art/sig/sig-<dragon>.webp
- 연구소 4종       art-src/lab-<type>.png   → public/art/lab/lab-<type>.webp
- 범용 조각        art-src/ui-universal.png → public/art/ui/ui-universal.webp
투명 배경이 아니면(초록 #00FF00 또는 단색 배경) 가장자리에서 이어진 배경을 지운다.
실행: python scripts/process_art_batch6.py  → 마지막 줄의 목록을 src/ui/art.ts ART_FILES에 연결
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square, remove_flat_background

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'public' / 'art'

SPECIALS = ['rage', 'aegis', 'burst', 'flameSeal', 'iceHeart', 'thunderCrest', 'venomMark', 'darkPact',
            'stormBless', 'earthWill', 'holyLight', 'ancientEye', 'starMana', 'treasure', 'resonance']
DRAGONS = ['red', 'blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane']
LABS = ['attack', 'hp', 'speed', 'pickup']

JOBS = (
    [(f'sp-{k}', f'special/sp-{k}.webp') for k in SPECIALS]
    + [(f'sig-{k}', f'sig/sig-{k}.webp') for k in DRAGONS]
    + [(f'lab-{k}', f'lab/lab-{k}.webp') for k in LABS]
    + [('ui-universal', 'ui/ui-universal.webp')]
)


def opaque_corners(im: Image.Image) -> bool:
    a = im.convert('RGBA').getchannel('A')
    w, h = a.size
    return all(a.getpixel(p) > 200 for p in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])


def main() -> None:
    done, missing = {}, []
    for key, rel in JOBS:
        src = next((SRC / f'{key}{ext}' for ext in ('.png', '.webp', '.jpg') if (SRC / f'{key}{ext}').exists()), None)
        if src is None:
            missing.append(key)
            continue
        im = Image.open(src)
        if opaque_corners(im):
            im = remove_flat_background(im, tol=30)
        out = OUT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        fit_square(im, 256, 0.04).save(out, 'WEBP', quality=88, method=6)
        done[key] = rel
    print(f'가공 {len(done)}장, 아직 없음 {len(missing)}장: {", ".join(missing)}')
    print('ART_FILES 추가 =', done)


if __name__ == '__main__':
    main()
