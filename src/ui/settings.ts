// Settings menu (Dan 2026-07-05): a canvas pixel-panel overlay opened from
// the gear chip. Pages: main (sound / stats / achievements / reset /
// credits), an are-you-sure reset page, a lifetime stats page and the
// achievements list built from the milestone registry. The dim backdrop
// and the panel face both swallow taps so the game can't be played
// through the menu.

import { Container, Graphics, Sprite, Text } from "pixi.js";
import { audioHandles, toggleMute } from "../audio/sfx";
import { fmt, fmtMoney } from "../config/format";
import type { SimState } from "../sim";
import type { Textures } from "../render/textures";
import { attachTap, FONT, pixelButton, pixelPanel } from "./kit";
import { MILESTONE_ORDER, MILESTONE_TITLE } from "./milestoneText";

export interface Settings {
  toggle(): void;
  isOpen(): boolean;
  layout(w: number, h: number): void;
}

export interface SettingsDeps {
  layer: Container;
  textures: Textures;
  sim: SimState;
  /** Wipe the save and reload (main's loadState(null)). */
  onReset(): void;
}

type Page = "main" | "confirm" | "stats" | "ach";

/** Stats rows: label + live formatter over the sim. */
const STAT_ROWS: [string, (s: SimState) => string][] = [
  ["Eggs banked", (s) => fmt(s.stats.eggs ?? 0)],
  ["Golden eggs", (s) => fmt(s.stats.golden ?? 0)],
  ["Deliveries", (s) => fmt(s.totalDelivered)],
  ["Dishes cooked", (s) => fmt(s.stats.dishes ?? 0)],
  ["Perfect plates", (s) => fmt(s.stats.perfects ?? 0)],
  ["Customers served", (s) => fmt(s.stats.customers ?? 0)],
  ["Golden rushes", (s) => fmt(s.stats.rushes ?? 0)],
  ["Dinner rushes", (s) => fmt(s.stats.dinnerRushes ?? 0)],
  ["Foxes shooed", (s) => fmt(s.stats.foxes ?? 0)],
  ["Birds lost to foxes", (s) => fmt(s.stats.birdsLost ?? 0)],
  ["Nights survived", (s) => fmt(s.stats.nights ?? 0)],
  ["Pachinko drops", (s) => fmt(s.stats.drops ?? 0)],
  ["Best pachinko win", (s) => fmtMoney(s.stats.casinoBest ?? 0)],
  ["Roulette spins", (s) => fmt(s.stats.spins ?? 0)],
  ["Best roulette win", (s) => fmtMoney(s.stats.rouletteBest ?? 0)],
  ["Slot pulls", (s) => fmt(s.stats.pulls ?? 0)],
  ["Best slots win", (s) => fmtMoney(s.stats.slotsBest ?? 0)],
];

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

  const closeLabel = new Text({
    text: "×",
    style: { fontFamily: FONT, fontSize: 22, fontWeight: "700", fill: "#fff" },
  });
  closeLabel.anchor.set(0.5);
  const closeBtn = pixelButton({ w: 38, h: 38, face: 0x4a4438, content: closeLabel, onTap: () => close() });
  panel.addChild(closeBtn.root);

  const btnLabel = (text: string): Text => {
    const t = new Text({
      text,
      style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#fff" },
    });
    t.anchor.set(0.5);
    return t;
  };

  // ---- main page -----------------------------------------------------------
  const main = new Container();
  panel.addChild(main);
  const soundIcon = new Sprite(deps.textures.icons.speakerOn);
  soundIcon.anchor.set(0.5);
  soundIcon.scale.set(1.8);
  const soundText = btnLabel("Sound: on");
  const soundLabel = new Container();
  soundLabel.addChild(soundIcon, soundText);
  const syncSound = (): void => {
    const muted = audioHandles()?.muted ?? false;
    soundText.text = muted ? "Sound: off" : "Sound: on";
    soundIcon.texture = muted ? deps.textures.icons.speakerOff : deps.textures.icons.speakerOn;
    soundIcon.x = -Math.round(soundText.width / 2) - 16;
  };
  const soundBtn = pixelButton({ w: 240, h: 44, face: 0x2f6fdb, content: soundLabel, onTap: () => { toggleMute(); syncSound(); } });
  const statsBtn = pixelButton({ w: 240, h: 44, face: 0x2f6fdb, content: btnLabel("Stats"), onTap: () => showPage("stats") });
  const achBtn = pixelButton({ w: 240, h: 44, face: 0x2f6fdb, content: btnLabel("Achievements"), onTap: () => showPage("ach") });
  const resetBtn = pixelButton({ w: 240, h: 44, face: 0xb03a30, content: btnLabel("Reset game…"), onTap: () => showPage("confirm") });
  main.addChild(soundBtn.root, statsBtn.root, achBtn.root, resetBtn.root);
  const credits = new Text({
    text: "Egg Empire — created by Daniel Mason",
    style: { fontFamily: FONT, fontSize: 11, fill: "#e8dcc8" },
  });
  credits.anchor.set(0.5);
  credits.alpha = 0.65;
  main.addChild(credits);

  // ---- are-you-sure page ---------------------------------------------------
  const confirm = new Container();
  confirm.visible = false;
  panel.addChild(confirm);
  const warn = new Text({
    text: "Wipe this farm and start over?\nAll progress will be lost.",
    style: { fontFamily: FONT, fontSize: 15, fontWeight: "700", fill: "#ffb0a8", align: "center" },
  });
  warn.anchor.set(0.5);
  const yesBtn = pixelButton({ w: 240, h: 44, face: 0xb03a30, content: btnLabel("Yes — reset everything"), onTap: () => deps.onReset() });
  const cancelBtn = pixelButton({ w: 240, h: 44, face: 0x4a5a3f, content: btnLabel("Cancel"), onTap: () => showPage("main") });
  confirm.addChild(warn, yesBtn.root, cancelBtn.root);

  // ---- stats page -----------------------------------------------------------
  const stats = new Container();
  stats.visible = false;
  panel.addChild(stats);
  const statTexts: { label: Text; value: Text }[] = [];
  for (const [label] of STAT_ROWS) {
    const l = new Text({ text: label, style: { fontFamily: FONT, fontSize: 13, fill: "#e8dcc8" } });
    const v = new Text({ text: "", style: { fontFamily: FONT, fontSize: 13, fontWeight: "700", fill: "#8fe3d0" } });
    v.anchor.set(1, 0);
    stats.addChild(l, v);
    statTexts.push({ label: l, value: v });
  }
  const statsBack = pixelButton({ w: 240, h: 40, face: 0x4a5a3f, content: btnLabel("Back"), onTap: () => showPage("main") });
  stats.addChild(statsBack.root);

  // ---- achievements page -----------------------------------------------------
  const ach = new Container();
  ach.visible = false;
  panel.addChild(ach);
  const achTexts: { mark: Text; name: Text; id: string }[] = [];
  for (const id of MILESTONE_ORDER) {
    const mark = new Text({ text: "○", style: { fontFamily: FONT, fontSize: 13, fontWeight: "700", fill: "#7a8a72" } });
    const name = new Text({ text: MILESTONE_TITLE[id] ?? id, style: { fontFamily: FONT, fontSize: 13, fill: "#e8dcc8" } });
    ach.addChild(mark, name);
    achTexts.push({ mark, name, id });
  }
  const achCount = new Text({ text: "", style: { fontFamily: FONT, fontSize: 12, fill: "#ffd94a" } });
  achCount.anchor.set(0.5, 0);
  const achBack = pixelButton({ w: 240, h: 40, face: 0x4a5a3f, content: btnLabel("Back"), onTap: () => showPage("main") });
  ach.addChild(achCount, achBack.root);

  // ---- page/layout plumbing --------------------------------------------------
  let W = 390;
  let H = 760;
  let page: Page = "main";
  const pageH = (): number =>
    page === "main" ? 344 : page === "confirm" ? 250 : page === "stats" ? 96 + STAT_ROWS.length * 24 + 56 : 120 + MILESTONE_ORDER.length * 24 + 56;

  function refreshPage(): void {
    if (page === "stats")
      for (let i = 0; i < STAT_ROWS.length; i++) statTexts[i].value.text = STAT_ROWS[i][1](deps.sim);
    if (page === "ach") {
      let done = 0;
      for (const row of achTexts) {
        const got = !!deps.sim.milestones[row.id];
        if (got) done++;
        row.mark.text = got ? "✓" : "○";
        row.mark.style.fill = got ? "#7ef25d" : "#7a8a72";
        row.name.alpha = got ? 1 : 0.55;
      }
      achCount.text = `${done} / ${achTexts.length} unlocked`;
    }
  }

  function relayout(): void {
    dim.clear();
    dim.rect(0, 0, W, H).fill({ color: 0x000000, alpha: 0.55 });
    const PW = Math.min(320, W - 32);
    const PH = Math.min(pageH(), H - 40);
    face.clear();
    pixelPanel(face, 0, 0, PW, PH, { face: 0x24402c, frame: 0x0d160f });
    panel.position.set(Math.round((W - PW) / 2), Math.round(H * 0.5 - PH / 2) - 14);
    title.position.set(Math.round(PW / 2), 16);
    title.text = page === "stats" ? "Stats" : page === "ach" ? "Achievements" : "Settings";
    closeBtn.root.position.set(PW - 46, 10);
    const bx = Math.round((PW - 240) / 2);
    // main
    soundBtn.root.position.set(bx, 62);
    statsBtn.root.position.set(bx, 116);
    achBtn.root.position.set(bx, 170);
    resetBtn.root.position.set(bx, 224);
    credits.position.set(Math.round(PW / 2), 344 - 28);
    // confirm
    warn.position.set(Math.round(PW / 2), 84);
    yesBtn.root.position.set(bx, 128);
    cancelBtn.root.position.set(bx, 182);
    // stats rows
    for (let i = 0; i < statTexts.length; i++) {
      statTexts[i].label.position.set(22, 60 + i * 24);
      statTexts[i].value.position.set(PW - 22, 60 + i * 24);
    }
    statsBack.root.position.set(bx, PH - 52);
    // achievements rows
    achCount.position.set(Math.round(PW / 2), 46);
    for (let i = 0; i < achTexts.length; i++) {
      achTexts[i].mark.position.set(24, 78 + i * 24);
      achTexts[i].name.position.set(48, 78 + i * 24);
    }
    achBack.root.position.set(bx, PH - 52);
  }

  function showPage(next: Page): void {
    page = next;
    main.visible = next === "main";
    confirm.visible = next === "confirm";
    stats.visible = next === "stats";
    ach.visible = next === "ach";
    refreshPage();
    relayout();
  }

  function close(): void {
    root.visible = false;
  }

  return {
    layout(w: number, h: number): void {
      W = w;
      H = h;
      relayout();
    },
    toggle(): void {
      root.visible = !root.visible;
      if (root.visible) {
        syncSound();
        showPage("main"); // always land on the safe page
      }
    },
    isOpen(): boolean {
      return root.visible;
    },
  };
}
