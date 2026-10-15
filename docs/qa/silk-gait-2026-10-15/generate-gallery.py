from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json,shutil
p=Path(__file__).parent
font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',14)
for kind in ['clip','runtime','foot','web']:
 rows=json.loads((p/f'{kind}-coverage.json').read_text())
 for page in range((len(rows)+17)//18):
  chunk=rows[page*18:page*18+18]; cols=6;w,h=320,320
  c=Image.new('RGB',(cols*w,((len(chunk)+cols-1)//cols)*h),'#111827');d=ImageDraw.Draw(c)
  for i,r in enumerate(chunk):
   im=Image.open(p/'gallery'/r['file']).convert('RGB');im.thumbnail((w,h-26));x=i%cols*w;y=i//cols*h
   label=(f"{r['key']} {r['phase']}%" if kind=='clip' else f"{r['kind']} {r['time']}s" if kind!='web' else f"{r['view']}/{r['background']}/{r['hand']} {r['phase']} {r['time']}")
   d.text((x+5,y+5),label,font=font,fill='white');c.paste(im,(x+(w-im.width)//2,y+26))
  c.save(p/f'{kind}-sheet-{page+1}.jpg',quality=93)
shutil.copy(p/'gallery/web-first-day-both-fire-0.16.png',p/'web-after.png')
c=Image.new('RGB',(1280,650),'#111827');d=ImageDraw.Draw(c)
for i,(name,label) in enumerate([('web-before.png','BEFORE'),('web-after.png','AFTER')]):
 im=Image.open(p/name).convert('RGB');im.thumbnail((640,617));c.paste(im,(640*i,33));d.text((640*i+12,8),label,font=font,fill='white')
c.save(p/'web-before-after.jpg',quality=95)
print('Contact sheets and before/after saved')
