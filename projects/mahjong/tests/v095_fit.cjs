const assert=require('node:assert/strict');
const M=require('../web/cuboid-scene.js'),c=M.config;
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
for(const overhead of [false,true]){
 const F=M.frame(overhead),T=c.TABLE_HALF;
 const nearLeft=F.screen([-T,-T,0]),nearRight=F.screen([T,-T,0]);
 close(nearLeft[0],0);close(nearRight[0],F.width);close(nearLeft[1],F.height);close(nearRight[1],F.height);
 if(!overhead)close(Math.min(F.screen([0,T,0])[1],F.screen([0,c.HAND_DISTANCE+c.D/2,c.H])[1],F.screen([0,c.HAND_DISTANCE-c.D/2,c.H])[1]),0);
 else close(F.screen([0,T,0])[1],0);
 for(const [w,h] of [[1440,900],[844,390],[667,375],[1920,1080],[390,844]]){
  const v=M.viewportFit(F,w,h);assert(v.x>=-1e-8&&v.y>=-1e-8);assert(Math.abs(v.x)<1e-8||Math.abs(v.y)<1e-8);
  close(v.x*2+F.width*v.scale,w);close(v.y*2+F.height*v.scale,h);
 }
}
console.log('v0.9.5: fixed theoretical bounds, near-edge width, maximum proportional fit and centering passed (five screen sizes, two views).');
