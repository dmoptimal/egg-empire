// Day/night cycle + foxes (Lily's design, 2026-07-05). At night the birds
// roost along the top and stop laying; foxes creep up from the bottom of
// the screen toward the hay. Tap (or sweep) a fox to shoo it — it pays a
// feather bounty scaled to your best bird — or let it reach the hay and it
// steals the oldest egg. The Night guard node auto-shoos on a cadence.

// Dan 2026-07-06: night now matches the day — the farm's foxes and the
// all-night casino are the evening game; the kitchen shuts at dusk. The
// cycle only begins once Ducks are unlocked, so the tutorial farm never
// freezes on a newcomer.
export const DAY_LENGTH = 150; //   seconds of daylight per cycle
export const NIGHT_LENGTH = 150; // seconds of night per cycle
export const NIGHT_FADE = 5; //     dusk/dawn tint fade (render-side)

// The witching hour (Dan's pick 2026-07-06): nights open sparse and build to
// a flurry before dawn; daybreak routs the stragglers for a token bounty each.
export const FOX_SPAWN_EARLY_MIN = 7; //  spawn gap at dusk …
export const FOX_SPAWN_EARLY_VAR = 4;
export const FOX_SPAWN_LATE_MIN = 2.2; // … tightening to this by dawn
export const FOX_SPAWN_LATE_VAR = 1.8;
export const WITCHING_CURVE = 1.6; //   progress^this — the flurry lands late
export const ROUT_BOUNTY_PCT = 0.25; // of a full bounty, per fox routed at dawn

export const FOX_FLEE_SPEED = 300; //  px/s bolting back down
export const FOX_TAP_R = 48; //        sweep radius that counts as a shoo
export const FOX_BOUNTY_MULT = 8; //   feathers = this × featherPerEgg(best bird)

// The rogues' gallery (Dan's pick): after the first couple of nights the
// ordinary fox brings friends. Weights pick the kind; kits come as a pack.
export interface FoxKindDef {
  speed: number; //  climb px/s
  taps: number; //   player taps to send it off (a bruiser soaks one)
  bounty: number; // × the standard bounty
  weight: number; // spawn lottery share
}
export const FOX_KINDS: Record<"fox" | "sneak" | "kit" | "bruiser", FoxKindDef> = {
  fox: { speed: 55, taps: 1, bounty: 1, weight: 66 },
  sneak: { speed: 80, taps: 1, bounty: 3, weight: 14 }, //  dashes, then hides flat
  kit: { speed: 90, taps: 1, bounty: 0.5, weight: 12 }, //  tiny, fast, in packs
  bruiser: { speed: 34, taps: 2, bounty: 4, weight: 8 }, // shrugs off the guards
};
export const KIT_PACK = 3; //      kits per spawn
export const KIT_SPREAD = 42; //   px between pack mates
export const SNEAK_DASH = 1.0; //  seconds moving …
export const SNEAK_HIDE = 0.7; //  … then frozen in the grass
export const STAGGER_TIME = 0.55; // bruiser pause after soaking a tap
export const ROGUE_NIGHTS = 2; //  plain foxes only until this many nights survived

// Tap-to-lunge guards (Dan's pick): tap a charged watchman and he sweeps
// every fox around him — spending the same recharge the auto-shoo uses.
export const GUARD_TAP_R = 46; //   tap this close to a watchman …
export const GUARD_LUNGE_R = 95; // … and he clears foxes within this

/**
 * Guards hold a visible patrol line just below the roost (Dan 2026-07-05:
 * "the foxes need to have a chance") — a fox is only shooed when it CROSSES
 * the line while the watch is ready; the shoo then recharges, so a second
 * fox close behind slips through.
 */
export const GUARD_LINE_RATIO = 0.42; // patrol y = hayTop × this
/** Seconds the watch recharges between shoos, by Night guard level. */
export const GUARD_INTERVAL = [0, 9, 6, 3];

// A fox that crosses an EMPTY hay line presses on toward the flock itself
// (Dan 2026-07-05: "irritating but not game ending" — hence the caps).
export const FOX_BIRD_DEPTH = 0.35; // steals a bird at hayTop × this
export const FOX_BIRD_CAP = 2; //     most birds lost per night

