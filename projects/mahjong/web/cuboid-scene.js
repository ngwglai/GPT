/* v0.9.8: perspective table, 30-degree hand HUD and rounded solid tiles, individual 3D vertices projected to ordinary 2D DOM.
 * No WebGL or CSS perspective camera. A face homography maps its texture to
 * the four projected corners. Existing hand buttons and action handlers stay live. */
(function (root) {
  "use strict";
  const config = Object.freeze({
    ANGLE: 45,
    HAND_ANGLE: 30,
    DISTANCE: 75 * Math.SQRT1_2,
    FOCAL_LENGTH: 25,
    HAND_SCALE: 2,
    ROUND_RADIUS: 0.085,
    ROUND_STEPS: 5,
    W: 1,
    H: 1.36,
    D: 0.45,
    TABLE_HALF: 12.5,
    CENTER_HALF: 3,
    RIVER_DISTANCE: 3.7,
    RIVER_OFFSET: -2.5,
    RIVER_COL_PITCH: 1.02,
    RIVER_ROW_PITCH: 1.38,
    WALL_DISTANCE: 9.2,
    WALL_OFFSET: 0.7,
    WALL_PITCH: 1.02,
    HAND_DISTANCE: 11.7,
    HAND_PITCH: 1.02,
  });
  const rotations = { south: 0, east: 1, north: 2, west: 3 };
  const rotate = ([x, y, z = 0], k) =>
    [
      [x, y, z],
      [-y, x, z],
      [-x, -y, z],
      [y, -x, z],
    ][k % 4];
  function camera(overhead = false, angle = config.ANGLE) {
    const a = ((overhead ? 90 : angle) * Math.PI) / 180,
      L = config.DISTANCE,
      f = config.FOCAL_LENGTH;
    const c = Math.cos(a),
      s = Math.sin(a);
    return {
      eye: [0, -L * c, L * s],
      depth: ([x, y, z]) => L + y * c - z * s,
      project: ([x, y, z = 0]) => {
        const q = L + y * c - z * s;
        if (q <= 0) throw Error("Point behind camera");
        return [(f * x) / q, (-f * (y * s + z * c)) / q];
      },
    };
  }
  // The four vertices are texture TL,TR,BR,BL, not just an axis-aligned box.
  function homography([a, b, c, d]) {
    const [x0, y0] = a,
      [x1, y1] = b,
      [x2, y2] = c,
      [x3, y3] = d;
    const dx1 = x1 - x2,
      dx2 = x3 - x2,
      dx3 = x0 - x1 + x2 - x3;
    const dy1 = y1 - y2,
      dy2 = y3 - y2,
      dy3 = y0 - y1 + y2 - y3;
    const den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-10) return null;
    const g = (dx3 * dy2 - dx2 * dy3) / den,
      h = (dx1 * dy3 - dx3 * dy1) / den;
    const A = x1 - x0 + g * x1,
      B = x3 - x0 + h * x3,
      D = y1 - y0 + g * y1,
      E = y3 - y0 + h * y3;
    return [
      A / 100,
      D / 100,
      0,
      g / 100,
      B / 100,
      E / 100,
      0,
      h / 100,
      0,
      0,
      1,
      0,
      x0,
      y0,
      0,
      1,
    ];
  }
  // Pick the smallest affine grid whose sampled projection error is below
  // one quarter of a raster pixel. Parallel projections take one exact draw.
  function textureGrid(points, scale = 2) {
    const m = homography(points);
    if (!m) return { m, n: 3, error: 0 };
    if (Math.abs(m[3]) + Math.abs(m[7]) < 1e-12) return { m, n: 0, error: 0 };
    const project = ([u, v]) => {
      const a = u * 100,
        b = v * 100,
        d = 1 + m[3] * a + m[7] * b;
      return [
        (m[0] * a + m[4] * b + m[12]) / d,
        (m[1] * a + m[5] * b + m[13]) / d,
      ];
    };
    let error = 0;
    for (let n = 1; n <= 3; n++) {
      error = 0;
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const a = [x / n, y / n],
            b = [(x + 1) / n, y / n],
            c = [(x + 1) / n, (y + 1) / n],
            d = [x / n, (y + 1) / n];
          for (const uv of [
            [a, b, c],
            [a, c, d],
          ]) {
            const p = uv.map(project);
            for (const weights of [
              [1 / 3, 1 / 3, 1 / 3],
              [0.5, 0.5, 0],
              [0, 0.5, 0.5],
              [0.5, 0, 0.5],
            ]) {
              const mix = (v) =>
                [0, 1].map((i) =>
                  v.reduce((sum, q, j) => sum + q[i] * weights[j], 0),
                );
              const exact = project(mix(uv)),
                flat = mix(p);
              error = Math.max(
                error,
                Math.hypot(exact[0] - flat[0], exact[1] - flat[1]) * scale,
              );
            }
          }
        }
      if (error <= 0.25 || n === 3) return { m, n, error };
    }
  }
  const bounds = (pts) => ({
    x: Math.min(...pts.map((p) => p[0])),
    y: Math.min(...pts.map((p) => p[1])),
    r: Math.max(...pts.map((p) => p[0])),
    b: Math.max(...pts.map((p) => p[1])),
  });
  const mean = (pts) =>
    pts[0].map((_, i) => pts.reduce((a, p) => a + p[i], 0) / pts.length);
  const rect = (x, y, w, h, z = 0) => [
    [x - w / 2, y + h / 2, z],
    [x + w / 2, y + h / 2, z],
    [x + w / 2, y - h / 2, z],
    [x - w / 2, y - h / 2, z],
  ];
  function frame(overhead = false) {
    const cam = camera(overhead),
      T = config.TABLE_HALF;
    const near = [
      [-T, -T, 0],
      [T, -T, 0],
    ].map(cam.project);
    // Fixed fit rectangle: near felt edge and theoretical north standing tile.
    const northTop = [-config.D / 2, config.D / 2].map(
      (d) => cam.project([0, config.HAND_DISTANCE + d, config.H])[1],
    );
    const b = {
      x: near[0][0],
      r: near[1][0],
      y: Math.min(cam.project([0, T, 0])[1], ...northTop),
      b: near[0][1],
    };
    const scale = (48 / config.FOCAL_LENGTH) * config.DISTANCE;
    const width = (b.r - b.x) * scale,
      height = (b.b - b.y) * scale;
    const toScreen = ([x, y]) => [(x - b.x) * scale, (y - b.y) * scale];
    const screen = (p) => toScreen(cam.project(p));
    // Independent 30-degree orthographic hand, scaled against a representative north tile.
    const unit =
      config.HAND_SCALE *
      scale *
      Math.abs(
        cam.project([
          0.5,
          config.HAND_DISTANCE + config.D / 2,
          config.H / 2,
        ])[0] -
          cam.project([
            -0.5,
            config.HAND_DISTANCE + config.D / 2,
            config.H / 2,
          ])[0],
      );
    const ha = (config.HAND_ANGLE * Math.PI) / 180,
      hs = Math.sin(ha),
      hc = Math.cos(ha);
    const handCam = overhead
      ? cam
      : {
          direction: [0, -hc, hs],
          depth: ([x, y, z]) => y * hc - z * hs,
          orthographic: true,
        };
    const handScreen = overhead
      ? screen
      : ([x, y, z = 0]) => [
          width / 2 + x * unit,
          height -
            8 -
            ((y + config.HAND_DISTANCE + config.D / 2) * hs + z * hc) * unit,
        ];
    return {
      cam,
      handCam,
      handScreen,
      overhead,
      width,
      height,
      screen,
      scale,
      bounds: b,
      handUnit: unit,
    };
  }
  function viewportFit(F, w, h) {
    const scale = Math.min(w / F.width, h / F.height);
    return {
      scale,
      x: (w - F.width * scale) / 2,
      y: (h - F.height * scale) / 2,
      width: w,
      height: h,
    };
  }
  // A Minkowski sum of an inset box and a sphere: six flat centers,
  // twelve quarter-cylinder strips and eight spherical octants. Meshes are
  // cached in tile-local coordinates; no CSS clipping simulates the geometry.
  const meshCache = new Map();
  const axis = (i, s) => [0, 1, 2].map((j) => (i === j ? s : 0));
  function roundedMesh(w, h, d, N = config.ROUND_STEPS) {
    const key = [w, h, d, N].join("/");
    if (meshCache.has(key)) return meshCache.get(key);
    const half = [w / 2, h / 2, d / 2],
      r = Math.min(config.ROUND_RADIUS, ...half.map((v) => v * 0.9)),
      inner = half.map((v) => v - r);
    const patches = [],
      steps = Array.from({ length: N + 1 }, (_, i) => (i * Math.PI) / (2 * N));
    const add = (kind, region, points, n, name) =>
      patches.push({ kind, region, points, n, name });
    const defs = [
      ["bottom", [2, 3, 1, 0], [0, 0, -1]],
      ["top", [6, 7, 5, 4], [0, 0, 1]],
      ["front", [4, 5, 1, 0], [0, -1, 0]],
      ["rear", [7, 6, 2, 3], [0, 1, 0]],
      ["left", [6, 4, 0, 2], [-1, 0, 0]],
      ["right", [5, 7, 3, 1], [1, 0, 0]],
    ];
    const corners = [];
    for (const z of [-1, 1])
      for (const y of [-1, 1]) for (const x of [-1, 1]) corners.push([x, y, z]);
    for (const [name, ids, n] of defs)
      add(
        "flat",
        name,
        ids.map((i) =>
          corners[i].map((s, j) => s * (n[j] ? half[j] : inner[j])),
        ),
        n,
        name,
      );
    for (let k = 0; k < 3; k++) {
      const i = (k + 1) % 3,
        j = (k + 2) % 3;
      for (const si of [-1, 1])
        for (const sj of [-1, 1]) {
          const point = (angle, end) => {
            const p = [0, 0, 0];
            p[k] = end * inner[k];
            p[i] = si * (inner[i] + r * Math.cos(angle));
            p[j] = sj * (inner[j] + r * Math.sin(angle));
            return p;
          };
          for (let l = 0; l < N; l++) {
            const a = steps[l],
              b = steps[l + 1],
              m = (a + b) / 2,
              n = [0, 0, 0];
            n[i] = si * Math.cos(m);
            n[j] = sj * Math.sin(m);
            add(
              "edge",
              `${k}/${si}/${sj}`,
              [point(a, -1), point(a, 1), point(b, 1), point(b, -1)],
              n,
            );
          }
        }
    }
    for (const signs of corners) {
      const normal = (a, b) => [
        signs[0] * Math.sin(a) * Math.cos(b),
        signs[1] * Math.sin(a) * Math.sin(b),
        signs[2] * Math.cos(a),
      ];
      const point = (a, b) =>
        normal(a, b).map((v, j) => signs[j] * inner[j] + r * v);
      for (let i = 0; i < N; i++)
        for (let j = 0; j < N; j++) {
          const a = steps[i],
            b = steps[i + 1],
            c = steps[j],
            e = steps[j + 1];
          const points =
            i === 0
              ? [point(a, c), point(b, c), point(b, e)]
              : [point(a, c), point(b, c), point(b, e), point(a, e)];
          add(
            "corner",
            signs.join("/"),
            points,
            normal((a + b) / 2, (c + e) / 2),
          );
        }
    }
    const mesh = { patches, radius: r, half, inner };
    meshCache.set(key, mesh);
    return mesh;
  }
  function tileFaces(t, F, verticesOnly = false) {
    const localHand = !F.overhead && t.k === 0 && t.hand && t.stand;
    const cam = localHand ? F.handCam : F.cam,
      screen = localHand
        ? (p) => {
            const [x, y] = F.handScreen(p);
            const k = t.hudScale || 1;
            return [
              F.width / 2 + (x - F.width / 2) * k + (t.hudShift || 0),
              F.height - 8 + (y - F.height + 8) * k,
            ];
          }
        : F.screen;
    const { W, H, D } = config,
      h = t.stand ? D : H,
      d = t.stand ? H : D,
      w = t.w || W;
    const world = (p) =>
      rotate([p[0] + t.x, p[1] + t.y, p[2] + (t.z || 0) + d / 2], t.k);
    const vertices = [];
    for (const z of [-d / 2, d / 2])
      for (const y of [-h / 2, h / 2])
        for (const x of [-w / 2, w / 2])
          vertices.push(screen(world([x, y, z])));
    if (verticesOnly) return { vertices };
    const mesh = roundedMesh(w, h, d, config.ROUND_STEPS),
      faces = [],
      curves = [],
      silhouette = [];
    const center = world([0, 0, 0]),
      layer = localHand ? 1 : 0;
    for (const patch of mesh.patches) {
      const pts = patch.points.map(world),
        mid = mean(pts),
        normal = rotate(patch.n, t.k);
      const dir = cam.orthographic
        ? cam.direction
        : cam.eye.map((x, i) => x - mid[i]);
      // Gather the complete projected solid for an exact convex click outline.
      const points = pts.map(screen);
      silhouette.push(...points);
      if (normal.reduce((sum, x, i) => sum + x * dir[i], 0) <= 1e-8) continue;
      const name = patch.name,
        face = t.stand ? name === "front" : name === "top";
      const back =
        (t.stand ? name === "rear" : name === "bottom") || (face && t.back);
      if (patch.kind === "flat")
        faces.push({
          name,
          points,
          depth: cam.depth(mid),
          layer,
          face,
          back,
          t,
          art: face && !t.back && t.type != null ? t.type : null,
          n: patch.n,
          normal,
        });
      else
        curves.push({ points, depth: cam.depth(mid), n: patch.n, normal, t });
    }
    return {
      faces,
      vertices,
      silhouette: hull(silhouette),
      curves,
      depth: cam.depth(center),
      layer,
      t,
    };
  }
  function riverTiles(table, seat) {
    const p = table.players[seat],
      discards = table.discards || [],
      out = [];
    let di = 0;
    const indices = discards
      .map((d, i) => ({ d, i }))
      .filter((x) => x.d.seat === seat);
    let si = 0,
      ting = false;
    const shelf = p.shelf_tiles || [];
    // Keep chronological placement where the sanitized public event stream is present.
    for (const e of table.presentation_events || []) {
      if (e.player !== seat) continue;
      if (e.type === "TILE_DISCARDED") {
        const item = indices[di++];
        if (item && !item.d.claimed)
          out.push({
            type: item.d.type,
            key: `discard-${item.i}`,
            recent:
              table.pending_claim?.kind === "DISCARD" &&
              table.pending_claim.source === seat &&
              item.i === discards.length - 1,
          });
      } else if (e.type === "GOLD_SHELVED" && si < shelf.length) {
        out.push({
          type: shelf[si],
          gold: true,
          key: `shelf-${seat}-${si++}`,
          label: "上金",
        });
      } else if (e.type === "TING_DECLARED" && p.ting_tile && !ting) {
        out.push({
          back: !!p.ting_tile.hidden,
          type: p.ting_tile.hidden ? null : p.ting_tile.type,
          key: `ting-${seat}-0`,
          label: "报听暗牌",
        });
        ting = true;
      }
    }
    for (const { d, i } of indices.slice(di))
      if (!d.claimed)
        out.push({
          type: d.type,
          key: `discard-${i}`,
          recent:
            table.pending_claim?.kind === "DISCARD" &&
            table.pending_claim.source === seat &&
            i === discards.length - 1,
        });
    for (; si < shelf.length; si++)
      out.push({
        type: shelf[si],
        gold: true,
        key: `shelf-${seat}-${si}`,
        label: "上金",
      });
    if (p.ting_tile && !ting)
      out.push({
        back: !!p.ting_tile.hidden,
        type: p.ting_tile.hidden ? null : p.ting_tile.type,
        key: `ting-${seat}-0`,
        label: "报听暗牌",
      });
    return out;
  }
  function layoutTiles(table, layout) {
    const tiles = [],
      hands = {},
      overflow = {};
    const add = (t, k, seat) =>
      tiles.push({
        ...t,
        k,
        seat,
        gold:
          t.gold ||
          (!t.back && t.type != null && t.type === table.gold_tile_type),
      });
    for (const [side, seat] of Object.entries(layout)) {
      const k = rotations[side],
        p = table.players[seat];
      if (!p) continue;
      for (const stack of table.wall_view?.sides?.[seat] || []) {
        for (const [layer, z] of [
          ["bottom", 0],
          ["top", config.D],
        ]) {
          const slot = stack[layer];
          if (!slot?.present) continue;
          add(
            {
              x: (stack.column - 8) * config.WALL_PITCH + config.WALL_OFFSET,
              y: -config.WALL_DISTANCE,
              z,
              type: slot.indicator ? table.gold_indicator?.type : null,
              back: !slot.indicator,
              key: `wall-${seat}-${stack.column}-${layer}`,
              label: slot.indicator ? "金指示牌" : "牌墙",
              cursor: slot.normal_cursor || slot.gang_cursor,
            },
            k,
            seat,
          );
        }
      }
      const river = riverTiles(table, seat),
        cols = Math.min(11, Math.max(7, Math.ceil(river.length / 3)));
      river
        .slice(0, cols * 4)
        .forEach((t, i) =>
          add(
            {
              ...t,
              x: config.RIVER_OFFSET + (i % cols) * config.RIVER_COL_PITCH,
              y:
                -config.RIVER_DISTANCE -
                Math.floor(i / cols) * config.RIVER_ROW_PITCH,
            },
            k,
            seat,
          ),
        );
      if (river.length > cols * 4) overflow[seat] = river.length - cols * 4;
      const hand = Array.isArray(p.concealed_tiles)
        ? [...p.concealed_tiles].sort((a, b) =>
            a.id === p.last_drawn_tile
              ? 1
              : b.id === p.last_drawn_tile
                ? -1
                : a.type - b.type || a.id - b.id,
          )
        : Array.from({ length: p.concealed_count || 0 }, () => ({
            type: null,
          }));
      const groups = (p.melds || []).map((m, i) =>
        orderMeld(seat, m).map((v, j) => ({
          type: v.type,
          back: v.type == null,
          source: v.sourceRelative,
          key: `meld-${seat}-${i}-${j}`,
          label: "副露",
        })),
      );
      if (p.picked_orphans?.length)
        groups.push(
          p.picked_orphans.map((type, i) => ({
            type,
            key: `orphan-${seat}-${i}`,
            label: "十三幺拾牌",
          })),
        );
      const publicCount = groups.reduce((n, g) => n + g.length, 0),
        drawGap = hand.some((t) => t.id != null && t.id === p.last_drawn_tile)
          ? 0.26
          : 0;
      const handSpan = hand.length * config.HAND_PITCH + drawGap,
        publicSpan =
          publicCount * config.HAND_PITCH +
          Math.max(0, groups.length - 1) * 0.22;
      const total =
        handSpan + publicSpan + (hand.length && publicCount ? 0.42 : 0);
      let x = -total / 2 + config.W / 2;
      hands[seat] = [];
      hand.forEach((t, i) => {
        if (t.id != null && t.id === p.last_drawn_tile) x += drawGap;
        const obj = {
          x,
          y: -config.HAND_DISTANCE,
          stand: true,
          type: t.type,
          back: t.type == null,
          key: t.id == null ? `opponent-${seat}-${i}` : `hand-${seat}-${t.id}`,
          id: t.id,
          last: i === hand.length - 1,
          hand: true,
        };
        add(obj, k, seat);
        hands[seat].push({ ...obj, k, seat });
        x += config.HAND_PITCH;
      });
      if (hand.length && publicCount) x += 0.42;
      for (const group of groups) {
        for (const t of group) {
          add({ ...t, x, y: -config.HAND_DISTANCE }, k, seat);
          x += config.HAND_PITCH;
        }
        x += 0.22;
      }
    }
    return { tiles, hands, overflow };
  }
  function prepareHandLayout(model, F) {
    if (F.overhead) return;
    const hand = model.tiles.filter((t) => t.k === 0 && t.hand && t.stand);
    if (!hand.length) return;
    const pub = model.tiles.filter(
      (t) =>
        t.k === 0 && (t.key.startsWith("meld-") || t.key.startsWith("orphan-")),
    );
    let r = bounds(
      hand.flatMap(
        (t) => tileFaces({ ...t, hudShift: 0, hudScale: 1 }, F, true).vertices,
      ),
    );
    const limit = pub.length
      ? Math.min(
          ...pub
            .flatMap((t) => tileFaces(t, F, true).vertices)
            .map((p) => p[0]),
        ) - 10
      : F.width - 12;
    const shrink = Math.min(1, (limit - 12) / (r.r - r.x));
    if (shrink < 1) {
      r.x = F.width / 2 + (r.x - F.width / 2) * shrink;
      r.r = F.width / 2 + (r.r - F.width / 2) * shrink;
    }
    const desired = pub.length
      ? Math.min(0, limit - r.r)
      : F.width / 2 - (r.x + r.r) / 2;
    const shift = Math.max(12 - r.x, Math.min(desired, F.width - 12 - r.r));
    for (const t of [...hand, ...(model.hands[hand[0].seat] || [])]) {
      t.hudShift = shift;
      t.hudScale = shrink;
    }
  }
  function orderMeld(seat, meld) {
    const tiles = (meld.tiles || Array(meld.count || 0).fill(null)).map(
      (type) => ({ type, sideways: false }),
    );
    if (meld.source == null || !tiles.length) return tiles;
    const source = (meld.source - seat + 4) % 4,
      added = meld.type === "BU_GANG" ? tiles.pop() : null,
      claimed = tiles.pop();
    claimed.sourceRelative = source;
    if (meld.type === "CHI")
      return [...tiles, claimed].sort(
        (a, b) => (a.type ?? -1) - (b.type ?? -1),
      );
    const at = source === 3 ? 0 : source === 2 ? 1 : tiles.length;
    tiles.splice(at, 0, claimed);
    if (added) tiles.splice(at + 1, 0, added);
    return tiles;
  }
  root.MahjongCuboid = {
    config,
    rotate,
    camera,
    frame,
    viewportFit,
    homography,
    textureGrid,
    feltSVG,
    roundedMesh,
    tileFaces,
    riverTiles,
    layoutTiles,
    prepareHandLayout,
    orderMeld,
  };
  if (typeof module === "object" && module.exports)
    module.exports = root.MahjongCuboid;
  if (typeof MahjongScene === "undefined") return;
  const safe = (s) => esc(s ?? "");
  const assetURL = (type) =>
    root.MahjongPresentation?.assets?.resolve?.("tiles", String(type)) ||
    `/assets/tiles/${type}.svg`;
  const xy = (x, y) => `left:${x}px;top:${y}px;`;
  function surfaceColor(f) {
    const { t, n, normal } = f;
    const front = t.stand ? Math.max(0, -n[1]) : Math.max(0, n[2]);
    const back = t.stand ? Math.max(0, n[1]) : Math.max(0, -n[2]);
    const green = Math.max(back, t.back ? front : 0),
      gold = t.gold && !t.back ? front : 0;
    const base = [255, 250, 235],
      g = [105, 183, 158],
      y = [255, 221, 130];
    const mix = base.map(
      (v, i) => v * (1 - green - gold) + g[i] * green + y[i] * gold,
    );
    // Quantized diffuse + broad soft highlight. World lighting is constant for all seats.
    const light = Math.max(
      0,
      normal[0] * -0.36 + normal[1] * -0.44 + normal[2] * 0.82,
    );
    const shade = 0.86 + 0.14 * light,
      highlight = 12 * Math.pow(light, 5);
    const q = (v) => Math.max(0, Math.min(255, Math.round(v / 3) * 3));
    return `rgb(${mix.map((v) => q(v * shade + highlight)).join(",")})`;
  }
  // Retain live canvases and reuse untextured projected bodies.
  // The exact location-dependent perspective is retained (not a generic rotated card).
  const sprites = new Map(),
    bodies = new Map(),
    artImages = new Map(),
    artSources = new Map();
  let artWidth = 100;
  function wantedArtWidth() {
    const F = frame(false),
      d = Math.min(
        2,
        (root.devicePixelRatio || 1) *
          Math.min(
            (root.innerWidth || 1440) / F.width,
            (root.innerHeight || 900) / F.height,
          ),
      );
    return Math.max(
      100,
      Math.min(
        200,
        Math.ceil(
          ((config.W - 2 * config.ROUND_RADIUS) * F.handUnit * d) / 50,
        ) * 50,
      ),
    );
  }
  function rasterArt(i, img) {
    const art = artImages.get(i) || document.createElement("canvas");
    art.width = artWidth;
    art.height = Math.round(artWidth * 1.32);
    art.getContext("2d").drawImage(img, 0, 0, art.width, art.height);
    artImages.set(i, art);
  }
  function ensureArt() {
    const desired = wantedArtWidth();
    if (desired > artWidth) {
      artWidth = desired;
      for (const [i, img] of artSources) rasterArt(i, img);
    }
  }

  // Match raster resolution to screen demand; geometry and hit targets stay exact.
  let rasterScale = 1;
  function density(F) {
    return (
      Math.ceil(
        Math.max(
          1,
          Math.min(
            2,
            (root.devicePixelRatio || 1) *
              Math.min(
                (root.innerWidth || 1440) / F.width,
                (root.innerHeight || 900) / F.height,
              ),
          ),
        ) * 2,
      ) / 2
    );
  }
  let bodyBytes = 0;
  function bodyPut(key, rec) {
    bodies.set(key, rec);
    bodyBytes += rec.bytes;
    while (bodyBytes > 6 * 1024 * 1024 || bodies.size > 320) {
      const k = bodies.keys().next().value;
      if (k === key) break;
      const old = bodies.get(k);
      bodyBytes -= old.bytes;
      old.canvas.width = old.canvas.height = 1;
      bodies.delete(k);
    }
  }
  let spriteBytes = 0,
    preloadPromise;
  const stats = {
    hits: 0,
    misses: 0,
    created: 0,
    reused: 0,
    removed: 0,
    lastMs: 0,
    tiles: 0,
    cacheBytes: 0,
    rasterized: 0,
    evicted: 0,
  };
  const MAX_BYTES = 8 * 1024 * 1024,
    MAX_SPRITES = 192;
  function cachePut(key, rec) {
    if (sprites.has(key)) spriteBytes -= sprites.get(key).bytes;
    sprites.set(key, rec);
    spriteBytes += rec.bytes;
    while (sprites.size > MAX_SPRITES || spriteBytes > MAX_BYTES) {
      const k = sprites.keys().next().value;
      if (k === key) break;
      const old = sprites.get(k);
      spriteBytes -= old.bytes;
      sprites.delete(k);
      if (old.canvas) {
        old.canvas.width = old.canvas.height = 1;
      }
      stats.evicted++;
    }
  }
  let atlasScale = 0,
    atlasPromise;
  function loadAtlas(scale) {
    if (atlasScale === scale) return atlasPromise;
    atlasScale = scale;
    const file =
      scale === 2 ? "wall-sprites-v101-2x.json" : "sprites-v101.json";
    return (atlasPromise = fetch("/assets/" + file)
      .then((r) => (r.ok ? r.json() : null))
      .then(async (data) => {
        if (data?.version !== 2 || !Array.isArray(data.entries)) return;
        await Promise.all(
          data.entries.map(async ([key, rec]) => {
            if (
              typeof key !== "string" ||
              !rec?.url?.startsWith("data:image/png;base64,") ||
              !(rec.bytes > 0 && rec.bytes <= MAX_BYTES)
            )
              return;
            const img = new Image();
            img.src = rec.url;
            try {
              await img.decode();
              const { url, ...geometry } = rec;
              cachePut(key, { ...geometry, image: img });
            } catch (_) {
              /* Optional bakes fall back to live geometry. */
            }
          }),
        );
      })
      .catch(() => {}));
  }
  root.MahjongCuboid.preload = () => {
    ensureArt();
    return (preloadPromise ||= Promise.all([
      ...Array.from(
        { length: 34 },
        (_, i) =>
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              artSources.set(i, img);
              rasterArt(i, img);
              resolve();
            };
            img.onerror = () => resolve();
            img.src = assetURL(i);
          }),
      ),
      loadAtlas(density(frame(false)) > 1 ? 2 : 1),
    ]));
  };
  root.MahjongCuboid.diagnostics = () => ({
    ...stats,
    cacheEntries: sprites.size,
    cacheBytes: spriteBytes,
    bodyBytes,
    bodyEntries: bodies.size,
    renderer: "per-tile-canvas",
    restoreCount: stats.restoreCount || 0,
    backgroundBytes: [
      ...document.querySelectorAll("img.cuboid-felt-image"),
    ].reduce((sum, n) => sum + n.naturalWidth * n.naturalHeight * 4, 0),
    atlasScale,
    missingArt: 34 - artImages.size,
    artWidth,
    artBytes: artImages.size * artWidth * Math.round(artWidth * 1.32) * 4,
    rasterScale,
    staticLimit: MAX_BYTES,
    bodyLimit: 6 * 1024 * 1024,
    liveBytes: [...document.querySelectorAll("canvas.cuboid-sprite")].reduce(
      (sum, n) => sum + n.width * n.height * 4,
      0,
    ),
  });
  let raster = document.createElement("canvas");
  let ctx = raster.getContext("2d");
  function newRaster(w, h, target) {
    raster = target || document.createElement("canvas");
    raster.width = w;
    raster.height = h;
    ctx = raster.getContext("2d");
  }
  function path(points) {
    ctx.beginPath();
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
  }
  function fill(points, color, stroke = false) {
    path(points);
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.3;
      ctx.lineJoin = "round";
      ctx.stroke();
    }
  }
  // Map the art to its actual perspective quadrilateral via small affine triangles.
  function texture(img, points) {
    const { m, n } = textureGrid(points, rasterScale);
    if (!m) return;
    if (n === 0) {
      ctx.save();
      path(points);
      ctx.clip();
      ctx.transform(
        m[0] * 100,
        m[1] * 100,
        m[4] * 100,
        m[5] * 100,
        m[12],
        m[13],
      );
      ctx.drawImage(img, 0, 0, 1, 1);
      ctx.restore();
      return;
    }
    const project = (u, v) => {
      const a = u * 100,
        b = v * 100,
        d = 1 + m[3] * a + m[7] * b;
      return [
        (m[0] * a + m[4] * b + m[12]) / d,
        (m[1] * a + m[5] * b + m[13]) / d,
      ];
    };
    const triangle = (uv) => {
      const [a, b, c] = uv.map((p) => project(...p)),
        [p, q, r] = uv;
      const dx = q[0] - p[0],
        dy = q[1] - p[1],
        ex = r[0] - p[0],
        ey = r[1] - p[1],
        det = dx * ey - ex * dy;
      const A = ((b[0] - a[0]) * ey - (c[0] - a[0]) * dy) / det,
        C = ((c[0] - a[0]) * dx - (b[0] - a[0]) * ex) / det;
      const B = ((b[1] - a[1]) * ey - (c[1] - a[1]) * dy) / det,
        D = ((c[1] - a[1]) * dx - (b[1] - a[1]) * ex) / det;
      const mid = mean([a, b, c]);
      ctx.save();
      path(
        [a, b, c].map((v) => {
          const d = Math.hypot(v[0] - mid[0], v[1] - mid[1]) || 1;
          return v.map((x, i) => x + ((x - mid[i]) * 0.65) / d);
        }),
      );
      ctx.clip();
      ctx.transform(
        A,
        B,
        C,
        D,
        a[0] - A * p[0] - C * p[1],
        a[1] - B * p[0] - D * p[1],
      );
      ctx.drawImage(img, 0, 0, 1, 1);
      ctx.restore();
    };
    ctx.save();
    path(points);
    ctx.clip();
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const a = [x / n, y / n],
          b = [(x + 1) / n, y / n],
          c = [(x + 1) / n, (y + 1) / n],
          d = [x / n, (y + 1) / n];
        triangle([a, b, c]);
        triangle([a, c, d]);
      }
    ctx.restore();
  }
  function sprite(t, F, existing) {
    const local = !F.overhead && t.k === 0 && t.hand && t.stand;
    const q = local ? { ...t, x: 0, hudShift: 0 } : t;
    const dx = local
      ? t.x * F.handUnit * (t.hudScale || 1) + (t.hudShift || 0)
      : 0;
    // Standing opponents expose only back/edges; concealed art does not affect pixels.
    const artType = !F.overhead && q.stand && q.hand && q.k !== 0 ? null : q.type;
    const key = JSON.stringify([
      F.overhead,
      q.k,
      q.x,
      q.y,
      q.z || 0,
      q.w || 1,
      !!q.stand,
      !!q.hand,
      q.hudScale || 1,
      artType ?? null,
      !!q.back,
      !!q.gold,
      !!q.recent,
      !!q.cursor,
      q.source || 0,
      artType != null && !q.back ? artWidth : 0,
      rasterScale,
    ]);
    if (existing?.__spriteKey === key) {
      stats.hits++;
      return { rec: existing.__geometry, dx, key };
    }
    let cachedKey = key,
      rec = sprites.get(key);
    // A 2x wall atlas also serves intermediate screen scales without rebuilding
    // the entire wall when the inspected/action seat rotates.
    if (!rec && rasterScale > 1 && t.key?.startsWith("wall-")) {
      const parts = JSON.parse(key);
      parts[parts.length - 1] = 2;
      cachedKey = JSON.stringify(parts);
      rec = sprites.get(cachedKey);
    }
    if (rec) {
      stats.hits++;
      sprites.delete(cachedKey);
      sprites.set(cachedKey, rec);
      return { rec, dx, key };
    }
    stats.misses++;
    const bodyKey = JSON.stringify([
      F.overhead,
      q.k,
      q.x,
      q.y,
      q.z || 0,
      q.w || 1,
      !!q.stand,
      !!q.hand,
      q.hudScale || 1,
      !!q.back,
      !!q.gold,
      rasterScale,
    ]);
    let body = bodies.get(bodyKey);
    const scale = rasterScale,
      pad = 1;
    if (!body) {
      const s = tileFaces(q, F),
        b = bounds(s.silhouette),
        w = b.r - b.x + 2 * pad,
        h = b.b - b.y + 2 * pad;
      newRaster(Math.ceil(w * scale), Math.ceil(h * scale));
      ctx.setTransform(
        scale,
        0,
        0,
        scale,
        (pad - b.x) * scale,
        (pad - b.y) * scale,
      );
      fill(s.silhouette, "#dad6c1");
      for (const f of [...s.curves].sort((a, b) => b.depth - a.depth))
        fill(f.points, surfaceColor(f), true);
      for (const f of s.faces) {
        fill(f.points, surfaceColor(f));
      }
      const canvas = raster;
      body = {
        canvas,
        b,
        faces: s.faces.map((f) => ({
          points: f.points,
          face: f.face,
          name: f.name,
          art: f.art,
        })),
        outline: s.silhouette,
        bytes: canvas.width * canvas.height * 4,
      };
      bodyPut(bodyKey, body);
    } else {
      bodies.delete(bodyKey);
      bodies.set(bodyKey, body);
    }
    const b = body.b,
      s = { silhouette: body.outline };
    newRaster(body.canvas.width, body.canvas.height, existing);
    ctx.drawImage(body.canvas, 0, 0);
    ctx.setTransform(
      scale,
      0,
      0,
      scale,
      (pad - b.x) * scale,
      (pad - b.y) * scale,
    );
    for (const f of body.faces) {
      if (f.face && !q.back && q.type != null) {
        const im = artImages.get(q.type);
        if (im) texture(im, f.points);
        else {
          ctx.fillStyle = "#254839";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(tileName(q.type), ...mean(f.points));
        }
      }
      const primary =
        f.face ||
        (!q.stand && f.name === "top") ||
        (q.stand && f.name === "rear");
      if (primary && (q.gold || q.recent || q.cursor)) {
        path(f.points);
        ctx.strokeStyle = q.recent
          ? "#d96b4f"
          : q.cursor
            ? "#f6df99"
            : "#d7a342";
        ctx.lineWidth = q.recent ? 1.7 : 1;
        ctx.stroke();
      }
      if (primary && q.source) {
        const c = mean(f.points);
        ctx.fillStyle = "#fff9e9";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(["", "→", "↑", "←"][q.source], ...c);
      }
    }
    const canvas = raster;
    stats.rasterized++;
    rec = {
      canvas,
      x: b.x - pad,
      y: b.y - pad,
      w: raster.width / scale,
      h: raster.height / scale,
      outline: s.silhouette,
      bytes: raster.width * raster.height * 4,
    };
    // Live tiles own their pixels; caches retain only immutable images and shared bodies.
    raster = null;
    ctx = null;
    if (!existing) cachePut(key, rec);
    return { rec, dx, key };
  }
  // Developer build utility: bake common fixed positions and all unscaled local faces.
  root.MahjongCuboid.bakeStaticSprites = async (scale = 1) => {
    await root.MahjongCuboid.preload();
    if (artImages.size !== 34) throw Error("Tile art incomplete");
    rasterScale = scale;
    const F = frame(false),
      entries = new Map();
    const add = (t) => {
      const { key, rec } = sprite(t, F);
      const { canvas, image, ...geometry } = rec;
      const source = canvas || image;
      const out = document.createElement("canvas");
      out.width = source.width;
      out.height = source.height;
      out.getContext("2d").drawImage(source, 0, 0);
      entries.set(key, { ...geometry, url: out.toDataURL("image/png") });
      out.width = out.height = 1;
    };
    for (let k = 0; k < 4; k++)
      for (let col = 0; col < 17; col++)
        for (const z of [0, config.D])
          add({
            k,
            x: (col - 8) * config.WALL_PITCH + config.WALL_OFFSET,
            y: -config.WALL_DISTANCE,
            z,
            back: true,
          });
    if (scale === 1)
      for (let type = 0; type < 34; type++)
        add({
          k: 0,
          x: 0,
          y: -config.HAND_DISTANCE,
          stand: true,
          hand: true,
          type,
        });
    return { version: 2, entries: [...entries] };
  };
  // Recover canvas pixels after a page-cache return or a 2D context reset.
  // This does not recover a browser process killed by the operating system.
  let pixelsDirty = false,
    restoreFrame = 0;
  function restorePixels() {
    if (!pixelsDirty || document.hidden || restoreFrame) return;
    restoreFrame = root.requestAnimationFrame(() => {
      restoreFrame = 0;
      if (document.hidden || typeof table === "undefined" || !table) return;
      pixelsDirty = false;
      for (const body of bodies.values())
        body.canvas.width = body.canvas.height = 1;
      bodies.clear();
      bodyBytes = 0;
      for (const [i, img] of artSources) rasterArt(i, img);
      const shell = document.querySelector(".table-shell"),
        stage = shell?.querySelector(".cuboid-scene");
      if (stage) {
        for (const node of stage.querySelectorAll(".cuboid-sprite"))
          node.__spriteKey = null;
        stage.geometryKey = null;
        stats.restoreCount = (stats.restoreCount || 0) + 1;
        MahjongScene.mount(shell);
      }
    });
  }
  document.addEventListener(
    "contextrestored",
    (event) => {
      if (event.target.classList?.contains("cuboid-sprite")) {
        pixelsDirty = true;
        restorePixels();
      }
    },
    true,
  );
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restorePixels();
  });
  root.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      pixelsDirty = true;
      restorePixels();
    }
  });
  function renderSprites(layer, model, F) {
    const old = layer.__tiles || new Map(),
      next = new Map(),
      hitboxes = new Map();
    const tiles = model.tiles
      .map((t) => {
        const local = !F.overhead && t.k === 0 && t.hand && t.stand;
        const z = (t.z || 0) + (t.stand ? config.H : config.D) / 2;
        return {
          t,
          layer: local ? 1 : 0,
          depth: (local ? F.handCam : F.cam).depth(rotate([t.x, t.y, z], t.k)),
        };
      })
      .sort((a, b) => a.layer - b.layer || b.depth - a.depth);
    let cursor = layer.firstChild;
    for (const { t } of tiles) {
      // Reuse by projected slot across inspected-seat rotations. Motion identifiers
      // remain logical tile IDs so existing flight/selection behavior is preserved.
      const slot = t.key.startsWith("wall-") ? `wall/${t.k}/${t.x}/${t.z || 0}`
        : t.hand ? `hand/${t.k}/${t.x}` : t.key;
      let node = old.get(slot);
      if (!node) {
        node = document.createElement("canvas");
        node.className = "cuboid-sprite";
        node.draggable = false;
        node.alt = "";
        stats.created++;
      } else stats.reused++;
      const { rec, dx, key } = sprite(t, F, node);
      if (node.__spriteKey !== key) {
        const source = rec.canvas || rec.image;
        if (source !== node) {
          node.width = Math.ceil(rec.w * rasterScale);
          node.height = Math.ceil(rec.h * rasterScale);
          node
            .getContext("2d")
            .drawImage(source, 0, 0, node.width, node.height);
        }
        node.__spriteKey = key;
        const { canvas, image, ...geometry } = rec;
        node.__geometry = geometry;
      }
      const pos = [rec.x + dx, rec.y, rec.w, rec.h].join("/");
      if (node.__pos !== pos) {
        Object.assign(node.style, {
          left: `${rec.x + dx}px`,
          top: `${rec.y}px`,
          width: `${rec.w}px`,
          height: `${rec.h}px`,
        });
        node.__pos = pos;
      }
      node.dataset.motion = t.key;
      node.dataset.cuboidSeat = t.seat;
      node.dataset.hand = String(!!t.hand);
      const world = rotate([t.x, t.y, t.z || 0], t.k);
      node.dataset.worldX = world[0];
      node.dataset.worldY = world[1];
      if (t.key.startsWith("wall-")) {
        const parts = t.key.split("-");
        node.dataset.wallSeat = t.seat;
        node.dataset.wallColumn = parts[2];
        node.dataset.wallLayer = parts[3];
      }
      node.dataset.cuboidKind = t.key.split("-")[0];
      node.dataset.tileFace = t.back || t.type == null ? "" : t.type;
      if (t.hand && t.last) node.dataset.lastHand = t.seat;
      else delete node.dataset.lastHand;
      node.title =
        t.label || (t.back || t.type == null ? "暗牌" : tileName(t.type));
      if (node !== cursor) layer.insertBefore(node, cursor);
      cursor = node.nextSibling;
      next.set(slot, node);
      if (t.hand && t.id != null)
        hitboxes.set(
          `${t.seat}/${t.id}`,
          rec.outline.map((p) => [p[0] + dx, p[1]]),
        );
    }
    for (const [key, node] of old)
      if (!next.has(key)) {
        node.width = node.height = 1;
        node.remove();
        stats.removed++;
      }
    layer.__tiles = next;
    model.hitboxes = hitboxes;
    stats.tiles = tiles.length;
  }
  function polygon(points) {
    return points.map((p) => p.map((v) => v.toFixed(3)).join(",")).join(" ");
  }
  function roundedPath(points, r = 20) {
    const toward = (p, q) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      const k = Math.min(r / d, 0.3);
      return [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k].join(" ");
    };
    return (
      points
        .map(
          (p, i) =>
            `${i ? "L" : "M"} ${toward(p, points[(i + points.length - 1) % points.length])} Q ${p.join(" ")} ${toward(p, points[(i + 1) % points.length])}`,
        )
        .join(" ") + " Z"
    );
  }
  // Immutable baked images retain the vector table gradient and chained shadows.
  // A live CSS filter on the full felt caused expensive repainting in WebKit.
  function feltSVG(overhead = false) {
    const F = frame(overhead),
      felt = roundedPath(
        rect(0, 0, 2 * config.TABLE_HALF, 2 * config.TABLE_HALF).map(F.screen),
      ),
      center = polygon(rect(0, 0, 6, 6, 0.01).map(F.screen));
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${F.width + 160}" height="${F.height + 160}" viewBox="-80 -80 ${F.width + 160} ${F.height + 160}"><defs><linearGradient id="felt94" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9adbc9"/><stop offset="1" stop-color="#459c92"/></linearGradient><filter id="felt-shadow" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="7" stdDeviation="0" flood-color="#b48357" result="first"/><feDropShadow in="first" dx="0" dy="12" stdDeviation="17" flood-color="#163e3d" flood-opacity=".4"/></filter></defs><g filter="url(#felt-shadow)"><path d="${felt}" fill="url(#felt94)" stroke="#e6c48e" stroke-width="7" stroke-linejoin="round"/><polygon points="${center}" fill="#235e60" stroke="#f5d39a" stroke-width="3"/></g></svg>`;
  }
  function centerHTML(table, layout, F) {
    const b = bounds(rect(0, 0, 6, 6).map(F.screen));
    const active =
      table.phase === "ROLLING_DICE" ? table.dealer : table.current_player;
    const wind = (side) => {
      const seat = layout[side],
        score = table.match?.scoring?.totals?.[String(seat)] ?? "—";
      return `<div class="center-wind ${side}${seat === active && table.phase !== "ROUND_END" ? " active" : ""}" title="${safe(seatNames[seat])}家${seat === table.dealer ? "（庄家）" : ""}"><b class="${seat === table.dealer ? "dealer-wind" : ""}">${seatNames[seat]}</b><span>${safe(score)}</span></div>`;
    };
    const dice = (table.dice || [])
      .filter((v) => v != null)
      .map(
        (v) =>
          `<span class="cuboid-die" aria-label="骰子${safe(v)}">${["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][v] || safe(v)}</span>`,
      )
      .join("");
    return `<div class="cuboid-center-info" style="${xy(b.x + 4, b.y + 3)}width:${b.r - b.x - 8}px;height:${b.b - b.y - 22}px">${["north", "west", "east", "south"].map(wind).join("")}<div class="center-round"><b>第 ${safe(table.match?.round_no ?? 1)} 局</b><span>余 ${safe(table.normal_tiles_remaining ?? "—")} 张</span><div>${dice}</div></div></div>`;
  }
  function hull(points) {
    const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (a, b, c) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const h = [];
    for (const x of p) {
      while (h.length >= 2 && cross(h.at(-2), h.at(-1), x) <= 0) h.pop();
      h.push(x);
    }
    const n = h.length;
    for (const x of p.slice(0, -1).reverse()) {
      while (h.length > n && cross(h.at(-2), h.at(-1), x) <= 0) h.pop();
      h.push(x);
    }
    h.pop();
    return h;
  }
  function place(el, x, y) {
    if (el) {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    }
  }
  function positionUI(shell, table, layout, model, F) {
    for (const [side, seat] of Object.entries(layout)) {
      const k = rotations[side],
        el = shell.querySelector(`#seat-${seat}`);
      if (!el) continue;
      const head = el.querySelector(".player-head"),
        hand = el.querySelector(".hand");
      const playerPoint =
        side === "south" && !F.overhead
          ? [-11.65, -9.8, 0.3]
          : side === "north" || side === "south"
            ? rotate([-11.15, -11.7, 0.3], k)
            : rotate([0, -13.65, 0.3], k);
      const anchor = F.screen(playerPoint);
      if (head) {
        head.dataset.visualSide = side;
        head.dataset.anchorX = anchor[0];
        head.dataset.anchorY = anchor[1];
        place(head, ...anchor);
      }
      // Buttons are clipped to the projected convex tile silhouette, not to a fixed rectangle.
      if (hand) {
        for (const b of hand.querySelectorAll("button[data-tile]")) {
          const t = model.hands[seat]?.find(
            (t) => t.id === Number(b.dataset.tile),
          );
          if (!t) continue;
          const pts =
              model.hitboxes?.get(`${seat}/${t.id}`) ||
              tileFaces(t, F).silhouette,
            r = bounds(pts),
            w = r.r - r.x,
            h = r.b - r.y;
          Object.assign(b.style, {
            left: `${r.x}px`,
            top: `${r.y}px`,
            width: `${w}px`,
            height: `${h}px`,
            clipPath: `polygon(${pts.map((p) => `${((p[0] - r.x) / w) * 100}% ${((p[1] - r.y) / h) * 100}%`).join(",")})`,
          });
        }
      }
      const wallPoint = F.screen(
        rotate([0, -config.WALL_DISTANCE, config.D * 2], k),
      );
      place(el.querySelector(".decision-row"), ...wallPoint);
      const toolsPoint = F.screen(
        rotate([6.9, -config.WALL_DISTANCE, config.D * 2], k),
      );
      place(el.querySelector(".dock-tools"), ...toolsPoint);
    }
  }
  function fit(shell, F) {
    const area = shell.closest(".game-content");
    const w = area?.clientWidth || root.innerWidth || 1440,
      h = area?.clientHeight || root.innerHeight || 800;
    const V = viewportFit(F, w, h),
      s = V.scale;
    shell.style.setProperty("--cuboid-width", `${F.width}px`);
    shell.style.setProperty("--cuboid-height", `${F.height}px`);
    shell.style.setProperty("--cuboid-scale", String(s));
    // Edge controls stay screen-relative and do not participate in fitting.
    const topbar = document.querySelector(".topbar");
    const toolbarTop = (topbar?.getBoundingClientRect().bottom || 0) + 3;
    shell.style.setProperty("--edge-right", `${(10 - V.x) / s}px`);
    shell.style.setProperty("--edge-top", `${(toolbarTop - V.y) / s}px`);
    shell.style.setProperty("--edge-scale", String(1 / s));
    for (const head of shell.querySelectorAll(".player-head[data-anchor-x]")) {
      let ax = Number(head.dataset.anchorX),
        ay = Number(head.dataset.anchorY);
      const hw = head.offsetWidth / 2,
        hh = head.offsetHeight / 2;
      if (head.dataset.visualSide === "north") {
        const controls = [
          topbar?.querySelector(".round-controls"),
          shell.querySelector(".scene-toolbar"),
        ]
          .filter(Boolean)
          .map((el) => el.getBoundingClientRect());
        if (
          controls.some(
            (r) =>
              V.x + (ax + hw) * s > r.left &&
              V.x + (ax - hw) * s < r.right &&
              V.y + (ay - hh) * s < r.bottom &&
              V.y + (ay + hh) * s > r.top,
          )
        ) {
          // The nearby corner inside the two walls is free in ordinary play.
          [ax, ay] = F.screen([6.5, 6.8, 0.3]);
        }
      }
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      place(
        head,
        clamp(ax, -V.x / s + hw + 3 / s, (w - V.x) / s - hw - 3 / s),
        clamp(ay, -V.y / s + hh + 3 / s, (h - V.y) / s - hh - 3 / s),
      );
    }
  }
  MahjongScene.markup = () =>
    '<div class="cuboid-scene" aria-label="混合透视麻将桌"></div>';
  MahjongScene.restoreHand = () => {};
  MahjongScene.meldOrder = orderMeld;
  MahjongScene.mount = function (shell) {
    if (!shell || !table) return;
    const stage = shell.querySelector(".cuboid-scene");
    if (!stage) return;
    shell.classList.add("cuboid-active");
    const overhead = shell.classList.contains("overhead-view");
    const started = performance.now();
    const F = frame(overhead);
    rasterScale = density(F);
    ensureArt();
    const wantedAtlas = rasterScale > 1 ? 2 : 1;
    if (atlasScale !== wantedAtlas)
      loadAtlas(wantedAtlas).then(() => {
        if (shell.isConnected) {
          stage.geometryKey = null;
          MahjongScene.mount(shell);
        }
      });
    const layout = visualSeatMap(),
      model = layoutTiles(table, layout);
    // The inspection view lays known hand tiles face-up; hidden hands remain hidden.
    if (overhead) {
      for (const t of model.tiles) if (t.hand) t.stand = false;
      for (const hand of Object.values(model.hands))
        for (const t of hand) t.stand = false;
    }
    prepareHandLayout(model, F);
    const geometryKey = JSON.stringify([
      overhead,
      rasterScale,
      artWidth,
      model.tiles,
    ]);
    const gold =
      table.phase !== "ROLLING_DICE" && table.gold_tile_type != null
        ? `<div class="cuboid-gold" style="${xy(...F.screen([-11, 10.65, 0]))}"><span>本局金牌</span><img src="${safe(assetURL(table.gold_tile_type))}" alt="${safe(tileName(table.gold_tile_type))}"></div>`
        : "";
    const over = Object.entries(model.overflow)
      .map(
        ([seat, n]) =>
          `<button class="cuboid-overflow ghost" data-river-toggle style="${xy(...F.screen(rotate([6.7, -7.4, 0], rotations[Object.keys(layout).find((s) => layout[s] === Number(seat))])))}">+${n} 查看牌河</button>`,
      )
      .join("");
    if (!stage.querySelector(".cuboid-faces"))
      stage.innerHTML =
        '<div class="cuboid-felt-holder"></div><div class="cuboid-faces"></div><div class="cuboid-info-holder"></div>';
    const feltHolder = stage.querySelector(".cuboid-felt-holder");
    const feltKey = overhead + "/" + rasterScale;
    if (feltHolder.__view !== feltKey) {
      feltHolder.innerHTML = `<img class="cuboid-felt-image" src="/assets/table/felt-${overhead ? "overhead" : "oblique"}-${rasterScale}.png" alt="" style="width:${Math.ceil((F.width + 160) * rasterScale) / rasterScale}px;height:${Math.ceil((F.height + 160) * rasterScale) / rasterScale}px">`;
      feltHolder.__view = feltKey;
      const image = feltHolder.firstElementChild;
      image.onerror = () => {
        if (image.isConnected) {
          const template = document.createElement("template");
          template.innerHTML = feltSVG(overhead);
          const svg = template.content.firstElementChild;
          svg.classList.add("cuboid-felt-image");
          image.replaceWith(svg);
        }
      };
    }
    if (stage.geometryKey !== geometryKey) {
      renderSprites(stage.querySelector(".cuboid-faces"), model, F);
      stage.geometryKey = geometryKey;
      stage.hitboxes = model.hitboxes;
    } else model.hitboxes = stage.hitboxes;
    const info = stage.querySelector(".cuboid-info-holder"),
      markup = centerHTML(table, layout, F) + gold + over;
    if (info.__markup !== markup) {
      info.innerHTML = markup;
      info.__markup = markup;
    }
    positionUI(shell, table, layout, model, F);
    fit(shell, F);
    stats.lastMs = performance.now() - started;
    if (!shell.__cuboidResize) {
      shell.__cuboidResize = true;
      let pending = false;
      const resize = () => {
        if (pending) return;
        pending = true;
        root.requestAnimationFrame(() => {
          pending = false;
          MahjongScene.mount(shell);
        });
      };
      root.addEventListener("resize", resize);
      if (root.ResizeObserver) {
        shell.__cuboidObserver = new ResizeObserver(resize);
        shell.__cuboidObserver.observe(shell.closest(".game-content"));
      }
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
