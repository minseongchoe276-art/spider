"""Compose existing browser screenshots into QA contact sheets (Pillow)."""
import json, math
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parent
GALLERY = ROOT / 'gallery'
FONT = ImageFont.truetype('/System/Library/Fonts/Menlo.ttc', 17)

def sheets(entries, stem, scene=True):
    for index in range(math.ceil(len(entries) / 20)):
        batch=entries[index*20:(index+1)*20]
        page = Image.new('RGB', (1500, math.ceil(len(batch)/5)*330), '#202735')
        draw = ImageDraw.Draw(page)
        for slot, (name, path) in enumerate(batch):
            image = Image.open(path).convert('RGB')
            if scene:
                w, h = image.size
                image = image.crop((int(w*.34), int(h*.1), w, h))
            tile = ImageOps.contain(image, (294, 290))
            x, y = slot%5*300, slot//5*330
            page.paste(tile, (x+(300-tile.width)//2, y+30+(294-tile.height)//2))
            draw.text((x+8, y+5), name, font=FONT, fill='white')
        page.save(GALLERY / f'{stem}-{index+1}.jpg', quality=94)

clips = json.loads((GALLERY/'browser-coverage.json').read_text())
sheets([(f"{x['key']} / {x['phase']}%", GALLERY/f"{x['key']}-{x['phase']}.png") for x in clips], 'contact-sheet')
runtime = json.loads((GALLERY/'runtime-coverage.json').read_text())
sheets([(f"{x['kind']} / {x['time']}s", GALLERY/f"runtime-{x['kind']}-{x['time']}.png") for x in runtime], 'runtime-sheet')
fp = json.loads((GALLERY/'first-person-coverage.json').read_text())
sheets([(f"{x['key']} / {x['phase']}", GALLERY/f"first-person-{x['key']}.png") for x in fp], 'first-person-sheet', False)
canvas=Image.new('RGB',(1600,640),'#202735'); draw=ImageDraw.Draw(canvas)
for i,(label,path) in enumerate([('BEFORE: airborne lead-in','slamLand-20-before.png'),('AFTER: grounded recovery','slamLand-20.png')]):
    im=ImageOps.contain(Image.open(GALLERY/path).convert('RGB'),(792,590))
    canvas.paste(im,(i*800+(800-im.width)//2,40));draw.text((i*800+15,10),label,font=FONT,fill='white')
canvas.save(GALLERY/'landing-before-after.jpg',quality=95)
print(f'{len(clips)} clip samples, {len(runtime)} runtime samples, {len(fp)} first-person samples composed.')
