import { CHARACTERS, ENEMIES, SKILLS, WEAPONS } from "../data/content";
import { read, write } from "./storage";
export const ASSET_IDS = [
  ...CHARACTERS.map((c) => ({
    id: `player.${c.id}`,
    name: c.name,
    group: "角色",
  })),
  ...Object.entries(ENEMIES).map(([id, e]) => ({
    id: `enemy.${id}`,
    name: e.name,
    group: e.boss ? "首领" : "敌人",
  })),
  ...Object.entries(WEAPONS).flatMap(([id, w]) => [
    { id: `weapon.${id}`, name: w.name, group: "武器" },
    { id: `projectile.${id}`, name: w.name + "弹道", group: "投射物" },
  ]),
  ...Object.entries(SKILLS).map(([id, s]) => ({
    id: `skill.${id}`,
    name: s.name,
    group: "技能",
  })),
  { id: "projectile.enemy", name: "敌方弹幕", group: "投射物" },
  { id: "map.rock", name: "星岩", group: "地图" },
  { id: "map.flower", name: "荧光花", group: "地图" },
  { id: "map.ground", name: "地表", group: "地图" },
  { id: "ui.gem", name: "经验星晶", group: "界面" },
  { id: "ui.panel", name: "面板背景", group: "界面" },
];
export interface Asset {
  data: string;
  scale: number;
  x: number;
  y: number;
  frameWidth?: number;
  frameHeight?: number;
  frames?: number;
  fps?: number;
}
export type AssetPack = { version: 1; assets: Record<string, Asset> };
export const assetPack: AssetPack = { version: 1, assets: {} };
export function validateMeta(a: Asset) {
  if (
    !a ||
    typeof a.data !== "string" ||
    a.data.length > 2_800_000 ||
    !/^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.data) ||
    !Number.isFinite(a.scale) ||
    a.scale < 0.1 ||
    a.scale > 4 ||
    !Number.isFinite(a.x) ||
    Math.abs(a.x) > 128 ||
    !Number.isFinite(a.y) ||
    Math.abs(a.y) > 128
  )
    throw new Error("图片配置无效：仅支持 PNG/WebP，缩放 0.1–4，偏移 ±128。");
  if (
    a.frames !== undefined &&
    (!Number.isInteger(a.frames) ||
      a.frames < 1 ||
      a.frames > 64 ||
      !Number.isInteger(a.frameWidth) ||
      a.frameWidth! < 1 ||
      !Number.isInteger(a.frameHeight) ||
      a.frameHeight! < 1 ||
      !Number.isFinite(a.fps) ||
      a.fps! < 1 ||
      a.fps! > 30)
  )
    throw new Error("动画配置无效：最多 64 帧，帧率 1–30。");
}
export function decodeImage(data: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (
        image.width < 1 ||
        image.height < 1 ||
        image.width > 2048 ||
        image.height > 2048
      ) {
        reject(new Error("图片尺寸必须在 1–2048 像素之间。"));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("图片解码失败，已保留默认资源。"));
    image.src = data;
  });
}
export async function validateAsset(a: Asset) {
  validateMeta(a);
  const signature = atob(a.data.split(",")[1].slice(0, 24));
  const png = signature.startsWith("\x89PNG\r\n\x1a\n");
  const webp =
    signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP";
  if ((!png && !webp) || (a.data.startsWith("data:image/png") ? !png : !webp))
    throw new Error("图片文件内容与 PNG/WebP 格式不匹配。");
  const img = await decodeImage(a.data);
  if (
    a.frames &&
    (a.frameWidth! > img.width ||
      a.frameHeight! > img.height ||
      Math.floor(img.width / a.frameWidth!) *
        Math.floor(img.height / a.frameHeight!) <
        a.frames)
  )
    throw new Error("精灵图尺寸与帧数不匹配。");
  return img;
}
export async function fromFile(file: File) {
  if (
    !["image/png", "image/webp"].includes(file.type) ||
    file.size > 2 * 1024 * 1024
  )
    throw new Error("请选择不超过 2 MB 的 PNG 或 WebP 图片。");
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("图片读取失败。"));
    r.readAsDataURL(file);
  });
  const a = { data, scale: 1, x: 0, y: 0 };
  await validateAsset(a);
  return a;
}
export async function importPack(text: string) {
  if (text.length > 24 * 1024 * 1024) throw new Error("资源包最大为 24 MB。");
  let pack: unknown;
  try {
    pack = JSON.parse(text);
  } catch {
    throw new Error("资源包不是有效的 JSON 文件。");
  }
  if (
    !pack ||
    typeof pack !== "object" ||
    (pack as AssetPack).version !== 1 ||
    !(pack as AssetPack).assets ||
    typeof (pack as AssetPack).assets !== "object"
  )
    throw new Error("不支持的资源包格式。");
  const assets = (pack as AssetPack).assets;
  if (Object.keys(assets).length > ASSET_IDS.length)
    throw new Error("资源数量超过上限。");
  const safe: Record<string, Asset> = {};
  let pixels = 0;
  for (const [id, a] of Object.entries(assets)) {
    if (!ASSET_IDS.some((e) => e.id === id))
      throw new Error("资源包包含未知资源 ID。");
    const decoded = await validateAsset(a);
    pixels += decoded.width * decoded.height;
    if (pixels > 16 * 1024 * 1024)
      throw new Error("资源包解码尺寸过大，总像素不得超过 1600 万。");
    safe[id] = {
      data: a.data,
      scale: a.scale,
      x: a.x,
      y: a.y,
      ...(a.frames
        ? {
            frames: a.frames,
            frameWidth: a.frameWidth,
            frameHeight: a.frameHeight,
            fps: a.fps,
          }
        : {}),
    };
  }
  return { version: 1 as const, assets: safe };
}
export async function loadAssets() {
  try {
    const p = await read<AssetPack>("assets");
    if (p) {
      const safe = await importPack(JSON.stringify(p));
      assetPack.assets = safe.assets;
    }
  } catch {
    assetPack.assets = {};
    return "自定义资源损坏，已回退到默认美术。";
  }
}
export async function persistAssets(assets: Record<string, Asset>) {
  const next: AssetPack = { version: 1, assets };
  if (JSON.stringify(next).length > 24 * 1024 * 1024)
    throw new Error(
      "资源包总大小不能超过 24 MB，请缩小图片或恢复部分默认资源。",
    );
  const safe = await importPack(JSON.stringify(next));
  await write("assets", safe);
  assetPack.assets = safe.assets;
}
export function download(
  name: string,
  data: string,
  type = "application/json",
) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
