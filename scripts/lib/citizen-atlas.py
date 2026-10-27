import json,sys
from PIL import Image,ImageOps,ImageEnhance
c=json.load(open(sys.argv[1]));atlas=Image.new('RGBA',(c['size'],c['size']),(255,255,255,255))
for item in c['items']:
 image=Image.open(item['image']).convert('RGBA') if item['image'] else Image.new('RGBA',(c['tile'],c['tile']),(255,255,255,255))
 image=image.resize((c['tile'],c['tile']),Image.Resampling.LANCZOS)
 # FBX diffuse color is linear; do not double-tint embedded sRGB skin/clothes.
 if not item['image']:
  rgb=tuple(int(max(0,min(1,x))**(1/2.2)*255) for x in item['color']);image=Image.new('RGBA',image.size,(*rgb,255))
 pad=c['pad'];atlas.paste(image,(item['x']+pad,item['y']+pad))
 # Extend edge texels into the gutter to keep mipmaps off adjacent materials.
 for k in range(pad):
  atlas.paste(image.crop((0,0,1,c['tile'])),(item['x']+k,item['y']+pad));atlas.paste(image.crop((c['tile']-1,0,c['tile'],c['tile'])),(item['x']+pad+c['tile']+k,item['y']+pad))
  atlas.paste(image.crop((0,0,c['tile'],1)),(item['x']+pad,item['y']+k));atlas.paste(image.crop((0,c['tile']-1,c['tile'],c['tile'])),(item['x']+pad,item['y']+pad+c['tile']+k))
atlas.save(sys.argv[2],optimize=True)
