/* Project the public table view. Coordinates are in logical table units, with +z
   pointing out of the felt. Slot IDs identify locations, never concealed tiles. */
const MahjongScene = (() => {
  const tableSize = {width:1014, length:704, rail:28, radius:37, top:6, base:-37};
  const feltWidth = tableSize.width - tableSize.rail * 2;
  const feltLength = tableSize.length - tableSize.rail * 2;
  const handTile = {w:25, h:36, depth:11};
  const tileBaseZ = 2.25;
  const cameraDistance = 1800;
  const yaw = {south:0, west:90, north:180, east:-90};
  const travelKinds = new Set([
    "TILE_DRAWN", "TILE_DISCARDED", "CHI", "PENG", "GANG", "GOLD_SHELVED",
    "ORPHAN_PICKED", "TING_DECLARED", "HU", "GOLD_INDICATOR_REVEALED"
  ]);
  let observedShell;
  let observedStage;
  let observer;
  const flights = new Set();

  function point(side, across, outward) {
    switch (side) {
      case "north": return [-across, -outward];
      case "west": return [-outward, across];
      case "east": return [outward, -across];
      default: return [across, outward];
    }
  }

  function position(side, across, outward, options = {}) {
    const [x, y] = point(side, across, outward);
    return {...options, x, y, angle: yaw[side] + (options.angle || 0)};
  }

  function tile(type, {
    x, y, z = 5, w = 24, h = 32, depth = 10, angle = 0, pitch = 0,
    classes = "", key, label = type == null ? "暗牌" : tileName(type),
    back = type == null, dice = false, extra = ""
  }) {
    const surface = MahjongMesh.available && !dice
      ? '<span class="tile-body scene-anchor"><span class="tile-top"></span></span>'
      : MahjongTile.body(type, {back, dice, label});
    return `<span class="scene-tile ${classes}"${key ? ` data-motion="${key}"` : ""}
      style="--x:${x}px;--y:${y}px;--z:${z}px;--w:${w}px;--h:${h}px;--d:${depth}px;--yaw:${angle}deg;--pitch:${pitch}deg"
      title="${esc(label)}" data-tile-face="${back ? "" : type ?? ""}"${extra}>${surface}</span>`;
  }

  function frame() {
    const {width, length, rail, radius, top, base} = tableSize;
    const halfWidth = width / 2;
    const halfDepth = length / 2;
    const innerRight = width - rail;
    const innerBottom = length - rail;
    const innerRadius = radius - 8;
    const innerStart = rail + innerRadius;
    const cutout = `M ${innerStart} ${rail} H ${innerRight - innerRadius}
      Q ${innerRight} ${rail} ${innerRight} ${innerStart} V ${innerBottom - innerRadius}
      Q ${innerRight} ${innerBottom} ${innerRight - innerRadius} ${innerBottom} H ${innerStart}
      Q ${rail} ${innerBottom} ${rail} ${innerBottom - innerRadius} V ${innerStart}
      Q ${rail} ${rail} ${innerStart} ${rail} Z`.replace(/\s+/g, " ");
    const points = [];
    for (let corner = 0; corner < 4; corner++) {
      const cx = corner < 2 ? halfWidth - radius : radius - halfWidth;
      const cy = corner === 0 || corner === 3 ? radius - halfDepth : halfDepth - radius;
      for (let segment = 0; segment <= 5; segment++) {
        const angle = (corner * 90 - 90 + segment * 18) * Math.PI / 180;
        points.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
      }
    }
    const sides = points.map(([x, y], i) => {
      const [nextX, nextY] = points[(i + 1) % points.length];
      const dx = nextX - x;
      const dy = nextY - y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const length = Math.hypot(dx, dy) + 0.25;
      return `<span class="frame-facet" style="--x:${x}px;--y:${y}px;--length:${length}px;--angle:${angle}deg;--grain:${i * -53}px"></span>`;
    }).join("");
    return `<div class="frame-floor" style="--height-z:${base - 6}px"></div>
      <div class="frame-base" style="--height-z:${base}px"></div>${sides}
      <div class="frame-top" style="--height-z:${top}px;clip-path:path(evenodd,'M 0 0 H ${width} V ${length} H 0 Z ${cutout}')"></div>
      <div class="frame-inlay"></div><div class="scene-felt"></div><div class="scene-well"></div>`;
  }
  const frameMarkup = frame();

  // Size of the unscaled backing canvas. Fit uses projected content below.
  const sceneWidth = 1280;
  const stageGeometry = [
    `--scene-width:${sceneWidth}px;--scene-block-size:820px;--camera-distance:${cameraDistance}px`,
    `--frame-width:${tableSize.width}px;--frame-length:${tableSize.length}px;--frame-radius:${tableSize.radius}px`,
    `--felt-width:${feltWidth}px;--felt-length:${feltLength}px;--tile-base-z:${tileBaseZ}px`,
    `--frame-top:${tableSize.top}px;--frame-thickness:${tableSize.top - tableSize.base}px`
  ].join(";");

  // Column 0 is on the owner's left, even when the scene rotates for LAN.
  const wallLayers = ["top", "bottom"];
  const wallPaintOrder = [1, 0];
  const wallKey = ({side, column, layer}) => `wall-${side}-${column}-${wallLayers[layer]}`;

  const wallGeometry = {
    horizontal:{step:29, outward:183, w:27.6, h:30, depth:10.6},
    vertical:{step:20, outward:300, w:18.7, h:30, depth:10.6}
  };
  const sideIsVertical = side => side === "east" || side === "west";

  function wallPosition(side, column) {
    const {step, outward, ...size} = wallGeometry[sideIsVertical(side) ? "vertical" : "horizontal"];
    return position(side, (column - 8) * step, outward, size);
  }

  function wall(table, seat, side) {
    const columns = table.wall_view?.sides?.[seat] || [];
    const tiles = columns.map(stack => {
      const {column, bottom} = stack;
      const geometry = wallPosition(side, column);
      return wallPaintOrder.map(layer => {
        const name = wallLayers[layer];
        const slot = stack[name];
        if (!slot?.present) return "";
        const classes = ["wall-layer", "present", slot.reserved && "reserved",
          slot.normal_cursor && "normal-cursor", slot.gang_cursor && "gang-cursor", slot.indicator && "indicator"
        ].filter(Boolean).join(" ");
        const type = slot.indicator ? table.gold_indicator?.type : null;
        const label = slot.indicator ? "金指示牌" : slot.normal_cursor ? "下一张正常摸牌" :
          slot.gang_cursor ? "下一张杠后补牌" : `${seatNames[seat]}墙 ${column} 号墩`;
        return tile(type, {...geometry,
          z:layer === 0 && bottom?.present ? 16.4 : 5.3,
          classes, label, key:wallKey({side:seat, column, layer}),
          extra:` data-wall-seat="${seat}" data-wall-column="${column}" data-wall-layer="${name}"`
        });
      }).join("");
    }).join("");

    const opening = table.wall_view?.break_position;
    if (opening?.side !== seat) return tiles;
    const {column} = opening;
    const {x, y, w, h, angle} = wallPosition(side, column);
    const label = `${seatNames[seat]}墙 ${column} 号墩开墙`;
    return `${tiles}<span class="wall-break" data-break-seat="${seat}" data-break-column="${column}"
      role="img" aria-label="${label}" title="${label}"
      style="--x:${x}px;--y:${y}px;--w:${w}px;--h:${h}px;--yaw:${angle}deg"></span>`;
  }

  function hand(table, seat, side) {
    if (side === "south") return "";
    const p = table.players[seat];
    const tiles = Array.isArray(p.concealed_tiles) ? [...p.concealed_tiles].sort((a,b) => {
      return (a.id === p.last_drawn_tile) - (b.id === p.last_drawn_tile) || a.type - b.type || a.id - b.id;
    }) : Array.from({length:p.concealed_count}, () => ({}));
    const step = handTile.w + 2;
    const edge = sideIsVertical(side) ? 449 : feltLength / 2;
    // Stand the tile with its printed face outward. Cant the side rows
    // toward the camera along their inward normal while keeping the tile
    // positions on the owner's wall axis.
    const [inX, inY] = point(side, 0, -1);
    const towardCamera = Math.atan2(inX, inY) * 180 / Math.PI;
    const turn = Math.max(-40, Math.min(40, towardCamera));
    return tiles.map(({id}, i) => {
      const last = i === tiles.length - 1;
      const drawn = id != null && p.last_drawn_tile === id;
      return tile(null, position(side, (i - (tiles.length - 1) / 2) * step + (drawn ? 8 : 0), edge - 24, {
        ...handTile, z: handTile.h / 2 + 1, angle:turn,
        pitch:-90, classes:`scene-hand${drawn ? " scene-drawn" : ""}`,
        key:id == null ? `closed-${seat}-${i}` : `hand-${seat}-${id}`,
        extra:last ? ` data-last-hand="${seat}"` : ""
      }));
    }).join("");
  }

  function river(table, seat, side) {
    const discards = table.discards.map((discard, index) => ({...discard, index}))
      .filter(d => d.seat === seat && !d.claimed);
    const vertical = sideIsVertical(side);
    const columns = side === "north" || side === "south" ? 8 : 7;
    const rows = Math.max(1, Math.ceil(discards.length / columns));
    const step = Math.min(35, (vertical ? 100 : 55) / Math.max(1, rows - 1));
    return discards.map((d, i) => {
      const pending = table.pending_claim?.kind === "DISCARD" && table.pending_claim.source === seat && i === discards.length - 1;
      const across = (i % columns - (columns - 1) / 2) * (vertical ? 26 : 31);
      const out = (vertical ? 166 : 93) + Math.floor(i / columns) * step;
      return tile(d.type, position(side, across, out, {
        w:vertical ? 24 : 28, h:Math.min(34, step - 1), z:5, key:`discard-${d.index}`,
        classes:`scene-river${pending ? " recent" : ""}${d.type === table.gold_tile_type ? " gold" : ""}`
      }));
    }).join("");
  }

  function meldOrder(seat, meld) {
    const tiles = (meld.tiles || Array(meld.count).fill(null)).map(type => ({type, sideways:false}));
    if (meld.source == null || !tiles.length) return tiles;
    const source = (meld.source - seat + 4) % 4;
    const added = meld.type === "BU_GANG" ? tiles.pop() : null;
    const claimed = tiles.pop();
    claimed.sideways = true;
    const at = source === 1 ? 0 : source === 2 ? 1 : tiles.length;
    tiles.splice(at, 0, claimed);
    if (added) tiles.splice(at + 1, 0, {...added, sideways:true, stacked:true});
    return tiles;
  }

  function zones(table, seat, side) {
    const p = table.players[seat];
    const vertical = sideIsVertical(side);
    const wall = wallGeometry[vertical ? "vertical" : "horizontal"];
    const wallEdge = wall.outward + wall.h / 2;
    // Horizontal rows end at the side walls' outer line. Vertical rows can
    // use the corners beyond that line without sharing space with either end.
    const halfRow = vertical ? feltLength / 2 - 12 :
      wallGeometry.vertical.outward + wallGeometry.vertical.h / 2;
    const rowStep = handTile.h + 2;
    const groups = [
      ...p.melds.map((meld, i) => ({
        category:"meld", tiles:meldOrder(seat, meld).map((t, j) => ({...t, key:`meld-${seat}-${i}-${j}`}))
      })),
      ...p.shelf_tiles.map((type, i) => ({category:"shelf", tiles:[{type, key:`shelf-${seat}-${i}`}]})),
      ...(p.picked_orphans || []).map((type, i) => ({category:"orphan", tiles:[{type, key:`orphan-${seat}-${i}`}]}))
    ];
    if (p.ting_tile) groups.push({category:"ting", tiles:[{type:p.ting_tile.type, key:`ting-${seat}`}]});

    const gap = 2;
    const span = ({sideways}) => sideways ? handTile.h : handTile.w;
    let used = 0;
    let row = 0;
    let lastCategory;
    return groups.map(({category, tiles}) => {
      // Keep a meld intact at a line break. Added kongs share the claimed
      // tile's position and do not consume a second slot in the row.
      const slots = tiles.filter(t => !t.stacked);
      const groupWidth = slots.reduce((total, t) => total + span(t), 0) + gap * (slots.length - 1);
      const separation = category !== lastCategory ? 12 : category === "meld" ? 8 : gap;
      if (used && used + separation + groupWidth > halfRow * 2) {
        row++;
        used = 0;
      }
      if (used) used += separation;
      lastCategory = category;
      const outward = wallEdge + handTile.h / 2 + 8 + row * rowStep;
      let across;
      let offset = used;
      used += groupWidth;
      return tiles.map(({type, sideways, stacked, key}) => {
        if (!stacked) {
          const width = span({sideways});
          across = halfRow - offset - width / 2;
          offset += width + gap;
        }
        const classes = `scene-${category}${sideways ? " scene-claimed" : ""}${stacked ? " scene-stacked" : ""}`;
        return tile(type, position(side, across, outward, {
          ...handTile, z:stacked ? handTile.depth * 1.5 + .6 : handTile.depth / 2,
          angle:sideways ? 90 : 0, key,
          classes:`${classes}${type != null && type === table.gold_tile_type ? " gold" : ""}`
        }));
      }).join("");
    }).join("");
  }

  function center(table) {
    const indicator = table.gold_indicator?.type;
    const gold = table.gold_tile_type;
    const objects = indicator == null ? "" : [
      tile(indicator, {x:-19, y:31, w:25, h:34, z:6, classes:"tile small", key:"gold-indicator", label:`金指示牌 ${tileName(indicator)}`}),
      tile(gold, {x:19, y:31, w:25, h:34, z:6, classes:"tile small gold", key:"gold", label:`金牌 ${tileName(gold)}`}),
      ...table.dice.map((value, i) => tile(value, {x:i ? 16 : -16, y:-18, w:24, h:24, depth:22, z:12,
        angle:i ? 17 : -17, dice:true, back:false, classes:"scene-die", label:`骰子 ${value}`}))
    ].join("");
    return `<div class="scene-center gold-box">${objects}</div>`;
  }

  function markup(table, layout) {
    const positions = Object.entries(layout);
    const board = positions.map(([side, seat]) => `
      ${wall(table, seat, side)}
      <div class="scene-river-side river-${side}" data-river-seat="${seat}" aria-label="${seatNames[seat]}家牌河">
        ${river(table, seat, side)}
      </div>
      ${zones(table, seat, side)}${hand(table, seat, side)}`).join("");
    const empty = table.phase === "ROLLING_DICE";
    const markers = positions.map(([side, seat]) => {
      const edge = (sideIsVertical(side) ? feltWidth : feltLength) / 2;
      const [x, y] = point(side, 0, edge + tableSize.rail / 2);
      return `<div class="scene-tag" style="--tag-x:${x}px;--tag-y:${y}px" aria-hidden="true">${seatNames[seat]}</div>`;
    }).join("");
    return `<div class="wall-stage" style="${stageGeometry}" aria-label="立体麻将桌">
      <div class="scene-world"><div class="scene-camera"><div class="scene-plane">
        ${frameMarkup}${markers}${board}${center(table)}
      </div></div><canvas class="scene-sprites" aria-hidden="true"></canvas></div>
      ${empty ? '<p class="scene-deal">等待庄家掷骰</p>' : ""}
    </div>`;
  }

  function fit(shell) {
    const stage = shell.querySelector(".wall-stage");
    if (!stage?.clientWidth || !stage.clientHeight) return false;
    const width = stage.clientWidth, height = stage.clientHeight;
    const full = shell.classList.contains("overhead-view");
    const tilt = full ? 17 : Math.max(31, Math.min(67, 31 + (width / height - .85) * 15));
    const radians = tilt * Math.PI / 180;
    const sin = Math.sin(radians), cos = Math.cos(radians);
    const camera = {originX:0, originY:0, sin, cos, perspective:cameraDistance, feltZ:tileBaseZ};
    const inner = full ? [tableSize.width / 2, tableSize.length / 2] : [332, 210];
    const points = [tableSize.top, full ? tableSize.base : 0].flatMap(z =>
      [-inner[0], inner[0]].flatMap(x => [-inner[1], inner[1]].map(y => {
        const scale = cameraDistance / (cameraDistance - y * sin - z * cos);
        return [x * scale, (y * cos - z * sin) * scale];
      })));
    const publicTiles = ".scene-river,.scene-meld,.scene-shelf,.scene-orphan,.scene-ting,.scene-hand,.scene-center .scene-tile,.wall-layer.indicator";
    for (const node of stage.querySelectorAll(full ? ".scene-tile" : publicTiles)) {
      points.push(...MahjongMesh.project(node, camera));
    }
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const [x, y] of points) {
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    const margin = full ? 10 : 7;
    const scale = Math.max(.01, Math.min((width - margin * 2) / (right - left),
      (height - margin * 2) / (bottom - top), full ? 1.25 : 1.68));
    const values = {
      "--scene-scale":scale,
      "--camera-tilt":`${tilt}deg`,
      "--scene-center-x":`${(left + right) / 2}px`,
      "--scene-center-y":`${(top + bottom) / 2}px`
    };
    const resized = stage.cameraSize !== `${width}x${height}`;
    stage.cameraSize = `${width}x${height}`;
    for (const [name, value] of Object.entries(values)) stage.style.setProperty(name, value);
    return resized;
  }

  function mount(shell) {
    fit(shell);
    MahjongMesh.mount(shell);
    const stage = shell.querySelector(".wall-stage");
    if (observedStage === stage) return;
    if (observedShell !== shell && typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => {
        if (fit(shell)) {
          cancelFlights();
          MahjongMesh.invalidate();
        }
      });
    }
    observedShell = shell;
    observer?.disconnect();
    observedStage = stage;
    if (stage) observer?.observe(stage);
  }

  function setPerspective(shell) {
    const overhead = shell.classList.toggle("overhead-view");
    cancelFlights();
    return overhead;
  }

  function cancelFlights() {
    for (const flight of flights) flight.cancel();
  }

  function snapshot(events) {
    if (!events.some(event => travelKinds.has(event.type)) ||
        typeof Element.prototype.animate !== "function" ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null;
    const anchors = new Map();
    const rectOf = node => (node.querySelector(".tile-top") || node).getBoundingClientRect();
    for (const node of document.querySelectorAll(".wall-stage [data-motion], .dock-seat .hand [data-motion], .result-box .winning-tile .tile")) {
      const rect = rectOf(node);
      if (rect.width < 2 || rect.height < 2) continue;
      const anchor = {node, rect};
      anchors.set(node.dataset.motion || "win", anchor);
      if (node.dataset.lastHand != null) anchors.set(`last-${node.dataset.lastHand}`, anchor);
    }
    return anchors;
  }

  function fly(from, to, kind, delay) {
    if (!from || !to || from.node === to.node) return;
    const {rect:start} = from;
    const {node, rect:end} = to;
    const targetFace = node.querySelector(".tile-body");
    if (!targetFace) return;
    const proxy = document.createElement("span");
    proxy.className = `flying-tile${node.classList.contains("gold") ? " gold" : ""}`;
    proxy.dataset.travel = kind;
    proxy.setAttribute("aria-hidden", "true");
    const label = node.dataset.tileFace;
    if (label == null) proxy.append(targetFace.cloneNode(true));
    else proxy.innerHTML = MahjongTile.body(label === "" ? null : Number(label));
    proxy.style.cssText = `left:${end.x}px;top:${end.y}px;width:${end.width}px;height:${end.height}px`;
    const x = start.x + start.width / 2 - end.x - end.width / 2;
    const y = start.y + start.height / 2 - end.y - end.height / 2;
    const sx = start.width / end.width;
    const sy = start.height / end.height;
    const lift = Math.min(65, 22 + Math.hypot(x, y) * 0.11);
    node.classList.add("receiving-tile");
    MahjongMesh.invalidate();
    document.body.append(proxy);
    const animation = proxy.animate([
      {transform:`translate(${x}px,${y}px) scale(${sx},${sy})`},
      {transform:`translate(${x * .46}px,${y * .46 - lift}px) rotate(-9deg) scale(1.13)`, offset:.53},
      {transform:"translate(0,0)"}
    ], {duration:325, delay, easing:"cubic-bezier(.22,.62,.3,1)", fill:"both"});
    if (kind === "TILE_DRAWN" && label !== "" && node.closest(".hand")) {
      proxy.firstChild.animate([
        {transform:"rotateX(6deg) rotateY(180deg)"},
        {transform:"rotateX(6deg) rotateY(135deg)", offset:.36},
        {transform:"rotateX(6deg) rotateY(0deg)"}
      ], {duration:325, delay, fill:"both"});
    }
    flights.add(animation);
    function finish() {
      flights.delete(animation);
      node.classList.remove("receiving-tile");
      proxy.remove();
      MahjongMesh.invalidate();
    }
    animation.onfinish = finish;
    animation.oncancel = finish;
  }

  function omittedHandTile(before, previous, next, seat, type, used) {
    const remaining = new Set(next.players[seat].concealed_tiles?.map(tile => tile.id));
    const lost = previous.players[seat].concealed_tiles?.find(tile =>
      (type == null || tile.type === type) && !remaining.has(tile.id) && !used?.has(tile.id));
    if (lost) used?.add(lost.id);
    return (lost && before.get(`hand-${seat}-${lost.id}`)) || before.get(`last-${seat}`);
  }

  function animate(events, before, previous, next) {
    if (!before) return;
    const after = snapshot(events);
    if (!after) return;
    const newDiscards = next.discards.slice(previous.discards.length).map((discard, i) => ({
      ...discard, index:previous.discards.length + i
    }));
    const startingClaim = previous.pending_claim;
    const claimFrom = seat => {
      if (seat == null) return null;
      if (startingClaim?.source === seat && startingClaim.kind === "ROB_BU_GANG") return before.get(`last-${seat}`);
      const index = previous.discards.findLastIndex(d => d.seat === seat && !d.claimed);
      return before.get(`discard-${index}`);
    };
    const finalDraw = new Map(events.filter(event => event.type === "TILE_DRAWN")
      .map(event => [event.player, event]));
    let delay = 0;
    for (const event of events) {
      const {type, player:seat, payload:p} = event;
      const rows = next.players[seat];
      switch (type) {
        case "TILE_DRAWN":
          if (event !== finalDraw.get(seat)) continue;
          if (p.position) fly(before.get(wallKey(p.position)), after.get(`last-${seat}`), type, delay);
          break;
        case "TILE_DISCARDED": {
          const index = newDiscards.findIndex(d => d.type === p.tile_type && d.seat === seat);
          if (index >= 0) {
            const [discard] = newDiscards.splice(index, 1);
            fly(omittedHandTile(before, previous, next, seat, p.tile_type), after.get(`discard-${discard.index}`), type, delay);
          }
          break;
        }
        case "GOLD_SHELVED":
          fly(omittedHandTile(before, previous, next, seat, p.tile_type), after.get(`shelf-${seat}-${p.shelf_count - 1}`), type, delay);
          break;
        case "TING_DECLARED":
          fly(omittedHandTile(before, previous, next, seat, rows.ting_tile?.type), after.get(`ting-${seat}`), type, delay);
          break;
        case "ORPHAN_PICKED":
          fly(claimFrom(p.source), after.get(`orphan-${seat}-${rows.picked_orphans.length - 1}`), type, delay);
          break;
        case "CHI":
        case "PENG":
        case "GANG": {
          const i = rows.melds.findIndex((meld, index) => {
            const old = previous.players[seat].melds[index];
            return old?.type !== meld.type || old.count !== meld.count;
          });
          if (i === -1) break;
          const meld = rows.melds[i];
          const used = new Set();
          meldOrder(seat, meld).forEach(({type:face, sideways, stacked}, column) => {
            if (p.kind === "BU_GANG" && !stacked) return;
            const from = sideways && p.kind !== "BU_GANG" ? claimFrom(meld.source) :
              omittedHandTile(before, previous, next, seat, face, used);
            fly(from, after.get(`meld-${seat}-${i}-${column}`), type, delay + column * 28);
          });
          break;
        }
        case "HU":
          fly(claimFrom(p.source) || before.get(`last-${seat}`), after.get("win"), type, delay);
          break;
        case "GOLD_INDICATOR_REVEALED":
          if (p.position) fly(before.get(wallKey(p.position)), after.get("gold-indicator"), type, delay);
          break;
      }
      if (travelKinds.has(type)) delay = Math.min(delay + 105, 310);
    }
  }

  return {markup, meldOrder, mount, setPerspective, snapshot, animate, cancelFlights};
})();
