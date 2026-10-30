# Renders category images (white background, plate with soft shadow, 3D-style food icon) for
# categories without a photo. Usage: python3 scripts/category-images.py  (needs Noto Color Emoji)
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "categories")
FONT = "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf"
CATS = {
    "shawarma": "🌯", "grills": "🍢", "chicken": "🍗", "manakish": "🫓", "sushi": "🍣",
    "asian": "🍜", "pasta": "🍝", "mexican": "🌮", "seafood": "🦐", "healthy": "🥗",
    "breakfast": "🍳", "desserts": "🍰", "ice-cream": "🍨", "bakery": "🥐", "drinks": "🥤",
}
S = 512  # draw at 2x, save at 256

def emoji(ch, size):
    f = ImageFont.truetype(FONT, 109)
    im = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((80, 80), ch, font=f, embedded_color=True, anchor="mm")
    return im.crop(im.getbbox()).resize((size, size), Image.LANCZOS)

def plate():
    base = Image.new("RGBA", (S, S), (255, 255, 255, 255))
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((50, 70, S - 40, S - 22), fill=(60, 40, 20, 70))
    base.alpha_composite(sh.filter(ImageFilter.GaussianBlur(18)))
    p = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(p)
    d.ellipse((36, 36, S - 36, S - 36), fill=(236, 231, 224, 255))  # rim edge
    d.ellipse((44, 40, S - 44, S - 48), fill=(250, 248, 244, 255))  # rim
    d.ellipse((96, 92, S - 96, S - 100), fill=(242, 238, 232, 255))  # well
    d.ellipse((104, 98, S - 104, S - 108), fill=(248, 246, 242, 255))
    base.alpha_composite(p)
    return base

for slug, ch in CATS.items():
    im = plate()
    e = emoji(ch, 300)
    shadow = Image.new("RGBA", e.size, (0, 0, 0, 0))
    shadow.putalpha(e.getchannel("A").point(lambda a: int(a * 0.28)))
    im.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)), ((S - 300) // 2 + 6, (S - 300) // 2 + 16))
    im.alpha_composite(e, ((S - 300) // 2, (S - 300) // 2 - 4))
    im.convert("RGB").resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, f"{slug}.webp"), "WEBP", quality=90, method=6)
    print("rendered", slug)
