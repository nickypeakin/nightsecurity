// Everything anyone says, and the jobs. San Cielo, now. You're Isaiah
// "Zay" Carter from the Flats, twenty-three, broke, with a car that
// mostly runs and a best friend, Dre, who is always one bad idea from
// trouble. The people with work for the two of you: Ray Okafor, who sells
// cars in Eastgate and buys back the ones people stopped paying for; Lena
// Voss, who runs the freight yards at the Docks and everything that goes
// through them; and Vince Moreno, who robbed armoured trucks for twenty
// years and retired to a big house in Palm Ridge, mostly.
//
// A mission is a list of steps the host works through in order (see
// host/missions.js for what each one does).

import { PLACES, BUILDINGS, BLOCKS, NODES, PARK, WALK_NODES } from './city.js';
import { COUNTRY, SUMMIT, SIGN, LAKE, ROUTE, along } from './world.js';
import { INTERIOR } from './interiors.js';

export const TITLE = 'GTA 7';
export const PLACE_NAME = 'San Cielo';

export const PEOPLE = {
  dre: { name: 'Dre', voice: 'dre', blip: 'D', color: '#7aff9a' },
  okafor: { name: 'Ray Okafor', voice: 'okafor', blip: 'O', color: '#7ad0ff' },
  voss: { name: 'Lena Voss', voice: 'voss', blip: 'V', color: '#ff7a9a' },
  vince: { name: 'Vince Moreno', voice: 'vince', blip: 'M', color: '#ffd06a' },
};
// who's who in the subtitles
export const NAMES = { you: 'Zay', dre: 'Dre', okafor: 'Ray Okafor', voss: 'Lena Voss', vince: 'Vince Moreno', brill: 'Teddy Brill' };

const shopAt = (name) => {
  const b = BUILDINGS.find((q) => q.name === name);
  const f = { n: [0, -2.4], s: [0, 2.4], e: [2.4, 0], w: [-2.4, 0] }[b.face || 'n'];
  const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
  return { x: b.face === 'e' ? b.x1 + 2.4 : b.face === 'w' ? b.x0 - 2.4 : x, z: b.face === 's' ? b.z1 + 2.4 : b.face === 'n' || !b.face ? b.z0 - 2.4 : z, f };
};
const node = (x, z) => NODES.find((n) => n.city && n.x === x && n.z === z);
// a spot at the kerb of the street north of a block, `k` of the way along,
// facing east (for a car to be parked at)
const kerbN = (b, k = 0.5) => ({ x: b.x0 + (b.x1 - b.x0) * k, z: b.z0 - 9 + PARK, h: Math.PI / 2 });
const kerbS = (b, k = 0.5) => ({ x: b.x0 + (b.x1 - b.x0) * k, z: b.z1 + 9 - PARK, h: -Math.PI / 2 });
const blockOf = (pred) => BLOCKS.find(pred);

const HOME = INTERIOR.home.door;
const LOT = PLACES.lot;
const POOL = shopAt('Pool Hall');
const STORE = shopAt('Diamond Exchange');
const BEACH = blockOf((b) => b.kind === 'beach' && b.j0 === 3);
const RIDGE = blockOf((b) => b.kind === 'mansions' && b.j0 === 1 && b.i0 === 2);
const STARLIGHT = blockOf((b) => b.kind === 'starlight' && b.j0 === 0 && b.i0 === 5);
const VOSS_BLOCK = blockOf((b) => b.kind === 'voss');
const TRUCK_START = blockOf((b) => b.kind === 'starlight' && b.j0 === 1 && b.i0 === 4);
// the street race: round Starlight, down through Downtown, out to Eastgate
// and back up through Mirror Hills (every checkpoint a junction)
const RACE = [[-50, -380], [20, -380], [20, -300], [20, -220], [20, -150], [20, -80], [90, -80], [160, -80], [240, -80], [240, -150], [240, -220], [240, -300], [160, -300], [160, -380], [90, -380]];
for (const [x, z] of RACE) if (!node(x, z)) throw new Error(`race checkpoint ${x}, ${z} isn't a junction`);

export const MISSIONS = [
  {
    id: 'm1', giver: 'dre', title: 'Easy Money', pay: 500,
    steps: [
      { do: 'say', lines: [
        ['dre', "Look who's up. I ate your cereal, by the way."],
        ['you', 'That was the last of it, Dre.'],
        ['dre', "Then we better get paid. Ray Okafor's buying back cars from people who stopped paying for them. Five hundred a car."],
        ['dre', "There's one down at Pelican Beach. You drive, I'll navigate. Come on, I'm outside."],
      ] },
      { do: 'peds', group: 'dre', kind: 'crew', look: 'dre', at: { x: HOME.x + 2, z: HOME.z + 1.5 }, n: 1, friend: true },
      { do: 'board', group: 'dre', car: 'player', text: "Get in your ~b~car~w~ (the blue arrow on the radar). ~b~Dre~w~'s coming with you." },
      { do: 'car', id: 'repo', type: 'sports', paint: 0, at: kerbN(BEACH, 0.45) },
      { do: 'say', lines: [['dre', "Ray sold my cousin a car once. No engine. He called it a project."], ['you', 'And you want to work for him.'], ['dre', 'I want to get paid by him. Different thing.']], wait: false },
      { do: 'goto', at: kerbN(BEACH, 0.45), r: 16, with: 'dre', text: 'Drive to ~y~Pelican Beach~w~ with ~b~Dre~w~.' },
      { do: 'unboard', group: 'dre', stay: true },
      { do: 'enter', car: 'repo', text: 'Get in the ~b~Kestrel~w~.' },
      { do: 'board', group: 'dre', car: 'repo', text: 'Wait for ~b~Dre~w~.' },
      { do: 'say', lines: [['dre', "Smells like sunscreen and bad decisions. Let's go."]], wait: false },
      { do: 'deliver', car: 'repo', at: LOT, r: 8, text: "Take it to ~y~Okafor's Motors~w~ in Eastgate." },
      { do: 'unboard', group: 'dre' },
      { do: 'say', lines: [
        ['okafor', 'Not one scratch. Well. A few scratches.'],
        ['okafor', "You want more work, Isaiah, you come to my office. Just you. Your friend makes my customers nervous."],
        ['dre', "I'm standing right here, Ray."],
      ] },
    ],
  },
  {
    id: 'm2', giver: 'okafor', title: 'Alarm Bells', pay: 750,
    steps: [
      { do: 'say', lines: [
        ['okafor', 'Sit down. A dentist in Palm Ridge bought a Kestrel from me in March. He has paid for none of it.'],
        ['okafor', "He keeps it in his drive like a trophy. It has an alarm, so the police will come."],
        ['okafor', "Don't bring them here. Lose them first, or take it to Spray-N-Go in Mill End. A new colour and nobody's looking for it."],
      ] },
      { do: 'car', id: 'kestrel', type: 'sports', paint: 4, at: kerbS(RIDGE, 0.3) },
      { do: 'enter', car: 'kestrel', text: "Take the dentist's ~b~Kestrel~w~ in ~y~Palm Ridge~w~." },
      { do: 'wanted', stars: 2, text: "The alarm's going off!" },
      { do: 'lose', text: 'Lose the cops (or get a respray at ~y~Spray-N-Go~w~).' },
      { do: 'deliver', car: 'kestrel', at: LOT, r: 8, text: "Bring the Kestrel to ~y~Okafor's Motors~w~." },
      { do: 'say', lines: [['okafor', 'Good. Here.'], ['okafor', 'A woman called Lena Voss came by asking if I knew any drivers. I said no. She asked again. Be careful with that one.']] },
    ],
  },
  {
    id: 'm3', giver: 'dre', title: 'Bad Company', pay: 1200,
    steps: [
      { do: 'say', lines: [
        ['dre', 'Zay. I messed up.'],
        ['dre', 'I owe Teddy Brill two thousand dollars, and he wants it today. Or my knees. He was clear about the knees.'],
        ['you', 'So pay him.'],
        ['dre', "With what? He drinks at the Pool Hall on the Strip. We go, we talk, we leave. Here, take this. Just in case. It's probably not loaded."],
      ] },
      { do: 'give', weapon: 'pistol', ammo: 60, text: 'You have a ~y~pistol~w~. Hold right mouse to aim, left mouse to shoot.' },
      { do: 'peds', group: 'dre', kind: 'crew', look: 'dre', at: { x: HOME.x + 2, z: HOME.z + 1.5 }, n: 1, friend: true },
      { do: 'board', group: 'dre', car: 'player', text: 'Get in a car with ~b~Dre~w~.' },
      { do: 'goto', at: POOL, r: 22, with: 'dre', text: 'Drive to the ~y~Pool Hall~w~ on the Strip.' },
      { do: 'peds', group: 'brill', kind: 'gang', at: POOL, n: 5, weapon: 'pistol', boss: true },
      { do: 'say', lines: [['brill', "Dre! You brought my money, or you brought a friend? Get 'em!"]], wait: false },
      { do: 'kill', group: 'brill', text: "Deal with ~r~Brill's crew~w~." },
      { do: 'pickup', id: 'bag', kind: 'bag', atGroupBoss: 'brill', text: "Pick up ~g~Brill's money~w~." },
      { do: 'board', group: 'dre', car: 'player', text: 'Get back in a car with ~b~Dre~w~.' },
      { do: 'say', lines: [['dre', 'So we owe him nothing now. Technically.'], ['you', "Technically he's not asking."]], wait: false },
      { do: 'goto', at: HOME, r: 10, with: 'dre', text: 'Take ~b~Dre~w~ home to ~y~the Flats~w~.' },
      { do: 'unboard', group: 'dre' },
      { do: 'say', lines: [['dre', 'Two grand AND his whole crew. Remind me never to owe you money.']] },
    ],
  },
  {
    id: 'm4', giver: 'voss', title: 'The Driver', pay: 2000,
    steps: [
      { do: 'say', lines: [
        ['voss', "Okafor says you're not a driver. That's how I knew you were."],
        ['voss', 'My people are taking the Diamond Exchange, downtown, in ten minutes. They need somebody outside who doesn\'t panic.'],
        ['voss', 'When they come out, you get them to Pier 9 in one piece. Them, and what they carry.'],
      ] },
      { do: 'car', id: 'getaway', type: 'sedan', paint: 4, at: kerbN(VOSS_BLOCK, 0.6) },
      { do: 'enter', car: 'getaway', text: 'Get in the ~b~getaway car~w~.' },
      { do: 'goto', at: STORE, r: 9, inCar: 'getaway', text: 'Wait outside the ~y~Diamond Exchange~w~ downtown.' },
      { do: 'wait', s: 3, text: 'Wait for the crew...' },
      { do: 'peds', group: 'crew', kind: 'crew', at: STORE, n: 2, weapon: 'smg' },
      { do: 'board', group: 'crew', car: 'getaway', text: 'The crew is coming out!' },
      { do: 'wanted', stars: 3, text: 'The alarm went off. Drive!' },
      { do: 'deliver', car: 'getaway', at: PLACES.pier, r: 9, text: 'Get the crew to ~y~Pier 9~w~ at the harbour.', failIfDead: 'getaway' },
      { do: 'unboard', group: 'crew' },
      { do: 'say', lines: [['voss', 'Clean. Keep the car. I will call you.']] },
    ],
  },
  {
    id: 'm5', giver: 'dre', title: 'Street Kings', pay: 1500,
    steps: [
      { do: 'say', lines: [
        ['dre', 'Saturday night, Starlight. Racers from all over the city. A grand to enter, winner takes the pot.'],
        ['dre', 'I put your name down.'],
        ['you', 'You did what?'],
        ['dre', "Relax. I put Okafor's Kestrel down too. He doesn't know yet. Don't scratch it."],
      ] },
      { do: 'car', id: 'racer', type: 'sports', paint: 8, at: { x: STARLIGHT.x0 + 8, z: STARLIGHT.z0 - 9 + 2.6, h: Math.PI / 2 } },
      { do: 'enter', car: 'racer', text: 'Get in the ~b~Kestrel~w~ in ~y~Starlight~w~.' },
      { do: 'race', car: 'racer', points: RACE, racers: 3, text: `Win the race! Checkpoint ~y~1~w~ of ${RACE.length}.` },
      { do: 'say', lines: [['dre', "THAT'S my boy! The pot's yours. Minus my cut. And Okafor's cut. Mostly Okafor's cut."]] },
    ],
  },
  {
    id: 'm6', giver: 'voss', title: 'Hot Cargo', pay: 3000,
    steps: [
      { do: 'say', lines: [
        ['voss', 'A freight company at the airport is holding one of my trucks. Customs. Paperwork. Tiresome.'],
        ['voss', "Bring it back to my yard. Airport security will call the police, so don't let them follow you home."],
      ] },
      { do: 'car', id: 'cargo', type: 'van', paint: 10, at: COUNTRY.cargo },
      { do: 'enter', car: 'cargo', text: 'Take the ~b~cargo truck~w~ from ~y~San Cielo International~w~.' },
      { do: 'wanted', stars: 3, text: 'Airport security called it in!' },
      { do: 'lose', text: 'Lose the cops.' },
      { do: 'deliver', car: 'cargo', at: PLACES.voss, r: 9, text: 'Bring the truck to ~y~Voss Freight~w~ at the Docks.' },
      { do: 'say', lines: [['voss', "You're expensive. You're worth it."], ['voss', "Somebody else wants to meet you. Vince Moreno, up in Palm Ridge. Don't keep him waiting; he doesn't."]] },
    ],
  },
  {
    id: 'm7', giver: 'vince', title: 'The Score', pay: 10000,
    steps: [
      { do: 'say', lines: [
        ['vince', "So you're the driver. Sit down. Drink?"],
        ['you', "I'm good."],
        ['vince', 'Every week an armoured truck takes the cash from the Starlight casinos across town. It never takes the same streets twice. Twelve minutes on the road.'],
        ['vince', 'You stop it, you open it, you take the bags, you lose the police. Then you bring the bags here. I did this for twenty years. Do it once.'],
      ] },
      { do: 'give', weapon: 'smg', ammo: 160, text: 'You have an ~y~SMG~w~.' },
      { do: 'convoy', ids: ['truck'], type: 'van', paint: 10, hp: 320, at: [kerbS(TRUCK_START, 0.5)] },
      { do: 'destroy', cars: ['truck'], text: 'Stop the ~r~armoured truck~w~.' },
      { do: 'loot', car: 'truck', n: 4, text: 'Grab the ~g~cash bags~w~.' },
      { do: 'wanted', stars: 4, text: 'Every cop in San Cielo is coming!' },
      { do: 'lose', text: 'Lose the cops.' },
      { do: 'goto', at: PLACES.vince, r: 7, text: "Bring the money to ~y~Vince's place~w~ in Palm Ridge." },
      { do: 'say', lines: [['vince', 'Four bags. Not bad for a kid from the Flats.'], ['vince', "Your share's on the table. Now go home. Somebody's going to come asking about this, and I'd rather it wasn't tonight."]] },
    ],
  },
  {
    id: 'm8', giver: 'vince', title: 'Paid in Full', pay: 15000, final: true,
    steps: [
      { do: 'say', lines: [
        ['vince', "Lena Voss says that truck was hers. All of it. She took your friend to make the point."],
        ['you', 'She took Dre?'],
        ['vince', "The container terminal at the Docks. She wants the money. She's not going to get it, and she's not keeping your friend. Take this."],
      ] },
      { do: 'give', weapon: 'shotgun', ammo: 40, text: 'You have a ~y~shotgun~w~.' },
      { do: 'goto', at: PLACES.terminal, r: 36, text: 'Get to the ~y~container terminal~w~ at the Docks.' },
      { do: 'peds', group: 'voss', kind: 'gang', at: PLACES.terminal, n: 8, weapon: 'smg', boss: true, bossLook: 'voss' },
      { do: 'say', lines: [['voss', 'You should have stayed a driver.']], wait: false },
      { do: 'kill', group: 'voss', text: "Take out ~r~Voss and her crew~w~." },
      { do: 'peds', group: 'dre', kind: 'crew', look: 'dre', at: PLACES.terminal, n: 1, friend: true },
      { do: 'say', lines: [['dre', "Zay! Over here! They tied me to a forklift. A FORKLIFT."]], wait: false },
      { do: 'board', group: 'dre', car: 'player', text: 'Get in a car with ~b~Dre~w~.' },
      { do: 'goto', at: HOME, r: 10, with: 'dre', text: 'Take ~b~Dre~w~ home.' },
      { do: 'unboard', group: 'dre' },
      { do: 'say', lines: [
        ['dre', 'You came.'],
        ['you', 'Course I came.'],
        ['dre', "Then I guess we're even for the cereal."],
      ] },
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

// Twenty hidden packages: twelve round the city (on the sidewalks at block
// corners, a different part of town each) and eight out on the island.
export const PACKAGES = (() => {
  const out = [];
  const seen = new Set();
  for (const b of BLOCKS) {
    if (out.length >= 12 || seen.has(b.name) || b.kind === 'home') continue;
    seen.add(b.name);
    const w = WALK_NODES[b.walk[(b.id * 7) % 4]];
    out.push([Math.round(w.x * 10) / 10, Math.round(w.z * 10) / 10]);
  }
  const P = COUNTRY.pier;
  const port = COUNTRY.towns.find((t) => t.name === 'Port Kerry'), dust = COUNTRY.towns.find((t) => t.name === 'Dust Creek');
  const hill = along(ROUTE.hill, 420), lake = along(ROUTE.eastN, 320);
  out.push(
    [P.x0 + 30, (P.z0 + P.z1) / 2], [SUMMIT.x + 6, SUMMIT.z + 6], [SIGN.x, SIGN.z + 8], [hill.x - hill.dz * 10, hill.z + hill.dx * 10],
    [lake.x - lake.dz * 12, lake.z + lake.dx * 12], [port.x + 8, port.z + 30], [dust.x - 20, dust.z], [LAKE.x + LAKE.rx * 1.25, LAKE.z],
  );
  return out.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
})();
export const PACKAGE_PAY = 500;
// guns, armour and health lying about town (they come back a minute after
// you take them): [kind, x, z]
export const PICKUPS = (() => {
  const at = (kind, k) => { const b = blockOf((q) => q.kind === kind); const w = WALK_NODES[b.walk[k]]; return [w.x, w.z]; };
  return [
    ['health', PLACES.hospital.x + 3, PLACES.hospital.z], ['armor', PLACES.police.x + 4, PLACES.police.z],
    ['pistol', ...at('yard', 1)], ['shotgun', ...at('site', 2)], ['smg', ...at('docks', 0)], ['health', ...at('park', 3)], ['armor', ...at('beach', 1)],
  ];
})();
export const PACKAGES_BONUS = 10000;

// what pedestrians say
export const BARKS = {
  hit: ['Hey!', 'Watch it!', "What's your problem?", 'Ow!'],
  flee: ['Help!', "He's got a gun!", 'Run!', 'Call the cops!', 'Oh my God!'],
  car: ["Hey, that's my car!", 'Get out of my car!', 'Somebody stop them!'],
  cop: ['Freeze! Police!', 'Get on the ground!', 'Stop right there!', 'Suspect on foot!', "You're under arrest!"],
  copShoot: ['Shots fired!', 'Take them down!', 'Officer needs assistance!'],
  gang: ['You picked the wrong street!', 'Get them!', 'Wrong neighbourhood!'],
};
export const DISPATCH = {
  1: 'All units, we have a disturbance in {area}.',
  2: 'Units in {area}, suspect is armed. Proceed with caution.',
  3: 'Code three. All units to {area}.',
  4: 'Suspect is extremely dangerous. Use of force authorised.',
  5: 'Every unit in San Cielo, converge on {area}.',
  lost: 'Lost visual on the suspect. Search the area.',
  clear: 'All units, suspect is gone. Resume patrol.',
};

export const HELP = [
  'Steal a car: walk up to one and press F. Press F again to get out.',
  'Hold right mouse to aim, left mouse to shoot. Q and E (or the wheel) switch weapons.',
  'Stars mean the police want you. Get out of their sight until they give up, or drive into Spray-N-Go.',
  'Walk into a big letter on the radar to start a job.',
];
