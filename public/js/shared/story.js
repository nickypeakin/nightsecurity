// Everything anyone says, and the jobs. November 1996: Kingsgate Mall is a
// fenced-off pile of rubble, the night shift that used to guard it is out
// of work, and the city's wide awake. Three people have jobs for you:
// Ray Okafor (who managed the mall, and sells used cars now), Lena Voss
// (who runs the harbour, and more than the harbour), and Dale Mercer (the
// old night guard, who never quite got over that last week at the mall).
//
// A mission is a list of steps the host works through in order (see
// host/missions.js for what each one does).

import { PLACES, BUILDINGS, LINES, PARK } from './city.js';

export const DATE = 'Friday, November 1, 1996';
export const TITLE = 'GTA 7';

export const PEOPLE = {
  okafor: { name: 'Ray Okafor', voice: 'okafor', blip: 'O', color: '#7ad0ff' },
  voss: { name: 'Lena Voss', voice: 'voss', blip: 'V', color: '#ff7a9a' },
  dale: { name: 'Dale Mercer', voice: 'dale', blip: 'D', color: '#d8d0a0' },
};

const shopAt = (name) => {
  const b = BUILDINGS.find((q) => q.name === name);
  return { x: (b.x0 + b.x1) / 2, z: b.z0 - 2.2 };
};
// a spot at the kerb on the road z = L (side +1 south, heading east) or
// x = L (side +1 west, heading south)
const kerbZ = (L, x, side = 1) => ({ x, z: L + side * PARK, h: side > 0 ? Math.PI / 2 : -Math.PI / 2 });
const kerbX = (L, z, side = 1) => ({ x: L - side * PARK, z, h: side > 0 ? 0 : Math.PI });

const OKAFOR_LOT = { x: 152, z: 64 };
const POOL = shopAt('Pool Hall');
const RACE = [[80, 40], [40, 78], [-20, 120], [-120, 96], [-120, 0], [-80, -40], [-40, -80], [0, -120], [80, -120], [120, -80], [120, 0], [150, 40]];

export const MISSIONS = [
  {
    id: 'm1', giver: 'okafor', title: 'Back to Work', pay: 250,
    steps: [
      { do: 'say', lines: [
        ['okafor', "Good, you came. The mall's gone, the job's gone, and here you are in my office. Sit down."],
        ['okafor', "A customer stopped paying for his Marlin. It's parked on Ash Street, outside the shops on the Strip."],
        ['okafor', 'Bring it back to the lot. Quietly.'],
      ] },
      { do: 'car', id: 'repo', type: 'sedan', paint: 1, at: kerbZ(40, 92, 1) },
      { do: 'enter', car: 'repo', text: 'Get in the ~b~Marlin~w~ on the Strip.' },
      { do: 'deliver', car: 'repo', at: OKAFOR_LOT, r: 6, text: "Take it to ~y~Okafor's Motors~w~." },
      { do: 'say', lines: [['okafor', 'Not a scratch. Well. A few scratches. Come and see me again.']] },
    ],
  },
  {
    id: 'm2', giver: 'okafor', title: 'Repo Man', pay: 600,
    steps: [
      { do: 'say', lines: [
        ['okafor', 'Mr. Delacroix owes me for a Kestrel. He parks it outside City Hall like he owns the place.'],
        ['okafor', "It has an alarm. The police will come. Don't bring them here."],
      ] },
      { do: 'car', id: 'kestrel', type: 'sports', paint: 0, at: kerbZ(-40, 8, 1) },
      { do: 'enter', car: 'kestrel', text: 'Steal the ~b~Kestrel~w~ outside City Hall.' },
      { do: 'wanted', stars: 2, text: "The alarm's going off!" },
      { do: 'lose', text: 'Lose the cops. (Or get it resprayed at ~y~Spray-N-Go~w~.)' },
      { do: 'deliver', car: 'kestrel', at: OKAFOR_LOT, r: 6, text: "Bring the Kestrel to ~y~Okafor's Motors~w~." },
      { do: 'say', lines: [['okafor', 'Somebody at the harbour has been asking about you. Lena Voss. Be careful with her.']] },
    ],
  },
  {
    id: 'm3', giver: 'voss', title: 'Collections', pay: 1000,
    steps: [
      { do: 'say', lines: [
        ['voss', "Okafor says you don't scare easily. Good."],
        ['voss', 'Teddy Brill owes me eleven thousand dollars. He drinks at the Pool Hall on the Strip.'],
        ['voss', "Take this. Don't come back without the money."],
      ] },
      { do: 'give', weapon: 'pistol', ammo: 48, text: 'You have a ~y~pistol~w~. Hold right mouse to aim, left to shoot.' },
      { do: 'goto', at: POOL, r: 22, text: 'Go to the ~y~Pool Hall~w~ on the Strip.' },
      { do: 'peds', group: 'brill', kind: 'gang', at: POOL, n: 4, weapon: 'pistol', boss: true },
      { do: 'say', lines: [['brill', "Voss sent a mall cop? Get 'em, boys!"]], wait: false },
      { do: 'kill', group: 'brill', text: "Deal with ~r~Brill's crew~w~." },
      { do: 'pickup', id: 'bag', kind: 'bag', atGroupBoss: 'brill', text: 'Pick up the ~g~money~w~.' },
      { do: 'goto', at: PLACES.voss, r: 4, onFoot: true, text: 'Take the money to ~y~Voss~w~ at the harbour.' },
      { do: 'say', lines: [['voss', "Eleven thousand. You didn't count it. I like that."]] },
    ],
  },
  {
    id: 'm4', giver: 'voss', title: 'Wheelman', pay: 2000,
    steps: [
      { do: 'say', lines: [
        ['voss', "My people are taking a jewellery store in Eastgate. They need a driver who doesn't panic."],
        ['voss', 'Wait outside. When they come out, get them to Pier 3.'],
      ] },
      { do: 'car', id: 'getaway', type: 'sedan', paint: 4, at: kerbX(40, 150, 1) },
      { do: 'enter', car: 'getaway', text: 'Get in the ~b~getaway car~w~.' },
      { do: 'goto', at: { x: 124.9, z: -80 }, r: 6, inCar: 'getaway', text: 'Wait outside the ~y~jewellery store~w~ in Eastgate.' },
      { do: 'wait', s: 3, text: 'Wait for the crew...' },
      { do: 'peds', group: 'crew', kind: 'crew', at: { x: 130, z: -80 }, n: 2, weapon: 'smg', board: 'getaway' },
      { do: 'board', group: 'crew', car: 'getaway', text: 'The crew is coming out!' },
      { do: 'wanted', stars: 3, text: 'The alarm went off. Drive!' },
      { do: 'deliver', car: 'getaway', at: PLACES.pier, r: 7, text: 'Get the crew to ~y~Pier 3~w~.', failIfDead: 'getaway' },
      { do: 'unboard', group: 'crew' },
      { do: 'say', lines: [['voss', 'Clean. You can keep the car.']] },
    ],
  },
  {
    id: 'm5', giver: 'okafor', title: 'Checkpoint', pay: 1500,
    steps: [
      { do: 'say', lines: [
        ['okafor', "Kids race my cars round the city when they think I'm not looking. One of them bet me I couldn't find a driver to beat them."],
        ['okafor', "Take the Kestrel. Through every checkpoint, first. Don't make me pay that boy."],
      ] },
      { do: 'car', id: 'racer', type: 'sports', paint: 8, at: { x: 150, z: 44.9, h: -Math.PI / 2 } },
      { do: 'enter', car: 'racer', text: 'Get in the ~b~Kestrel~w~.' },
      { do: 'race', car: 'racer', points: RACE, racers: 3, text: 'Win the race! Checkpoint ~y~1~w~ of 12.' },
      { do: 'say', lines: [['okafor', 'Ha! First! That boy can walk home.']] },
    ],
  },
  {
    id: 'm6', giver: 'voss', title: 'Convoy', pay: 2500,
    steps: [
      { do: 'say', lines: [
        ['voss', 'Brill has family. They move guns through my harbour in two vans, tonight, out of Mill End.'],
        ['voss', 'I want them burning.'],
      ] },
      { do: 'give', weapon: 'smg', ammo: 120, text: 'You have an ~y~SMG~w~.' },
      { do: 'convoy', ids: ['van1', 'van2'], type: 'van', at: [{ x: -160, z: 120 + 2.6, h: Math.PI / 2 }, { x: -200 - 2.6, z: 150, h: 0 }] },
      { do: 'destroy', cars: ['van1', 'van2'], text: 'Destroy the ~r~vans~w~.' },
      { do: 'say', lines: [['voss', "That's the end of the Brills. Dale Mercer's been asking for you. The old guard. He sounds... scared."]] },
    ],
  },
  {
    id: 'm7', giver: 'dale', title: 'Thirteen', pay: 5000, final: true,
    steps: [
      { do: 'say', lines: [
        ['dale', 'You were at Kingsgate that week. You saw them move.'],
        ['dale', "The auction house says they sold thirteen mannequins out of Halvorsen's. There were fourteen."],
        ['dale', 'The last one is in a crate at Pier 3. Bring it to where the mall was. And whatever you do, keep looking at them.'],
      ] },
      { do: 'goto', at: PLACES.pier, r: 18, text: 'Go to ~y~Pier 3~w~.' },
      { do: 'mannequins', group: 'mq', at: PLACES.pier, n: 9 },
      { do: 'pickup', id: 'crate', kind: 'crate', at: { x: -22, z: 230 }, text: "Find the ~y~crate~w~. Don't look away from them." },
      { do: 'goto', at: PLACES.ruins, r: 9, carry: 'crate', text: 'Take the crate to the ~y~Old Mall Site~w~.' },
      { do: 'target', id: 'crate', at: PLACES.ruins, hp: 120, text: 'Destroy the ~r~crate~w~.' },
      { do: 'clear', group: 'mq' },
      { do: 'say', lines: [['dale', "It's quiet. Thirteen. Just thirteen. Thank you, kid. Go home."]] },
    ],
  },
];

// what the shop sells
export const SHOP = [
  { key: 'pistol', label: 'Pistol', weapon: 'pistol' },
  { key: 'smg', label: 'SMG', weapon: 'smg' },
  { key: 'shotgun', label: 'Shotgun', weapon: 'shotgun' },
  { key: 'armor', label: 'Body armour', armor: true },
];

// Thirteen security tapes from Kingsgate Mall, lost round the city. Find
// them all.
export const TAPES = [
  [-161, -28], [-79, -158.5], [0, -130], [84.5, -83], [160, -150], [-160, 75], [-75, 70],
  [-1, -28], [158, 14], [80, 150], [-150, 170], [164, 230], [-60, 230],
];
export const TAPE_PAY = 250;
export const TAPES_BONUS = 5000;

// what pedestrians say
export const BARKS = {
  hit: ['Hey!', 'Watch it!', "What's your problem?", 'Ow!'],
  flee: ['Help!', "He's got a gun!", 'Run!', 'Call the cops!', 'Oh my God!'],
  car: ['Hey, that\'s my car!', 'Get out of my car!', 'Somebody stop them!'],
  cop: ['Freeze! Police!', 'Get on the ground!', 'Stop right there!', 'Suspect on foot!', "You're under arrest!"],
  copShoot: ['Shots fired!', 'Take them down!', 'Officer needs assistance!'],
  gang: ['You picked the wrong street!', 'Get them!', "Brill sends his regards!"],
};
export const DISPATCH = {
  1: 'All units, we have a disturbance in {area}.',
  2: 'Units in {area}, suspect is armed. Proceed with caution.',
  3: 'Code three. All units to {area}.',
  4: 'Suspect is extremely dangerous. Use of force authorised.',
  5: 'Every unit in Kingsgate, converge on {area}.',
  lost: 'Lost visual on the suspect. Search the area.',
  clear: 'All units, suspect is gone. Resume patrol.',
};

export const HELP = [
  'Steal a car: walk up to one and press F. Press F again to get out.',
  'Hold right mouse to aim, left mouse to shoot. Q and E (or the wheel) switch weapons.',
  'Stars mean the police want you. Get out of their sight until they give up, or drive into Spray-N-Go.',
  'Walk into a big letter on the radar to start a job.',
];
