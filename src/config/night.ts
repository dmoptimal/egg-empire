// Day/night cycle + foxes (Lily's design, 2026-07-05). At night the birds
// roost along the top and stop laying; foxes creep up from the bottom of
// the screen toward the hay. Tap (or sweep) a fox to shoo it — it pays a
// feather bounty scaled to your best bird — or let it reach the hay and it
// steals the oldest egg. The Night guard node auto-shoos on a cadence.

export const DAY_LENGTH = 150; //  seconds of daylight per cycle
export const NIGHT_LENGTH = 40; // seconds of night per cycle
export const NIGHT_FADE = 5; //    dusk/dawn tint fade (render-side)

export const FOX_SPAWN_MIN = 4; // seconds between foxes at night …
export const FOX_SPAWN_VAR = 4; // … plus up to this much
export const FOX_CLIMB_SPEED = 55; //  px/s creeping up the screen
export const FOX_FLEE_SPEED = 300; //  px/s bolting back down
export const FOX_TAP_R = 48; //        sweep radius that counts as a shoo
export const FOX_BOUNTY_MULT = 8; //   feathers = this × featherPerEgg(best bird)

/** Seconds between automatic shoos, indexed by Night guard level (0 = none). */
export const GUARD_INTERVAL = [0, 9, 6, 3];
