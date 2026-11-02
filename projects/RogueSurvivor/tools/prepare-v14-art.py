"""Slice original built-in image_gen atlases; Pillow is development-only.
Run after prepare-art.py. Never changes collision or game rules.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance
import json
ROOT=Path(__file__).resolve().parents[1]
SOURCE=ROOT/'art-source/v1.4';OUT=ROOT/'public/assets'
# Preserve the original source PNGs in the generation workspace; archive lossless copies.
SOURCES={
'creatures-draft':'exec-6575981d-8066-4ad5-812e-d74a04545870.png',
'creatures':'exec-1c0fc9db-1d51-40d7-9510-363f624cd89b.png',
'boss-original':'exec-0bc2df2c-c1a3-4b7a-bfeb-88431383d520.png',
'boss-cutout':'exec-2fa14ee1-08a6-43af-98fd-dbb042eec60a.png',
'maps':'exec-71b14ee7-90cb-465c-8d88-6da4ff2086fe.png',
'decor':'exec-bf7924e2-2cc3-46c9-b9fc-303422989c59.png'}
SOURCE.mkdir(parents=True,exist_ok=True)
for name,file in SOURCES.items():
 dest=SOURCE/(name+'.webp')
 if not dest.exists():
  im=Image.open(Path('/workspace/generated_images')/file).convert('RGBA')
  im.save(dest,lossless=True,method=0,exact=True)
visuals={};names={}
def src(name):return Image.open(SOURCE/(name+'.webp')).convert('RGBA')
def cell(im,i,cols,rows):
 x=i%cols;y=i//cols;w,h=im.size
 return im.crop((round(x*w/cols),round(y*h/rows),round((x+1)*w/cols),round((y+1)*h/rows)))
def clean_boundary_fragments(im):
    # Remove only disconnected fragments from adjacent cells that touch a crop boundary.
    # Keep the largest character component and all interior accessories.
    from collections import deque
    a=im.getchannel('A');w,h=im.size;pix=a.load();seen=bytearray(w*h);groups=[]
    for y in range(h):
      for x in range(w):
        ix=y*w+x
        if seen[ix] or pix[x,y]<=24:continue
        seen[ix]=1;q=deque([(x,y)]);points=[];edge=False
        while q:
          xx,yy=q.popleft();points.append((xx,yy));edge |= xx<12 or yy<12 or xx>=w-12 or yy>=h-12
          for nx,ny in ((xx-1,yy),(xx+1,yy),(xx,yy-1),(xx,yy+1)):
            if 0<=nx<w and 0<=ny<h and not seen[ny*w+nx] and pix[nx,ny]>24:
              seen[ny*w+nx]=1;q.append((nx,ny))
        groups.append((points,edge))
    biggest=max((len(g[0]) for g in groups),default=0)
    for points,edge in groups:
      if edge and len(points)<biggest*.18:
        for x,y in points:
          for yy in range(max(0,y-2),min(h,y+3)):
            for xx in range(max(0,x-2),min(w,x+3)):pix[xx,yy]=0
    im.putalpha(a);return im
def asset(id,name,im,size=256,trim=True):
 if trim:
  im=clean_boundary_fragments(im)
  # Trim alpha after discarding disconnected crop-boundary fragments; do not recolor or draw replacement creature art.
  box=im.getchannel('A').point(lambda n:255 if n>24 else 0).getbbox()
  if box:im=im.crop(box)
  im.thumbnail((round(size*.92),round(size*.92)))
  canvas=Image.new('RGBA',(size,size));canvas.alpha_composite(im,((size-im.width)//2,(size-im.height)//2));im=canvas
 else:im.thumbnail((size,size))
 path='v1.4/'+id.replace('.','/')+'.webp';dest=OUT/path;dest.parent.mkdir(parents=True,exist_ok=True);im.save(dest,quality=93,method=6)
 visuals[id]=path;names[id]=name
s=src('creatures')
ids=['fairy','protector','ghost','splitter','mirror','mimic','summoner','hexer','butterfly','crab']
cn=['治愈妖精','星光护卫','时空幽灵','分裂史莱姆','魔法镜灵','贪婪宝箱怪','星界召唤师','诅咒魔女','月光蝴蝶','水晶巨蟹']
for i,id in enumerate(ids):asset('enemy.'+id,cn[i],cell(s,i,3,4))
asset('projectile.crystal','水晶光束碎片',cell(s,10,3,4),128)
asset('effect.heal','妖精治愈之心',cell(s,11,3,4),128)
s=src('boss-cutout')
for i,(id,name) in enumerate(zip(['crystalQueen','candyWitch','eclipseSaint','mirrorMaiden'],['水晶女王','糖果魔女','月蚀圣女','镜中少女'])):asset('enemy.'+id,name,cell(s,i,2,2),512)
s=src('maps')
for i,(id,name) in enumerate(zip(['cavern','garden','eclipse'],['水晶洞窟','糖果魔女庭院','月蚀遗迹'])):
 asset('map.'+id+'.preview',name+'预览',cell(s,i,3,2),768,False)
 base=cell(s,i+3,3,2).crop((4,4,508,508)).convert('RGB').resize((256,256))
 base=ImageEnhance.Contrast(base).enhance(.85)
 tile=Image.new('RGB',(512,512));tile.paste(base,(0,0));tile.paste(ImageOps.mirror(base),(256,0));tile.paste(ImageOps.flip(base),(0,256));tile.paste(ImageOps.flip(ImageOps.mirror(base)),(256,256))
 asset('map.'+id+'.ground',name+'地表',tile,512,False)
s=src('decor')
ids=['map.cavern.crystal','map.cavern.lake','map.cavern.ore','map.garden.tree','map.garden.tea','map.garden.house','map.eclipse.pillar','map.eclipse.altar','map.eclipse.rune','map.candy.speed','map.candy.haste','map.candy.heal','map.candy.xp','map.candy.slow','map.candy.weak','map.magicCircle']
cn=['可破坏水晶','地下湖泊','魔法矿石','糖果树','魔法茶会','奶油小屋','遗迹石柱','月光祭坛','星空符石','疾风糖果','闪电糖果','爱心糖果','星星糖果','恶作剧缓行糖','裂纹虚弱糖','月光法阵']
for i,(id,name) in enumerate(zip(ids,cn)):asset(id,name,cell(s,i,4,4),256)
(ROOT/'src/data/worldVisuals.ts').write_text('/** Generated atlas mapping; no combat parameters. */\nexport const WORLD_VISUALS:Record<string,string> = '+json.dumps(visuals,ensure_ascii=False,indent=2)+';\nexport const WORLD_ASSET_NAMES:Record<string,string> = '+json.dumps(names,ensure_ascii=False,indent=2)+';\n')
manifest=json.loads((OUT/'manifest.json').read_text());manifest['version']='1.4';manifest['assets'].update(visuals);(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print(len(visuals),'new IDs;',len(set(visuals.values())),'new files')
