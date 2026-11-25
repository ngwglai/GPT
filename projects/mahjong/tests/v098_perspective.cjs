const assert=require('node:assert/strict');
const M=require('../web/cuboid-scene.js'),c=M.config,F=M.frame(),O=M.frame(true);
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const span=(pts,i)=>Math.max(...pts.map(p=>p[i]))-Math.min(...pts.map(p=>p[i]));
assert.equal(c.ANGLE,45);assert.equal(c.HAND_ANGLE,30);
const T=c.TABLE_HALF;
const width=y=>F.screen([T,y,0])[0]-F.screen([-T,y,0])[0];
close(width(-T)/width(T),1.4);
const t={x:0,y:-c.HAND_DISTANCE,k:0,stand:true,hand:true,type:4};
const local=M.tileFaces(t,F);assert.deepEqual(local.faces.map(f=>f.name).sort(),['front','top']);assert(local.faces.every(f=>f.layer===1));
close(span(local.vertices,1)/span(local.vertices,0),c.H*Math.cos(Math.PI/6)+c.D*Math.sin(Math.PI/6));
const front=local.faces.find(f=>f.name==='front'),top=local.faces.find(f=>f.name==='top'),r=c.ROUND_RADIUS;
close(span(front.points,1)/F.handUnit,(c.H-2*r)*Math.cos(Math.PI/6));
close(span(top.points,1)/F.handUnit,(c.D-2*r)*Math.sin(Math.PI/6));
const y=c.HAND_DISTANCE+c.D/2,z=c.H/2;
close(span(local.vertices,0)/(F.screen([.5,y,z])[0]-F.screen([-.5,y,z])[0]),2);
// A complete rounded cuboid includes all 6 planar faces, 12 cylindrical edges,
// and 8 spherical corner regions; each sampled vertex lies on the rounded surface.
for(const dims of [[c.W,c.D,c.H],[c.W,c.H,c.D]]){
 const m=M.roundedMesh(...dims);assert.equal(m.radius,r);
 for(const [kind,count] of [['flat',6],['edge',12],['corner',8]])assert.equal(new Set(m.patches.filter(p=>p.kind===kind).map(p=>p.region)).size,count);
 for(const p of m.patches)for(const v of p.points){close(Math.hypot(...v.map((x,i)=>Math.max(0,Math.abs(x)-m.inner[i]))),r);assert(v.every((x,i)=>Math.abs(x)<=m.half[i]+1e-9));}
}
assert(local.silhouette.length>4);assert(local.curves.length>0);
for(const k of [1,2,3])assert.deepEqual(M.tileFaces({...t,k},F).vertices,M.tileFaces({...t,k,hand:false},F).vertices);
assert.deepEqual(M.tileFaces({...t,stand:false},F).vertices,M.tileFaces({...t,stand:false,hand:false},F).vertices);
assert.deepEqual(M.tileFaces(t,O).vertices,M.tileFaces({...t,hand:false},O).vertices);
const players=Object.fromEntries([0,1,2,3].map(i=>[i,{concealed_count:13,melds:[],shelf_tiles:[],picked_orphans:[]} ]));
const layout={south:0,west:1,north:2,east:3};
for(const [count,groups,picked] of [[14,[],[]],[11,[3],[]],[8,[3,3],[]],[5,[3,4],[]],[2,[4,4,4,4],[]],[1,[],Array(13).fill(1)]]){
 players[0]={...players[0],concealed_tiles:Array.from({length:count},(_,id)=>({id,type:id%34})),last_drawn_tile:count-1,melds:groups.map(n=>({type:n===4?'MING_GANG':'PENG',tiles:Array(n).fill(1),source:1})),picked_orphans:picked};
 const model=M.layoutTiles({players,discards:[]},layout);M.prepareHandLayout(model,F);
 const hand=model.tiles.filter(t=>t.k===0&&t.hand),pub=model.tiles.filter(t=>t.k===0&&!t.hand);
 const pts=hand.flatMap(t=>M.tileFaces(t,F).vertices);
 assert(pts.every(([x,y])=>x>=0&&x<=F.width&&y>=0&&y<=F.height));
 for(const t of hand)assert.deepEqual(M.tileFaces(t,F).silhouette,M.tileFaces(model.hands[0].find(h=>h.id===t.id),F).silhouette);
 if(pub.length)assert(Math.max(...pts.map(p=>p[0]))<=Math.min(...pub.flatMap(t=>M.tileFaces(t,F).vertices).map(p=>p[0])),`public overlap: ${count}`);
}
console.log('v0.9.8: 45° camera, exact 1.4 table ratio, 30° hand, all 12 edges and 8 corners, 2x scale, matched hitboxes, independent overhead and six hand/meld layouts passed.');
