/* Author the two immutable, vector-accurate felt/shadow resources. No dependencies. */
const fs=require('node:fs'),path=require('node:path');
const M=require('../web/cuboid-scene.js');
for(const [name,overhead] of [['oblique',false],['overhead',true]]){
 const target=path.join(__dirname,'../web/assets/table',`felt-${name}.svg`);
 fs.writeFileSync(target,M.feltSVG(overhead)+'\n');
 console.log(name,fs.statSync(target).size,'bytes');
}
