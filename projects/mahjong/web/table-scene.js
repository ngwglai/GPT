/* Project the public table view. Coordinates are in logical table units, with +z
   pointing out of the felt. Slot IDs identify locations, never concealed tiles. */
const MahjongScene = (() => {
  const width = 1000;
  const yaw = {south:0, west:90, north:180, east:-90};
  const travelKinds = new Set([
    "TILE_DRAWN", "TILE_DISCARDED", "CHI", "PENG", "GANG", "GOLD_SHELVED",
    "ORPHAN_PICKED", "TING_DECLARED", "HU", "GOLD_INDICATOR_REVEALED"
  ]);
  let overhead = false;
  let observedShell;
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
    const halfWidth = 431;
    const halfDepth = 275;
    const radius = 37;
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
    return `<div class="frame-floor"></div><div class="frame-base"></div>${sides}
      <div class="frame-top"></div><div class="frame-inlay"></div><div class="scene-felt"></div>
      <div class="scene-well"></div>`;
  }
  const frameMarkup = frame();

  const wallKey = ({side, column, layer}) => `wall-${side}-${column}-${layer === 0 ? "top" : "bottom"}`;

  function wall(table, seat, side) {
    const columns = table.wall_view?.sides?.[seat] || [];
    const vertical = side === "east" || side === "west";
    return columns.map(({column, top, bottom}) => [bottom, top].map((slot, layer) => {
      if (!slot?.present) return "";
      const name = layer ? "top" : "bottom";
      const classes = ["wall-layer", "present", slot.reserved && "reserved",
        slot.normal_cursor && "normal-cursor", slot.gang_cursor && "gang-cursor", slot.indicator && "indicator"
      ].filter(Boolean).join(" ");
      const end = table.wall_view.break_position;
      const mark = end?.side === seat && end.column === column && layer ? " break-stack" : "";
      const type = slot.indicator ? table.gold_indicator?.type : null;
      const label = slot.indicator ? "金指示牌" : slot.normal_cursor ? "下一张正常摸牌" :
        slot.gang_cursor ? "下一张杠后补牌" : `${seatNames[seat]}墙 第 ${column + 1} 墩`;
      return tile(type, position(side, (column - 8) * (vertical ? 19 : 23), vertical ? 312 : 183, {
        z: layer && bottom?.present ? 16.4 : 5.3, w: vertical ? 17.7 : 21.6, h: 30, depth:10.6,
        classes:classes + mark, label, key:wallKey({side:seat, column, layer:layer ? 0 : 1}),
        extra:` data-wall-seat="${seat}" data-wall-column="${column}" data-wall-layer="${name}"`
      }));
    }).join("")).join("");
  }

  function hand(table, seat, side) {
    const p = table.players[seat];
    const tiles = Array.isArray(p.concealed_tiles) ? [...p.concealed_tiles].sort((a,b) => {
      return (a.id === p.last_drawn_tile) - (b.id === p.last_drawn_tile) || a.type - b.type || a.id - b.id;
    }) : Array.from({length:p.concealed_count}, () => ({}));
    const vertical = side === "east" || side === "west";
    const step = vertical ? 21 : 27;
    const playable = new Set((table.legal_actions?.[seat] || []).flatMap(action => action.tile_ids));
    return tiles.map(({id, type}, i) => {
      const last = i === tiles.length - 1;
      const drawn = id != null && p.last_drawn_tile === id;
      // The crest is on the underside of the ceramic tile. A standing far
      // hand is seen from behind, while local practice shows its visible faces.
      const pitch = type == null || side === "south" ? -74 : -17;
      return tile(type, position(side, (i - (tiles.length - 1) / 2) * step + (drawn ? 8 : 0), vertical ? 369 : 236, {
        z: pitch === -74 ? 19 : 10, w:step - 2, h:vertical ? 29 : 36, depth:11,
        pitch, classes:`scene-hand${type != null && type === table.gold_tile_type ? " gold" : ""}${drawn ? " scene-drawn" : ""}`,
        key:id == null ? `closed-${seat}-${i}` : `hand-${seat}-${id}`,
        extra:(last ? ` data-last-hand="${seat}"` : "") +
          (id != null && playable.has(id) ? ` data-scene-tile="${id}" data-scene-seat="${seat}"` : "")
      }));
    }).join("");
  }

  function river(table, seat, side) {
    const discards = table.discards.map((discard, index) => ({...discard, index}))
      .filter(d => d.seat === seat && !d.claimed);
    const vertical = side === "east" || side === "west";
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
    const vertical = side === "east" || side === "west";
    const near = vertical ? 344 : 215;
    const cells = p.melds.flatMap((m, i) => [
      ...meldOrder(seat, m).map((t, j) => ({...t, key:`meld-${seat}-${i}-${j}`, classes:"scene-meld"})),
      {gap:true}
    ]);
    p.shelf_tiles.forEach((type, i) => cells.push({type, key:`shelf-${seat}-${i}`, classes:"scene-shelf"}));
    p.picked_orphans?.forEach((type, i) => cells.push({type, key:`orphan-${seat}-${i}`, classes:"scene-orphan"}));
    if (p.ting_tile) cells.push({type:p.ting_tile.type, key:`ting-${seat}`, classes:"scene-ting"});
    let offset = 0;
    let row = 0;
    const rowLimit = vertical ? 406 : 490;
    return cells.map(({type, sideways, stacked, classes, key, gap}) => {
      if (gap) {
        offset += 7;
        return "";
      }
      const span = sideways ? 26 : 19;
      if (!stacked && offset + span > rowLimit) {
        offset = 0;
        row += 1;
      }
      const across = (vertical ? 203 : 245) - offset + (stacked ? span / 2 : -span / 2);
      if (!stacked) offset += span;
      return tile(type, position(side, across, near - row * 25, {
        w:18, h:25, depth:8, z:stacked ? 12.5 : 4, angle:sideways ? 90 : 0, key,
        classes:`${classes}${sideways ? " scene-claimed" : ""}${type != null && type === table.gold_tile_type ? " gold" : ""}`
      }));
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
      const [x, y] = point(side, 0, side === "east" || side === "west" ? 416 : 260);
      return `<div class="scene-tag" style="--tag-x:${x}px;--tag-y:${y}px" aria-hidden="true">${seatNames[seat]}</div>`;
    }).join("");
    return `<div class="wall-stage" aria-label="立体麻将桌">
      <div class="scene-world"><div class="scene-camera"><div class="scene-plane">
        ${frameMarkup}${markers}${board}${center(table)}
      </div></div><canvas class="scene-sprites" aria-hidden="true"></canvas></div>
      ${empty ? '<p class="scene-deal">等待庄家掷骰</p>' : ""}
    </div>`;
  }

  function fit(shell) {
    const stage = shell.querySelector(".wall-stage");
    if (!stage?.clientWidth) return;
    shell.style.setProperty("--scene-scale", stage.clientWidth / width);
    shell.style.setProperty("--stage-height", `${stage.clientHeight}px`);
  }

  function mount(shell) {
    fit(shell);
    MahjongMesh.mount(shell);
    if (observedShell === shell) return;
    observedShell = shell;
    if (typeof ResizeObserver === "function") {
      observer = new ResizeObserver(() => {
        fit(shell);
        cancelFlights();
        MahjongMesh.invalidate();
      });
      observer.observe(shell.querySelector("#center"), {box:"border-box"});
    }
  }

  function setPerspective(shell) {
    overhead = !overhead;
    shell.classList.toggle("overhead-view", overhead);
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
    for (const node of document.querySelectorAll(".wall-stage [data-motion], .result-box .winning-tile .tile")) {
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
    if (kind === "TILE_DRAWN" && label !== "") {
      proxy.firstChild.animate([
        {transform:"rotateX(18deg) rotateY(180deg)"},
        {transform:"rotateX(18deg) rotateY(180deg)", offset:.48},
        {transform:"rotateX(18deg)"}
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

  function omittedHandTile(before, previous, next, seat, type) {
    const remaining = new Set(next.players[seat].concealed_tiles?.map(tile => tile.id));
    const lost = previous.players[seat].concealed_tiles?.find(tile =>
      (type == null || tile.type === type) && !remaining.has(tile.id));
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
    let delay = 0;
    for (const {type, player:seat, payload:p} of events) {
      const rows = next.players[seat];
      switch (type) {
        case "TILE_DRAWN":
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
          meldOrder(seat, meld).forEach(({type:face, sideways, stacked}, column) => {
            if (p.kind === "BU_GANG" && !stacked) return;
            const from = sideways && p.kind !== "BU_GANG" ? claimFrom(meld.source) :
              omittedHandTile(before, previous, next, seat, face);
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
