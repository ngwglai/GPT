"""Lossless atlas slicing, size normalization and seamless reflected ground tile.
Requires Pillow. Source images are original built-in image_gen outputs, not drawn placeholders.
"""
from pathlib import Path
from PIL import Image, ImageOps, ImageEnhance
import json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets'
visuals = {}
def source(name): return Image.open(ROOT / 'art-source' / (name + '.webp')).convert('RGBA')
def save(im, path, size=256, square=True):
    if square:
        box = im.getchannel('A').point(lambda n: 255 if n > 24 else 0).getbbox()
        if box: im = im.crop(box)
        im.thumbnail((int(size*.9), int(size*.9)))
        canvas = Image.new('RGBA', (size,size)); canvas.alpha_composite(im, ((size-im.width)//2,(size-im.height)//2)); im=canvas
    else: im.thumbnail((size,size))
    target=OUT/(path+'.webp'); target.parent.mkdir(parents=True,exist_ok=True); im.save(target,quality=90)
def asset(id, im, path, size=256, square=True):
    save(im,path,size,square);visuals[id]=path+'.webp'
s=source('sample')
asset('portrait.ranger',s.crop((0,0,625,670)),'characters/ranger-full',768,False)
asset('player.ranger',s.crop((645,0,1254,655)),'characters/ranger-battle',128)
asset('avatar.ranger',s.crop((160,10,460,280)),'characters/ranger-avatar',256)
asset('enemy.crawler',s.crop((0,755,610,1254)),'enemies/crawler',128)
for char,src,w,split in [('knight','swordswoman',1295,682),('mage','witch',1261,655)]:
    s=source(src)
    asset('portrait.'+char,s.crop((0,0,625,split)),'characters/'+char+'-full',768,False)
    asset('player.'+char,s.crop((630,0,w,split)),'characters/'+char+'-battle',128)
    asset('avatar.'+char,s.crop((0,split, min(650,w//2),s.height)),'characters/'+char+'-avatar',256)
s=source('monsters'); xs=[0,420,840,1254];ys=[0,390,775,1254]
for n,id in enumerate(['runner','archer','seer','shaman','guard','bomber','warden','witch','titan']):
    x=n%3;y=n//3;asset('enemy.'+id,s.crop((xs[x],ys[y],xs[x+1],ys[y+1])),'enemies/'+id,256 if id in ['warden','witch','titan'] else 128)
s=source('icons')
ids=['weapon.bow','weapon.blade','weapon.ember','weapon.orbit','weapon.drone','skill.fire','skill.ice','skill.lance','skill.ward','skill.bloom','skill.storm','card.shuffle','card.treasure','card.negative','card.lucky','ui.gem']
for n,id in enumerate(ids):
    x=n%4;y=n//4;asset(id,s.crop((x*384,y*256,(x+1)*384,(y+1)*256)),('cards/' if id.startswith('card') else 'weapons/' if id.startswith('weapon') else 'effects/' if id.startswith('skill') else 'ui/')+id.split('.')[1],128)
s=source('decor'); w,h=s.size
for n,id in enumerate(['map.rock','map.flower','map.tree','map.obelisk','projectile.bow','projectile.ember','projectile.drone','projectile.enemy']):
    x=n%4;y=n//4;asset(id,s.crop((x*w//4,y*h//2,(x+1)*w//4,(y+1)*h//2)),('maps/' if n<4 else 'effects/')+id.split('.')[1],128)
s=source('familiars');w,h=s.size
for n,id in enumerate(['weapon.orbit','weapon.drone','effect.bloom','effect.ward']):
    x=n%2;y=n//2;asset(id,s.crop((x*w//2,y*h//2,(x+1)*w//2,(y+1)*h//2)),('weapons/' if n<2 else 'effects/')+id.split('.')[1],128)
for id,target in [('projectile.lance','projectile.enemy'),('projectile.blade','projectile.bow'),('projectile.orbit','projectile.enemy'),('card.common','card.lucky'),('card.rare','skill.ice'),('card.epic','skill.storm'),('card.mechanism','skill.lance')]:visuals[id]=visuals[target]
s=source('sample').crop((650,685,1240,1240)).resize((256,256)).convert('RGB')
s=ImageEnhance.Contrast(s).enhance(.48);s=Image.blend(s,Image.new('RGB',s.size,'#d5e6c9'),.36)
tile=Image.new('RGB',(512,512));tile.paste(s,(0,0));tile.paste(ImageOps.mirror(s),(256,0));tile.paste(ImageOps.flip(s),(0,256));tile.paste(ImageOps.flip(ImageOps.mirror(s)),(256,256));tile.save(OUT/'maps/grass.webp',quality=92);visuals['map.ground']='maps/grass.webp'
s=source('world');save(s,'ui/world',1672,False);visuals['ui.world']='ui/world.webp'
(ROOT/'src/data/visuals.ts').write_text('/** Original generated art, independent of all collision and rule data. */\nexport const VISUALS: Record<string, string> = '+json.dumps(visuals,ensure_ascii=False,indent=2)+';\nexport const artUrl = (id: string) => VISUALS[id] ? `${import.meta.env.BASE_URL}assets/${VISUALS[id]}` : undefined;\nexport function cardArt(u: {id:string;polarity:string;rarity:number;weapon?:string;maxStacks:number|null}) { return u.id === "shuffle" ? "card.shuffle" : u.polarity === "negative" ? "card.negative" : u.id.startsWith("chest_") ? "card.treasure" : u.weapon ? "weapon."+u.weapon : u.id === "reroll" ? "card.lucky" : u.maxStacks !== null ? "card.mechanism" : "card."+(["common","rare","epic","epic"][u.rarity] || "common"); }\n')
(OUT/'manifest.json').write_text(json.dumps({'version':'1.3','generator':'OpenAI built-in image_gen','assets':visuals},ensure_ascii=False,indent=2)+'\n')
print(len(visuals),'IDs',len(set(visuals.values())),'unique files')
