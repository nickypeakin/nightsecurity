// Everything anyone says, what the clues say, and how the night is laid
// out. Kingsgate Mall, Thursday October 24, 1996: a week before it closes
// for good. {We}/{we}/{us} become I/me in a solo game; {code} is the
// combination of Dale's locker; {place} is where Dale is.

export const DATE = 'Thursday, October 24, 1996';

// The hours of the night: what the card says when each one starts.
export const HOURS = [
  { h: 22, id: 'lockup', title: '10:00 PM', sub: 'Locking up' },
  { h: 23, id: 'round1', title: '11:00 PM', sub: 'The first round' },
  { h: 24, id: 'midnight', title: '12:00 AM', sub: 'Midnight' },
  { h: 25, id: 'round2', title: '1:00 AM', sub: 'The second round' },
  { h: 26, id: 'channel2', title: '2:00 AM', sub: 'Channel two' },
  { h: 27, id: 'round3', title: '3:00 AM', sub: 'The dead hour' },
  { h: 28, id: 'lockdown', title: '4:00 AM', sub: 'Lockdown' },
  { h: 29, id: 'last', title: '5:00 AM', sub: 'The last hour' },
  { h: 30, id: 'dawn', title: '6:00 AM', sub: 'Day shift' },
];

// the manager, by the fountain, handing over the keys
export const MANAGER = [
  [3.0, 'Ray Okafor', "You must be the crew from Gatehouse. Ray Okafor, I manage the place. For another week, anyway."],
  [9.5, 'Ray Okafor', "Keys. Every gate, every door. The only thing they won't open is Halvorsen's, and you won't need to go in Halvorsen's."],
  [16.5, 'Ray Okafor', "Lock up, then you walk the round: six clock stations, turn the key in every one, every round. Your office is down the service hall, past the restrooms."],
  [24.5, 'Ray Okafor', "The panel in there shows every gate and door. Green is locked. I'd like it all green when I come back at six."],
  [31.0, 'Ray Okafor', "And if you see Dale Mercer, the man who had this job, call Gatehouse. He hasn't been in since Tuesday. His car's still out front."],
  [38.5, 'Ray Okafor', "Lock these behind me. Good night."],
];

// the PA, as the mall closes
export const CLOSING = 'Attention shoppers: Kingsgate Mall is now closed. Thank you for shopping at Kingsgate. Please make your way to the nearest exit.';

// Gatehouse Security dispatch, on the radio
export const DISPATCH = {
  checkin: [
    'Gatehouse to Kingsgate, copy. This is Rita. You\'re the new crew on Dale\'s post.',
    'Rounds start at eleven. Six clocks, every one, every round. I can see your punches from here.',
    'The panel in your office shows every door and gate. Green\'s locked. Keep it green.',
    'And if Dale turns up, you call me first.',
  ],
  checkinLate: [
    'There you are, Kingsgate. You\'re late checking in. Rounds start at eleven. Keep the panel green.',
  ],
  round1: ['Kingsgate, it\'s eleven. First round. Six clocks.'],
  midnight: ['Kingsgate, I\'m showing your PA system on. Did somebody turn on music? Shut it off, the owners pay the power bill.'],
  allquiet: ['Copy, all quiet.'],
  moved: [
    'Mannequins don\'t move, Kingsgate.',
    '...Dale said that too. Last week. Just keep your rounds.',
  ],
  sawDale: [
    'You saw Dale? Where? On the cameras?',
    'Then go and get him. And tell him he owes me twenty dollars.',
  ],
  power: ['Kingsgate, your mall just dropped off the grid. Breakers are in the electrical room off the service corridor.'],
  halvOpen: ['Kingsgate, my board shows Halvorsen\'s gate open. Did one of you go in there? Lock it.'],
  round2: ['Kingsgate, second round. And somebody punched station three a minute ago. Who was in Halvorsen\'s?'],
  help: [
    'Say again, Kingsgate? Something\'s in there with you?',
    'I can\'t send anybody before the day shift. Lock yourselves in the office if you have to. Six o\'clock.',
  ],
  round3: ['Third round, Kingsgate. You\'re doing fine.'],
  cams: ['Kingsgate, I\'ve lost your camera feed. Check the CCTV breaker.'],
  foundDale: [
    'You found him? Is he okay?',
    'Keep him with you. Get him to the office. I\'m calling it in.',
  ],
  lockdown: ['Kingsgate. Your panel\'s lit up like a Christmas tree. Lock it down.'],
  last: [
    'One hour, Kingsgate. Ray opens the south doors at six.',
    'If you can\'t walk the round, don\'t. Get in the office and lock the door.',
  ],
  dawn: ['Kingsgate, it\'s six. Ray\'s at the south doors. Let him in. Then I need your incident report.'],
};

// what you can say on the walkie, when it makes sense
export const RADIO_LINES = {
  checkin: 'Kingsgate to Gatehouse: on post, checking in.',
  allquiet: 'All quiet here.',
  moved: 'The mannequins in Halvorsen\'s have moved.',
  sawDale: 'We saw Dale. On the cameras.',
  help: 'Something\'s in here with us.',
  foundDale: 'We found Dale!',
};

// Dale, whispering on channel two, wherever he is
export const CHANNEL2 = {
  open: [
    '...is somebody there? Don\'t answer. Not on this. It listens.',
    'It\'s Dale. Dale Mercer. I\'ve been... I don\'t know how long.',
    'It took my keys. It wears my jacket. It walks my round.',
  ],
  cage: ['I\'m in the cage. Halvorsen\'s stockroom. It locked me in. I can hear them standing outside.'],
  freezer: ['It\'s so cold. I can hear the compressor, behind the food court. It shut the door on me.'],
  elevator: ['I\'m in the freight elevator, by the dock. It\'s stuck. I can hear the big door rattle.'],
  close: [
    'My spare keys are in my locker in the office. The combination\'s in my book.',
    'And whatever you do... don\'t all look away at once.',
  ],
};

// the PA, when nobody's at the microphone
export const PA_LINES = [
  'Attention shoppers. Kingsgate Mall is now closed.',
  'Attention. Kingsgate Mall is now closed. Thank you for shopping at Kingsgate.',
  'Would the night crew please come to Halvorsen\'s. Somebody is waiting for you at the window.',
  'Attention shoppers. Please make your way to the nearest exit. Please make your way.',
];

// what Dale says once he's out
export const DALE = {
  found: [
    'Oh thank God. Thank God. Is it morning?',
    'Don\'t look at me, look at the door. Keep your lights on them. I\'m right behind you.',
  ],
  follow: ['Stay close. Stay close.', 'Watch the corners.', 'I\'m here. Keep going.', 'Not that way. Please.'],
  office: ['The office. Lock the door. The deadbolt. It can\'t open the deadbolt.'],
};

// Dale's logbook, on the desk in the security office
export function logbook(code) {
  return [
    ['OCT 3', 'All quiet. Halvorsen\'s gate locked, power still off in there. Window displays: 13.'],
    ['OCT 9', 'Halvorsen\'s window mannequins turned round to face the concourse. Turned them back. Kids? Gate was locked.'],
    ['OCT 12', 'Heard the carousel music at 3 AM. The carousel was off. The breaker was off.'],
    ['OCT 15', 'Counted the window. 14. Counted again. 14. The new one is at the back, facing the wall.'],
    ['OCT 17', 'The tape says somebody punched Station 3 at 3:12. I was in this office the whole time. Somebody has a station key.'],
    ['OCT 19', 'It\'s wearing a uniform now. Ours. My spare jacket is gone from my locker.'],
    ['OCT 21', 'They only move when nobody\'s looking. Not in your light, not on camera. Keep a camera on them. Keep your light on them. Never all look away at once.'],
    ['OCT 22', `Spare keys in my locker, combination ${code}. If anybody reads this: I am not crazy. I'm going in there to count them one more time.`],
  ];
}

// the clues, in the order they're listed in your notes
export const CLUES = {
  logbook: { title: 'Dale\'s logbook', text: 'On the desk in the security office. Dale wrote in it every night until Tuesday.' },
  tape: { title: 'The watchclock tape', text: 'Station 3, inside Halvorsen\'s, was punched at 3:12 AM on Wednesday, Thursday... every night since Dale stopped coming in. Nobody else has a station key.' },
  car: { title: 'Dale\'s car', text: 'A brown \'84 Buick under the lamp outside the south doors, frost on the windshield. It hasn\'t moved since Tuesday.' },
  uniform: { title: 'The mannequin in the window', text: 'One of the mannequins in Halvorsen\'s window is wearing a Gatehouse Security uniform. The name tag says MERCER.' },
  inventory: { title: 'Halvorsen\'s inventory', text: 'A clipboard in the stockroom: "Display mannequins (window and floor): 13. To go to auction Nov 4." There are fourteen.' },
  photos: { title: 'Dale\'s photographs', text: 'A roll Dale dropped off at Photo Finish, never picked up. Four nights of Halvorsen\'s window, with the flash on.' },
  vcr: { title: 'The tape in the VCR', text: 'Labelled TUE 10/22. Dale goes into Halvorsen\'s at 2:47 AM. At 3:31 somebody in his uniform comes out. It isn\'t Dale.' },
  channel2: { title: 'Channel two', text: 'Dale, whispering on the walkie: alive, locked in, and hiding from the thing that took his keys. "Don\'t all look away at once."' },
  locker: { title: 'Dale\'s locker', text: 'His spare keys (a cage key, the freezer, the freight elevator), a photo of his granddaughter, and a note: "If they\'re standing still, somebody\'s watching. Make sure somebody\'s watching."' },
  dale: { title: 'Dale', text: 'Found him. Alive.' },
  seen: { title: 'They moved', text: 'You saw it for yourself: a mannequin that wasn\'t where it had been, the moment nobody was looking.' },
  stalker: { title: 'It walks his round', text: 'Something in Dale\'s uniform, with Dale\'s keys, walking Dale\'s round. Its face is smooth white plastic.' },
};
export const CLUE_ORDER = ['logbook', 'tape', 'car', 'uniform', 'inventory', 'photos', 'vcr', 'seen', 'stalker', 'channel2', 'locker', 'dale'];

// the incident report at six
export const REPORT = [
  { q: 'Who has been unlocking the gates at night?', a: ['Dale Mercer', 'Someone living in the mall', 'Something wearing Dale\'s uniform', 'Kids with a stolen key'], right: 2 },
  { q: 'What has been happening with Halvorsen\'s mannequins?', a: ['Somebody keeps moving them around', 'They move on their own, when nobody is watching', 'Nothing. Mannequins don\'t move.'], right: 1 },
  { q: 'Where was Dale Mercer?', a: ['He quit and left town', 'Locked in Halvorsen\'s stockroom cage', 'Locked in the walk-in freezer', 'Stuck in the freight elevator'], right: null },
];

// shouted to whoever's near (number keys)
export const SHOUTS = ['Over here!', 'Keep your eyes on them!', 'Run!', 'Lock it!'];

export const ENDINGS = {
  best: {
    title: 'SHIFT COMPLETE',
    lines: [
      'Dale Mercer left Kingsgate in the back of an ambulance at 6:40 AM, wrapped in a foil blanket, still telling the paramedics not to look away.',
      'Your incident report went to Gatehouse, and from Gatehouse to the mall\'s owners, who read it twice and sold Halvorsen\'s fixtures to the first bidder.',
      'Kingsgate Mall closed for good on Friday. The mannequins went to auction. The catalogue listed thirteen.',
    ],
  },
  good: {
    title: 'SHIFT COMPLETE',
    lines: [
      'At six, Ray Okafor let himself in and found {us} in the security office, every light on, every gate locked.',
      'Gatehouse filed {our} report. Rita underlined one line of it in red.',
      'Kingsgate Mall closed for good on Friday. On Saturday morning, the window at Halvorsen\'s was empty, except for one mannequin in a guard\'s uniform, facing the street.',
    ],
  },
  noDale: {
    title: 'SHIFT OVER',
    lines: [
      'The day shift found Dale Mercer at nine, in {place}. He\'d been there since Tuesday.',
      'He keeps asking the nurses whether the new crew made it to six. They tell him yes. He doesn\'t believe them.',
      'Kingsgate Mall closed for good on Friday.',
    ],
  },
  wrong: {
    title: 'REPORT FILED',
    lines: [
      'Gatehouse filed {our} report under vandalism, and sent a locksmith on Monday.',
      'Nobody read past the first page. Nobody asked about the mannequins.',
      'The new night crew starts tonight.',
    ],
  },
  taken: {
    title: 'NOBODY ANSWERED',
    lines: [
      'At six, Ray Okafor unlocked the south doors and called for the night crew. Nobody answered.',
      'The panel in the security office was red from end to end. The cameras showed an empty mall.',
      'On Friday, Halvorsen\'s window had more mannequins in it than the inventory said. One of them was wearing {your} jacket.',
    ],
  },
};
