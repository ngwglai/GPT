/* Batch stationary tile faces onto a single layer. The CSS camera uses the
   same units and perspective. Moving tiles, dice and controls retain CSS 3D. */
const MahjongMesh = (() => {
  const radians = degrees => degrees * Math.PI / 180;
  const images = new Map();
  const available = typeof Path2D === "function" && Boolean(document.createElement("canvas").getContext("2d"));
  const crest = "/assets/table/textures/celadon.webp";
  const faces = [
    ["under", [4,7,6,5]], ["top", [0,1,2,3]], ["near", [3,2,6,7]],
    ["far", [1,0,4,5]], ["left", [0,3,7,4]], ["right", [2,1,5,6]]
  ];
  const vertices = [[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1]];
  const edgeColors = {near:"#b9aa8c", far:"#d5c9ab", left:"#d0c2a2", right:"#b1a186"};
  let pending = false;
  let shell;

  function invalidate() {
    if (pending || !shell) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      paint();
    });
  }

  function texture(path) {
    if (!path) return null;
    if (!images.has(path)) {
      const image = new Image();
      image.onload = invalidate;
      image.src = path;
      images.set(path, image);
    }
    const image = images.get(path);
    return image.complete && image.naturalWidth ? image : null;
  }

  function project(node, {cos, sin, perspective, originX, originY, feltZ}) {
    const css = node.style;
    const number = name => Number.parseFloat(css.getPropertyValue(name));
    const x = number("--x"), y = number("--y"), z = number("--z") + feltZ;
    const w = number("--w") / 2, h = number("--h") / 2, d = number("--d") / 2;
    const yaw = radians(number("--yaw"));
    const pitch = radians(number("--pitch"));
    const ca = Math.cos(yaw), sa = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return vertices.map(([vx, vy, vz]) => {
      const py = vy * h * cp - vz * d * sp;
      const pz = z + vy * h * sp + vz * d * cp;
      const sx = x + vx * w * ca - py * sa;
      const sy = y + vx * w * sa + py * ca;
      const depth = sy * sin + pz * cos;
      const scale = perspective / (perspective - depth);
      return [originX + sx * scale, originY + (sy * cos - pz * sin) * scale, depth];
    });
  }

  function quadPath(points, round = .10) {
    const path = new Path2D();
    points.forEach(([x,y], i) => {
      const [px,py] = points[(i + 3) % 4];
      const [nx,ny] = points[(i + 1) % 4];
      const start = [x + (px - x) * round, y + (py - y) * round];
      if (i) path.lineTo(...start);
      else path.moveTo(...start);
      path.quadraticCurveTo(x, y, x + (nx - x) * round, y + (ny - y) * round);
    });
    path.closePath();
    return path;
  }

  function drawSurface(ctx, {face, points, node}) {
    const top = face === "top";
    const label = node.dataset.tileFace;
    const back = face === "under" || (top && label === "");
    const gold = node.classList.contains("gold");
    const path = quadPath(points, top || back ? .13 : .03);
    const [first, second, , fourth] = points;
    if (top && !back) {
      const shade = ctx.createLinearGradient(first[0], first[1], fourth[0], fourth[1]);
      shade.addColorStop(0, gold ? "#fff5cc" : "#fffaf0");
      shade.addColorStop(1, gold ? "#e8bc5c" : "#e9dbbd");
      ctx.fillStyle = shade;
    } else {
      ctx.fillStyle = back ? "#31573e" : edgeColors[face];
    }
    ctx.fill(path);

    if (top || back) {
      const image = texture(back ? crest : asset("tiles", label));
      ctx.save();
      ctx.clip(path);
      ctx.transform(second[0] - first[0], second[1] - first[1],
        fourth[0] - first[0], fourth[1] - first[1], first[0], first[1]);
      if (image) {
        const padding = back ? 0 : .055;
        ctx.drawImage(image, padding, padding, 1 - padding * 2, 1 - padding * 2);
      } else if (!back) {
        ctx.scale(.01, .01);
        ctx.fillStyle = "#2b4233";
        ctx.font = "bold 32px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(tileName(Number(label)), 50, 61, 85);
      }
      ctx.restore();
    }
    if (!top && !back) {
      const [a,b,c,d] = points;
      const band = new Path2D();
      band.moveTo(c[0], c[1]);
      band.lineTo(d[0], d[1]);
      band.lineTo(d[0] + (a[0] - d[0]) * .23, d[1] + (a[1] - d[1]) * .23);
      band.lineTo(c[0] + (b[0] - c[0]) * .23, c[1] + (b[1] - c[1]) * .23);
      band.closePath();
      ctx.fillStyle = "#355a48";
      ctx.fill(band);
    }
    ctx.strokeStyle = "#f0dfbc52";
    ctx.lineWidth = .65;
    if (top && node.matches(".normal-cursor, .scene-selected, .recent, .indicator, .gang-cursor")) {
      ctx.strokeStyle = node.matches(".normal-cursor, .recent") ? "#9de5cb" : "#e7c17e";
      ctx.lineWidth = 1.45;
    }
    ctx.stroke(path);
  }

  function paint() {
    const world = shell.querySelector(".scene-world");
    const canvas = world?.querySelector("canvas");
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const stage = world.parentElement;
    const canvasWidth = world.clientWidth;
    const canvasHeight = world.clientHeight;
    if (!stage.clientWidth || !canvasWidth || !canvasHeight) return;
    const resolution = Math.min(1.55, Math.max(.5, stage.clientWidth * window.devicePixelRatio / canvasWidth));
    const pixelWidth = Math.round(canvasWidth * resolution);
    const pixelHeight = Math.round(canvasHeight * resolution);
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    ctx.setTransform(resolution, 0, 0, resolution, 0, 0);
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    const sceneStyle = getComputedStyle(stage);
    const cameraStyle = getComputedStyle(world.querySelector(".scene-camera"));
    const tilt = radians(Number.parseFloat(sceneStyle.getPropertyValue("--camera-tilt")));
    const [originX, originY] = cameraStyle.perspectiveOrigin.split(" ").map(Number.parseFloat);
    const camera = {originX, originY, cos:Math.cos(tilt), sin:Math.sin(tilt),
      perspective:Number.parseFloat(cameraStyle.perspective),
      feltZ:Number.parseFloat(sceneStyle.getPropertyValue("--tile-base-z"))};
    if (!Object.values(camera).every(Number.isFinite)) return;
    const queue = [];
    for (const node of world.querySelectorAll(".scene-tile:not(.scene-die):not(.receiving-tile)")) {
      const corners = project(node, camera);
      for (const [face, indices] of faces) {
        const points = indices.map(i => corners[i]);
        const [[x0,y0],[x1,y1],[x2,y2]] = points;
        if ((x1 - x0) * (y2 - y0) <= (y1 - y0) * (x2 - x0)) continue;
        const depth = points.reduce((sum, p) => sum + p[2], 0);
        queue.push({face, points, node, depth});
      }
    }
    queue.sort((a,b) => a.depth - b.depth);
    queue.forEach(surface => drawSurface(ctx, surface));
  }

  function mount(element) {
    // Preserve the full CSS 3D renderer when the browser has no canvas APIs.
    if (!available) return;
    shell = element;
    invalidate();
  }

  return {available, mount, invalidate};
})();
