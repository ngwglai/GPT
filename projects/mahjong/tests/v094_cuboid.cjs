const assert=require('node:assert/strict');
const M=require('../web/cuboid-scene.js');
const f=M.frame(false), c=M.config;
assert.equal(c.ANGLE,45);assert.equal(c.HAND_ANGLE,30);assert(c.DISTANCE>c.TABLE_HALF);assert.equal(c.D,.45);
const near=f.cam.project([1,-10,0]),far=f.cam.project([1,10,0]);assert(near[0]>far[0]);
const pts=[[12,17],[83,19],[75,79],[9,70]],m=M.homography(pts);
for(const [i,[x,y]] of [[0,0],[100,0],[100,100],[0,100]].entries()){
 const q=1+m[3]*x+m[7]*y;
 assert(Math.abs((m[0]*x+m[4]*y+m[12])/q-pts[i][0])<1e-8);
 assert(Math.abs((m[1]*x+m[5]*y+m[13])/q-pts[i][1])<1e-8);
}
for(let k=0;k<4;k++)for(const stand of [false,true]){
 const result=M.tileFaces({x:1,y:-5,k,stand,type:4},f);
 assert.equal(result.vertices.length,8);assert(result.faces.length>=2);
 for(const face of result.faces)assert(face.points.flat().every(Number.isFinite));
 const hidden=M.tileFaces({x:1,y:-5,k,stand,back:true,type:4},f);assert(hidden.faces.every(v=>v.art===null));
}
for(let k=1;k<4;k++){const t=M.tileFaces({x:1,y:-5,k,stand:true,hand:true,type:25},f);assert(t.faces.every(v=>v.art===null),'standing opponent front must remain invisible');}
const layout={south:0,east:1,north:2,west:3};
const players=Object.fromEntries([0,1,2,3].map(i=>[i,{concealed_count:13,melds:[],shelf_tiles:[],picked_orphans:[]} ]));
const stacks=Array.from({length:17},(_,column)=>({column,top:{present:true},bottom:{present:true}}));
const table={players,wall_view:{sides:Object.fromEntries([0,1,2,3].map(i=>[i,stacks]))},discards:[],gold_tile_type:4};
let model=M.layoutTiles(table,layout);assert.equal(model.tiles.length,136+52);assert(model.tiles.filter(t=>t.hand).every(t=>t.back&&t.type==null));
// Overlapping physical rectangles are prohibited for different tiles at the same height.
function box(t){const d=t.stand?c.D:c.H;const [x,y]=M.rotate([t.x,t.y],t.k);const hw=(t.k%2?d:c.W)/2,hh=(t.k%2?c.W:d)/2;return [x-hw,y-hh,x+hw,y+hh];}
function check(tiles){for(let i=0;i<tiles.length;i++){const a=tiles[i],A=box(a);assert(A[0]>=-c.TABLE_HALF-1e-8&&A[1]>=-c.TABLE_HALF-1e-8&&A[2]<=c.TABLE_HALF+1e-8&&A[3]<=c.TABLE_HALF+1e-8);for(let j=0;j<i;j++){const b=tiles[j],B=box(b);if((a.z||0)!==(b.z||0))continue;assert(Math.min(A[2],B[2])-Math.max(A[0],B[0])<1e-8||Math.min(A[3],B[3])-Math.max(A[1],B[1])<1e-8,`${a.key} overlaps ${b.key}`);}}}
check(model.tiles);
for(let i=0;i<44;i++)for(let seat=0;seat<4;seat++)table.discards.push({seat,type:i%34,claimed:false});
model=M.layoutTiles(table,layout);check(model.tiles);assert.equal(Object.keys(model.overflow).length,0);
table.discards.push({seat:0,type:7});assert.equal(M.layoutTiles(table,layout).overflow[0],1);
table.discards=[{seat:0,type:5},{seat:0,type:6,claimed:true},{seat:0,type:8}];players[0].shelf_tiles=[4];players[0].ting_tile={hidden:true};table.presentation_events=[{player:0,type:'TILE_DISCARDED'},{player:0,type:'GOLD_SHELVED'},{player:0,type:'TILE_DISCARDED'},{player:0,type:'TING_DECLARED'},{player:0,type:'TILE_DISCARDED'}];
assert.deepEqual(M.riverTiles(table,0).map(t=>t.key),['discard-0','shelf-0-0','ting-0-0','discard-2']);assert.equal(M.riverTiles(table,0)[2].type,null);assert.equal(M.riverTiles(table,0)[2].back,true);players[0].ting_tile={hidden:false,type:9};assert.equal(M.riverTiles(table,0)[2].type,9);assert.equal(M.riverTiles(table,0)[2].back,false);
players[0].concealed_count=2;players[0].melds=Array.from({length:4},()=>({type:'MING_GANG',tiles:[1,1,1,1],source:1}));model=M.layoutTiles(table,layout);check(model.tiles);assert.equal(model.tiles.filter(t=>t.key.startsWith('meld-0')).length,16);
for(let owner=0;owner<4;owner++){
 for(const [offset,index] of [[1,2],[2,1],[3,0]]){
  const source=(owner+offset)%4;
  for(const [type,count] of [['PENG',3],['MING_GANG',4],['BU_GANG',4]]){
   const row=M.orderMeld(owner,{type,tiles:Array(count).fill(6),source});
   assert.equal(row.findIndex(t=>t.sourceRelative===offset),offset===1&&type==='MING_GANG'?3:index);
   assert.equal(row.length,count);
  }
 }
 const chi=M.orderMeld(owner,{type:'CHI',tiles:[5,7,6],source:(owner+3)%4});
 assert.deepEqual(chi.map(t=>t.type),[5,6,7]);
 assert.equal(chi[1].sourceRelative,3);
}
assert(M.orderMeld(0,{type:'BU_GANG',tiles:[1,1,1,1],source:2}).every(t=>!t.sideways));
console.log('v0.9.4: camera, exact face corner homography, eight views, hidden tiles, wall/hand/river collision checks (44 per river), special river order, four kongs passed.');
