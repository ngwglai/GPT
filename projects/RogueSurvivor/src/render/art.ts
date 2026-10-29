import { ENEMIES, SKILLS, WEAPONS } from "../data/content";
import type { EnemyId, SkillId, WeaponId } from "../core/types";
export function defaultArt(id: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const c = canvas.getContext("2d")!;
  c.lineCap = "round";
  c.lineJoin = "round";
  const circle = (
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke = "#172b32",
    width = 4,
  ) => {
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = fill;
    c.fill();
    if (width) {
      c.strokeStyle = stroke;
      c.lineWidth = width;
      c.stroke();
    }
  };
  const poly = (
    points: number[],
    fill: string,
    stroke = "#172b32",
    width = 4,
  ) => {
    c.beginPath();
    points.forEach((n, i) => {
      if (i % 2 === 0)
        (i === 0 ? c.moveTo : c.lineTo).call(c, n, points[i + 1]);
    });
    c.closePath();
    c.fillStyle = fill;
    c.fill();
    c.strokeStyle = stroke;
    c.lineWidth = width;
    c.stroke();
  };
  const line = (points: number[], color: string, width = 5) => {
    c.beginPath();
    points.forEach((n, i) => {
      if (i % 2 === 0)
        (i === 0 ? c.moveTo : c.lineTo).call(c, n, points[i + 1]);
    });
    c.strokeStyle = color;
    c.lineWidth = width;
    c.stroke();
  };
  const hex = (n: number) => "#" + n.toString(16).padStart(6, "0");
  if (id.startsWith("player.")) {
    const color = id.endsWith("knight")
      ? "#eda66a"
      : id.endsWith("mage")
        ? "#b49ce0"
        : "#8ad8b7";
    c.fillStyle = "#050f1888";
    c.beginPath();
    c.ellipse(64, 110, 32, 9, 0, 0, 7);
    c.fill();
    line([48, 90, 45, 109], "#293b45", 15);
    line([78, 90, 83, 109], "#293b45", 15);
    poly([40, 52, 86, 52, 102, 96, 64, 86, 29, 98], color);
    poly([47, 52, 78, 52, 83, 91, 45, 91], "#315463");
    line([46, 67, 32, 84], "#e6c2a0", 12);
    line([81, 65, 97, 79], "#e6c2a0", 12);
    circle(64, 39, 25, color);
    poly([42, 40, 47, 23, 78, 22, 87, 42, 76, 37, 71, 27, 59, 42], "#274d4c");
    c.fillStyle = "#f5d9b1";
    c.fillRect(48, 38, 33, 19);
    circle(56, 44, 2.5, "#183039", "#183039", 0);
    circle(73, 44, 2.5, "#183039", "#183039", 0);
    line([61, 54, 67, 54], "#9a745c", 2);
    poly([80, 18, 90, 4, 87, 33], "#e9e4ba", "#172b32", 2);
    circle(64, 71, 7, "#f4cd76");
    line([100, 43, 108, 98], "#c89764", 5);
    line([100, 43, 115, 70, 108, 98], "#f3d28d", 4);
    line([100, 43, 108, 98], "#e0ebd8", 1);
  } else if (id.startsWith("enemy.")) {
    const kind = id.slice(6) as EnemyId,
      d = ENEMIES[kind],
      color = hex(d.color);
    c.fillStyle = "#050f1855";
    c.beginPath();
    c.ellipse(64, 110, 38, 9, 0, 0, 7);
    c.fill();
    if (d.boss) {
      poly([36, 48, 21, 30, 26, 9, 45, 35, 52, 47], color);
      poly([78, 45, 90, 18, 105, 8, 105, 32, 94, 54], color);
      line([43, 91, 34, 109], "#486359", 15);
      line([80, 92, 94, 109], "#486359", 15);
      poly([37, 39, 87, 39, 106, 94, 81, 113, 39, 106, 23, 79], color);
      poly([48, 38, 65, 23, 82, 39, 77, 70, 51, 70], "#355450");
      circle(64, 86, 14, "#f5d78e");
    } else if (kind === "runner") {
      poly(
        [26, 55, 17, 16, 49, 37, 77, 36, 111, 16, 103, 68, 83, 103, 39, 102],
        color,
      );
      poly([40, 76, 63, 62, 88, 78, 65, 98], "#f2dab4");
      circle(65, 77, 7, "#243643");
    } else if (kind === "guard") {
      poly([35, 29, 77, 18, 105, 51, 100, 90, 72, 110, 28, 98, 18, 60], color);
      line([33, 43, 56, 30, 82, 47, 89, 73], "#b7d2d9", 8);
    } else {
      circle(64, 77, 33, kind === "bomber" ? "#ffd693" : "#e2d6b1");
      c.beginPath();
      c.ellipse(64, 51, 46, 33, 0, Math.PI, Math.PI * 2);
      c.lineTo(110, 60);
      c.quadraticCurveTo(64, 79, 18, 60);
      c.closePath();
      c.fillStyle = color;
      c.fill();
      c.strokeStyle = "#172b32";
      c.lineWidth = 4;
      c.stroke();
      circle(43, 40, 8, "#e6f2da", "#e6f2da", 0);
      circle(79, 34, 6, "#e6f2da", "#e6f2da", 0);
      if (kind === "seer" || kind === "shaman")
        line([106, 48, 105, 108], "#b88c6b", 7);
      if (kind === "bomber") poly([53, 20, 65, 3, 71, 22], "#fff3b7");
    }
    circle(49, 73, 6, "#172b32", "#172b32", 0);
    circle(78, 73, 6, "#172b32", "#172b32", 0);
    circle(50, 71, 2, "#fff", "#fff", 0);
    circle(79, 71, 2, "#fff", "#fff", 0);
    line([59, 86, 66, 90, 72, 86], "#274047", 3);
  } else if (id === "map.rock") {
    poly(
      [26, 50, 55, 29, 91, 39, 113, 79, 87, 104, 37, 101, 14, 77],
      "#345451",
    );
    poly([26, 50, 55, 29, 91, 39, 69, 67], "#52786a");
    line([35, 91, 47, 78, 75, 79], "#7da681", 5);
    circle(84, 56, 8, "#95b191", "#95b191", 0);
  } else if (id === "map.ground") {
    c.fillStyle = "#18342e";
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 25; i++)
      circle((i * 71) % 128, (i * 37) % 128, 1, "#51715b", "#51715b", 0);
  } else if (id === "map.flower") {
    line([62, 108, 66, 66, 45, 87], "#407967", 6);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      circle(
        65 + Math.cos(a) * 14,
        48 + Math.sin(a) * 14,
        12,
        "#7bc8ad",
        "#33594e",
        2,
      );
    }
    circle(65, 48, 8, "#f4dda0", "#f4dda0", 0);
  } else if (id === "ui.panel") {
    c.fillStyle = "#152c32";
    c.fillRect(0, 0, 128, 128);
    line([0, 3, 128, 3], "#82ac91", 3);
  } else if (id === "ui.gem") {
    poly([64, 13, 95, 63, 64, 116, 33, 63], "#85e3bf");
    poly([64, 13, 64, 70, 33, 63], "#d8ffe6", "#b5f7d5", 1);
  } else if (id.startsWith("weapon.")) {
    const key = id.slice(7) as WeaponId,
      col = hex(WEAPONS[key].color);
    circle(64, 64, 49, "#18353e", "#54766b", 3);
    if (key === "bow") {
      line([38, 24, 85, 65, 38, 105], col, 9);
      line([38, 24, 38, 105], "#e4e1c4", 2);
      line([22, 65, 102, 65], "#e4e1c4", 5);
      poly([102, 65, 88, 56, 88, 74], col);
    } else if (key === "blade") {
      poly([34, 94, 41, 72, 92, 23, 100, 29, 70, 88, 48, 96], col);
      line([28, 80, 51, 106], "#b98e66", 7);
    } else if (key === "orbit") {
      c.strokeStyle = col;
      c.lineWidth = 7;
      c.beginPath();
      c.ellipse(64, 64, 37, 22, -0.6, 0, 7);
      c.stroke();
      circle(89, 42, 12, col);
      circle(40, 83, 8, col);
    } else {
      line([38, 96, 83, 35], "#b99b75", 7);
      poly([83, 20, 99, 41, 79, 62, 66, 41], col);
      circle(47, 30, 5, col);
    }
  } else {
    const key = id.split(".")[1] as SkillId;
    const col = id.startsWith("skill.")
      ? hex(SKILLS[key].color)
      : id.endsWith("enemy")
        ? "#f39898"
        : hex(WEAPONS[key as unknown as WeaponId]?.color || 0xa7e9d1);
    circle(64, 64, 45, col + "33", col, 3);
    if (key === "ice") {
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        line([64, 64, 64 + Math.cos(a) * 35, 64 + Math.sin(a) * 35], col, 5);
      }
    } else if (key === "ward") {
      poly([64, 26, 94, 40, 88, 77, 64, 101, 40, 77, 34, 40], col);
      poly([64, 38, 80, 45, 76, 73, 64, 86, 52, 73, 48, 45], "#31594e");
    } else if (key === "bloom") {
      line([64, 35, 64, 93], col, 15);
      line([35, 64, 93, 64], col, 15);
    } else {
      poly([68, 22, 43, 66, 62, 66, 56, 104, 87, 54, 67, 54], col, col, 2);
    }
  }
  return canvas;
}
