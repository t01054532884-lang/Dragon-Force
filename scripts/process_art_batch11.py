"""v1.2 이미지 요청서(개정) 4차 묶음 가공(2026-11-21): 기획자 압축 파일 DragonForce_v1.2_batch04(10장).
원본: art-src/batch11-v12/{SIGILS,SHOP}/*.png (1024×1024 투명)
- sigil-<속성> 8장(fire·ice·lightning·poison·light·dark·earth·wind) → public/art/sigil/sigil-<속성>.webp 512
  새 드래곤 해금 연출(src/ui/celebrate.ts)의 회전 마법진. water·arcane은 아직 없음(도형으로 그림).
- chest-rune-body·lid → public/art/chest/chest-rune-<part>.webp 600×600
  두 장은 같은 캔버스에서 겹치면 닫힌 상자(chest-rune.png와 같음). 기존 상자 3종처럼 상자 폭이 캔버스의 약 88%가
  되도록 두 장을 같은 비율·같은 자리로 키운다(위치가 어긋나면 안 되므로 합친 영역 기준으로 한 번에 계산).
실행: py scripts/process_art_batch11.py → 마지막 줄의 입구 높이를 src/data/chestFx.ts CHEST_MOUTH_Y.rune에
"""
from pathlib import Path

from PIL import Image

from process_art import fit_square

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'batch11-v12'
OUT = ROOT / 'public' / 'art'
SIGILS = ['fire', 'ice', 'lightning', 'poison', 'light', 'dark', 'earth', 'wind']
CANVAS = 600
WIDTH = 530  # 기존 상자 폭(514~538)에 맞춤
CENTER_Y = 330  # 기존 상자 3종의 세로 가운데(약 300~350)


def solid(im: Image.Image) -> Image.Image:
    r, g, b, a = im.split()
    return Image.merge('RGBA', (r, g, b, a.point(lambda v: 0 if v <= 12 else v)))


def main() -> None:
    for el in SIGILS:
        out = OUT / 'sigil' / f'sigil-{el}.webp'
        out.parent.mkdir(parents=True, exist_ok=True)
        fit_square(Image.open(SRC / 'SIGILS' / f'sigil-{el}.png'), 512, 0.02).save(out, 'WEBP', quality=88, method=6)
    print('마법진', len(SIGILS), '장')

    parts = {p: solid(Image.open(SRC / 'SHOP' / f'chest-rune-{p}.png').convert('RGBA')) for p in ('body', 'lid')}
    # 뚜껑의 보석 걸쇠가 본체 앞면까지 내려와, 뚜껑이 올라가면 본체에 V자 구멍이 생긴다
    # → 본체 윗면 아래로 내려온 뚜껑 부분을 본체에도 복사(닫힌 모습은 그대로, 열면 걸쇠가 본체에 남음)
    top = parts['body'].getchannel('A').getbbox()[1]
    below = parts['lid'].copy()
    below.paste((0, 0, 0, 0), (0, 0, below.width, top + 6))
    parts['body'] = Image.alpha_composite(parts['body'], below)
    boxes = [im.getchannel('A').getbbox() for im in parts.values()]
    x0, y0 = min(b[0] for b in boxes), min(b[1] for b in boxes)
    x1, y1 = max(b[2] for b in boxes), max(b[3] for b in boxes)
    k = WIDTH / (x1 - x0)
    w, h = round((x1 - x0) * k), round((y1 - y0) * k)
    ox, oy = (CANVAS - w) // 2, CENTER_Y - h // 2
    (OUT / 'chest').mkdir(parents=True, exist_ok=True)
    for p, im in parts.items():
        canvas = Image.new('RGBA', (CANVAS, CANVAS), (0, 0, 0, 0))
        canvas.alpha_composite(im.crop((x0, y0, x1, y1)).resize((w, h), Image.LANCZOS), (ox, oy))
        canvas.save(OUT / 'chest' / f'chest-rune-{p}.webp', 'WEBP', quality=90, method=6)
    body_top = parts['body'].getchannel('A').getbbox()[1]
    print(f'룬 상자 본체·뚜껑 600×600 (배율 {k:.3f}), 본체 윗면 y = {round(oy + (body_top - y0) * k)}')


if __name__ == '__main__':
    main()
