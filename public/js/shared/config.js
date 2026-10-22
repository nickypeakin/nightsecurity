// Tuning numbers shared by the host simulation and every client.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'gsgs-kingsgate-';
// bump whenever host and guest messages change: mismatched copies refuse to mix
export const PROTOCOL = 1;

// people
export const PLAYER_R = 0.26;
export const EYE = 1.62;
export const WALK = 2.6;
export const SPRINT = 4.4;
export const CROUCH = 1.3;
export const STAMINA_MAX = 6;       // seconds of sprinting
export const STAMINA_REGEN = 0.8;   // seconds of stamina regained per second
export const REACH = 2.3;           // how far away you can use things

// the opening: closing time, and the manager handing over the keys
export const INTRO_LEN = 50;

// the night runs from 10 PM (22) to 6 AM (30); seconds of play per hour
export const HOUR_LEN = 160;
export const SHIFT_START = 22;
export const SHIFT_END = 30;

// The mannequins from Halvorsen's. They only move while nobody can see
// them: not in anyone's view, not in a flashlight, not on the camera
// somebody is watching.
export const MANNEQUIN = {
  radius: 0.28,
  speed: 2.1,           // at the start of the night...
  speedLate: 3.0,       // ...and by five in the morning
  catchDist: 0.75,
  notice: 24,           // how far away they notice someone to go after
  seeLit: 34,           // how far you can see one in the light
  seeFlash: 26,         // ... in your flashlight beam
  seeDark: 2.6,         // ... in the dark
  fov: 0.42,            // cos of the half-angle of your view that counts
  beam: 0.88,           // cos of the flashlight beam's half-angle
  camSee: 30,           // a security camera's reach
  camFov: 0.62,
};

// The thing that walks Dale's round, in his uniform, with his keys.
export const STALKER = {
  radius: 0.3,
  walk: 1.5,
  chase: 3.55,          // faster than a walk, slower than a sprint
  catchDist: 0.85,
  seeDark: 7,
  seeLit: 26,
  seeFlash: 30,
  fov: 0.3,             // cos of half his field of view
  giveUp: 6,            // seconds without seeing you before he stops chasing
  unlockTime: 2.2,      // seconds to find the right key and open a lock
  stun: 2.6,            // a flashlight in his face stops him this long
};

// simulation
export const TICK = 1 / 20;
export const SNAP_EVERY = 3;        // ticks between snapshots (about 15 Hz)
