"""23차분(2026-11-24, 그림 요청서 8): 장비 등급 오라 3 · 장비 궤도 받침 4. 제작자 ChatGPT 공유 링크(1254, 투명 배경, 한 장씩, 그림 보고 이름 맞춤).
art-src/aura/<이름>.png → public/art/equip/<이름>.webp (오라 512 · 받침 192). EquipScene.drawAura·drawOrbit가 같은 키로 씀."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src' / 'aura'
OUT = ROOT / 'public' / 'art' / 'equip'
FILES = {f'aura-equip-{r}': 512 for r in ['rare', 'epic', 'legendary']} | {f'equip-orb-{r}': 192 for r in ['common', 'rare', 'epic', 'legendary']}


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


for name, size in FILES.items():
    out = OUT / f'{name}.webp'
    fit_square(Image.open(SRC / f'{name}.png'), size, 0.01).save(out, 'WEBP', quality=88, method=6)
    print(out.name, out.stat().st_size)
