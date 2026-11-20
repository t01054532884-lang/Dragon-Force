"""임시 앱 아이콘 만들기(기획자 그림이 오기 전 TestFlight용).

게임 안 레드 드래곤 도형 그림(src/dragonArt.ts)을 그대로 크게 그려서
- ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png (1024×1024, 투명 없음)
- store/app-icon-placeholder.png (같은 그림, 스토어 자료 확인용)
을 만든다. 실행: python scripts/make_placeholder_icon.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
S = 1024


def hexrgb(h: int):
    return ((h >> 16) & 255, (h >> 8) & 255, h & 255)


def shade(h: int, f: float):
    r, g, b = hexrgb(h)
    return tuple(max(0, min(255, int(c * f))) for c in (r, g, b))


# 배경: 위 보랏빛 → 아래 용암 주황 그라데이션 + 가운데 빛
bg = Image.new('RGB', (S, S))
top, bot = hexrgb(0x2a1a4a), hexrgb(0xb8400f)
for y in range(S):
    t = y / (S - 1)
    c = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    ImageDraw.Draw(bg).line([(0, y), (S, y)], fill=c)
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow).ellipse([S * 0.18, S * 0.2, S * 0.82, S * 0.84], fill=(255, 150, 60, 110))
bg = Image.alpha_composite(bg.convert('RGBA'), glow.filter(ImageFilter.GaussianBlur(90)))

# 레드 드래곤(64×64 좌표계를 k배, 가운데 정렬) — dragonArt.ts drawDragon('red')와 같은 도형
k = S / 64 * 0.86
ox = (S - 64 * k) / 2
oy = (S - 64 * k) / 2 + S * 0.02
layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(layer)


def P(x, y):
    return (ox + x * k, oy + y * k)


def tri(a, b, c, col):
    d.polygon([P(*a), P(*b), P(*c)], fill=col)


def ell(cx, cy, w, h, col):
    d.ellipse([P(cx - w / 2, cy - h / 2), P(cx + w / 2, cy + h / 2)], fill=col)


def circ(cx, cy, r, col):
    ell(cx, cy, r * 2, r * 2, col)


body, belly, accent = 0xD23B2A, 0xF3D6A2, 0xFF9A3C
wing = shade(body, 0.68)
tri((32, 30), (2, 14), (10, 42), wing)  # 날개
tri((32, 30), (62, 14), (54, 42), wing)
tri((26, 48), (38, 48), (32, 63), hexrgb(body))  # 꼬리
circ(32, 61, 3, hexrgb(0xFFB347))
ell(32, 36, 22, 30, hexrgb(body))  # 몸통
ell(32, 38, 9, 20, hexrgb(belly) + (217,))  # 배
circ(32, 18, 9, shade(body, 1.12))  # 머리
tri((25, 14), (28, 12), (23, 4), hexrgb(0x8A6A4A))  # 뿔
tri((39, 14), (36, 12), (41, 4), hexrgb(0x8A6A4A))
circ(28, 17, 2, hexrgb(0xFFD34D))  # 눈
circ(36, 17, 2, hexrgb(0xFFD34D))

shadow = layer.split()[3].filter(ImageFilter.GaussianBlur(18))
sh = Image.new('RGBA', (S, S), (0, 0, 0, 0))
sh.putalpha(shadow.point(lambda a: int(a * 0.55)))
out = Image.alpha_composite(bg, sh.transform((S, S), Image.AFFINE, (1, 0, 0, 0, 1, -18)))
out = Image.alpha_composite(out, layer).convert('RGB')  # 앱 아이콘은 투명 불가

icon = ROOT / 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'
out.save(icon, optimize=True)
(ROOT / 'store').mkdir(exist_ok=True)
out.save(ROOT / 'store/app-icon-placeholder.png', optimize=True)
print('saved', icon)
