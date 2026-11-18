"""기획자 그림(art-src/, git 제외) → 게임용 그림(public/art/) 가공.

- 원본 파일명(GPT 기본 이름)과 게임 키를 아래 SOURCES로 짝지어 둔다. 그림이 늘면 여기에 한 줄 추가.
- 투명 그림: 빈 여백을 잘라 내고 정사각형 가운데 + 여백 6%로 맞춘 뒤 크기를 줄인다.
- 단색 배경 그림(remove_bg=True): 가장자리에서 이어진 배경색만 지워 투명하게 만든다(외곽선은 남김).
- 배경 그림: 게임 비율(9:16)로 가운데를 잘라 1080×1920 JPG.
- 앱 아이콘: 1024×1024 RGB(투명 금지)로 iOS 아이콘과 store/에 저장(release/appstore 쪽에서 복사해 씀).
실행: python scripts/process_art.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'art-src'
OUT = ROOT / 'public' / 'art'
STORE = ROOT / 'store'

P = 'ChatGPT 이미지 2026년 11월 18일 오전 '
# 게임 키: (원본 파일명, 종류, 최종 크기)
SOURCES = {
    'app-icon': (P + '11_08_43-2.png', 'icon', 1024),
    'lobby-bg': (P + '11_09_12-3.png', 'background', (1080, 1920)),
    'chest-equipment': (P + '11_09_17-4.png', 'sprite', 512),
    'chest-dragon': (P + '11_09_22-5.png', 'sprite', 512),
    'chest-gold': (P + '11_09_27-6.png', 'sprite', 512),
    'ui-gold': (P + '11_09_31-7.png', 'sprite', 256),
    'ui-ruby': (P + '11_09_35-8.png', 'sprite', 256),
    'ui-card': (P + '11_09_46-9.png', 'sprite', 256),
    'ui-essence': (P + '11_09_51-10.png', 'sprite', 256),
    'hero-red': (P + '11_18_46.png', 'sprite-bg', 768),  # 화풍 기준 그림 → 로비 출격 드래곤
    'ui-fragment': ('ChatGPT 이미지 2026년 11월 18일 오후 02_59_45-1.png', 'sprite', 256),
    'ui-ticket': ('ChatGPT 이미지 2026년 11월 18일 오후 02_59_53-2.png', 'sprite', 256),
}

# 6단계 기획서 v1.0 HTML에 들어 있는 드래곤 10종 아틀라스(5×2 칸). v1.2 31쪽: 도감·소환 결과·상세·선택 카드에 사용 가능.
ATLAS = ('atlas-dragons-v1.0.png', ['red', 'blue', 'yellow', 'green', 'white', 'black', 'stone', 'wind', 'water', 'arcane'], 384)


def remove_flat_background(im: Image.Image, tol: int = 38) -> Image.Image:
    """가장자리에서 이어진(배경) 영역만 투명하게. 같은 색이 그림 안에 있어도 외곽선으로 막혀 있으면 남는다."""
    rgb = im.convert('RGB')
    w, h = rgb.size
    mark = (255, 0, 255)
    work = rgb.copy()
    for seed in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (0, h // 2), (w - 1, h // 2), (w // 2, h - 1)]:
        if work.getpixel(seed) != mark:
            ImageDraw.floodfill(work, seed, mark, thresh=tol)
    mask = Image.new('L', (w, h), 255)
    px, wp = mask.load(), work.load()
    for y in range(h):
        for x in range(w):
            if wp[x, y] == mark:
                px[x, y] = 0
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))  # 가장자리 배경 테두리 한 겹 제거 + 부드럽게
    out = rgb.convert('RGBA')
    out.putalpha(mask)
    return out


def fit_square(im: Image.Image, size: int, pad: float = 0.06) -> Image.Image:
    im = im.convert('RGBA')
    bbox = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    s = max(w / im.width, h / im.height)
    r = im.convert('RGB').resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    x, y = (r.width - w) // 2, (r.height - h) // 2
    return r.crop((x, y, x + w, y + h))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    STORE.mkdir(exist_ok=True)
    done = {}
    for key, (name, kind, size) in SOURCES.items():
        src = SRC / name
        if not src.exists():
            print('없음', key, name)
            continue
        im = Image.open(src)
        if kind == 'icon':
            icon = im.convert('RGB').resize((size, size), Image.LANCZOS)
            icon.save(STORE / 'app-icon.png', optimize=True)
            icon.resize((600, 600), Image.LANCZOS).save(STORE / 'toss-logo-600.png', optimize=True)
            print('아이콘', key)
            continue
        if kind == 'background':
            path = OUT / f'{key}.jpg'
            cover(im, *size).save(path, quality=85, optimize=True, progressive=True)
        else:
            if kind == 'sprite-bg':
                im = remove_flat_background(im)
            path = OUT / f'{key}.webp'  # 투명 WebP: PNG보다 4~6배 가벼움(iOS 14+ WebView·브라우저 지원)
            fit_square(im, size).save(path, 'WEBP', quality=88, method=6)
        done[key] = path.name
        print(key, path.name, path.stat().st_size // 1024, 'KB')
    atlas = SRC / ATLAS[0]
    if atlas.exists():
        im = Image.open(atlas).convert('RGB')
        cw, ch = im.width / 5, im.height / 2
        for i, did in enumerate(ATLAS[1]):
            cx, cy = (i % 5) * cw, (i // 5) * ch
            cell = im.crop((round(cx) + 6, round(cy) + 6, round(cx + cw) - 6, round(cy + ch) - 6))  # 칸 사이 구분선 제외
            key = f'portrait-{did}'
            path = OUT / f'{key}.webp'
            fit_square(remove_flat_background(cell, tol=30), ATLAS[2]).save(path, 'WEBP', quality=88, method=6)
            done[key] = path.name
        print('아틀라스 10종 잘라 냄')
    # src/ui/art.ts의 ART_FILES에 붙일 목록
    print('ART_FILES =', done)


if __name__ == '__main__':
    main()
