import type { Run, Settings, Vec } from "../core/types";
import { TouchState, canvasPoint, touchAim, touchVisible } from "./touchState";

export class TouchControls {
  readonly state = new TouchState();
  enabled = false;
  private active = false;
  private stick?: HTMLElement;
  private held = new Map<number, HTMLElement>();
  private media = window.matchMedia?.("(any-pointer: coarse)");
  private mode: Settings["touchControls"] = "auto";
  constructor(
    private run: () => Run | undefined,
    private canvas: () => HTMLCanvasElement | undefined,
    private size: () => Vec,
    private unlock: () => void,
  ) {
    document.addEventListener("pointerdown", (e) => this.down(e));
    document.addEventListener("pointermove", (e) => this.move(e), {
      passive: false,
    });
    for (const name of [
      "pointerup",
      "pointercancel",
      "lostpointercapture",
    ] as const)
      document.addEventListener(name, (e) => this.up(e));
    document.addEventListener("click", (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>(
        "[data-skill-slot],[data-dash]",
      );
      if (b && e.detail === 0 && this.active) {
        e.preventDefault();
        this.activate(b, this.enabled);
      }
    });
    window.addEventListener("blur", () => this.reset());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.reset();
    });
    window.addEventListener("resize", () => this.reset());
    window.visualViewport?.addEventListener("resize", () => this.reset());
    const change = () => this.configure(this.mode);
    if (this.media?.addEventListener)
      this.media.addEventListener("change", change);
    else this.media?.addListener?.(change);
  }
  configure(mode: Settings["touchControls"] = "auto") {
    this.mode = mode;
    const enabled = touchVisible(
      mode,
      !!this.media?.matches,
      navigator.maxTouchPoints || 0,
    );
    if (enabled !== this.enabled) this.reset();
    this.enabled = enabled;
    document.documentElement.classList.toggle("touch-controls", enabled);
  }
  setActive(active: boolean) {
    if (!active && this.active) this.reset();
    this.active = active;
    document.documentElement.classList.toggle("touch-input-inactive", !active);
  }
  reset() {
    this.state.reset();
    for (const [id, element] of this.held) {
      element.classList.remove("pressed");
      try {
        if (element.hasPointerCapture(id)) element.releasePointerCapture(id);
      } catch {
        /* Detached controls. */
      }
    }
    this.held.clear();
    const stick = this.stick;
    this.stick = undefined;
    if (stick) {
      stick.style.setProperty("--stick-x", "0px");
      stick.style.setProperty("--stick-y", "0px");
    }
    this.label();
  }
  private label() {
    const el = document.querySelector("[data-clear-aim]");
    if (el)
      el.textContent = this.state.target
        ? "瞄准：定点 · 点击恢复自动"
        : "瞄准：自动 · 轻触战场定点";
  }
  private capture(el: HTMLElement, e: PointerEvent) {
    this.held.set(e.pointerId, el);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* Document listeners retain ownership when capture is unavailable. */
    }
  }
  private down(e: PointerEvent) {
    if (
      !this.active ||
      !this.run() ||
      (e.pointerType === "mouse" && e.button !== 0)
    )
      return;
    const target = e.target as HTMLElement;
    const joystick = target.closest<HTMLElement>("[data-joystick]");
    const button = target.closest<HTMLElement>("[data-skill-slot],[data-dash]");
    if (joystick && this.enabled) {
      e.preventDefault();
      e.stopPropagation();
      if (this.state.begin(e.pointerId)) {
        this.stick = joystick;
        this.capture(joystick, e);
        this.move(e);
        this.unlock();
      }
    } else if (button) {
      e.preventDefault();
      e.stopPropagation();
      if (this.held.has(e.pointerId)) return;
      this.capture(button, e);
      button.classList.add("pressed");
      this.activate(button, e.pointerType !== "mouse");
    } else if (target.closest("[data-clear-aim]")) {
      e.preventDefault();
      this.state.target = undefined;
      this.label();
    } else if (
      this.enabled &&
      e.pointerType !== "mouse" &&
      target === this.canvas()
    ) {
      const canvas = this.canvas()!;
      this.state.target = canvasPoint(
        { x: e.clientX, y: e.clientY },
        canvas.getBoundingClientRect(),
        this.size(),
        this.run()!.player,
      );
      this.label();
      this.unlock();
    }
  }
  private activate(button: HTMLElement, touch: boolean) {
    const run = this.run();
    if (!run || run.phase !== "playing") return;
    this.unlock();
    const slot = button.dataset.skillSlot;
    const unavailable =
      slot === undefined
        ? run.player.dashCd > 0
        : run.player.cooldowns[Number(slot)] > 0;
    button.classList.toggle("unavailable", unavailable);
    if (unavailable) return;
    if (slot === undefined) this.state.dash = true;
    else this.state.skills.set(Number(slot), touch);
  }
  private move(e: PointerEvent) {
    if (e.pointerId !== this.state.pointer || !this.stick || !this.active)
      return;
    e.preventDefault();
    const r = this.stick.getBoundingClientRect();
    this.state.move(
      e.pointerId,
      e.clientX - (r.left + r.width / 2),
      e.clientY - (r.top + r.height / 2),
      Math.min(r.width, r.height) * 0.34,
    );
    this.stick.style.setProperty("--stick-x", `${this.state.knob.x}px`);
    this.stick.style.setProperty("--stick-y", `${this.state.knob.y}px`);
  }
  private up(e: PointerEvent) {
    const el = this.held.get(e.pointerId);
    this.held.delete(e.pointerId);
    if (el && ![...this.held.values()].includes(el))
      el.classList.remove("pressed");
    if (this.state.end(e.pointerId)) {
      this.stick?.style.setProperty("--stick-x", "0px");
      this.stick?.style.setProperty("--stick-y", "0px");
      this.stick = undefined;
    }
  }
  consume(run: Run) {
    const skills = [false, false, false],
      aims: (Vec | undefined)[] = [];
    for (const [slot, touch] of this.state.skills) {
      skills[slot] = true;
      if (touch)
        aims[slot] = touchAim(
          run,
          run.player.skills[slot],
          this.state.target,
          this.state.vector,
        );
    }
    this.state.skills.clear();
    const dash = this.state.dash;
    this.state.dash = false;
    return {
      x: this.state.vector.x,
      y: this.state.vector.y,
      skills,
      skillAims: aims,
      dash,
    };
  }
}
