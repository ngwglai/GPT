/* Qingque Mahjong v0.9.3 — pure 2D planar projective projection.
 * A single homography maps the square tabletop to a viewing trapezoid.
 * All board objects remain ordinary 2D DOM elements on z=0; there is no
 * 3D scene, depth buffer, perspective camera, or per-seat CSS approximation.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MahjongProjection = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';

  const IDENTITY = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';

  function profileForViewport(viewport = {}) {
    const width = Number(viewport.width) || 1280;
    const height = Number(viewport.height) || 800;
    const portrait = height > width;
    const compactLandscape = !portrait && height <= 560;
    if (compactLandscape) {
      return { topHalf: 0.385, bottomHalf: 0.493, topY: 0.22, bottomY: 0.78, name: 'landscape-compact' };
    }
    if (portrait) {
      return { topHalf: 0.405, bottomHalf: 0.49, topY: 0.17, bottomY: 0.83, name: 'portrait' };
    }
    return { topHalf: 0.36, bottomHalf: 0.495, topY: 0.22, bottomY: 0.78, name: 'desktop' };
  }

  // Homography from the unit square to a symmetric trapezoid. The same map is
  // used for every tile, wall, river, meld, hand, and center-table object.
  function coefficients(profile) {
    const { topHalf: t, bottomHalf: b, topY: y0, bottomY: y1 } = profile;
    const bottomScale = t / b;
    const denominatorY = bottomScale - 1;
    const xScale = 2 * t;
    const xShear = (0.5 - b) * bottomScale - (0.5 - t);
    const xOffset = 0.5 - t;
    const yScale = y1 * bottomScale - y0;
    const yOffset = y0;
    return { xScale, xShear, xOffset, yScale, yOffset, denominatorY };
  }

  function projectPoint(x, y, width, height, profile) {
    const c = coefficients(profile || profileForViewport());
    const u = x / width;
    const v = y / height;
    const denominator = 1 + c.denominatorY * v;
    return {
      x: width * (c.xScale * u + c.xShear * v + c.xOffset) / denominator,
      y: height * (c.yScale * v + c.yOffset) / denominator,
    };
  }

  function matrix3d(width, height, profile) {
    if (!(width > 0 && height > 0)) return IDENTITY;
    const c = coefficients(profile || profileForViewport());
    // CSS matrix3d is only the serialization carrier for a planar homography.
    // Its z terms are identity/zero; all input points have z=0.
    const values = [
      c.xScale, 0, 0, 0,
      c.xShear * width / height, c.yScale, 0, c.denominatorY / height,
      0, 0, 1, 0,
      c.xOffset * width, c.yOffset * height, 0, 1,
    ];
    return `matrix3d(${values.map(v => Number(v.toFixed(9))).join(',')})`;
  }

  function apply(board, shell, viewport) {
    if (!board) return IDENTITY;
    const width = board.offsetWidth || board.clientWidth || 0;
    const height = board.offsetHeight || board.clientHeight || 0;
    if (shell?.classList?.contains('overhead-view')) {
      board.style.transform = IDENTITY;
      board.dataset.projection = 'overhead';
      return IDENTITY;
    }
    const view = viewport || {
      width: root?.innerWidth || width,
      height: root?.innerHeight || height,
    };
    const profile = profileForViewport(view);
    const value = matrix3d(width, height, profile);
    board.style.transform = value;
    board.dataset.projection = profile.name;
    return value;
  }

  return { IDENTITY, profileForViewport, coefficients, projectPoint, matrix3d, apply };
});
