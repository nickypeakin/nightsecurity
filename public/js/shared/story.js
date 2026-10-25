// Everything anyone says, and the jobs. San Cielo, now. You're Franklin,
// from the Flats: young, broke, repossessing cars for a crooked dealer and
// wondering if this is it. Lamar, your best friend since the second grade,
// is sure the next idea is the one. Then a repo job goes wrong in Palm
// Ridge and you meet Michael, who used to rob banks for a living and is
// very bored of not robbing them; through him, Lester, who plans the jobs,
// and Trevor, who ruins them. And Stretch, Lamar's old friend, is out of
// prison and running with the Ballas now.
//
// (A fan game's homage to GTA V's people: every line here is new.)
//
// A mission is a list of steps the host works through in order (see
// host/missions.js for what each one does); `call` is what the person with
// the job says when they phone you about it.

import { PLACES, BUILDINGS, BLOCKS, NODES, PARK, WALK_NODES } from './city.js';
import { COUNTRY, SUMMIT, SIGN, LAKE, ROUTE, along } from './world.js';
import { INTERIOR } from './interiors.js';

export const TITLE = 'GTA 7';
export const PLACE_NAME = 'San Cielo';

// the people with jobs (their letter on the radar)
export const PEOPLE = {
  lamar: { name: 'Lamar Davis', voice: 'lamar', blip: 'L', color: '#7aff9a' },
  simeon: { name: 'Simeon Yetarian', voice: 'simeon', blip: 'S', color: '#7ad0ff' },
  michael: { name: 'Michael De Santa', voice: 'michael', blip: 'M', color: '#ffd06a' },
  lester: { name: 'Lester Crest', voice: 'lester', blip: 'L', color: '#d08aff' },
};
// who's who in the subtitles
export const NAMES = { you: 'Franklin', lamar: 'Lamar', simeon: 'Simeon', michael: 'Michael', lester: 'Lester', trevor: 'Trevor', stretch: 'Stretch', ballas: 'Balla' };

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
const ESTATE = blockOf((b) => b.kind === 'estate');
const MILL = blockOf((b) => b.kind === 'mill' && b.j0 === 5);
const STARLIGHT = blockOf((b) => b.kind === 'starlight' && b.j0 === 0 && b.i0 === 5);
const TRUCK_START = blockOf((b) => b.kind === 'starlight' && b.j0 === 1 && b.i0 === 4);
const CARGO = COUNTRY.cargo;
// the race back from the beach to Simeon's: along the avenue, round City
// Hall's plaza and out to Eastgate (every checkpoint a junction)
const TO_SIMEON = [[-340, -150], [-190, -150], [-120, -150], [-120, -80], [20, -80], [160, -80], [240, -80], [240, -150], [320, -150]];
// the street race: round Starlight, down through Downtown, out to Eastgate
// and back up through Mirror Hills
const RACE = [[-50, -380], [20, -380], [20, -300], [20, -220], [20, -150], [20, -80], [90, -80], [160, -80], [240, -80], [240, -150], [240, -220], [240, -300], [160, -300], [160, -380], [90, -380]];
for (const [x, z] of [...TO_SIMEON, ...RACE]) if (!node(x, z)) throw new Error(`race checkpoint ${x}, ${z} isn't a junction`);

export const MISSIONS = [
  {
    id: 'm1', giver: 'lamar', title: 'Franklin and Lamar', pay: 600,
    steps: [
      { do: 'say', lines: [
        ['lamar', "F! There he is. Sleeping Beauty. I ate your cereal, by the way."],
        ['you', 'That was the last of it, Lamar.'],
        ['lamar', "Then we better get paid, homie. Simeon's got two cars need bringing in from Pelican Beach. Some dentist and his girlfriend stopped paying in April."],
        ['lamar', "We drive down together, we each take one, we race back to the lot. Loser buys the chicken."],
        ['you', "You always lose and you never buy the chicken."],
        ['lamar', "That's 'cause I'm a visionary, dog. Visionaries don't carry cash. Let's go."],
      ] },
      { do: 'peds', group: 'lamar', kind: 'crew', look: 'lamar', at: { x: HOME.x + 2, z: HOME.z + 1.5 }, n: 1, friend: true },
      { do: 'board', group: 'lamar', car: 'player', text: "Get in your ~b~car~w~ (the blue arrow on the radar). ~b~Lamar~w~'s riding with you." },
      { do: 'car', id: 'repo', type: 'sports', paint: 0, at: kerbN(BEACH, 0.45) },
      { do: 'say', lines: [
        ['lamar', 'You still listening to this? Change the station, man.'],
        ['you', 'My car, my station.'],
        ['lamar', "Your car is Simeon's car, technically. You're two payments behind. I'm just saying, he could repo YOU."],
      ], wait: false },
      { do: 'goto', at: kerbN(BEACH, 0.45), r: 18, with: 'lamar', text: 'Drive to ~y~Pelican Beach~w~ with ~b~Lamar~w~.' },
      { do: 'unboard', group: 'lamar', stay: true },
      { do: 'enter', car: 'repo', text: "Get in the dentist's ~b~Kestrel~w~. Lamar's taking the other one." },
      { do: 'race', car: 'repo', points: TO_SIMEON, racers: 1, driver: 'lamar', rivalLook: 'lamar', text: `Race ~b~Lamar~w~ back to Simeon's. Checkpoint ~y~1~w~ of ${TO_SIMEON.length}.` },
      { do: 'deliver', car: 'repo', at: LOT, r: 9, text: "Park it in ~y~Simeon's lot~w~." },
      { do: 'say', lines: [
        ['simeon', "My boys! Look at this. Not one scratch. Well. One scratch. Is fine, I put it on the bill."],
        ['lamar', 'Pay the man, Simeon. Pay me too.'],
        ['simeon', "Franklin, you come to my office tomorrow, I have special work. Only for you. Lamar, you frighten my customers."],
        ['lamar', "I frighten everybody, Simeon. That's called charisma."],
      ] },
    ],
  },
  {
    id: 'm2', giver: 'simeon', title: 'Repossession', pay: 800,
    call: [
      ['simeon', "Franklin! My friend. Simeon. Come see me at the office, I have a job only you can do. Not Lamar. Lamar is very loud."],
    ],
    steps: [
      { do: 'say', lines: [
        ['simeon', 'Sit, sit. A customer in Mill End, he buys a beautiful car from me. One payment. Then nothing. Like a ghost.'],
        ['simeon', 'And now his friends, they keep my car in their yard. These friends, they are the Ballas. You understand?'],
        ['you', 'You want me to steal a car out of a Ballas yard.'],
        ['simeon', "Repossess! Is completely legal. Mostly. Bring it back with no holes, please. Holes I can't sell."],
      ] },
      { do: 'car', id: 'ride', type: 'sedan', paint: 5, at: kerbN(MILL, 0.4) },
      { do: 'peds', group: 'ballas', kind: 'gang', at: { x: MILL.x0 + (MILL.x1 - MILL.x0) * 0.4, z: MILL.z0 - 1.5 }, n: 4, weapon: 'pistol' },
      { do: 'enter', car: 'ride', text: "Take Simeon's ~b~car~w~ back from the ~r~Ballas~w~ in ~y~Mill End~w~." },
      { do: 'say', lines: [['ballas', "Yo! That's our ride! Get him!"]], wait: false },
      { do: 'deliver', car: 'ride', at: LOT, r: 9, text: "Get it back to ~y~Simeon's lot~w~ in one piece." },
      { do: 'say', lines: [
        ['simeon', "Ah! Some scratches, some little holes. I am a fair man, I don't take it from your money. Today."],
        ['simeon', 'Tomorrow, an easy one. A rich man in Palm Ridge. Very soft. He plays golf.'],
      ] },
    ],
  },
  {
    id: 'm3', giver: 'simeon', title: 'Complications', pay: 500,
    call: [
      ['simeon', "Franklin. The easy one I told you about. Come to the office. Is very easy. I promise you. On my mother."],
    ],
    steps: [
      { do: 'say', lines: [
        ['simeon', 'A Kestrel, outside the big house in Palm Ridge. The owner bought it for his son, and the son, he stops paying.'],
        ['you', 'Every time you say easy, somebody shoots at me.'],
        ['simeon', 'Nobody shoots in Palm Ridge! They sue. Is much worse. Go, go.'],
      ] },
      { do: 'car', id: 'kestrel', type: 'sports', paint: 9, at: kerbS(ESTATE, 0.75) },
      { do: 'enter', car: 'kestrel', text: 'Take the ~b~Kestrel~w~ from outside the big house in ~y~Palm Ridge~w~.' },
      { do: 'peds', group: 'michael', kind: 'crew', look: 'michael', at: kerbS(ESTATE, 0.75), n: 1, friend: true, inCar: 'kestrel' },
      { do: 'say', lines: [
        ['michael', "Don't turn around. Keep driving."],
        ['you', 'Whoa! Who the hell are you?'],
        ['michael', "The guy whose car this is. I've been sitting back here since breakfast, waiting for whoever Simeon sent."],
        ['michael', 'Relax, kid. I just want a word with the man who sold my son a loan he could never pay. Take me to him.'],
      ], wait: false },
      { do: 'goto', at: LOT, r: 12, with: 'michael', text: "Drive ~b~the man in the back seat~w~ to ~y~Simeon's~w~." },
      { do: 'unboard', group: 'michael' },
      { do: 'say', lines: [
        ['michael', "Simeon. You sold my kid a car with a loan built to fail, then sent this kid to steal it back. That's a whole business, huh?"],
        ['simeon', 'Sir, please, is just business!'],
        ['michael', "So's this. My son's done paying. You're done calling. And if I see your face in Palm Ridge, you'll be done with that too."],
        ['michael', "And you, kid. You've got a good head. Don't waste it doing this clown's dirty work."],
        ['you', "Yeah? What should I be doing?"],
        ['michael', 'Something that pays. I might call you.'],
      ] },
    ],
  },
  {
    id: 'm4', giver: 'lamar', title: 'Old Friends', pay: 1500,
    call: [
      ['lamar', "F! Simeon just called me crying, dog. Said some rich dude in a golf shirt talked to him so bad he locked himself in the bathroom."],
      ['lamar', "Anyway. Come home. Big news."],
    ],
    steps: [
      { do: 'say', lines: [
        ['lamar', 'Guess who got out. Stretch!'],
        ['you', 'Stretch. Who got locked up for shooting a guy over a parking space.'],
        ['lamar', "That was a misunderstanding. The space was his. He wants to meet us, at the Pool Hall on the Strip. Says he's got business."],
        ['lamar', "Here. Take this. Just in case. It's not even loaded. ...Okay, it's loaded. Don't tell my mama."],
      ] },
      { do: 'give', weapon: 'pistol', ammo: 60, text: 'You have a ~y~pistol~w~. Hold right mouse to aim, left mouse to shoot.' },
      { do: 'peds', group: 'lamar', kind: 'crew', look: 'lamar', at: { x: HOME.x + 2, z: HOME.z + 1.5 }, n: 1, friend: true },
      { do: 'board', group: 'lamar', car: 'player', text: 'Get in a car with ~b~Lamar~w~.' },
      { do: 'say', lines: [
        ['lamar', 'Stretch says he changed. Says he did a lot of reading inside.'],
        ['you', 'Reading what?'],
        ['lamar', "I don't know, dog. Books. Big ones."],
      ], wait: false },
      { do: 'goto', at: POOL, r: 22, with: 'lamar', text: 'Drive to the ~y~Pool Hall~w~ on the Strip.' },
      { do: 'peds', group: 'ballas', kind: 'gang', at: POOL, n: 5, weapon: 'pistol', boss: true },
      { do: 'say', lines: [
        ['ballas', "Stretch said you'd show up. Said you'd be dumb enough to come in a pair."],
        ['lamar', "STRETCH set this up? Oh, he's dead. He is so dead!"],
      ], wait: false },
      { do: 'kill', group: 'ballas', text: 'Deal with the ~r~Ballas~w~.' },
      { do: 'pickup', id: 'bag', kind: 'bag', atGroupBoss: 'ballas', text: 'Grab the ~g~money~w~ they were going to pay Stretch.' },
      { do: 'board', group: 'lamar', car: 'player', text: 'Get back in a car with ~b~Lamar~w~.' },
      { do: 'say', lines: [
        ['lamar', 'My day-one, F. My day-one sold us out.'],
        ['you', 'Your day-one sold us to the Ballas for a pool table.'],
      ], wait: false },
      { do: 'goto', at: HOME, r: 10, with: 'lamar', text: 'Take ~b~Lamar~w~ home to ~y~the Flats~w~.' },
      { do: 'unboard', group: 'lamar' },
      { do: 'say', lines: [
        ['lamar', "I'ma find him."],
        ['you', "No. You're gonna sit down, eat something and let it go."],
        ['lamar', '...After I find him.'],
      ] },
    ],
  },
  {
    id: 'm5', giver: 'michael', title: 'The Driver', pay: 2500,
    call: [
      ['michael', "Franklin? It's Michael. The guy from the back seat. Come up to the house in Palm Ridge. I might have something for you."],
    ],
    steps: [
      { do: 'say', lines: [
        ['michael', 'Come in. Shoes off. My wife has a thing about the rugs.'],
        ['michael', "I used to do this for a living, kid. Banks. Armoured trucks. Then I made a deal, retired, and moved up here. Now I sit by the pool and my son plays video games eighteen hours a day."],
        ['michael', "I'm bored. And bored is dangerous for a guy like me. Some old friends are hitting the Diamond Exchange downtown. They need a driver who doesn't panic."],
        ['you', 'And you?'],
        ['michael', "I sit in the passenger seat and give you notes. Let's go."],
      ] },
      { do: 'car', id: 'getaway', type: 'sedan', paint: 4, at: kerbS(ESTATE, 0.3) },
      { do: 'peds', group: 'michael', kind: 'crew', look: 'michael', at: PLACES.michael, n: 1, friend: true },
      { do: 'enter', car: 'getaway', text: 'Get in the ~b~getaway car~w~.' },
      { do: 'board', group: 'michael', car: 'getaway', text: 'Wait for ~b~Michael~w~.' },
      { do: 'say', lines: [
        ['michael', "Ten and two, kid. Don't drive like you stole it. Drive like you're late for a dentist."],
        ['you', 'Who drives fast to the dentist?'],
        ['michael', "Exactly. Nobody looks twice."],
      ], wait: false },
      { do: 'goto', at: STORE, r: 9, inCar: 'getaway', with: 'michael', text: 'Pull up outside the ~y~Diamond Exchange~w~ downtown.' },
      { do: 'wait', s: 3, text: 'Wait for the crew...' },
      { do: 'peds', group: 'crew', kind: 'crew', at: STORE, n: 2, weapon: 'smg' },
      { do: 'board', group: 'crew', car: 'getaway', text: 'The crew is coming out!' },
      { do: 'wanted', stars: 3, text: 'The alarm went off. Drive!' },
      { do: 'say', lines: [['michael', "There it is. Okay. Now you drive like you stole it."]], wait: false },
      { do: 'deliver', car: 'getaway', at: PLACES.pier, r: 9, text: 'Get everyone to ~y~Pier 9~w~ at the harbour.', failIfDead: 'getaway' },
      { do: 'unboard', group: 'crew' },
      { do: 'unboard', group: 'michael' },
      { do: 'say', lines: [
        ['michael', "Not bad. Not bad at all. You drive like a guy with nothing to lose."],
        ['you', "I don't have anything to lose."],
        ['michael', "Yeah. That's what worries me. Go home, kid. I'll call you."],
      ] },
    ],
  },
  {
    id: 'm6', giver: 'lamar', title: 'Street Kings', pay: 2000,
    call: [
      ['lamar', 'F! Where you been, dog? Hanging with your new rich friends? Come home, I got the best idea I ever had.'],
    ],
    steps: [
      { do: 'say', lines: [
        ['lamar', 'Street race. Starlight, tonight. Big money. I put your name down.'],
        ['you', 'Lamar.'],
        ['lamar', "And I put Simeon's Kestrel down too, so don't scratch it. He don't know. He's never gonna know."],
        ['lamar', "And guess who's racing for the Ballas. Stretch. You beat him, that's better than shooting him."],
        ['you', 'Is it, though?'],
      ] },
      { do: 'car', id: 'racer', type: 'sports', paint: 8, at: { x: STARLIGHT.x0 + 8, z: STARLIGHT.z0 - 9 + 2.6, h: Math.PI / 2 } },
      { do: 'enter', car: 'racer', text: 'Get in the ~b~Kestrel~w~ in ~y~Starlight~w~.' },
      { do: 'race', car: 'racer', points: RACE, racers: 3, rivalLook: 'stretch', text: `Win the race! Checkpoint ~y~1~w~ of ${RACE.length}.` },
      { do: 'say', lines: [
        ['lamar', "THAT'S my dog! Stretch is crying in his car right now! The pot's ours!"],
        ['lamar', "Minus my cut. And Simeon's cut. Mostly Simeon's cut, 'cause he found out."],
      ] },
    ],
  },
  {
    id: 'm7', giver: 'michael', title: 'Trevor', pay: 3500,
    call: [
      ['michael', "Kid, it's Michael. I need a favour. It's about an old friend of mine. Come by the house."],
    ],
    steps: [
      { do: 'say', lines: [
        ['michael', 'Bad news. An old partner of mine is in town. We did a lot of jobs together, back in the day. He thought I was dead.'],
        ['you', 'Why did he think you were dead?'],
        ['michael', "Because I told everybody I was dead. It's a long story."],
        ['michael', "His name's Trevor. He's... a lot. He's at the airport with a truck that isn't his. Help him get it to Lester's warehouse at the Docks before he kills somebody."],
      ] },
      { do: 'car', id: 'cargo', type: 'van', paint: 10, at: CARGO },
      { do: 'peds', group: 'trevor', kind: 'crew', look: 'trevor', at: { x: CARGO.x + 1.5, z: CARGO.z + 5 }, n: 1, friend: true },
      { do: 'enter', car: 'cargo', text: "Get to the ~b~truck~w~ at ~y~San Cielo International~w~. ~b~Trevor~w~'s waiting." },
      { do: 'say', lines: [
        ['trevor', 'Who the hell are you? Where is Michael?'],
        ['you', 'Michael sent me.'],
        ['trevor', 'Michael sent a CHILD. Of course he did. Wonderful. Drive, child!'],
      ], wait: false },
      { do: 'board', group: 'trevor', car: 'cargo', text: 'Wait for ~b~Trevor~w~.' },
      { do: 'wanted', stars: 3, text: 'Airport security called it in!' },
      { do: 'say', lines: [
        ['trevor', "Whatever Michael told you about me, kid? Lies. All of it. I'm a delight."],
        ['you', 'He said you might kill somebody.'],
        ['trevor', '...Okay, that part was true.'],
      ], wait: false },
      { do: 'lose', text: 'Lose the cops.' },
      { do: 'deliver', car: 'cargo', at: PLACES.lester, r: 9, text: "Bring the truck to ~y~Lester's warehouse~w~ at the Docks." },
      { do: 'unboard', group: 'trevor' },
      { do: 'say', lines: [
        ['trevor', 'Lester! Lester, my sweet little genius!'],
        ['lester', 'Please do not touch me, Trevor.'],
        ['trevor', 'The kid can drive, Les. The kid can DRIVE.'],
        ['lester', 'So I heard. Franklin, is it? I may have work for you. The kind that pays properly.'],
      ] },
    ],
  },
  {
    id: 'm8', giver: 'lester', title: 'The Score', pay: 12000,
    call: [
      ['lester', "Franklin. It's Lester. Trevor gave me your number, which I'm choosing not to be upset about. Come to the warehouse at the Docks."],
    ],
    steps: [
      { do: 'say', lines: [
        ['lester', "Sit. Don't touch that. Or that. That's load-bearing."],
        ['lester', 'Every week an armoured truck carries the takings from the Starlight casinos to the bank downtown. Different streets every week. I know all of them.'],
        ['lester', "Michael's watching the police scanner. Trevor's watching... I don't know what Trevor's watching. You stop the truck, you take the bags, you lose the police, and you bring the money here."],
        ['you', 'And if it goes wrong?'],
        ['lester', 'Then I never met you, and this warehouse is a bakery.'],
      ] },
      { do: 'give', weapon: 'smg', ammo: 160, text: 'You have an ~y~SMG~w~.' },
      { do: 'convoy', ids: ['truck'], type: 'van', paint: 10, hp: 320, at: [kerbS(TRUCK_START, 0.5)] },
      { do: 'destroy', cars: ['truck'], text: 'Stop the ~r~armoured truck~w~ in Starlight.' },
      { do: 'loot', car: 'truck', n: 4, text: 'Grab the ~g~cash bags~w~.' },
      { do: 'wanted', stars: 4, text: 'Every cop in San Cielo is coming!' },
      { do: 'lose', text: 'Lose the cops.' },
      { do: 'goto', at: PLACES.lester, r: 8, text: "Bring the money to ~y~Lester's warehouse~w~." },
      { do: 'say', lines: [
        ['lester', 'Four bags. Clean. Your share is on the table.'],
        ['trevor', 'I want it noted that nobody died today. Nobody! I was a professional!'],
        ['lester', 'Noted, Trevor. Go home, Franklin. Somebody is going to be very angry about this truck.'],
      ] },
    ],
  },
  {
    id: 'm9', giver: 'michael', title: 'The Long Stretch', pay: 20000, final: true,
    call: [
      ['michael', "Franklin. Get up to the house. Now. It's about Lamar."],
    ],
    steps: [
      { do: 'say', lines: [
        ['michael', "Lamar called me twenty minutes ago. Except it wasn't Lamar. It was Stretch, on Lamar's phone."],
        ['you', 'What does he want?'],
        ['michael', "Your share of the truck. He's got Lamar at the container terminal at the Docks, with most of the Ballas."],
        ['michael', "Take this. Trevor's on his way, which means you've got about ten minutes before it turns into a war. Go get your friend."],
      ] },
      { do: 'give', weapon: 'shotgun', ammo: 40, text: 'You have a ~y~shotgun~w~.' },
      { do: 'goto', at: PLACES.terminal, r: 36, text: 'Get to the ~y~container terminal~w~ at the Docks.' },
      { do: 'peds', group: 'ballas', kind: 'gang', at: PLACES.terminal, n: 8, weapon: 'smg', boss: true, bossLook: 'stretch' },
      { do: 'say', lines: [
        ['stretch', "Franklin! You came for this fool? He'd sell you out for a sandwich."],
        ['you', "Nah. That's you, Stretch."],
      ], wait: false },
      { do: 'kill', group: 'ballas', text: 'Take out ~r~Stretch and the Ballas~w~.' },
      { do: 'peds', group: 'lamar', kind: 'crew', look: 'lamar', at: PLACES.terminal, n: 1, friend: true },
      { do: 'say', lines: [['lamar', "F! Took you long enough! They tied me to a forklift, dog. A FORKLIFT."]], wait: false },
      { do: 'board', group: 'lamar', car: 'player', text: 'Get in a car with ~b~Lamar~w~.' },
      { do: 'say', lines: [
        ['lamar', 'You came back for me.'],
        ['you', 'Course I came back for you.'],
        ['lamar', "...I'm still not buying the chicken."],
      ], wait: false },
      { do: 'goto', at: HOME, r: 10, with: 'lamar', text: 'Take ~b~Lamar~w~ home.' },
      { do: 'unboard', group: 'lamar' },
      { do: 'say', lines: [
        ['lamar', "So. Stretch is gone, we're rich, and you got friends in Palm Ridge now."],
        ['you', "WE got friends in Palm Ridge."],
        ['lamar', 'Can I have a car?'],
        ['you', 'No.'],
        ['lamar', 'A little car?'],
        ['you', "Come on. I'm buying the chicken."],
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
