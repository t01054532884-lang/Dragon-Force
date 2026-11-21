"""그림 12차분(2026-11-21, 요청서 6 ②④⑤ 일부): 공유 링크로 받은 10장.
원본: art-src/batch12-link/raw-<n>.png (공유 페이지 순서, 1254×1254 또는 1086×1448 투명) — 그림을 보고 이름을 붙였다.
- sigil-water·sigil-arcane → public/art/sigil/ 512 (나머지 8장은 process_art_batch11.py)
- fx-unlock-rays           → public/art/fx/fx-unlock-rays.webp 512 (해금·보상 화면 뒤 빛줄기)
- frame-<등급> 4장(3:4)     → public/art/frame/frame-<등급>.webp 384×512 (보상 팝업 카드 테두리)
- aura-enrage·aura-elite·zone-danger → public/art/hard/*.webp 512 (어려움 보스 광폭화·엘리트 강화 오라, 8단계 위험 지대)
실행: py scripts/process_art_batch12.py
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch12-link'
OUT = ROOT / 'public' / 'art'

# raw 번호 → (출력 경로, 크기). 크기가 (w, h)면 비율 유지 틀
JOBS = {
    1: ('sigil/sigil-water.webp', 512),
    7: ('sigil/sigil-arcane.webp', 512),
    3: ('fx/fx-unlock-rays.webp', 512),
    4: ('frame/frame-common.webp', (384, 512)),
    2: ('frame/frame-rare.webp', (384, 512)),
    8: ('frame/frame-epic.webp', (384, 512)),
    9: ('frame/frame-legendary.webp', (384, 512)),
    5: ('hard/aura-enrage.webp', 512),
    6: ('hard/aura-elite.webp', 512),
    10: ('hard/zone-danger.webp', 512),
}


def main() -> None:
    for n, (rel, size) in JOBS.items():
        im = Image.open(SRC / f'raw-{n}.png').convert('RGBA')
        out = OUT / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        if isinstance(size, tuple):
            # 테두리: 투명 여백만 잘라 3:4 그대로 맞춤(가운데 비어 있는 틀이라 늘이지 않는다)
            box = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
            im = im.crop(box)
            w, h = size
            k = min(w / im.width, h / im.height)
            im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
            canvas = Image.new('RGBA', size, (0, 0, 0, 0))
            canvas.alpha_composite(im, ((w - im.width) // 2, (h - im.height) // 2))
            canvas.save(out, 'WEBP', quality=90, method=6)
        else:
            fit_square(im, size, 0.02).save(out, 'WEBP', quality=88, method=6)
        print('가공', rel)


if __name__ == '__main__':
    main()
