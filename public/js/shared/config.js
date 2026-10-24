// Tuning numbers shared by the host simulation and every client.

export const MAX_PLAYERS = 4;
export const PEER_PREFIX = 'gsgs-kingsgate-city-';
// bump whenever host and guest messages change: mismatched copies refuse to mix
export const PROTOCOL = 2;

// the host runs the city 20 times a second and tells everyone 10 times
export const TICK = 1 / 20;
export const SNAP_EVERY = 2;

// on foot
export const PLAYER_R = 0.32;
export const WALK = 1.6;          // (holding Alt)
export const JOG = 4.4;
export const SPRINT = 7.0;
export const JUMP_V = 4.8;
export const GRAVITY = 14;
export const REACH = 3.2;          // how near a car's door you need to be to get in

export const MAX_HP = 100;
export const MAX_ARMOR = 100;

// the city comes alive around the players: pedestrians and traffic appear
// between SPAWN_NEAR and SPAWN_FAR of someone (out of sight where they
// can) and go when nobody's within DESPAWN
export const SPAWN_NEAR = 50;
export const SPAWN_FAR = 95;
export const DESPAWN = 130;
export const PEDS_PER_PLAYER = 22;
export const PEDS_MAX = 44;
export const TRAFFIC_PER_PLAYER = 12;
export const TRAFFIC_MAX = 26;

// Weapons. dmg per bullet (pellet), rate in shots a second, clip before a
// reload, spread in radians, range in metres, price at the gun shop.
export const WEAPONS = [
  { key: 'fist', name: 'Fists', dmg: 14, rate: 2.2, range: 1.9, melee: true },
  { key: 'pistol', name: 'Pistol', dmg: 26, rate: 3.4, clip: 12, reload: 1.3, spread: 0.012, range: 70, price: 250, ammo: 48, ammoPrice: 40 },
  { key: 'smg', name: 'SMG', dmg: 15, rate: 10, clip: 30, reload: 1.8, spread: 0.035, range: 55, price: 900, ammo: 120, ammoPrice: 90, auto: true },
  { key: 'shotgun', name: 'Shotgun', dmg: 11, pellets: 8, rate: 1.1, clip: 6, reload: 2.4, spread: 0.075, range: 24, price: 1300, ammo: 24, ammoPrice: 70 },
];
export const WEAPON_INDEX = Object.fromEntries(WEAPONS.map((w, i) => [w.key, i]));

// Wanted level: heat builds stars; out of every cop's sight long enough
// (longer the more stars) and it's gone.
export const WANTED = {
  lose: [0, 9, 13, 18, 24, 30],      // seconds unseen to lose it all
  cars: [0, 1, 2, 3, 4, 5],          // police cars after you
  foot: [0, 2, 3, 4, 6, 8],          // officers on foot at most
  shoot: 2,                          // from this many stars they shoot
  arrest: 2.2,                       // seconds a cop has to hold you
};

export const PRICES = { armor: 250, respray: 100, hospital: 100, busted: 150 };

// pedestrians and cops
export const PED = { r: 0.3, walk: 1.35, run: 5.2, hp: 40 };
export const COP = { r: 0.3, run: 5.6, hp: 90, sight: 45, fov: 1.2 };
