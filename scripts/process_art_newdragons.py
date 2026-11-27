"""신규 드래곤 5종 초상·필살기 아이콘 + 스틸 아이콘 둥근 사각형 금테 교체 (2026-11-27, 1.0.4)

원본: art-src/new-dragons/ (제작자 ChatGPT 확정본, 투명 배경 1254×1254, 스틸+기어스 아이콘은 한 장 1774×887)
결과: public/art/portrait-<id>.webp 384×384 (레드와 같은 틀: 내용 높이 약 340, 바닥 y=362, 가운데)
      public/art/sig/sig-<id>.webp 256×256 (내용 240, 여백 8)
실행: py -3 -X utf8 scripts/process_art_newdragons.py
"""
import os
from PIL import Image

SRC = 'art-src/new-dragons'
PORTRAIT = {'gears': '기어스 드래곤.png', 'silva': '실바 드래곤.png', 'forge': '포지 드래곤.png', 'crystal': '크리스탈 드래곤.png', 'bahamut': '바하무트 드래곤.png'}
SIG = {'silva': '실바 스킬 아이콘.png', 'forge': '포지 스킬 아이콘.png', 'crystal': '크리스탈 스킬 아이콘.png', 'bahamut': '바하무트 스킬 아이콘.png'}
PAIR = '스팀 스킬 아이콘 및 기어스 스킬 아이콘.png'  # 왼쪽 스틸, 오른쪽 기어스


def crop(im: Image.Image) -> Image.Image:
    a = im.split()[3].point(lambda v: 255 if v > 8 else 0)
    return im.crop(a.getbbox())


def portrait(im: Image.Image) -> Image.Image:
    im = crop(im)
    s = min(340 / im.height, 330 / im.width)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (384, 384), (0, 0, 0, 0))
    out.alpha_composite(im, ((384 - im.width) // 2, 362 - im.height))
    return out


def icon(im: Image.Image) -> Image.Image:
    im = crop(im)
    s = 240 / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
    out.alpha_composite(im, ((256 - im.width) // 2, (256 - im.height) // 2))
    return out


def main() -> None:
    for id_, f in PORTRAIT.items():
        portrait(Image.open(os.path.join(SRC, f)).convert('RGBA')).save(f'public/art/portrait-{id_}.webp', quality=90, method=6)
    for id_, f in SIG.items():
        icon(Image.open(os.path.join(SRC, f)).convert('RGBA')).save(f'public/art/sig/sig-{id_}.webp', quality=90, method=6)
    pair = Image.open(os.path.join(SRC, PAIR)).convert('RGBA')
    half = pair.width // 2
    icon(pair.crop((0, 0, half, pair.height))).save('public/art/sig/sig-steel.webp', quality=90, method=6)
    icon(pair.crop((half, 0, pair.width, pair.height))).save('public/art/sig/sig-gears.webp', quality=90, method=6)
    print('ok')


if __name__ == '__main__':
    main()
