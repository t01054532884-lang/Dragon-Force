"""UI 묶음 18장(2026-11-26, Higgsfield GPT Image 2.6, 투명 배경, 루비 아이콘·골드 묶음을 화풍 참고 그림으로).
art-src/uiset/hf-<키>.png → public/art/<폴더>/<키>.webp
- 아래 메뉴 5: ic-shop · ic-dragon · ic-swords · ic-shield(같은 키 교체) · ic-lab(새 키, 예전 ic-upgrade 대신) — 256
- 업적 메달 4: medal-bronze/silver/gold/diamond — 256
- 루비 상품 5: shop/ruby-pack-1~5 — 256 (몇 알 → 주머니 → 더미 → 그릇 → 보물 상자)
- 우편 봉투 열림 mail-open · 패스 받침대 pass-pedestal — 256
- 결과 배너 res-victory · res-defeat — 가로 720 (글자는 코드가 위에 씀)
원본 경로(art-src/)는 메인 저장소 폴더 — worktree에서 돌릴 때는 ART_SRC 환경변수로 지정."""
import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(os.environ.get('ART_SRC', ROOT / 'art-src')) / 'uiset'
OUT = ROOT / 'public' / 'art'

SQUARE = {
    'ic-shop': 'ui', 'ic-dragon': 'ui', 'ic-swords': 'ui', 'ic-shield': 'ui', 'ic-lab': 'ui',
    'medal-bronze': 'ui', 'medal-silver': 'ui', 'medal-gold': 'ui', 'medal-diamond': 'ui',
    'ruby-pack-1': 'shop', 'ruby-pack-2': 'shop', 'ruby-pack-3': 'shop', 'ruby-pack-4': 'shop', 'ruby-pack-5': 'shop',
    'mail-open': 'ui', 'pass-pedestal': 'ui',
}
WIDE = {'res-victory': 'ui', 'res-defeat': 'ui', 'rubypass-hero': 'ui', 'lvup-crest': 'ui', 'rune-reward-pop': 'ui'}  # + 2026-11-26 루비 패스 머리 그림 · 레벨 축하 문장


def crop(im):
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 10 else 0).getbbox()
    return im.crop(bbox) if bbox else im


def square(im, size=256, pad=0.03):
    im = crop(im)
    side = int(max(im.size) / (1 - 2 * pad))
    c = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    c.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return c.resize((size, size), Image.LANCZOS)


for k, folder in {**SQUARE, **WIDE}.items():
    p = SRC / f'hf-{k}.png'
    if not p.exists():
        print('없음:', p)
        continue
    im = Image.open(p)
    if k in WIDE:
        im = crop(im)
        im = im.resize((720, round(im.height * 720 / im.width)), Image.LANCZOS)
    else:
        im = square(im)
    out = OUT / folder / f'{k}.webp'
    im.save(out, 'WEBP', quality=88, method=6)
    print(f'{folder}/{k}.webp', im.size, f'{out.stat().st_size // 1024}KB')
