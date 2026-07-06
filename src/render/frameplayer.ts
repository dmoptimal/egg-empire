// Steps a Sprite through Texture frames. Render-side only — the sim never
// knows frames exist. Built for the ?anim=1 lab, reusable by the game once
// drawn strips land. No allocation in update().

import type { Sprite, Texture } from "pixi.js";

export interface FrameAnim {
  frames: Texture[];
  fps: number;
  loop: boolean;
}

export class FramePlayer {
  private anim: FrameAnim | null = null;
  private t = 0;
  private idx = -1;
  private rev = false;
  private onDone: (() => void) | null = null;
  private onFrame: ((i: number) => void) | null = null;

  constructor(private readonly spr: Sprite) {}

  play(
    anim: FrameAnim,
    opts?: { reverse?: boolean; onDone?: () => void; onFrame?: (i: number) => void },
  ): void {
    this.anim = anim;
    this.t = 0;
    this.idx = -1;
    this.rev = opts?.reverse ?? false;
    this.onDone = opts?.onDone ?? null;
    this.onFrame = opts?.onFrame ?? null;
    this.update(0);
  }

  update(dt: number): void {
    const a = this.anim;
    if (!a) return;
    this.t += dt;
    const n = a.frames.length;
    let i = Math.floor(this.t * a.fps);
    let done = false;
    if (a.loop) i %= n;
    else if (i >= n) {
      i = n - 1; // hold the last frame; caller decides what's next
      done = true;
    }
    if (this.rev) i = n - 1 - i;
    if (i !== this.idx) {
      this.idx = i;
      this.spr.texture = a.frames[i];
      this.onFrame?.(i);
    }
    if (done) {
      const cb = this.onDone;
      this.anim = null;
      this.onDone = null;
      cb?.();
    }
  }

  get playing(): boolean {
    return this.anim !== null;
  }
}
