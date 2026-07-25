from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_production" / "poster-source.webp"
OUTPUT = ROOT / "public" / "poster.png"
THUMB = ROOT / "_production" / "poster-thumb.png"

image = Image.open(SOURCE).convert("RGB")
image = image.crop((82, 82, 942, 942)).resize((1024, 1024), Image.Resampling.LANCZOS)

veil = Image.new("RGBA", image.size, (0, 0, 0, 0))
pixels = veil.load()
for y in range(295):
    alpha = round(145 * (1 - y / 295) ** 1.7)
    for x in range(1024):
        pixels[x, y] = (2, 13, 18, alpha)
image = Image.alpha_composite(image.convert("RGBA"), veil)

draw = ImageDraw.Draw(image)
title_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Bodoni 72.ttc", 100, index=0)
small_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 15)
draw.text((63, 40), "VISUAL STUDY / 02", font=small_font, fill=(238, 249, 248, 180))
draw.multiline_text(
    (56, 58),
    "WATER\nVEIL",
    font=title_font,
    fill=(238, 249, 248, 255),
    spacing=-26,
)

rgb = image.convert("RGB")
rgb.quantize(
    colors=256,
    method=Image.Quantize.MEDIANCUT,
    dither=Image.Dither.FLOYDSTEINBERG,
).save(OUTPUT, "PNG", optimize=True)
rgb.resize((160, 160), Image.Resampling.LANCZOS).save(THUMB, "PNG", optimize=True)
