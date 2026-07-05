// Settings menu (Dan 2026-07-05): a canvas pixel-panel overlay opened from
// the gear chip. Holds the sound toggle (moved in from the old mute chip),
// a playtester Reset with an are-you-sure step, and the credits. The dim
// backdrop swallows every tap below it, so the game can't be played
// through the menu.

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { audioHandles, toggleMute } from "../audio/sfx";
import type { Textures } from "../render/textures";
import { attachTap, FONT, pixelButton, pixelPanel, type PixelButton } from "./kit";

export interface Settings {
  toggle(): void;
  isOpen(): boolean;
  layout(w: number, h: number): void;
}

export interface SettingsDeps {
  layer: Container;
  textures: Textures;
  /** Wipe the save and reload (main's loadState(null)). */
  onReset(): void;
}

export function createSettings(deps: SettingsDeps): Settings {
  const root = new Container();
  root.visible = false;
  deps.layer.addChild(root);

  const dim = new Graphics();
  attachTap(dim, { onTap: () => close() });
  root.addChild(dim);

  const panel = new Container();
  root.addChild(panel);
  const face = new Graphics();
  // A dead tap on the panel face must neither close the menu nor bubble to
  // the stage (it would sweep the farm behind the overlay).
  attachTap(face, { onTap: () => {} });
  panel.addChild(face);

  const title = new Text({
    text: "Settings",
    style: { fontFamily: FONT, fontSize: 20, fontWeight: "700", fill: "#f5ead8" },
  });
  title.anchor.set(0.5, 0);
  panel.addChild(title);

  // main page ---------------------------------------------------------------
  const page = new Container();
  panel.addChild(page);

  const soundIcon = new Sprite(deps.textures.icons.speakerOn);
  soundIcon.anchor.set(0.5);
  soundIcon.scale.set(1.8);
  const soundText = new Text({
    text: "Sound: on",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#fff" },
  });
  soundText.anchor.set(0.5);
  const soundLabel = new Container();
  soundLabel.addChild(soundIcon, soundText);
  const syncSound = (): void => {
    const muted = audioHandles()?.muted ?? false;
    soundText.text = muted ? "Sound: off" : "Sound: on";
    soundIcon.texture = muted ? deps.textures.icons.speakerOff : deps.textures.icons.speakerOn;
    soundIcon.x = -Math.round(soundText.width / 2) - 16;
  };
  const soundBtn: PixelButton = pixelButton({
    w: 240,
    h: 46,
    face: 0x2f6fdb,
    content: soundLabel,
    onTap: () => {
      toggleMute();
      syncSound();
    },
  });
  page.addChild(soundBtn.root);

  const resetLabel = new Text({
    text: "Reset game…",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#fff" },
  });
  resetLabel.anchor.set(0.5);
  const resetBtn = pixelButton({
    w: 240,
    h: 46,
    face: 0xb03a30,
    content: resetLabel,
    onTap: () => showConfirm(true),
  });
  page.addChild(resetBtn.root);

  const credits = new Text({
    text: "Egg Empire — created by Daniel Mason",
    style: { fontFamily: FONT, fontSize: 11, fill: "#e8dcc8" },
  });
  credits.anchor.set(0.5);
  credits.alpha = 0.65;
  page.addChild(credits);

  // are-you-sure page ---------------------------------------------------------
  const confirm = new Container();
  confirm.visible = false;
  panel.addChild(confirm);

  const warn = new Text({
    text: "Wipe this farm and start over?\nAll progress will be lost.",
    style: {
      fontFamily: FONT,
      fontSize: 15,
      fontWeight: "700",
      fill: "#ffb0a8",
      align: "center",
    },
  });
  warn.anchor.set(0.5);
  confirm.addChild(warn);

  const yesLabel = new Text({
    text: "Yes — reset everything",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#fff" },
  });
  yesLabel.anchor.set(0.5);
  const yesBtn = pixelButton({
    w: 240,
    h: 46,
    face: 0xb03a30,
    content: yesLabel,
    onTap: () => deps.onReset(),
  });
  confirm.addChild(yesBtn.root);

  const cancelLabel = new Text({
    text: "Cancel",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#fff" },
  });
  cancelLabel.anchor.set(0.5);
  const cancelBtn = pixelButton({
    w: 240,
    h: 46,
    face: 0x4a5a3f,
    content: cancelLabel,
    onTap: () => showConfirm(false),
  });
  confirm.addChild(cancelBtn.root);

  const closeLabel = new Text({
    text: "×",
    style: { fontFamily: FONT, fontSize: 22, fontWeight: "700", fill: "#fff" },
  });
  closeLabel.anchor.set(0.5);
  const closeBtn = pixelButton({
    w: 38,
    h: 38,
    face: 0x4a4438,
    content: closeLabel,
    onTap: () => close(),
  });
  panel.addChild(closeBtn.root);

  function showConfirm(on: boolean): void {
    page.visible = !on;
    confirm.visible = on;
  }

  function close(): void {
    root.visible = false;
  }

  let PW = 300;
  let PH = 268;

  return {
    layout(w: number, h: number): void {
      dim.clear();
      dim.rect(0, 0, w, h).fill({ color: 0x000000, alpha: 0.55 });
      PW = Math.min(320, w - 32);
      PH = 268;
      face.clear();
      pixelPanel(face, 0, 0, PW, PH, { face: 0x24402c, frame: 0x0d160f });
      panel.position.set(Math.round((w - PW) / 2), Math.round(h * 0.5 - PH / 2) - 20);
      title.position.set(Math.round(PW / 2), 16);
      closeBtn.root.position.set(PW - 46, 10);
      const bx = Math.round((PW - 240) / 2);
      soundBtn.root.position.set(bx, 66);
      resetBtn.root.position.set(bx, 126);
      credits.position.set(Math.round(PW / 2), PH - 28);
      warn.position.set(Math.round(PW / 2), 88);
      yesBtn.root.position.set(bx, 130);
      cancelBtn.root.position.set(bx, 188);
    },
    toggle(): void {
      root.visible = !root.visible;
      if (root.visible) {
        showConfirm(false); // always land on the safe page
        syncSound();
      }
    },
    isOpen(): boolean {
      return root.visible;
    },
  };
}
