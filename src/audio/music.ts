// Generative background music — no assets, like everything in src/audio.
// One lookahead sequencer, three scenes (Dan 2026-07-06: each room gets its
// own music):
//   farm    — the original pastoral loop: slow triangle pads over C-Am-F-G,
//             a music-box pentatonic melody; goes sparse and hushed at night.
//   kitchen — brighter and busier: quicker tempo, walking bass, chattier
//             square-wave melody. A bistro at lunch.
//   casino  — slow minor lounge: Am-Dm-E7, sine bass, late-night noodling.
// Runs on the standard WebAudio lookahead pattern (short setInterval
// scheduling ~0.2s ahead) so it keeps time whatever the framerate does.
// The mute button is honoured every tick via audioHandles().muted.

import { audioHandles } from "./sfx";

export type MusicScene = "farm" | "kitchen" | "casino";

interface SceneDef {
  bpm: number;
  /** Chord voicings as midi notes; chord[0] is the bass root. */
  chords: number[][];
  /** Melody note pool, walked lazily at random. */
  pool: number[];
  /** Chance of a melody note per 8th step. */
  density: number;
  padVol: number;
  padType: OscillatorType;
  melodyType: OscillatorType;
  /** 8th steps (within the 8-step bar) that get a bass note. */
  bassSteps: number[];
}

const SCENES: Record<MusicScene, SceneDef> = {
  farm: {
    bpm: 88,
    chords: [
      [48, 55, 60, 64], // C
      [45, 52, 57, 60], // Am
      [41, 48, 53, 57], // F
      [43, 50, 55, 59], // G
    ],
    pool: [72, 74, 76, 79, 81, 84],
    density: 0.3,
    padVol: 0.042,
    padType: "triangle",
    melodyType: "triangle",
    bassSteps: [0, 4],
  },
  kitchen: {
    bpm: 108,
    chords: [
      [41, 48, 53, 57], // F
      [43, 50, 55, 59], // G
      [48, 55, 60, 64], // C
      [45, 52, 57, 60], // Am
    ],
    pool: [72, 74, 76, 77, 79, 81, 84],
    density: 0.45,
    padVol: 0.034,
    padType: "triangle",
    melodyType: "square",
    bassSteps: [0, 2, 4, 6],
  },
  casino: {
    bpm: 74,
    chords: [
      [45, 52, 57, 60], // Am
      [50, 57, 62, 65], // Dm
      [52, 56, 59, 62], // E7
      [45, 52, 57, 60], // Am
    ],
    pool: [69, 72, 74, 76, 79, 81],
    density: 0.22,
    padVol: 0.05,
    padType: "sine",
    melodyType: "sine",
    bassSteps: [0, 5],
  },
};

const BAR = 8; // 8th-note steps per bar
const LOOKAHEAD_MS = 60;
const SCHEDULE_AHEAD = 0.2;

const freq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

let started = false;
let paused = false;
let night = false;
let scene: MusicScene = "farm";
let gain: GainNode | null = null;
let nextTime = 0;
let stepN = 0;
let melodyIdx = 2;

export function musicSetPaused(p: boolean): void {
  paused = p;
}

/** Nighttime flavour (farm only): sparser melody, softer pads. */
export function musicSetNight(n: boolean): void {
  night = n;
}

/** Swap rooms — takes effect from the next scheduled step. */
export function musicSetScene(next: MusicScene): void {
  if (next === scene) return;
  scene = next;
  stepN = 0; // start the new room on a downbeat
  melodyIdx = 2;
}

function voice(
  ac: AudioContext,
  out: GainNode,
  midi: number,
  t0: number,
  dur: number,
  vol: number,
  type: OscillatorType,
  attack = 0.01,
): void {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq(midi), t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(out);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function scheduleStep(ac: AudioContext, out: GainNode, t: number, stepLen: number): void {
  const def = SCENES[scene];
  const hush = night && scene === "farm";
  const bar = Math.floor(stepN / BAR) % def.chords.length;
  const beat = stepN % BAR;
  const chord = def.chords[bar];
  const barLen = stepLen * BAR;

  if (beat === 0)
    for (const m of chord.slice(1))
      voice(ac, out, m, t, barLen * 0.95, hush ? def.padVol * 0.7 : def.padVol, def.padType, 0.35);
  if (def.bassSteps.includes(beat)) {
    // root on the downbeat, fifth (or a walk-up octave) elsewhere
    const note = beat === 0 ? chord[0] : beat === 4 || beat === 5 ? chord[0] + 7 : chord[0] + 12;
    voice(ac, out, note, t, stepLen * 1.6, 0.06, "sine", 0.02);
  }

  const density = hush ? def.density * 0.55 : def.density;
  if (beat !== 0 && Math.random() < density) {
    melodyIdx = Math.min(
      def.pool.length - 1,
      Math.max(0, melodyIdx + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.25 ? 2 : 1)),
    );
    const vol = def.melodyType === "square" ? 0.035 : 0.05;
    voice(ac, out, def.pool[melodyIdx], t, stepLen * (Math.random() < 0.3 ? 1.9 : 0.9), vol, def.melodyType);
    if (Math.random() < 0.12)
      voice(ac, out, def.pool[melodyIdx] + 12, t + stepLen * 0.5, stepLen * 0.8, 0.02, "sine");
  }
}

/**
 * Begin (or resume) the loop. Safe to call every pointerdown — it starts
 * once, after audioInit() has created the context on a user gesture.
 */
export function musicStart(): void {
  if (started) return;
  const h = audioHandles();
  if (!h) return;
  started = true;
  gain = h.ac.createGain();
  gain.gain.value = 1;
  gain.connect(h.master);
  nextTime = h.ac.currentTime + 0.1;
  setInterval(() => {
    const handles = audioHandles();
    if (!handles || !gain) return;
    // honour the mute button and the hidden tab without tearing anything down
    gain.gain.value = handles.muted ? 0 : 1;
    if (paused) {
      nextTime = handles.ac.currentTime + 0.1;
      return;
    }
    const stepLen = 60 / SCENES[scene].bpm / 2;
    while (nextTime < handles.ac.currentTime + SCHEDULE_AHEAD) {
      if (!handles.muted) scheduleStep(handles.ac, gain, nextTime, stepLen);
      nextTime += stepLen;
      stepN++;
    }
  }, LOOKAHEAD_MS);
}
