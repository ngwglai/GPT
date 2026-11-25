/* Independent 3D plane samples bound affine texture error at 2x raster size. */
const assert=require('node:assert/strict');
const M=require('../web/cuboid-scene.js'),c=M.config;
const counts={};let maximum=0;
for(const overhead of [false,true])for(const stand of [false,true])for(let k=0;k<4;k++)for(const x of [-8,0,8])for(const y of [-11.7,-5,5]){
 const F=M.frame(overhead),local=!overhead&&stand&&k===0;
 const t={k,x,y,stand,hand:local,type:1};
 const h=stand?c.D:c.H,d=stand?c.H:c.D;
 const patch=M.roundedMesh(c.W,h,d).patches.find(p=>p.name===(stand?'front':'top'));
 const world=patch.points.map(p=>M.rotate([p[0]+x,p[1]+y,p[2]+d/2],k));
 const screen=local?F.handScreen:F.screen,points=world.map(screen);
 const grid=M.textureGrid(points,2);counts[grid.n]=(counts[grid.n]||0)+1;
 const mix=(a,b,t)=>a.map((v,i)=>v*(1-t)+b[i]*t);
 const exact=([u,v])=>screen(mix(mix(world[0],world[1],u),mix(world[3],world[2],u),v));
 const n=grid.n||1;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){
  const a=[i/n,j/n],b=[(i+1)/n,j/n],cc=[(i+1)/n,(j+1)/n],dd=[i/n,(j+1)/n];
  for(const tri of [[a,b,cc],[a,cc,dd]])for(let w1=0;w1<=10;w1++)for(let w2=0;w2<=10-w1;w2++){
   const weights=[w1/10,w2/10,1-(w1+w2)/10];
   const weighted=v=>v[0].map((_,axis)=>v.reduce((s,p,k)=>s+p[axis]*weights[k],0));
   const actual=exact(weighted(tri)),flat=weighted(tri.map(exact));
   const error=2*Math.hypot(actual[0]-flat[0],actual[1]-flat[1]);maximum=Math.max(maximum,error);
   assert(error<=.25,JSON.stringify({overhead,stand,k,x,y,n,error}));
  }
 }
}
assert(counts[0]>0 && counts[2]>0);
console.log('Texture projection: 144 plane poses, dense independent 3D samples, maximum raster-pixel error',maximum,'grids',counts);
