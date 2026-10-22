# Night Security · Kingsgate Mall

A co-op, first-person horror game that runs in the browser. You (and up to
three friends) work the graveyard shift as security guards at a dying
shopping mall, lock it up for the night, and figure out what's going on in
it. The story, places and characters are original.

Thursday, October 24, 1996. Kingsgate Mall closes for good next week, and
Gatehouse Security has put you on nights: ten at night to six in the
morning. The last night guard, Dale Mercer, stopped coming in on Tuesday.
His car is still in the lot.

It opens with the manager, Mr. Okafor, handing you the keys at closing time
and leaving by the south doors. Then it's eight hours alone in the mall:

- **10 PM, locking up.** Lock the south doors behind him, the food court
  entrance and the loading dock. Pull down and padlock the shop gates the
  staff left open. Find the security office and radio in to Gatehouse.
  Dale's logbook is on the desk.
- **The rounds.** Three times in the night, walk Dale's round: turn the key
  in all six watchclock stations, from the record shop to the loading dock
  to inside Halvorsen's, the department store that closed in the spring.
  The watchclock keeps a tape of every punch. So does somebody else.
- **The mannequins.** Halvorsen's window has thirteen of them. They only
  move when nobody can see them: not in anyone's view, not in a flashlight
  beam, not on a camera someone in the office is watching. In the dark you
  can't see them, so they can move. A locked gate stops them; an unlocked
  one doesn't.
- **From one in the morning,** the power goes out across the concourse, and
  something wearing Dale's uniform walks his round with his keys, unlocking
  what you locked and flipping breakers. If it sees you, it comes for you.
  Run, break its line of sight, hide, or shine your flashlight full in its
  face.
- **The PA, the carousel, channel two on the walkie.** Things in the mall
  start by themselves. Somebody is still alive in here.
- **5 AM.** Everything that's left comes for the security office. Get
  everyone inside and throw the deadbolt.
- **6 AM.** The manager's back at the south doors. Let him in and file the
  incident report: who's been unlocking the gates, what the mannequins are
  doing, and where Dale is. Your notes ([J]) fill in with every clue you
  find. How it ends, and your grade, depend on what you found and who made
  it to morning.

A full night takes about 25 minutes. Where Dale is, and his locker
combination, are picked fresh every night.

**Play it:** <https://nickypeakin.github.io/nightsecurity/> (once GitHub
Pages is switched on: see below). It works in Chrome, Edge or Firefox on a
computer with a keyboard and mouse. Headphones help.

## Controls

| Key | Action |
| --- | --- |
| WASD / arrows | walk (Shift to run, C to crouch) |
| Mouse | look |
| E | use: open, shut, pull a gate down, turn a station key, read, hide |
| R | lock or unlock the gate or door you're looking at |
| F | flashlight |
| V | walkie-talkie (Gatehouse dispatch) |
| M | map: what's locked, the clock stations, everyone |
| J | notes (and, at six, the incident report) |
| 1 to 4 | shout to your friends |
| Esc | pause |
| Space (hold) | skip the opening (host only) |

At the monitors in the security office: A/D or 1 to 8 to switch cameras,
E to step back. At the breaker panel: 1 to 6. At Dale's locker: type the
combination and press Enter.

## Playing with friends

- **Alone:** click **Work Alone**. Everything still works with one guard;
  you just have to watch the mannequins and walk the rounds yourself.
- **With friends:** one person clicks **Host a Shift** and sends the invite
  link from the lobby (the **Copy** button). Friends open the link and
  press **Join the Shift**, or open the game and type the 5-letter code. The
  host clicks **Clock In** once everyone's there.

There's no game server. The host's browser runs the night, and friends
connect straight to it over WebRTC; the free [PeerJS](https://peerjs.com)
service is only used to find each other by lobby code. The host has to keep
the game open while everyone plays. If friends can't get in, have everyone
press **Test Connection** on the main menu. Some school and work networks
block these connections; switching either player to a different network (a
phone hotspot works) usually fixes it.

With more guards, one of you can sit at the monitors and keep a camera on
the mannequins while the others walk the round.

## Publishing to GitHub Pages

`.github/workflows/pages.yml` tests the game, builds it and publishes it on
every push to the default branch. (If Pages isn't switched on yet: in the
repository go to **Settings → Pages → Build and deployment → Source** and
pick **GitHub Actions**.)

## Running it locally

Needs Node.js 20 or newer.

```sh
npm install
npm run dev      # builds dist/ and serves it at http://localhost:8080
npm test         # plays whole nights headless, and walks every room of the mall
```

`?hour=3` in the address starts the night at that hour (0 is 10 PM, 7 is
5 AM, 8 is 6 AM), which is handy when changing one part of it.

## How it's built

Plain JavaScript modules and [three.js](https://threejs.org). Every model,
texture and sound is generated in code, so there are no asset files.

The mall is laid out once, in `shared/mall.js`, as plain numbers: the
rooms, walls, shop gates and doors, props, clock stations, cameras and
hiding places. The host builds its collision and a half-metre navigation
grid from that, and each client builds the 3D mall from the same plan
(merged by material into big chunks, so it draws quickly). The lights work the same way: every
ceiling fixture sits on one 4 m grid and belongs to a breaker and a room, so
a patched three.js shader can light the whole mall with a hundred-odd lights
without them shining through walls, and the host can tell how well lit any
spot is (which matters, because the mannequins can't move while someone can
see them). The CCTV monitors render the mall from each camera into a
texture. The people are sculpted from smooth lofted shapes; the mannequins
are the same bodies in white plastic, baked into fixed poses.

```
public/
  index.html, css/style.css
  js/main.js              menus, lobby and the flow of a night
  js/shared/              rules the host and every client agree on
    config.js             tuning numbers
    mall.js               the building: rooms, walls, gates, doors, props,
                          stations, cameras, hiding places, collision, nav grid
    lights.js             every light, its breaker and its room
    story.js              everything anyone says, the clues, the report, endings
    rng.js
  js/host/                runs in the host's browser (and in Node for tests)
    lobby.js              guards joining and leaving, starting a night
    match.js              the night: hours, doors and locks, breakers, the
                          radio, Dale, the report and the grade
    mannequins.js         they only move when nobody's watching
    stalker.js            the thing in Dale's uniform
    nav.js                walking the nav grid's distance fields
    timers.js
  js/client/              what each guard sees and hears
    game.js               first person: moving, using and locking things,
                          the monitors, the panels, the map, the notes
    mallScene.js          the mall, built from the plan
    lighting.js           the shader patch for the mall's lights
    models.js, props.js   gates, doors, escalators, the fountain, everything else
    humans.js             procedural people (and mannequins)
    cctv.js               the security cameras
    cutscene.js           closing time
    mapview.js            the map
    post.js               tone mapping, bloom, the CCTV and VHS looks
    audio.js, voice.js    synthesised sound, spoken lines
    avatar.js, ui.js, net.js, input.js, attract.js, textures.js, util.js
test/
  sim.test.js             whole nights with 1 to 4 guards, the mannequin rules,
                          the stalker, the report, everyone taken
  walk.test.js            every room, station and hiding place reachable;
                          locked gates keep you out
```

The host decides everything that matters (where the mannequins and the
stalker are, who's caught, what's locked, what dispatch says); each client
moves its own guard, says what it uses, and draws the rest from the host's
snapshots.

### Where the engine came from

The engine is lifted from the other games on this account, mostly
[Cinder Peak](https://github.com/nickypeakin/fears-to-fathom): the
networking and lobby, the procedural people and their animation,
post-processing, synthesised sound and spoken voices, input, the build and
the Pages workflow. The networking core is the same one
[backrooms](https://github.com/nickypeakin/backrooms) uses. The mall, its
lighting, the CCTV, the mannequins and the stalker are new.
