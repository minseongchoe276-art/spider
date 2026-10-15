from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
import json
p=Path(__file__).parent;font=ImageFont.truetype('/System/Library/Fonts/Menlo.ttc',14)
for kind in ['clip','runtime','wall','web']:
 source=p/f'{kind}-final-coverage.json' if kind in ['clip','runtime'] else p/f'{kind}-coverage.json'
 rows=json.loads(source.read_text())
 for page in range((len(rows)+17)//18):
  chunk=rows[page*18:page*18+18];w,h=320,320;c=Image.new('RGB',(w*6,((len(chunk)+5)//6)*h),'#111827');d=ImageDraw.Draw(c)
  for i,r in enumerate(chunk):
   im=Image.open(p/'gallery'/r['file']).convert('RGB');im.thumbnail((w,h-26));x=i%6*w;y=i//6*h
   label=f"{r['key']} {r['phase']}%" if kind=='clip' else f"{r['view']}/{r['hand']} {r['phase']}" if kind=='web' else f"{r['view']} {r['kind']} {r['time']}s"
   d.text((x+5,y+5),label,font=font,fill='white');c.paste(im,(x+(w-im.width)//2,y+26))
  c.save(p/f'{kind}-sheet-{page+1}.jpg',quality=93)
rows=json.loads((p/'wall-coverage.json').read_text());times=sorted({r['time'] for r in rows});frames=[]
for time in times:
 c=Image.new('RGB',(1000,490),'#111827');d=ImageDraw.Draw(c)
 for i,(view,label) in enumerate([('third','THIRD PERSON'),('first','FIRST PERSON')]):
  r=next(x for x in rows if x['time']==time and x['view']==view);im=Image.open(p/'gallery'/r['file']).convert('RGB');im.thumbnail((500,460));c.paste(im,(i*500,28));d.text((i*500+8,7),label,font=font,fill='white')
 frames.append(c)
frames[0].save(p/'wall-both-views.gif',save_all=True,append_images=frames[1:],duration=150,loop=0,optimize=True)
frames[4].save(p/'wall-both-views.jpg',quality=95)
print('Generated full-pose sheets and synchronized wall view preview')
