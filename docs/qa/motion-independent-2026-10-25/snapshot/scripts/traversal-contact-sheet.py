"""Arrange this task's browser captures for visual QA; no model asset editing."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / 'docs' / 'qa'
keys = ['slope-up-final', 'slope-down-final', 'stairs-final',
        'mantle-grip-final', 'mantle-step-final', 'mantle-arrival-final']
sheet = Image.new('RGB', (1280, 1152), '#edf2f6')
draw = ImageDraw.Draw(sheet)
for index, key in enumerate(keys):
    x, y = index % 2 * 640, index // 2 * 384
    draw.text((x + 10, y + 6), key, fill='#16283b')
    with Image.open(root / (key + '.png')) as source:
        sheet.paste(source.resize((640, 360)), (x, y + 24))
sheet.save(root / 'traversal-contact-sheet.jpg', quality=92)
