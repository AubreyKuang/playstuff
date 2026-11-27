#!/usr/bin/env python3
"""Build the store icon and banners from the pictures capture.cjs took of the real game.

    python3 crispy-squishy/tools/compose-art.py     # needs Pillow

Icon: 1240x1240, square corners, opaque. Banners: 1920x1080 and 1440x1440, the toys lined up
on the game's own backdrop with the game name as the only text.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

GAME = Path(__file__).resolve().parent.parent
RAW = GAME.parent / 'dist/art'
OUT = GAME / 'store'
NAME = '脆皮捏捏铺'
INK = (29, 43, 39)
FONTS = ['/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc']


def font(size):
    for path in FONTS:
        if Path(path).exists():
            # The bold face of Hiragino Sans GB is the second one in the collection.
            for index in (1, 0):
                try:
                    return ImageFont.truetype(path, size, index=index)
                except OSError:
                    continue
    raise SystemExit('no Chinese font found for the banner title')


def backdrop(w, h):
    """The stage's soft spotlight: pale in the middle, deeper mint at the edges."""
    small = Image.new('RGB', (64, 64))
    px = small.load()
    hi, lo = (238, 246, 242), (200, 220, 212)
    for y in range(64):
        for x in range(64):
            d = min(1.0, (((x - 32) / 34) ** 2 + ((y - 27) / 30) ** 2) ** 0.5)
            px[x, y] = tuple(round(hi[i] + (lo[i] - hi[i]) * d ** 1.5) for i in range(3))
    return small.resize((w, h), Image.BICUBIC)


def toy(name, height):
    """A cut-out trimmed to its own pixels (shadow included) and scaled to a height."""
    im = Image.open(RAW / f'cut-{name}.png').convert('RGBA')
    im = im.crop(im.getbbox())
    k = height / im.height
    return im.resize((round(im.width * k), height), Image.LANCZOS)


def place(canvas, im, cx, base):
    canvas.alpha_composite(im, (round(cx - im.width / 2), round(base - im.height)))


def title(canvas, size, cy):
    draw = ImageDraw.Draw(canvas)
    f = font(size)
    box = draw.textbbox((0, 0), NAME, font=f)
    x, y = (canvas.width - (box[2] - box[0])) / 2 - box[0], cy - (box[3] - box[1]) / 2 - box[1]
    # a soft light halo keeps the name readable over the backdrop without adding a second colour
    halo = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(halo).text((x, y), NAME, font=f, fill=(255, 255, 255, 200))
    canvas.alpha_composite(halo.filter(ImageFilter.GaussianBlur(size * 0.08)))
    # the system face is light; a thin stroke in the same colour brings it up to a title weight
    draw.text((x, y), NAME, font=f, fill=INK + (255,), stroke_width=max(2, round(size * 0.022)), stroke_fill=INK + (255,))


def save(canvas, name):
    path = OUT / name
    canvas.convert('RGB').save(path, quality=93)
    print(f'  {path.relative_to(GAME.parent)}  {canvas.width}x{canvas.height}')


def main():
    OUT.mkdir(parents=True, exist_ok=True)

    icon = Image.open(RAW / 'icon-src.png').convert('RGB').resize((1240, 1240), Image.LANCZOS)
    icon.save(OUT / 'icon.png')
    print(f'  {(OUT / "icon.png").relative_to(GAME.parent)}  1240x1240')

    wide = backdrop(1920, 1080).convert('RGBA')
    title(wide, 190, 190)
    for name, cx, h in [('popsicle', 300, 560), ('strawberry', 660, 500), ('berry', 1010, 540), ('friedegg', 1360, 470), ('soda', 1680, 520)]:
        place(wide, toy(name, h), cx, 1010)
    save(wide, 'banner-1920x1080.jpg')

    square = backdrop(1440, 1440).convert('RGBA')
    title(square, 200, 210)
    for name, cx, base, h in [('toast', 400, 860, 470), ('popsicle', 1040, 880, 520),
                              ('strawberry', 270, 1350, 440), ('berry', 720, 1370, 500), ('soda', 1170, 1350, 460)]:
        place(square, toy(name, h), cx, base)
    save(square, 'banner-1440x1440.jpg')


if __name__ == '__main__':
    main()
