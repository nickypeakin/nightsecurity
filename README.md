# Kingsgate Nights

An open-world crime game in the browser, in the spirit of the old 3D GTA
games, for you and up to three friends. Steal cars, outrun the police and
take jobs from the people who run the city of Kingsgate, all night long. The
story, places and characters are original.

November 1996. Kingsgate Mall, where you used to work nights as a security
guard, is a fenced-off pile of rubble now, and the job went with it. The
city's still awake, though, and some of the people who run it have work for
somebody who doesn't scare easily:

- **Ray Okafor**, who managed the mall and sells used cars now, by the Strip,
  has cars that need taking back from people who stopped paying.
- **Lena Voss** runs the harbour, and more than the harbour.
- **Dale Mercer**, the old night guard, never quite got over that last week
  at the mall. He has one last thing for you.

Seven jobs, start to finish: repossessions, a car alarm and the police on
your tail, a gunfight at the Pool Hall, a getaway driver's job, a street
race through twelve checkpoints, a convoy of vans to burn, and a crate at
Pier 3 that Dale wants destroyed. Between jobs the city is yours: thirteen of
the mall's old security tapes are hidden round town, guns and armour lie
about or can be bought at Kingsgate Arms, and Spray-N-Go will respray your
car and make the police forget you were ever in it.

**Play it:** <https://nickypeakin.github.io/nightsecurity/>. It works in
Chrome, Edge or Firefox on a computer with a keyboard and mouse. Headphones
help.

## Controls

| Key | On foot | In a car |
| --- | --- | --- |
| WASD / arrows | walk (Shift to sprint, Alt to stroll) | drive and steer |
| Mouse | look | look round (the camera swings back behind you) |
| F | get in the nearest car (or drag the driver out) | get out |
| Right mouse | aim | |
| Left mouse | shoot, or punch | |
| Q, E, wheel, 1 to 4 | switch weapons | |
| Space | jump | handbrake |
| H, G, R | | horn, siren (police cars), radio |
| E | buy at the gun shop counter | |
| M | the map | the map |
| Space | skip the opening, or a job's dialogue | |
| Esc | pause | pause |

## How it plays

- **Jobs.** The big letters on the radar (O, V, D) are the people with work.
  Walk into the glowing ring next to them to start a job, with no stars.
  The objective is at the bottom of the screen and what you need is on the
  radar: yellow for where to go, blue for a car or a friend, red for a
  target. Fail one and you can walk back in and try again.
- **Stars.** Crimes make the police want you: stealing cars (especially
  theirs), hitting or running people over, gunfire, killing. Stars bring
  police cars, then officers on foot; from two stars they shoot. Get out of
  every cop's sight long enough and the stars go (the more stars, the
  longer), or drive into Spray-N-Go for $100. Let an officer get hold of you
  and you're **busted**: you lose your guns and $150. Die and you're
  **wasted**: the hospital charges $100.
- **Your place.** The green ring by your front door in Kingsgate Heights
  saves the game. It also saves when you pass a job or find a tape, and
  **Continue** on the main menu picks up where you left off.

## Playing with friends

- **Alone:** click **New Game**.
- **With friends:** one person clicks **Host a Game** and sends the invite
  link from the lobby (the **Copy** button). Friends open the link and press
  **Join the Game**, or open the game and type the 5-letter code. The host
  clicks **Start** once everyone's there.

Everyone shares the jobs (any of you can do any step, and everyone gets
paid), but each of you has your own money, guns and wanted level. Climb into
a friend's car with F to ride along and shoot out of the window.

There's no game server. The host's browser runs the city, and friends
connect straight to it over WebRTC; the free [PeerJS](https://peerjs.com)
service is only used to find each other by lobby code. The host has to keep
the game open while everyone plays. If friends can't get in, have everyone
press **Test Connection** on the main menu. Some school and work networks
block these connections; switching either player to a different network (a
phone hotspot works) usually fixes it.

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
npm test         # plays every job headless, and checks the city's layout
```

## How it's built

Plain JavaScript modules and [three.js](https://threejs.org). Every model,
texture and sound is generated in code, so there are no asset files.

The city is laid out once, in `shared/city.js`, as plain numbers: a six by
six grid of junctions 80 m apart with traffic lights, the districts and
their buildings, parking spaces, street lamps, props and the pavements'
walking network. The host builds its collision from that and each client
builds the 3D city from the same plan, merged into a few big meshes per
80 m square so it draws quickly. Hundreds of street lamps light the city
through one patched three.js shader that looks lamps up in a small texture
laid over the map. Cars use one arcade physics model (`shared/car.js`) that
your own browser runs for the car you drive and the host runs for all the
traffic. The people are the procedural bodies from the other games, turned
into skinned meshes so a crowd costs a handful of draws each.

```
public/
  index.html, css/style.css
  js/main.js              menus, the lobby, saving, the frame loop
  js/shared/              rules the host and every client agree on
    config.js             tuning numbers: speeds, weapons, wanted levels, prices
    city.js               the roads, lanes and lights, blocks and buildings,
                          parking, lamps, the walking network, collision
    car.js                the cars and how they drive
    collide.js            boxes, cars, people and bullets
    lights.js             the street lamps, as a grid for the shader
    story.js              everyone and everything they say, the jobs, the tapes
    rng.js
  js/host/                runs in the host's browser (and in Node for tests)
    lobby.js              players joining and leaving, starting a game
    match.js              the city: players, cars, shooting, pickups, the shop,
                          crashes and fires, streaming traffic and people in
    drivers.js            traffic: lanes, turns, red lights, chases, races
    peds.js               people on the pavements, gangs, cops on foot
    police.js             stars, dispatch, chases, arrests
    missions.js           the jobs, step by step
    timers.js
  js/client/              what each player sees and hears
    game.js               third person on foot and behind the wheel, aiming,
                          the camera, the HUD, the map, the shop
    cityScene.js          the city, built from the plan
    lighting.js           the street-light shader patch
    vehicles.js           the six car models, lights, sirens
    people.js, humans.js  procedural people, skinned for crowds, and their guns
    radar.js              the radar and the map
    fx.js                 muzzle flashes, tracers, fire, smoke, markers, pickups
    post.js               tone mapping, bloom, the VHS look
    audio.js, voice.js    synthesised engines, guns, sirens, radio; spoken lines
    ui.js, net.js, input.js, attract.js, textures.js, props.js, util.js
test/
  sim.test.js             traffic and crowds, the police, busted and wasted,
                          carjacking, fires, the shop, saving, co-op, and all
                          seven jobs played start to finish
  walk.test.js            every lane, junction and parking space has room for
                          a car; every place, tape and pickup can be walked to;
                          the lights; the car physics
```

The host decides everything that matters (where every car and person is,
who's hit, who's wanted, how each job is going); each client drives its own
character or car, says what it shoots at, and draws the rest from the host's
snapshots, ten a second, a little behind so everything moves smoothly.

### Where it came from

This repository used to be **Night Security**, a co-op horror game set in
Kingsgate Mall. The mall's been knocked down (it's the Old Mall Site on the
map now) and its engine kept: the networking and lobby, the procedural people,
the light-grid shader, post-processing, synthesised sound and spoken voices,
input, the build and the Pages workflow. Most of that came from the other
games on this account, especially
[Cinder Peak](https://github.com/nickypeakin/fears-to-fathom), and the
networking core is the one [backrooms](https://github.com/nickypeakin/backrooms)
uses. The city, the cars, the traffic, the police, the guns and the jobs are
new.
