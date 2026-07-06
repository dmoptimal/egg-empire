// Milestone copy — shared by the toast dispatcher (main.ts) and the
// achievements page (settings.ts) so the two can never drift.

export const MILESTONE_ORDER = [
  "delivered_100",
  "delivered_1000",
  "delivered_10000",
  "delivered_100000",
  "delivered_1000000",
  "quail_intro",
  "goose_intro",
  "ostrich_intro",
  "night_intro",
  "fox_bird_intro",
  "moon_intro",
];

/** Short names for the achievements list. */
export const MILESTONE_TITLE: Record<string, string> = {
  delivered_100: "First hundred",
  delivered_1000: "A thousand out the gate",
  delivered_10000: "Ten thousand strong",
  delivered_100000: "Hundred-K farm",
  delivered_1000000: "The Egg Empire",
  quail_intro: "Meet the quail",
  goose_intro: "Meet the geese",
  ostrich_intro: "Meet the ostriches",
  night_intro: "First nightfall",
  fox_bird_intro: "The fox got one",
  moon_intro: "Moonlighting",
};

/** Toast copy fired the moment each milestone lands. */
export const MILESTONE_TEXT: Record<string, string> = {
  delivered_100: "Milestone: 100 delivered!",
  delivered_1000: "Milestone: 1,000 delivered!",
  delivered_10000: "Milestone: 10,000 delivered!",
  delivered_100000: "Milestone: 100,000 delivered!",
  delivered_1000000: "Milestone: 1,000,000 delivered! Egg empire indeed.",
  quail_intro: "Quail lay in bursts — sweep a whole cluster for hot streaks!",
  goose_intro: "Goose eggs sparkle while fresh — sweep fast for +50%!",
  ostrich_intro: "Ostrich eggs roll! Sweep one mid-roll to smash everything nearby.",
  night_intro: "Night falls — the flock roosts, and foxes creep in. Tap foxes for feathers!",
  fox_bird_intro: "A fox got through the bare hay and took a bird! Shoo them before they reach the flock.",
  moon_intro: "A moon egg, caught mid-fall! The roost drops one every so often at night — worth a slice of the whole flock's laying.",
};
