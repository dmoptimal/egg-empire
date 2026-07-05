// Generative background music — no assets, like everything in src/audio.
// A gentle pastoral loop: soft triangle pads over a four-chord farm
// progression, a walking sine bass, and a sparse pentatonic music-box
// melody that never repeats exactly. Runs on the standard WebAudio
// lookahead pattern (short setInterval scheduling ~0.2s ahead of the
// clock) so it stays in time whatever the render framerate does.
//
// Volume lives well below the SFX so the game stays the star. The mute
// button is honoured every tick via audioHandles().muted.

import { audioHandles } from "./sfx";

const BPM = 88;
const STEP = 60 / BPM / 2; //          8th-note grid
const BAR = 8; //                      steps per bar
const LOOKAHEAD_MS = 60;
const SCHEDULE_AHEAD = 0.2;

// C – Am – F – G, voiced low and warm (midi note numbers).
const CHORDS = [
  [48, 55, 60, 64], // C3 G3 C4 E4
  [45, 52, 57, 60], // A2 E3 A3 C4
  [41, 48, 53, 57], // F2 C3 F3 A3
  [43, 50, 55, 59], // G2 D3 G3 B3
];
const PENTA = [72, 74, 76, 79, 81, 84]; // C5 pentatonic + top C

const freq = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

let started = false;
let paused = false;
let night = false;
let gain: GainNode | null = null;
let nextTime = 0;
let stepN = 0;
let melodyIdx = 2;

export function musicSetPaused(p: boolean): void {
  paused = p;
}

/** Nighttime flavour: sparser melody, softer pads (day/night cycle). */
export function musicSetNight(n: boolean): void {
  night = n;
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

function scheduleStep(ac: AudioContext, out: GainNode, t: number): void {
  const bar = Math.floor(stepN / BAR) % CHORDS.length;
  const beat = stepN % BAR;
  const chord = CHORDS[bar];
  const barLen = STEP * BAR;

  if (beat === 0) {
    // pad: the whole chord breathes in for the bar
    for (const m of chord.slice(1))
      voice(ac, out, m, t, barLen * 0.95, night ? 0.03 : 0.042, "triangle", 0.35);
    voice(ac, out, chord[0], t, STEP * 3, 0.07, "sine", 0.02); // bass root
  } else if (beat === 4) {
    voice(ac, out, chord[0] + 7, t, STEP * 3, 0.055, "sine", 0.02); // bass fifth
  }

  // music-box melody: a lazy random walk over the pentatonic, sparser at night
  const density = night ? 0.16 : 0.3;
  if (beat !== 0 && Math.random() < density) {
    melodyIdx = Math.min(
      PENTA.length - 1,
      Math.max(0, melodyIdx + (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.25 ? 2 : 1)),
    );
    voice(ac, out, PENTA[melodyIdx], t, STEP * (Math.random() < 0.3 ? 1.9 : 0.9), 0.05, "triangle");
    if (Math.random() < 0.12) voice(ac, out, PENTA[melodyIdx] + 12, t + STEP * 0.5, STEP * 0.8, 0.02, "sine");
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
    while (nextTime < handles.ac.currentTime + SCHEDULE_AHEAD) {
      if (!handles.muted) scheduleStep(handles.ac, gain, nextTime);
      nextTime += STEP;
      stepN++;
    }
  }, LOOKAHEAD_MS);
}
