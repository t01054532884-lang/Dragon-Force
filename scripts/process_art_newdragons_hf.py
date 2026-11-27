"""신규 드래곤 5종 게임용 그림·컷신 영상 (2026-11-28, 1.0.4, Higgsfield GPT Image 2.6 고품질 투명 배경 + Seedance 2.5 4초 720p 소리 포함)
원본: art-src/new-dragons/hf/<id>-<종류>.png, <id>-video.mp4 (저장소 밖)
  top    → public/art/top/top-<id>.webp        384×384 (전투 탑다운)
  basic  → public/art/skill/basic-<id>.webp    256×256 (기본 공격 카드 아이콘, 둥근 사각형 금테)
  sigart → public/art/sigfx/sigart-<id>.webp   512×512 (전용 스킬 효과)
  sigil  → public/art/sigil/sigil-<element>.webp 512×512 (해금 마법진, 속성 이름)
  ultfx  → public/art/ult/ult-fx-<id>.webp     폭 1024 (필살기 전장 효과)
  video  → public/art/ult/ult-<id>.mp4         (그대로 복사)
실행: py -3 -X utf8 scripts/process_art_newdragons_hf.py
"""
import os
import shutil
from PIL import Image

SRC = 'art-src/new-dragons/hf'
IDS = ['gears', 'silva', 'forge', 'crystal', 'bahamut']
ELEMENT = {'gears': 'machine', 'silva': 'forest', 'forge': 'forge', 'crystal': 'crystal', 'bahamut': 'dragonking'}


def crop(im: Image.Image) -> Image.Image:
    a = im.getchannel('A').point(lambda v: 255 if v > 8 else 0)
    b = a.getbbox()
    return im.crop(b) if b else im


def square(im: Image.Image, size: int, pad: float) -> Image.Image:
    im = crop(im.convert('RGBA'))
    side = int(max(im.size) / (1 - 2 * pad))
    c = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    c.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return c.resize((size, size), Image.LANCZOS)


def main() -> None:
    for id_ in IDS:
        p = lambda k: os.path.join(SRC, f'{id_}-{k}.png')
        if os.path.exists(p('top')):
            square(Image.open(p('top')), 384, 0.04).save(f'public/art/top/top-{id_}.webp', quality=90, method=6)
        if os.path.exists(p('basic')):
            square(Image.open(p('basic')), 256, 0.01).save(f'public/art/skill/basic-{id_}.webp', quality=90, method=6)
        if os.path.exists(p('sigart')):
            square(Image.open(p('sigart')), 512, 0.02).save(f'public/art/sigfx/sigart-{id_}.webp', quality=88, method=6)
        if os.path.exists(p('sigil')):
            square(Image.open(p('sigil')), 512, 0.02).save(f'public/art/sigil/sigil-{ELEMENT[id_]}.webp', quality=88, method=6)
        if os.path.exists(p('ultfx')):
            fx = crop(Image.open(p('ultfx')).convert('RGBA'))
            fx.resize((1024, round(fx.height * 1024 / fx.width)), Image.LANCZOS).save(f'public/art/ult/ult-fx-{id_}.webp', quality=86, method=6)
        v = os.path.join(SRC, f'{id_}-video.mp4')
        if os.path.exists(v):
            shutil.copyfile(v, f'public/art/ult/ult-{id_}.mp4')
        print(id_, 'ok')


if __name__ == '__main__':
    main()
