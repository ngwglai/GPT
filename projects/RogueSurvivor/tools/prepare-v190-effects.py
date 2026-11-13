"""Reproducible slicing/alpha cleanup of original image_gen VFX atlases. Requires Pillow.
No external art; original output copies in art-source/v1.9.0. Runtime uses RGBA WebP.
"""
from collections import deque
from pathlib import Path
from PIL import Image
import json
ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'art-source/v1.9.0'
OUT = ROOT / 'public/assets/v1.9.0/effects'
OUT.mkdir(parents=True, exist_ok=True)
NAMES = [
 'arrow','slash','fireball','spirit','frost','lance','shield','heal',
 'starfall','dash','hit','critical','hostile','warning','revive','dissolve',
 'vine','beam','candy','moon','meteor','fan','mirror','phase',
]
def clean(im):
    # Remove only border-connected neutral matte; enclosed white energy stays.
    im=im.convert('RGBA'); p=im.load(); w,h=im.size
    seen=set(); q=deque([(x,0) for x in range(w)]+[(x,h-1) for x in range(w)]+[(0,y) for y in range(h)]+[(w-1,y) for y in range(h)])
    while q:
        x,y=q.popleft()
        if (x,y) in seen: continue
        seen.add((x,y)); r,g,b,a=p[x,y]
        if not (a<8 or (min(r,g,b)>205 and max(r,g,b)-min(r,g,b)<38)): continue
        p[x,y]=(r,g,b,0)
        for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
            nx,ny=x+dx,y+dy
            if 0<=nx<w and 0<=ny<h and (nx,ny) not in seen:q.append((nx,ny))
    # Remove invisible color noise, retain soft antialiasing above 8/255.
    a=im.getchannel('A').point(lambda n: 0 if n<8 else n);im.putalpha(a)
    return im

def cell(im,c,r,cols,rows):
    w,h=im.size
    return im.crop((round(c*w/cols)+3,round(r*h/rows)+3,round((c+1)*w/cols)-3,round((r+1)*h/rows)-3))
def fit(im,size=192):
    im=clean(im)
    box=im.getchannel('A').point(lambda n:255 if n>35 else 0).getbbox()
    if not box: raise ValueError('Empty effect')
    im=im.crop(box);im.thumbnail((round(size*.90),round(size*.90)),Image.Resampling.LANCZOS)
    out=Image.new('RGBA',(size,size));out.alpha_composite(im,((size-im.width)//2,(size-im.height)//2))
    return out
stats=[]
for file,rows,offset in [('player-status',4,0),('boss-world',2,16)]:
    im=Image.open(SOURCE/(file+'.webp'))
    for i in range(rows*4):
        name=NAMES[offset+i]
        if file=='player-status':
            ys=[0,298,596,890,1243]; xs=[0,316,633,950,1265]
            raw=im.crop((xs[i%4]+5,ys[i//4]+5,xs[i%4+1]-5,ys[i//4+1]-5))
        else: raw=cell(im,i%4,i//4,4,rows)
        out=fit(raw);target=OUT/(name+'.webp')
        out.save(target,quality=88,method=6)
        stats.append({'id':'vfx.'+name,'file':target.name,'width':192,'height':192,'bytes':target.stat().st_size})
# Four original consecutive generated frames. Crop paper/grid at fixed row bounds.
s=Image.open(SOURCE/'impact-sequence.webp').convert('RGBA')
s=s.crop((0,round(s.height*.065),s.width,round(s.height*.845)))
frames=[clean(cell(s,i,0,4,1)) for i in range(4)]
# All frames use the SAME scale and center; never individually fit a growing burst.
scale=172/max(max(f.width,f.height) for f in frames)
sheet=Image.new('RGBA',(192*4,192))
for i,f in enumerate(frames):
    f=f.resize((round(f.width*scale),round(f.height*scale)),Image.Resampling.LANCZOS)
    sheet.alpha_composite(f,(i*192+(192-f.width)//2,(192-f.height)//2))
sheet.save(OUT/'impact.webp',quality=88,method=6)
stats.append({'id':'vfx.impact','file':'impact.webp','width':768,'height':192,'frames':4,'frameWidth':192,'frameHeight':192,'fps':12,'bytes':(OUT/'impact.webp').stat().st_size})
(OUT/'manifest.json').write_text(json.dumps({'version':'1.9.0','source':'OpenAI built-in image_gen, original generated art','assets':stats},ensure_ascii=False,indent=2)+'\n')
preview=Image.new('RGB',(192*5,224*5),'#213944')
from PIL import ImageDraw
for i,a in enumerate(stats):
    im=Image.open(OUT/a['file']).crop((0,0,192,192));x=(i%5)*192;y=(i//5)*224
    preview.paste(im,(x,y),im);ImageDraw.Draw(preview).text((x+8,y+194),a['id'],fill='white')
preview.save(SOURCE/'contact-sheet.jpg',quality=90)
print(json.dumps({'textures':len(stats),'bytes':sum(a['bytes'] for a in stats),'pixels':sum(a['width']*a['height'] for a in stats)}))
