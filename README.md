# GTA 7

A fan-made open-world crime game in the browser, in the spirit of the GTA
games, for you and up to three friends. Steal cars, outrun the police, walk
into buildings and take jobs from the people who run the city of Kingsgate,
then take the highway out of town and see the rest of the island, from
morning till night and round again. The story, places, characters and map
are original. (GTA 7 isn't affiliated with or endorsed by Rockstar Games.)

November 1996. Kingsgate Mall, where you used to work nights as a security
guard, is a fenced-off pile of rubble now, and the job went with it. The game
opens at home in Kingsgate Heights at eight in the morning: your car's in the
drive, and the phone's ringing. Some of the people who run this city have
work for somebody who doesn't scare easily:

- **Ray Okafor**, who managed the mall and sells used cars now, by the Strip,
  has cars that need taking back from people who stopped paying.
- **Lena Voss** runs the harbour, and more than the harbour.
- **Dale Mercer**, the old night guard, never quite got over that last week
  at the mall. He has one last thing for you.

Each of them waits in their office: walk in through their door and the job
starts with a cutscene. Seven jobs, start to finish: repossessions, a car alarm and the police on
your tail, a gunfight at the Pool Hall, a getaway driver's job, a street
race through twelve checkpoints, a convoy of vans to burn, and a crate at
Pier 3 that Dale wants destroyed. Between jobs the city is yours: thirteen of
the mall's old security tapes are hidden round town, guns and armour lie
about or can be bought over the counter inside Kingsgate Arms, a meal at
Sal's Diner puts you back to full health, and Spray-N-Go will respray your
car and make the police forget you were ever in it. Days pass (a whole one
takes 48 minutes): the street lights and lit windows come on at dusk.

## The island

Kingsgate is on the south coast of an island about 2 km across and 3 km
from end to end, laid out the way GTA V's is (a city in the south, hills,
desert, a lake and a big mountain to the north) but drawn from scratch:

- **Kingsgate**, the city, with its harbour, on the south coast.
- **Pelican Beach** just west of town, with its pier and café, and
  **Kingsgate International**, the airport, out on the peninsula beyond it.
- **The Kingsgate Hills** north of town, with the big white sign, the
  villas and the winding Hill Road.
- **The Redwater Desert** in the middle of the island, with an airstrip,
  and **Lake Corrigan** north of it. **Dust Creek** (a bar, a motel, a gas
  station and trailers) is where the freeway meets the Desert Road.
- **Mount Calder** and a wind farm in the east; **Mount Harlow**, the
  island's highest point (with a mast on top), in the north-west, in the
  pine forests round **Port Kerry** at the northern tip.

The **Coast Highway** runs up the west coast, the **Eastern Freeway** up the
middle-east, the **Shore Road** up the east side, the **Desert Road** across
the middle and the **Hill Road** over the hills, about 10 km of road in
all, with traffic on it. Press **M** for the map: scroll (or + and -) to
zoom, drag (or the arrow keys) to move it about.

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
| E | buy at the gun counter, eat at the diner | |
| M | the map (scroll to zoom, drag to move) | the map |
| Space | skip the opening, or a job's cutscene | |
| Esc | pause | pause |

## How it plays

- **Jobs.** The big letters on the radar (O, V, D) are the people with work.
  Go in through their door and step into the glowing ring in front of them
  to start a job (with no stars).
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
- **Buildings.** Walk into a glowing door to go inside (not with the police
  after you): your place, Kingsgate Arms, Sal's Diner, and the offices of
  Okafor, Voss and Dale. Nobody fights indoors.
- **Your place and your car.** Your Kestrel is parked by your house (the
  blue arrow on the radar). Wreck it and a new one turns up there. Walk up to
  your bed to save; the game also saves when you pass a job or find a tape,
  and **Continue** on the main menu picks up where you left off.

## Playing with friends

- **Alone:** **Story Mode**, then **New Game** (or **Continue**).
- **With friends:** in **Online**, one person clicks **Host a Game** and sends the invite
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

The island is plain numbers too (`shared/world.js`): a coastline, a height
for every 5 m worked out from a few hills and mountains, noise, beaches and
cliffs, the lake's hollow and the city's flat ground, and the highways as
smooth curves that the land is cut and banked to fit, never steeper than 1
in 9. The highways join the city's road graph as chains of junctions, so the
traffic, the police and the jobs' drivers use them like any street. The
land is drawn a 320 m square at a time (the far squares with a quarter of
the triangles, and a skirt so they never show a crack), the trees and rocks
merged a square at a time too, and from far off each square of town is a
single mesh of plain boxes whose windows still light up at night.

The rooms you can walk into are laid out out at sea, off the south-east
coast, where nobody will see them: a door takes you there (with a quick
fade), and while you're inside only that room is drawn, lit by the same
light-grid shader as the streets (its ceiling lights are always on). The
sun, the sky and the haze follow a 24-hour clock that starts at 8 AM.

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
    config.js             tuning numbers: speeds, weapons, wanted levels,
                          prices, the clock (a day, sunrise and sunset)
    world.js              the island: the coast, the land's heights, the
                          highways, the towns, the trees
    city.js               the roads, lanes and lights, blocks and buildings,
                          parking, lamps, the walking network, collision
    interiors.js          the rooms you can walk into, their doors, furniture
                          and counters
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
    cityScene.js          the city, built from the plan; the sky, the sun and
                          the time of day
    countryScene.js       the island round it: the land, the sea and the
                          lake, the highways, the trees, the landmarks
    interiorScene.js      the rooms, furnished, and the doors out in the city
    opening.js            the opening: the city, your place, the phone call
    lighting.js           the street-light (and ceiling-light) shader patch
    vehicles.js           the six car models, lights, sirens
    people.js, humans.js  procedural people, skinned for crowds, and their guns
    radar.js              the radar and the map of the island
    fx.js                 muzzle flashes, tracers, fire, smoke, markers, pickups
    post.js               tone mapping, bloom, the VHS look
    audio.js, voice.js    synthesised engines, guns, sirens, radio; spoken lines
    ui.js, net.js, input.js, attract.js, textures.js, props.js, util.js
test/
  sim.test.js             waking up at home with your car, traffic and crowds,
                          traffic out on the highways and a drive to Port
                          Kerry, the police, busted and wasted, carjacking,
                          fires, the gun counter and the diner, saving, co-op,
                          and all seven jobs played start to finish
  walk.test.js            every lane, junction and parking space has room for
                          a car; every place, tape, pickup and door can be
                          walked to; inside, every room's counter, bed and
                          giver can be reached; the lights; the island (sea
                          all round, the highways out of the water and never
                          too steep, level ground for every building); the
                          car physics, hills and the sea's edge included
```

The host decides everything that matters (where every car and person is,
who's hit, who's wanted, how each job is going); each client drives its own
character or car, says what it shoots at, and draws the rest from the host's
snapshots, ten a second, a little behind so everything moves smoothly.

### Where it came from

This repository used to be **Night Security** (and then, briefly, *Kingsgate
Nights*), a co-op horror game set in
Kingsgate Mall. The mall's been knocked down (it's the Old Mall Site on the
map now) and its engine kept: the networking and lobby, the procedural people,
the light-grid shader, post-processing, synthesised sound and spoken voices,
input, the build and the Pages workflow. Most of that came from the other
games on this account, especially
[Cinder Peak](https://github.com/nickypeakin/fears-to-fathom), and the
networking core is the one [backrooms](https://github.com/nickypeakin/backrooms)
uses. The city, the cars, the traffic, the police, the guns and the jobs are
new.
