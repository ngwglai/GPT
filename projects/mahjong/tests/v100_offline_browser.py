import base64,json,re,copy,os,sys
from pathlib import Path
PROJECT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(PROJECT))
os.chdir(PROJECT)
OUT=PROJECT/"validation"/"v0.10.0"
OUT.mkdir(parents=True,exist_ok=True)
from pathlib import Path
from playwright.sync_api import sync_playwright
from web_server import LocalTable
from mahjong import Seat
root=Path('web');l=LocalTable(seed=42);s0=l.snapshot();s1=l.act(seat=Seat(s0['dealer']),payload={'round_id':s0['round_id'],'revision':s0['revision'],'type':'ROLL_DICE','tile_ids':[]});lanview=copy.deepcopy(l.engine.player_view(Seat(2)));lanview['match']=copy.deepcopy(s1['match']);lanview['legal_actions']={'2':lanview['legal_actions']};seat=s1['current_player'];action=next(a for a in s1['legal_actions'][str(seat)] if a['type']=='DISCARD');s2=l.act(seat=Seat(seat),payload={'round_id':s1['round_id'],'revision':s1['revision'],'type':'DISCARD','tile_ids':action['tile_ids']})
assets={str(i):'data:image/svg+xml;base64,'+base64.b64encode((root/'assets/tiles'/f'{i}.svg').read_bytes()).decode() for i in range(34)}
manifest={'tiles':assets}
html=(root/'local.html').read_text();html=re.sub(r'<link rel="stylesheet" href="/([^"]+)">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',html)
# Offline fixture: execute original app and actual server-generated snapshots without network.
mock='''<script>window._states=%s;window._i=0;window._requests=[];window.fetch=async (url,opts)=>{if(url.includes('manifest'))return {ok:true,json:async()=>(%s)};if(url.includes('sprites-v101'))return {ok:true,json:async()=>(%s)};if(url==='/api/action'){window._requests.push(JSON.parse(opts.body));window._i++;}return {ok:true,json:async()=>({ok:true,table:window._states[window._i]})}};</script>'''%(json.dumps([s0,s1,s2],ensure_ascii=False),json.dumps(manifest),(root/'assets/sprites-v101.json').read_text())
html=html.replace('<script src="/presentation.js"></script>',mock+'<script src="/presentation.js"></script>')
for path in ['ui-v09/sakura-room.webp']+[f'ui-v09/seat-{i}.webp' for i in range(4)]:
 data='data:image/webp;base64,'+base64.b64encode((root/'assets'/path).read_bytes()).decode();html=html.replace('/assets/'+path,data)
html=re.sub(r'<script src="/([^"]+)"></script>',lambda m:'<script>'+ (root/m[1]).read_text().replace('</script>','<\\/script>')+'</script>',html)
with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or None,headless=True,args=['--no-sandbox']);page=b.new_page(viewport={'width':1440,'height':900});errs=[];page.on('pageerror',lambda e:errs.append(str(e)));page.set_content(html,wait_until='domcontentloaded');page.wait_for_selector('.cuboid-sprite',timeout=5000);assert page.locator('.cuboid-sprite').count()==136;assert page.evaluate('MahjongCuboid.diagnostics().hits')>=130;assert page.locator('.cuboid-rounded-body').count()==0;print('initial',page.evaluate('MahjongCuboid.diagnostics()'),page.locator('.dock-seat .decision-row').inner_text());page.screenshot(path=str(OUT/"mj100_before_roll.png"))
 page.locator('.dock-seat [data-action-key^="ROLL_DICE"]').click(timeout=4000);page.wait_for_selector('.dock-seat button[data-tile].clickable',timeout=5000);page.wait_for_timeout(1800);page.screenshot(path=str(OUT/"mj100_after_roll.png"));print('rolled',page.locator('.cuboid-sprite').count(),page.evaluate("MahjongCuboid.diagnostics()"));page.evaluate("window._wallNode=document.querySelector('.cuboid-sprite[data-cuboid-kind=wall]')")
 btn=page.locator(f'.dock-seat button[data-tile="{action["tile_ids"][0]}"]');print('button',btn.bounding_box(),btn.get_attribute('data-tile'));btn.click(timeout=4000);page.wait_for_selector('.dock-seat button.selected');page.screenshot(path=str(OUT/"mj100_selected.png"));print('selection',page.locator('.dock-seat .decision-row').inner_text())
 page.locator('.dock-seat [data-action-key^="DISCARD:"]').first.click(timeout=4000);page.wait_for_timeout(250);assert page.locator('[data-motion^="discard-"]').count()==1;assert page.evaluate('window._requests[1].tile_ids')==action['tile_ids'];assert page.evaluate("window._wallNode.isConnected");print("after discard",page.evaluate("MahjongCuboid.diagnostics()"));print('discard',page.locator('[data-motion^="discard-"]').count(),page.evaluate('window._requests'));page.screenshot(path=str(OUT/"mj100_discard.png"))
 page.locator('[data-view-toggle]').click(timeout=4000);page.wait_for_timeout(150);page.screenshot(path=str(OUT/"mj100_overhead.png"));print('overhead',page.locator('.overhead-view').count());page.locator('[data-view-toggle]').click(timeout=4000)
 page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(200);page.screenshot(path=str(OUT/"mj100_phone.png"));print('phone',page.locator('.table-shell').bounding_box());
 for width,height in [(844,390),(667,375),(1280,720),(1440,900),(390,844)]:
  page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(120)
  bb=page.locator('.table-shell').bounding_box();assert abs(bb['x']+bb['width']/2-width/2)<1.5,bb;assert abs(bb['y']+bb['height']/2-height/2)<1.5,bb
  assert bb['width']<=width+1 and bb['height']<=height+1,bb
  assert min(abs(bb['width']-width),abs(bb['height']-height))<1.5,bb
  assert abs(bb['width']/bb['height']-page.evaluate('MahjongCuboid.frame(false).width/MahjongCuboid.frame(false).height'))<.001,bb
  gold=page.locator('.cuboid-gold').bounding_box();assert gold['x']>=bb['x'] and gold['y']>=bb['y'] and gold['x']+gold['width']<=bb['x']+bb['width'] and gold['y']+gold['height']<=bb['y']+bb['height'],gold
  print('maximum fit',width,height,bb)
 print('errors',errs);assert not errs
 # LAN offline: actual engine-sanitized viewer state; execute shared client renderer.
 lan= (root/'lan.html').read_text();lan=re.sub(r'<link rel="stylesheet" href="/([^"]+)">',lambda m:'<style>'+ (root/m[1]).read_text()+'</style>',lan)
 lan=lan.replace('<script src="/lan.js"></script>','')
 lan=lan.replace('<script src="/presentation.js"></script>',mock+'<script src="/presentation.js"></script>')
 for path in ['ui-v09/sakura-room.webp']+[f'ui-v09/seat-{i}.webp' for i in range(4)]:
  data='data:image/webp;base64,'+base64.b64encode((root/'assets'/path).read_bytes()).decode();lan=lan.replace('/assets/'+path,data)
 lan=re.sub(r'<script src="/([^"]+)"></script>',lambda m:'<script>'+ (root/m[1]).read_text().replace('</script>','<\\/script>')+'</script>',lan)
 lp=b.new_page(viewport={'width':1440,'height':900});le=[];lp.on('pageerror',lambda e:le.append(str(e)));lp.set_content(lan,wait_until='domcontentloaded')
 lp.evaluate('async view=>{window.LanGame={decorate(){}};await MahjongPresentation.init();await MahjongCuboid.preload();document.querySelector("#joinPanel").classList.add("hidden");document.querySelector("#gameTable").classList.remove("hidden");MahjongView.setViewerSeat(2);acceptTable(view,{initial:true});}',json.loads(json.dumps(lanview)))
 lp.wait_for_selector('.cuboid-sprite');lp.wait_for_timeout(150);lb=lp.locator('#gameTable').bounding_box();assert abs(lb['x']+lb['width']/2-720)<2,lb
 assert lp.locator('#seat-2').get_attribute('class').find('south')>=0
 assert lp.locator('.player:not(#seat-2) button[data-tile]').count()==0
 assert not le,le
 lp.screenshot(path=str(OUT/"mj100_lan_fixture.png"));print('LAN sanitized fixture',lb,'errors',le)
 # Visual stress case: deliberate synthetic full rivers and exposed tiles, not a legal match.
 page.set_viewport_size({'width':1440,'height':900});page.evaluate('''()=>{let t=JSON.parse(JSON.stringify(window._states[1]));t.discards=Array.from({length:84},(_,i)=>({seat:i%4,type:i%34,claimed:false}));t.presentation_events=[];t.players[0].concealed_tiles=t.players[0].concealed_tiles.slice(0,5);t.players[0].melds=[{type:'PENG',tiles:[3,3,3],source:1},{type:'AN_GANG',tiles:[10,10,10,10],count:4}];t.players[0].shelf_tiles=[t.gold_tile_type];t.players[0].ting_tile={hidden:true};acceptTable(t,{initial:true})}''');page.wait_for_timeout(100);page.screenshot(path=str(OUT/"mj100_stress.png"));print('stress tiles',page.locator('.cuboid-sprite').count());
 mobile=b.new_page(viewport={'width':844,'height':390},device_scale_factor=3,is_mobile=True,has_touch=True);me=[];mobile.on('pageerror',lambda e:me.append(str(e)));mobile.set_content(html,wait_until='domcontentloaded');mobile.wait_for_selector('.cuboid-sprite');assert mobile.evaluate('matchMedia("(pointer: coarse)").matches');mobile.locator('.dock-seat [data-action-key^="ROLL_DICE"]').click();mobile.wait_for_selector('.dock-seat button[data-tile].clickable');mobile.wait_for_timeout(300);mobile.screenshot(path=str(OUT/'mj100_mobile_touch.png'));print('mobile diagnostics',mobile.evaluate('MahjongCuboid.diagnostics()'));assert not me,me
 # Stress repeated changes, retain nodes and cap cache. Simulate a hidden tab then restore it.
 page.evaluate("window._stage=document.querySelector('.cuboid-scene');window._stable=document.querySelector('.cuboid-sprite[data-cuboid-kind=wall]')")
 page.evaluate("""()=>{for(let i=0;i<8;i++){let t=JSON.parse(JSON.stringify(window._states[1]));t.discards=Array.from({length:32+i},(_,j)=>({seat:j%4,type:(j+i)%34,claimed:false}));t.presentation_events=[];acceptTable(t,{initial:true});}}""")
 assert page.evaluate("window._stage.isConnected && window._stable.isConnected")
 assert page.evaluate('MahjongCuboid.diagnostics().cacheBytes')<=4*1024*1024
 page.evaluate("""()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});window._prior=MahjongCuboid.diagnostics();acceptTable(window._states[0],{initial:true});}""")
 assert page.evaluate('MahjongCuboid.diagnostics().created===window._prior.created')
 page.evaluate("""()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));}""")
 page.wait_for_timeout(400);assert page.locator('.cuboid-sprite').count()==136;assert not errs,errs
 print('repeat and hidden recovery',page.evaluate('MahjongCuboid.diagnostics()'))
 b.close()
