"""20차분(2026-11-24): 제작자 ChatGPT 공유 링크 두 장(1254×1254, 투명 배경, 3×3).
- art-src/sig9/a.png: 19차분 탄 9종 수정본(본체 크게, 미러 팔각 결정, 하울 가운데 빈 고리) → public/art/proj/<이름>.webp 256 (19차분 덮어씀)
- art-src/sig9/b.png: 신규 9종 전용 스킬 전투 연출 → public/art/sigfx/sigart-<드래곤>.webp 512
  (키를 sigart-로 둔 이유: sigfx-<드래곤>은 15차분 '시전 번쩍임' 그림 키라 겹치면 시전 때 엉뚱하게 뜬다)"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
A = ROOT / 'art-src' / 'sig9' / 'a.png'
B = ROOT / 'art-src' / 'sig9' / 'b.png'
PROJ = [['proj-aurora', 'proj-mirror', 'proj-chrono'], ['proj-void', 'proj-sand', 'proj-steel'], ['proj-bloom', 'fx-sound-ring', 'fx-crimson-slash']]
SIG = [['aurora', 'void', 'chrono'], ['mirror', 'howl', 'crimson'], ['sand', 'steel', 'bloom']]


def isolate(im: Image.Image) -> Image.Image:
    """가장 큰 덩어리만 남김(옆 칸에서 넘어온 조각 제거): 1/4로 줄인 알파(>40)에서 연결 성분을 찾아
    가장 큰 것(한 칸 넓힘)만 두고 나머지 픽셀은 투명으로"""
    k = 4
    small = im.getchannel('A').resize((im.width // k, im.height // k), Image.BOX)
    w, h = small.size
    sp = small.load()
    on = [[sp[x, y] > 40 for x in range(w)] for y in range(h)]
    seen = [[False] * w for _ in range(h)]
    best: list[tuple[int, int]] = []
    for y0 in range(h):
        for x0 in range(w):
            if not on[y0][x0] or seen[y0][x0]:
                continue
            comp, stack = [], [(x0, y0)]
            seen[y0][x0] = True
            while stack:
                x, y = stack.pop()
                comp.append((x, y))
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and on[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    keep = Image.new('L', (w, h), 0)
    kp = keep.load()
    for x, y in best:
        for dx in (-2, -1, 0, 1, 2):
            for dy in (-2, -1, 0, 1, 2):
                if 0 <= x + dx < w and 0 <= y + dy < h:
                    kp[x + dx, y + dy] = 255
    mask = keep.resize(im.size, Image.NEAREST)
    out = im.copy()
    a = Image.composite(im.getchannel('A'), Image.new('L', im.size, 0), mask)
    out.putalpha(a)
    return out


def fit_square(im: Image.Image, size: int, pad: float) -> Image.Image:
    im = isolate(im)
    bbox = im.getchannel('A').point(lambda a: 255 if a > 12 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    side = int(max(im.size) / (1 - 2 * pad))
    canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
    canvas.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return canvas.resize((size, size), Image.LANCZOS)


def cut(src: Path, names, out_dir: Path, size: int, prefix: str = '') -> None:
    sheet = Image.open(src).convert('RGBA')
    cw, ch = sheet.width // 3, sheet.height // 3
    out_dir.mkdir(parents=True, exist_ok=True)
    for r, row in enumerate(names):
        for c, name in enumerate(row):
            cell = sheet.crop((c * cw, r * ch, (c + 1) * cw, (r + 1) * ch))
            out = out_dir / f'{prefix}{name}.webp'
            img = fit_square(cell, size, 0.02)
            if name == 'howl':  # 둥근 충격파: 아래 칸(칼날비) 칼끝이 붙어 들어와 둥근 가림막으로 정리
                from PIL import ImageDraw
                m = Image.new('L', img.size, 0)
                ImageDraw.Draw(m).ellipse((int(img.width * 0.03), 0, int(img.width * 0.97), int(img.height * 0.8)), fill=255)
                from PIL import ImageFilter
                m = m.filter(ImageFilter.GaussianBlur(img.width * 0.03))
                from PIL import ImageChops
                img.putalpha(ImageChops.multiply(img.getchannel('A'), m))
            img.save(out, 'WEBP', quality=88, method=6)
            print(out.name, out.stat().st_size)


cut(A, PROJ, ROOT / 'public' / 'art' / 'proj', 256)
cut(B, SIG, ROOT / 'public' / 'art' / 'sigfx', 512, 'sigart-')
