"""Compose browser QA screenshots without changing the recorded originals."""
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageOps,ImageFont
p=Path(__file__).resolve().parent
entries=json.loads((p/'browser-coverage.json').read_text())
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',17)
for view in ['first','third','palm']:
    page=Image.new('RGB',(1600,1080),'#202735');draw=ImageDraw.Draw(page)
    for i,item in enumerate(x for x in entries if x['view']==view):
        image=ImageOps.contain(Image.open(p/'gallery'/f"{view}-{item['side']}-{item['phase']}.png").convert('RGB'),(314,320))
        x,y=i%5*320,i//5*360;page.paste(image,(x+(320-image.width)//2,y+30));draw.text((x+8,y+6),f"{item['side']} / {item['phase']}",font=font,fill='white')
    page.save(p/'gallery'/f'{view}-sheet.jpg',quality=95)
proof=Image.new('RGB',(1440,500),'#202735');draw=ImageDraw.Draw(proof)
for i,(label,name) in enumerate([('FIRST PERSON / BOTH','first-both-fire.png'),('THIRD PERSON / LEFT','palm-left-fire.png'),('THIRD PERSON / RIGHT','palm-right-fire.png')]):
    im=ImageOps.contain(Image.open(p/'gallery'/name).convert('RGB'),(474,462));proof.paste(im,(i*480+(480-im.width)//2,34));draw.text((i*480+8,7),label,font=font,fill='white')
proof.save(p/'proof.jpg',quality=96)
