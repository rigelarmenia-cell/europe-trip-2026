"""Draw the application's original compass symbol. Requires Pillow; never loads photos."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / 'icons'
root.mkdir(exist_ok=True)
for name, size, maskable in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('maskable-512.png', 512, True), ('apple-touch-icon.png', 180, False)]:
    canvas = Image.new('RGB', (1024, 1024), '#183e42')
    draw = ImageDraw.Draw(canvas)
    draw.ellipse((198, 198, 826, 826), outline='#e5edda', width=16)
    draw.polygon([(638, 290), (580, 580), (290, 638), (444, 444)], fill='#e5edda')
    draw.polygon([(638, 290), (580, 580), (444, 444)], fill='#d97b50')
    draw.ellipse((474, 474, 550, 550), fill='#183e42')
    canvas.resize((size, size), Image.Resampling.LANCZOS).save(root / name)
