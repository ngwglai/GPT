const assert = require('node:assert/strict');
const Projection = require('../web/perspective.js');

for (const viewport of [
  {width: 1440, height: 900},
  {width: 844, height: 390},
  {width: 390, height: 844},
]) {
  const profile = Projection.profileForViewport(viewport);
  const width = 1000, height = 1000;
  const corners = [
    Projection.projectPoint(0, 0, width, height, profile),
    Projection.projectPoint(width, 0, width, height, profile),
    Projection.projectPoint(width, height, width, height, profile),
    Projection.projectPoint(0, height, width, height, profile),
  ];
  assert(corners[0].x < corners[1].x, 'top edge should read left-to-right');
  assert(corners[3].x < corners[2].x, 'bottom edge should read left-to-right');
  assert(corners[1].x - corners[0].x < corners[2].x - corners[3].x,
    'near edge must be wider than far edge');
  assert(corners[0].y < corners[3].y, 'far edge must remain above near edge');
  const expectedDepth = viewport.height > viewport.width ? 0.66 : 0.56;
  assert(Math.abs((profile.bottomY - profile.topY) - expectedDepth) < 1e-9,
    'projected table depth must match the responsive layout stage');
  for (const point of corners) {
    assert(Number.isFinite(point.x) && Number.isFinite(point.y));
    assert(point.x >= 0 && point.x <= width && point.y >= 0 && point.y <= height);
  }
  const matrix = Projection.matrix3d(width, height, profile);
  assert.match(matrix, /^matrix3d\(/);
  assert.equal(matrix.split(',').length, 16);
}

const desktop = Projection.profileForViewport({width:1440,height:900});
const center = Projection.projectPoint(500,500,1000,1000,desktop);
assert(Math.abs(center.x-500)<1e-6, 'center must stay horizontally centered');
assert(center.y < 500, 'perspective center shifts toward far edge from near-seat camera');
console.log('v0.9.3 planar homography: desktop, landscape and portrait corner mappings passed.');
