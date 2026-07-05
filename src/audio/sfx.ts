// Fully synthesized WebAudio — no assets. Ported verbatim from the prototype
// (tone/noise helpers, the SFX table, combo pitching, and the land/spoil
// throttles). Must init/resume on a user gesture (iOS): the first pointerdown
// calls audioInit().

let AC: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let noiseBuf: AudioBuffer | null = null;

export function audioInit(): void {
  if (AC) {
    if (AC.state === "suspended") void AC.resume();
    return;
  }
  const Ctor: typeof AudioContext | undefined =
    window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  AC = new Ctor();
  master = AC.createGain();
  master.gain.value = 0.5;
  master.connect(AC.destination);
  // One shared noise buffer, reused by every noise() voice (perf rule).
  const len = AC.sampleRate;
  noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

export function toggleMute(): boolean {
  muted = !muted;
  return muted;
}

/** Shared context handles for the music sequencer (src/audio/music.ts). */
export function audioHandles(): { ac: AudioContext; master: GainNode; muted: boolean } | null {
  return AC && master ? { ac: AC, master, muted } : null;
}

interface ToneOpts {
  type?: OscillatorType;
  vol?: number;
  delay?: number;
  slide?: number;
}

function tone(freq: number, dur: number, o: ToneOpts = {}): void {
  if (!AC || !master || muted) return;
  const t0 = AC.currentTime + (o.delay ?? 0);
  const osc = AC.createOscillator();
  const g = AC.createGain();
  osc.type = o.type ?? "sine";
  osc.frequency.setValueAtTime(freq, t0);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + o.slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(o.vol ?? 0.25, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

interface NoiseOpts {
  freq?: number;
  vol?: number;
  delay?: number;
  slide?: number;
  q?: number;
}

function noise(dur: number, o: NoiseOpts = {}): void {
  if (!AC || !master || muted || !noiseBuf) return;
  const t0 = AC.currentTime + (o.delay ?? 0);
  const src = AC.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = 0.7 + Math.random() * 0.6;
  const f = AC.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.setValueAtTime(o.freq ?? 800, t0);
  if (o.slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, (o.freq ?? 800) + o.slide), t0 + dur);
  f.Q.value = o.q ?? 1;
  const g = AC.createGain();
  g.gain.setValueAtTime(o.vol ?? 0.15, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

let comboN = 0;
let lastPopT = 0;
let lastLandT = 0;
let lastSpoilT = 0;
let lastSizzleT = 0;

export const SFX = {
  pop(golden: boolean): void {
    const now = performance.now();
    comboN = now - lastPopT < 450 ? comboN + 1 : 0;
    lastPopT = now;
    // pentatonic climb (always musical); after ~2 octaves it cycles the top
    // five notes instead of parking on one high shriek
    const PENTA = [0, 2, 4, 7, 9];
    const i = comboN <= 9 ? comboN : 5 + (comboN % 5);
    const semis = Math.floor(i / 5) * 12 + PENTA[i % 5];
    const f = 392 * Math.pow(2, semis / 12);
    const vol = comboN > 10 ? 0.16 : 0.24; // soften sustained streaks
    tone(f, 0.09, { type: "triangle", vol, slide: f * 0.4 });
    if (comboN < 8 || (comboN & 1) === 0) noise(0.03, { freq: 3200, vol: 0.05, q: 2 });
    if (golden) {
      tone(880, 0.08, { type: "sine", vol: 0.22, delay: 0.02 });
      tone(1318, 0.1, { type: "sine", vol: 0.22, delay: 0.09 });
      tone(1760, 0.14, { type: "sine", vol: 0.18, delay: 0.16 });
      noise(0.25, { freq: 6500, vol: 0.08, q: 3, delay: 0.02 });
    }
  },
  land(): void {
    const now = performance.now();
    if (now - lastLandT < 60) return; // throttle hay thuds (CLAUDE.md)
    lastLandT = now;
    noise(0.05, { freq: 280 + Math.random() * 180, vol: 0.1, q: 0.8 });
    tone(130 + Math.random() * 30, 0.05, { type: "sine", vol: 0.08, slide: -50 });
  },
  spoil(): void {
    const now = performance.now();
    if (now - lastSpoilT < 200) return; // throttle spoils (CLAUDE.md)
    lastSpoilT = now;
    tone(320, 0.16, { type: "sine", vol: 0.09, slide: -180 });
  },
  honk(): void {
    // Dan 2026-07-05: was 0.14 and "a bit too loud" — both trucks honk now.
    tone(392, 0.13, { type: "square", vol: 0.06 });
    tone(330, 0.15, { type: "square", vol: 0.06, delay: 0.14 });
  },
  kaching(): void {
    tone(1244, 0.07, { type: "square", vol: 0.15 });
    tone(1660, 0.2, { type: "square", vol: 0.15, delay: 0.07 });
    noise(0.18, { freq: 7000, vol: 0.09, q: 2, delay: 0.05 });
    tone(90, 0.1, { type: "sine", vol: 0.15 });
  },
  buy(): void {
    [523, 659, 784].forEach((f, i) => tone(f, 0.08, { type: "triangle", vol: 0.18, delay: i * 0.06 }));
  },
  unlock(): void {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, { type: "square", vol: 0.16, delay: i * 0.09 }));
    noise(0.5, { freq: 5000, vol: 0.07, q: 2, delay: 0.1 });
  },
  donk(): void {
    tone(180, 0.12, { type: "square", vol: 0.13, slide: -50 });
  },
  cluck(): void {
    const f = 750 + Math.random() * 500;
    noise(0.045, { freq: f + 400, vol: 0.05, q: 5 });
    noise(0.07, { freq: f, vol: 0.07, q: 4, delay: 0.07 });
  },
  /** Quiet pan noise while anything cooks — self-throttled. */
  sizzle(): void {
    const now = performance.now();
    if (now - lastSizzleT < 400) return;
    lastSizzleT = now;
    noise(0.35, { freq: 5200, vol: 0.028, q: 1.4 });
  },
  /** Perfect plate: bright double-hit. */
  perfect(): void {
    tone(1568, 0.07, { type: "square", vol: 0.14 });
    tone(2349, 0.12, { type: "square", vol: 0.12, delay: 0.06 });
    noise(0.15, { freq: 8000, vol: 0.06, q: 3, delay: 0.04 });
  },
  /** New order ticket: a polite double knock. */
  order(): void {
    tone(660, 0.06, { type: "square", vol: 0.12 });
    tone(880, 0.08, { type: "square", vol: 0.12, delay: 0.09 });
  },
  /** Plate ding on dish completion. */
  ding(): void {
    tone(1568, 0.09, { type: "sine", vol: 0.12 });
    tone(2093, 0.12, { type: "sine", vol: 0.08, delay: 0.05 });
  },
  /** The kitchen truck's cha-ching, pitched up from the farm one. */
  kachingUp(): void {
    tone(1555, 0.07, { type: "square", vol: 0.14 });
    tone(2075, 0.2, { type: "square", vol: 0.14, delay: 0.07 });
    noise(0.18, { freq: 8000, vol: 0.08, q: 2, delay: 0.05 });
    tone(112, 0.1, { type: "sine", vol: 0.14 });
  },
  /** Fox shooed: two quick descending yips. */
  foxYip(): void {
    tone(1250, 0.06, { type: "square", vol: 0.12, slide: -500 });
    tone(950, 0.08, { type: "square", vol: 0.1, slide: -400, delay: 0.08 });
  },
  /** A fox made off with an egg. */
  gulp(): void {
    tone(340, 0.14, { type: "sine", vol: 0.12, slide: -160 });
  },
  /** A fox took a BIRD — distressed squawking on the way out. */
  squawk(): void {
    noise(0.12, { freq: 1400, vol: 0.16, q: 3, slide: -600 });
    tone(620, 0.1, { type: "square", vol: 0.12, slide: -260 });
    noise(0.1, { freq: 1100, vol: 0.12, q: 3, delay: 0.12, slide: -500 });
  },
  /** Dusk: two low, soft tones under a breath of wind. */
  nightfall(): void {
    tone(196, 0.7, { type: "sine", vol: 0.09 });
    tone(147, 0.9, { type: "sine", vol: 0.07, delay: 0.25 });
    noise(0.6, { freq: 900, vol: 0.02, q: 1, delay: 0.1 });
  },
  /** Dawn: a gentle rising triad. */
  daybreak(): void {
    [392, 494, 587].forEach((f, i) => tone(f, 0.14, { type: "triangle", vol: 0.12, delay: i * 0.09 }));
  },
  /** Roulette ratchet — one clack per slice divider. */
  tick(): void {
    tone(1700, 0.025, { type: "square", vol: 0.05 });
  },
  /** Golden Rush fanfare: a fast rising arpeggio with shimmer. */
  rush(): void {
    [523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
      tone(f, 0.1, { type: "triangle", vol: 0.16, delay: i * 0.05 }),
    );
    noise(0.6, { freq: 7000, vol: 0.07, q: 2, delay: 0.1 });
  },
  win(): void {
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, { type: "square", vol: 0.18, delay: i * 0.12 }));
    noise(0.8, { freq: 6000, vol: 0.08, q: 2, delay: 0.2 });
  },
};
