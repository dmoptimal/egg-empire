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

export const FOX_SPAWN_MIN = 4; // seconds between foxes at night …
export const FOX_SPAWN_VAR = 4; // … plus up to this much
export const FOX_CLIMB_SPEED = 55; //  px/s creeping up the screen
export const FOX_FLEE_SPEED = 300; //  px/s bolting back down
export const FOX_TAP_R = 48; //        sweep radius that counts as a shoo
export const FOX_BOUNTY_MULT = 8; //   feathers = this × featherPerEgg(best bird)

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

