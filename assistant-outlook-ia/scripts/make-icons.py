"""Génère les icônes PNG du complément (micro blanc sur fond bleu arrondi). Usage : python3 scripts/make-icons.py"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'assets')
os.makedirs(OUT, exist_ok=True)
for size in (16, 32, 64, 80, 128):
    s = size * 4  # suréchantillonnage puis réduction (anticrénelage)
    img = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=(15, 98, 192, 255))
    w = s * 0.22
    cx = s / 2
    top, bottom = s * 0.18, s * 0.58
    d.rounded_rectangle([cx - w / 2, top, cx + w / 2, bottom], radius=int(w / 2), fill='white')
    lw = max(2, int(s * 0.06))
    d.arc([cx - s * 0.2, s * 0.32, cx + s * 0.2, s * 0.68], start=0, end=180, fill='white', width=lw)
    d.line([cx, s * 0.68, cx, s * 0.80], fill='white', width=lw)
    d.line([cx - s * 0.13, s * 0.81, cx + s * 0.13, s * 0.81], fill='white', width=lw)
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f'icon-{size}.png'))
print('ok')
