const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

global.window = global;
global.document = {};
vm.runInThisContext(fs.readFileSync('web/table-scene.js', 'utf8'), {filename:'web/table-scene.js'});
const order = vm.runInThisContext('MahjongScene.meldOrder');

// South (seat 1) calls a 4 from the previous seat to complete 3-4-5.
const chi = order(1, {type:'CHI', tiles:[5,3,4], source:0});
assert.deepEqual(chi.map(x=>x.type), [3,4,5]);
assert.equal(chi[1].sideways, true, 'called tile remains in the middle sequence slot');
assert.equal(chi[1].sourceRelative, 3);
assert.equal(chi[0].sideways, false);

// PENG/MING_GANG still place the sideways tile at the edge indicated by source.
const pengLeft = order(1, {type:'PENG', tiles:[7,7,7], source:0});
assert.equal(pengLeft[0].sideways, true);
const pengAcross = order(1, {type:'PENG', tiles:[7,7,7], source:3});
assert.equal(pengAcross[1].sideways, true);
const pengRight = order(1, {type:'PENG', tiles:[7,7,7], source:2});
assert.equal(pengRight[2].sideways, true);

// Bu-gang keeps the source marker and stacks its fourth tile over the called tile.
const buGang = order(1, {type:'BU_GANG', tiles:[9,9,9,9], source:2});
assert.equal(buGang[2].sideways, true);
assert.equal(buGang[3].sideways, true);
assert.equal(buGang[3].stacked, true);
assert.equal(buGang[3].sourceRelative, 1);

console.log('v0.9.2 meld logic: CHI sequence order, source positions and bu-gang stacking passed.');
