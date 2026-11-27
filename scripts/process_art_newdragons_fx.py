"""신규 드래곤 전투 이펙트 8장 (2026-11-28, 제작자 ChatGPT — 합본 시안을 나눠 배경 제거한 1024 RGBA)
원본: art-src/new-dragons/fx8/*.png (저장소 밖)
→ public/art/proj/<키>.webp 256×256 (투명 여백 정리 후 정사각형). 게임에서는 dragonArt.applyProjectileArt가 작은 크기(30~56px)로 다시 그린다.
실행: py -3 -X utf8 scripts/process_art_newdragons_fx.py
"""
import os
from PIL import Image

SRC = 'art-src/new-dragons/fx8'
OUT = {
    '기어스_포탑.png': 'proj-turret',
    '기어스_쌍포.png': 'proj-turret2',
    '기어스_포탄.png': 'proj-gears',
    '실바_식물.png': 'proj-plant',
    '실바_잎.png': 'proj-silva',
    '포지_망치.png': 'proj-forge',
    '크리스탈_창.png': 'proj-crystal',
    '바하무트_브레스.png': 'fx-breath',
}


def main() -> None:
    for f, key in OUT.items():
        im = Image.open(os.path.join(SRC, f)).convert('RGBA')
        # 체커보드 잔무늬·흰 가장자리 줄이기: 거의 투명한 픽셀은 완전히 투명하게
        a = im.getchannel('A').point(lambda v: 0 if v < 24 else v)
        im.putalpha(a)
        im = im.crop(a.getbbox())
        side = int(max(im.size) * 1.04)
        c = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        c.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
        c.resize((256, 256), Image.LANCZOS).save(f'public/art/proj/{key}.webp', quality=90)
        print(key)


if __name__ == '__main__':
    main()
