// Pixel UI kit (PLAN.md Phase 1). Hard-cornered panels with a chunky frame
// and a corner-notch bevel — never roundRect. One typeface for the whole
// game: Pixelify Sans (bundled OFL asset in public/fonts/), with a baked
// BitmapFont ("PixelifyHot") for text that updates every second or faster.

import { BitmapFont, Container, Graphics, type FederatedPointerEvent } from "pixi.js";

export const FONT = "Pixelify Sans";
/**
 * BitmapFont family for hot text (HUD numbers, popups, basket labels).
 * Baked from VT323 rather than Pixelify: Pixelify's 6/8/9 are ambiguous at
 * chip sizes, and numbers are what hot text mostly shows (Dan, 2026-07-04).
 */
export const HOT_FONT = "PixelHot";

/**
 * Load the bundled fonts and bake the hot BitmapFont. Must complete before
 * any Text is created, so boot awaits it right after app.init().
 */
export async function loadPixelFont(): Promise<void> {
  const pixelify = new FontFace(FONT, "url(/fonts/PixelifySans.ttf)", { weight: "400 700" });
  const vt323 = new FontFace("VT323", "url(/fonts/VT323.ttf)");
  await Promise.all([pixelify.load(), vt323.load()]);
  document.fonts.add(pixelify);
  document.fonts.add(vt323);
  BitmapFont.install({
    name: HOT_FONT,
    style: {
      fontFamily: "VT323",
      fontSize: 40, // VT323 is condensed; bake large for crisp downscales
      fill: 0xffffff, // white glyphs — tint per instance; stroke stays black
      stroke: { color: "#000", width: 4 },
    },
    chars: [[" ", "~"], "×’→"],
    resolution: 2,
  });
}

export interface PanelOpts {
  face: number;
  frame: number;
  faceAlpha?: number;
  frameWidth?: number;
  notch?: number;
}

/**
 * Draw a pixel panel into `g`: notched chunky frame + flat face. The notch
 * leaves the corner pixels transparent — the retro bevel.
 */
export function pixelPanel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: PanelOpts,
): void {
  const fw = opts.frameWidth ?? 3;
  const n = opts.notch ?? 2;
  g.rect(x + n, y, w - 2 * n, fw)
    .rect(x + n, y + h - fw, w - 2 * n, fw)
    .rect(x, y + n, fw, h - 2 * n)
    .rect(x + w - fw, y + n, fw, h - 2 * n)
    .fill(opts.frame);
  g.rect(x + fw, y + fw, w - 2 * fw, h - 2 * fw).fill({
    color: opts.face,
    alpha: opts.faceAlpha ?? 1,
  });
}

export interface TapOpts {
  onTap(): void;
  onPress?(down: boolean): void;
  /** Movement past this many px cancels the tap (matches the tree's feel). */
  threshold?: number;
}

/**
 * Shared press/tap behaviour: press visual on pointerdown, tap fires on
 * pointerup unless the pointer wandered. Stops propagation so buttons never
 * leak into the sweep-collection stage handlers.
 */
export function attachTap(target: Container, opts: TapOpts): void {
  const threshold = opts.threshold ?? 12;
  let activeId: number | null = null;
  let sx = 0;
  let sy = 0;
  let cancelled = false;
  target.eventMode = "static";
  target.on("pointerdown", (ev: FederatedPointerEvent) => {
    ev.stopPropagation();
    activeId = ev.pointerId;
    sx = ev.global.x;
    sy = ev.global.y;
    cancelled = false;
    opts.onPress?.(true);
  });
  target.on("globalpointermove", (ev: FederatedPointerEvent) => {
    if (ev.pointerId !== activeId || cancelled) return;
    if (Math.abs(ev.global.x - sx) > threshold || Math.abs(ev.global.y - sy) > threshold) {
      cancelled = true;
      opts.onPress?.(false);
    }
  });
  const end = (ev: FederatedPointerEvent, fire: boolean): void => {
    if (ev.pointerId !== activeId) return;
    ev.stopPropagation();
    activeId = null;
    opts.onPress?.(false);
    if (fire && !cancelled) opts.onTap();
  };
  target.on("pointerup", (ev) => end(ev, true));
  target.on("pointerupoutside", (ev) => end(ev, false));
  target.on("pointercancel", (ev) => end(ev, false));
}

export interface PixelButton {
  root: Container;
  setDisabled(d: boolean): void;
  /** Redraw with a new width (labels change size). */
  resize(w: number, h: number): void;
}

export interface ButtonOpts {
  w: number;
  h: number;
  face: number;
  frame?: number;
  content: Container;
  onTap(): void;
}

const darken = (c: number, f: number): number => {
  const r = Math.floor(((c >> 16) & 0xff) * f);
  const g = Math.floor(((c >> 8) & 0xff) * f);
  const b = Math.floor((c & 0xff) * f);
  return (r << 16) | (g << 8) | b;
};

/**
 * Pixel button: notched panel + centred content. Pressed = face darkens and
 * the content shifts down 2px (the old DOM button feel). Disabled = grey
 * face, dimmed content.
 */
export function pixelButton(opts: ButtonOpts): PixelButton {
  const root = new Container();
  const gfx = new Graphics();
  root.addChild(gfx, opts.content);
  let w = opts.w;
  let h = opts.h;
  let pressed = false;
  let disabled = false;

  const draw = (): void => {
    gfx.clear();
    const face = disabled ? 0x4a4a4a : pressed ? darken(opts.face, 0.72) : opts.face;
    pixelPanel(gfx, 0, 0, w, h, { face, frame: opts.frame ?? 0x0d120d });
    opts.content.position.set(Math.round(w / 2), Math.round(h / 2) + (pressed ? 2 : 0));
    opts.content.alpha = disabled ? 0.5 : 1;
  };

  attachTap(root, {
    onTap: () => {
      if (!disabled) opts.onTap();
    },
    onPress: (down) => {
      pressed = down && !disabled;
      draw();
    },
  });

  draw();
  return {
    root,
    setDisabled(d: boolean): void {
      if (disabled === d) return;
      disabled = d;
      draw();
    },
    resize(nw: number, nh: number): void {
      w = nw;
      h = nh;
      draw();
    },
  };
}

export interface SafeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;

/**
 * env(safe-area-inset-*) isn't visible from canvas — read it live from a
 * hidden DOM probe (PLAN Phase 1). Call on every layout; rotation changes it.
 */
export function safeInsets(): SafeInsets {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) " +
      "env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  const px = (v: string): number => Number.parseFloat(v) || 0;
  return {
    top: px(cs.paddingTop),
    right: px(cs.paddingRight),
    bottom: px(cs.paddingBottom),
    left: px(cs.paddingLeft),
  };
}
