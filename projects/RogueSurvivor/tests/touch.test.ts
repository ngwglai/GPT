import { describe, it, expect } from "vitest";
import {
  TouchState,
  touchAim,
  canvasPoint,
  clampAim,
  touchVisible,
} from "../src/input/touchState";
import { createRun } from "../src/core/create";
import { World } from "../src/core/world";
import { spawn } from "../src/core/director";

describe("触屏输入与共享战斗规则", () => {
  it("摇杆死区、360度斜向与半径限制，不允许第二指抢占", () => {
    const t = new TouchState();
    expect(t.begin(7)).toBe(true);
    expect(t.begin(9)).toBe(false);
    t.move(7, 2, 2, 40);
    expect(t.vector).toEqual({ x: 0, y: 0 });
    t.move(9, 100, 0, 40);
    expect(t.vector.x).toBe(0);
    t.move(7, 100, -100, 40);
    expect(Math.hypot(t.knob.x, t.knob.y)).toBeCloseTo(40);
    expect(t.vector.x).toBeCloseTo(Math.SQRT1_2);
    expect(t.vector.y).toBeCloseTo(-Math.SQRT1_2);
    expect(t.end(9)).toBe(false);
    expect(t.vector.x).toBeGreaterThan(0);
    expect(t.end(7)).toBe(true);
    expect(t.vector).toEqual({ x: 0, y: 0 });
  });
  it("触摸取消/弹窗复位同时清理移动、待发技能、闪避和落点", () => {
    const t = new TouchState();
    t.begin(1);
    t.move(1, 30, 0, 40);
    t.skills.set(0, true);
    t.dash = true;
    t.target = { x: 1, y: 2 };
    t.reset();
    expect(t.pointer).toBeNull();
    expect(t.vector.x).toBe(0);
    expect(t.skills.size).toBe(0);
    expect(t.dash).toBe(false);
    expect(t.target).toBeUndefined();
  });
  it("触屏轻推、满推、斜推与键盘移动距离相同，不改变速度", () => {
    const distance = (x: number, y: number) => {
      const w = new World(createRun("standard", "ranger", 17));
      w.s.rocks = [];
      for (let i = 0; i < 12; i++)
        w.step(1 / 60, { x, y, aim: { x: 1800, y: 1800 } });
      return Math.hypot(w.s.player.x - 1800, w.s.player.y - 1800);
    };
    const t = new TouchState();
    t.begin(1);
    t.move(1, 10, 0, 40);
    const expected = distance(1, 0);
    expect(distance(t.vector.x, t.vector.y)).toBeCloseTo(expected);
    t.move(1, 500, 500, 40);
    expect(distance(t.vector.x, t.vector.y)).toBeCloseTo(expected);
    expect(distance(0, 0)).toBe(0);
  });
  it("CSS显示尺寸与游戏逻辑尺寸独立映射，落点限于原有450射程", () => {
    const p = { x: 1800, y: 1800 };
    expect(
      canvasPoint(
        { x: 210, y: 120 },
        { left: 10, top: 20, width: 400, height: 200 },
        { x: 800, y: 400 },
        p,
      ),
    ).toEqual(p);
    expect(
      canvasPoint(
        { x: 310, y: 120 },
        { left: 10, top: 20, width: 400, height: 200 },
        { x: 800, y: 400 },
        p,
      ),
    ).toEqual({ x: 2000, y: 1800 });
    expect(clampAim(p, { x: 10000, y: 1800 })).toEqual({ x: 2250, y: 1800 });
  });
  it("六种主动技能保留自身、方向、区域区别；有效敌人自动瞄准", () => {
    const w = new World(createRun("standard", "ranger", 17));
    w.s.rocks = [];
    const p = w.s.player,
      point = { x: p.x + 100, y: p.y + 80 };
    for (const id of ["ice", "ward", "bloom"] as const)
      expect(touchAim(w.s, id, point)).toEqual({ x: p.x, y: p.y });
    for (const id of ["fire", "storm", "lance"] as const)
      expect(touchAim(w.s, id, point)).toEqual(point);
    const enemy = spawn(w, "crawler", { x: p.x + 140, y: p.y + 40 })!;
    expect(touchAim(w.s, "fire")).toEqual({ x: enemy.x, y: enemy.y });
    expect(touchAim(w.s, "lance")).toEqual({ x: enemy.x, y: enemy.y });
    enemy.hp = 0;
    expect(touchAim(w.s, "fire")).toEqual({ x: p.x, y: p.y });
    expect(touchAim(w.s, "lance", undefined, { x: 0, y: -1 })).toEqual({
      x: p.x,
      y: p.y - 240,
    });
  });
  it("自动瞄准不会选择射程外或障碍物背后的敌人", () => {
    const w = new World(createRun("standard", "ranger", 17));
    w.s.rocks = [];
    spawn(w, "crawler", { x: 1900, y: 1800 });
    spawn(w, "crawler", { x: 2400, y: 1800 });
    w.s.rocks = [{ x: 1850, y: 1800, r: 20 }];
    expect(touchAim(w.s, "fire")).toEqual({ x: 1800, y: 1800 });
  });
  it("能力检测支持触屏混合设备及手动覆盖，不读取UA", () => {
    expect(touchVisible("auto", false, 0)).toBe(false);
    expect(touchVisible("auto", true, 0)).toBe(true);
    expect(touchVisible("auto", false, 5)).toBe(true);
    expect(touchVisible("off", true, 5)).toBe(false);
    expect(touchVisible("on", false, 0)).toBe(true);
  });
});
