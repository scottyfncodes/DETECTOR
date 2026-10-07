# DETECTOR

A first-person field-discovery game about noticing things, learning how they
connect, and using that knowledge to uncover what was previously invisible.
Played entirely in first person, mobile-first. You
walk real ground under a real sky, sweep a metal detector, dig carefully, and
find out what has been down there — or notice it lying in plain sight without
digging at all. Most of what comes up is rubbish. Occasionally it is the
first piece of something much bigger — a shard that turns out to be one of
three, a symbol that keeps recurring on finds made in different places, a
page in someone else's handwriting that names a landmark and a bearing, and
ground you had already searched clean turning out to hold exactly what the
page said.

**Play it: https://scottyfncodes.github.io/DETECTOR/** — best on a phone, with
sound on.

DETECTOR grew out of the first-person build of UNEARTH and is now its
permanent home. (The UNEARTH repository and site are a different game — a
top-down kitten adventure — and are untouched by this one.)

```
EXPLORE → NOTICE SOMETHING STRANGE → INVESTIGATE → DISCOVER A CLUE
   → REINTERPRET SOMETHING SEEN BEFORE → USE IT SOMEWHERE ELSE → UNCOVER SOMETHING BIGGER
```

There is one perspective for the whole game: real first-person 3D, everywhere.
Left thumb moves, right thumb looks, one contextual button does whatever
standing in front of something makes possible. The detector is a tool you
carry, not a separate minigame you switch into — walking from open ground into
an authored ruin never changes how the game controls or feels.

## The world

Every place is authored around landmarks: the dead oak and the dedication
stone in Old Park, the signal box, the buffer stop and the water tower on the
Old Railway, the headframe, the spoil heaps and the boarded adit above the
Abandoned Mine. The ground rolls (a heightfield per location, flattened where
a bench or a set of rails needs level footing, raised into mounds where a
spoil heap is a mound), grass leans in the wind, a sun throws real shadows,
clouds drift, and each place has its own sky and air — a park at golden hour,
an overcast cutting, a mine at dusk.

Landmarks are not dressing. They are three things at once:

- **Navigation.** A bearing has to be taken *from* somewhere. "From the
  buffer stop, bearing 225, twelve paces" only means anything because the
  buffer stop is a thing you can stand at.
- **Environmental storytelling.** Walk up to one and a single prompt offers a
  closer look: the initials cut into the oak (and the one mark under them
  that is not initials), the one lever in the signal box that has been oiled,
  the wagon stencilled with the number of a line that does not exist. A note
  is not a find — it goes nowhere in your journal — but you remember it, and
  later it means something.
- **World state.** The adit is boarded shut until either of the two mysteries
  that lead to it is resolved. Then the boards are stacked neatly beside the
  rock, and the lintel carries the sun.

## The Surveyor

Somebody else has been walking this ground, recently, measuring. Their boot
prints are in the Silent Court. Their crate is there too, dropped and left,
and inside it: a surveyor's compass and the first page of a field book.

The compass is the game's one found tool — never bought, only picked up — and
it changes what the player can *read*. Every bearing already written in the
journal ("Bearing 312°" on the survey tag, scratched into the plaque on the
bench) becomes a direction you can face: a heading strip appears at the top
of the world while you carry it. The field book is the game's long thread.
Each page is a cross-bearing, the way a surveyor would actually fix a spot:
one line from a named landmark at a written bearing — which always runs
*at* something you can see, the dead oak, the signal box, the rock — and one
sightline to a second landmark on a labelled point of the compass ("where
the lamp on the path stands due south of you"). Where the two cross, the
next page is buried, findable only with the detector. There are no pace
counts: the player has to stand in the world and look. The pages lead
from the court to the park to the railway to a pocket in the rock behind the
mine's spoil heap that you can see from the headframe but cannot walk to in a
straight line (the third page opens the mine ground by itself: knowing exactly
where to stand is reason enough to go) — and the last page ends at the adit, where the three-pointed
sun was already pointing. The surveyor was chasing the same thing you are.
You are not the first. You may be the second.

**Caches** are how this works mechanically: a buried, authored find at a
fixed spot that is only seeded into a field once the player holds the clue
pointing at it. The ground has not changed; what the player knows has. A
place already searched clean becomes worth walking again the moment a page
names it, and the map says so in words rather than numbers.

Deployed to GitHub Pages by `.github/workflows/deploy-pages.yml` on every push
to `main`; the unit suite has to pass before the site goes out. The build's
base path is `/DETECTOR/` (`vite.config.ts`), the e2e suite serves the build
under that same path, and the workflow adds a `404.html` fallback and
`.nojekyll`. Icons and the web manifest live in `public/`.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173 — open it on a phone on your network
npm run build      # typecheck + production build
npm run preview    # serve the build on :4173
npm test           # unit tests (systems, content, save)
npm run e2e        # end-to-end tests at a phone viewport
npm run measure    # prints excavation timing/damage balance figures
```

Everything is rendered at runtime — no image or audio assets. Three.js is
lazy-loaded, so a player who never walks past the map pays nothing for it; the
main bundle is about 110 kB gzipped.

## How it plays

- **Move** with a thumb stick that appears wherever your left thumb lands;
  **look** by dragging anywhere on the right side of the screen. WASD + mouse
  drag work on a desktop, with Q/E as a keyboard-only turn fallback.
- **SEARCH.** Hold the ground steady and walk — the detector sweeps in front
  of you automatically. Beeps get faster and brighter as the coil passes
  closer to something. Pitch hints at the material — low and coarse for iron,
  bright for silver, wrong and doubled for things that should not be down
  there. There is no on-screen meter for this on purpose: the detector talks
  to you through your ears, not a percentage.
- **Hold PINPOINT** to narrow the sweep and read the target; the frame
  narrows with you. Letting go scratches a mark into the dirt where the coil
  was — a plain scuffed cross, no glow and no strength — which is the spot DIG
  will dig, so you can release the button and still dig where you found it.
  Digging is a commitment: you go down on one knee and the light goes before
  the pit opens.
- **OBSERVE.** Some things are never buried — a carving on a wall, a plaque
  half-sunk in the grass, boot prints that are not yours. Walk up, look at it,
  and a single contextual prompt appears. No detector involved; you only find
  these by actually looking. Landmarks offer the same prompt for a note that
  is not a find: a line of the world's story, told once.
- **Take a bearing.** With the surveyor's compass in your kit, the heading
  strip reads your facing as a compass bearing. Stand at the landmark a page
  names, find the line (it runs at something you can see), walk it, and keep
  checking the page's second sightline — turn to the compass point it names
  and see whether the landmark sits under the needle yet. Then listen.
- **The size of the moment matches the size of the find.** A bottle cap gets
  a glance and a single button. A real find gets the card. A clue, a
  connection or a new tool gets a held breath first — the camera settles on
  the thing, the frame narrows and darkens, a low swell — and then the card.
  A completed chain gets the room: its symbols drawn and joined into a
  constellation, the motif in full, and a new line inked onto the map.
- **Dig.** The pit is a hole cut into that field's own turf, with the spoil
  piling up round the rim as you work. Scoop out the bulk, and the moment you
  feel the tool touch something, switch to the brush. The scoop does not care
  what it hits. The tool under your finger is the tool, turned the way you are
  dragging, and the dirt flies the way you throw it.
- **Lift it out** once about 70% of it is uncovered. It comes up out of the
  hole, crumbs falling, before the card. Condition is permanent.
- Some finds carry markings. Those go in the journal as clues, and clues
  connect — the same recurring symbol on two "unrelated" finds is a real
  in-game signal, not decoration, and the journal's Links tab surfaces it,
  whether the two finds came from digging, looking, or both.
- Some finds are only *part* of something. The Journal's Assemble tab shows
  every fragment set you have made progress on; once you hold every piece,
  fitting them together produces the whole object — and changes what you know.

Digging in the wrong place gives you an empty hole. That is intended: the
target stays in the ground and you can go back and find it properly. The
ground remembers either way — every hole you dig stays where you dug it, open
where something came out, a filled plug of turned soil where nothing did. Likewise,
you can walk straight past something you never looked at — that is intended
too.

### The map

The map is a drawn survey sheet, not a list. Places sit where they are. A
place you cannot enter yet is not on the map at all — until something you
hold names it, at which point a faint pencil line runs from where you found
that clue toward a dashed ring and a question mark. When a chain resolves, an
ink line ties its places together for good. The field you walked away from
mid-search is circled in pencil. The map is the one screen where
"everything is connected" is literally visible, and it never shows a count.

### Sound

Everything is synthesised. Under the detector's beeps there is now a slow pad
that belongs to the place (a different key and colour for the park, the
railway, the mine, the ruins) and leans in as the signal rises — its filter
opens and a fifth begins to throb — so the ground stops feeling neutral
exactly when the detector says it is not. Fields are never silent: birds and
gusts in the park, gusts, a metallic creak and a crow on the railway, drips
and a distant rumble in the mine, wind and the odd stone tick in the ruins.
Discoveries have a motif in four sizes, in the key of wherever you are, and
the Silent Court's pedestal comes up out of the ground to the sound of stone
grinding on stone.

## Architecture

Content is data, systems are pure functions, engines own the frame loop, and
React only draws screens. No gameplay rule lives in a component.

```
src/
  content/        pure data — no logic, no imports from app/
    targets.ts          every findable object, including fragment pieces,
                         the composites they assemble into, and the fixed
                         scenery clues found by looking rather than digging
    locations.ts         plots, loot tables, landmarks (the authored features
                          of the ground, with their notes and open/closed
                          states), caches (knowledge-gated buried finds),
                          sceneryClues, and each place's position on the map
    clues.ts             clues and the chains (and cross-chain connections) they form
    equipment.ts         detectors, excavation tools, and the one found tool
    silhouettes.ts       object shapes as primitives (used for both hit-testing and drawing)
    adventure/           authored adventures (puzzle/mechanism/escape) — a
                          registry keyed by id, so a second adventure is a
                          content file plus one line in index.ts
    sites/                authored first-person spaces — same registry
                          pattern; a SiteDef is walls, props, interactables,
                          hazards and detector-findable spots, all still data
  core/
    types.ts            shared content and state types
    gameState.ts        the store: persistent save + navigation + actions
    save.ts             versioned save, migrations, and a sanitiser that eats bad data
    store.ts            tiny framework-agnostic observable
    rng.ts               seeded RNG, value noise, maths helpers
    debug.ts             opt-in read-only introspection (?debug=1)
  systems/        pure game logic, all unit-tested without a browser
    detection.ts        the signal model: falloff, depth, masking, noise, readouts
    placement.ts        procedural target placement from seeds
    excavation.ts       dirt, debris, contact, damage, exposure, extraction
    mechanism.ts        the precision artifact extraction
    discovery.ts        extraction/assembly/observation → journal record, clue, unlocks, funds
    mystery.ts          clue chain evaluation + cross-chain symbol connections
    assembly.ts         fragment-piece progress tracking and composite assembly
    explore.ts           first-person movement: collision, rectangular and
                          circular bounds, hazards, interaction targeting, and
                          the detector coil's sweep position — shared by every
                          first-person space, field or authored site alike
    survey.ts            bearings: yaw as a compass heading, the point N paces
                          along a bearing, the heading strip's ticks
    terrain.ts           the heightfield for a location — pure maths, so the
                          camera, the mesh and the tests all agree on the ground
    landmarks.ts         landmark colliders, notes, open/closed state, and the
                          named landmark the player is standing at
  engine/         browser-facing, imperative
    loop.ts             rAF loop with clamped delta, pauses when hidden
    quality.ts           steps pixel ratio, then shadows, down on a phone
                          that can't hold the frame rate
    input.ts             touch move stick, look drag controller, drag tracker,
                          canvas fitting
    audio.ts             everything synthesised with Web Audio
    haptics.ts            throttled vibration
    render/               the pit, mechanism, object and texture renderers (2D)
    scene3d/               builds a THREE.Scene from either a SiteDef or a
                            detecting LocationDef, and the first-person
                            detector prop both share; atmosphere.ts is the
                            sky, sun, clouds and shadow rig, terrainMesh.ts
                            the ground, grass.ts the instanced wind grass,
                            landmarks.ts what every LandmarkKind is made of,
                            marks.ts the dug holes and pinpoint scratch laid
                            onto the rolling ground;
                            artifact sprites reuse render/object.ts so a
                            carving looks the same in the world as it does in
                            the journal
  app/            React screens and a handful of components
    screens/ExploreScreen.tsx   the one first-person screen for every
                                 location — authored site or open field —
                                 the excavation pit is still its own screen,
                                 reached the same way from either
```

Two rules hold the shape:

1. **Systems never touch the DOM.** The pit, the signal model, the mechanism
   and `systems/explore.ts` are plain data transformations, which is why they
   can be tested exhaustively (and the pit's balance tuned with `npm run
   measure`) without a browser.
2. **State lives in one store.** Per-frame values (player position, the dirt
   grid) stay in the engine and are flushed into the store at sensible moments,
   so React is never in the frame budget.

### Adding content

A new find is an entry in `targets.ts` plus a silhouette. A new detecting
location is an entry in `locations.ts` with its own loot table, a `map`
position, its `landmarks` (pick a kind, place it, optionally give it a name
and a note), and optionally `sceneryClues` (fixed finds discovered by
looking, attachable to a landmark) and `caches` (an authored target at a
fixed spot, gated by a clue id). A new clue thread that leads the player
across the ground is clues with `pointsTo` plus caches gated by the previous
clue — the content tests check that every cache is authored, in bounds and
rolled on no loot table, and the survey tests check the bearings the clue
text promises are the bearings the content delivers. A new mystery is clues plus a chain in `clues.ts`. A new fragment
set is three or more `TargetDef`s with `pieceOf` pointing at a composite
`TargetDef` with `assemblyOf` — the composite must be `authored: true` and
never gets a `locations` list, since the only way to obtain it is
`systems/assembly.ts`, not a dig. A new adventure is a content file shaped
like `content/adventure/courtyard.ts` (a `mechanism`/`escape` are optional — a
puzzle-only adventure just omits them) plus one line in
`content/adventure/index.ts`. A new authored first-person site is a content
file shaped like `content/sites/silentCourt.ts` (props, interactables, one or
two hazards, and the spots a detector can actually find something) plus one
line in `content/sites/index.ts` and a `siteId` on the `LocationDef` that
hosts it — the 3D engine draws whatever the props and interactables say, so a
second site never touches `engine/scene3d/`. None of that requires touching
gameplay code — the content tests will tell you if a reference is broken, a
locked location is unreachable, a composite's pieces are not actually
findable, or a site's flags gate something nothing else ever unlocks.

## Save data

Saved to `localStorage` under `detector.save.v1` (namespaced, because every
`scottyfncodes.github.io` project shares one origin), versioned, and run through
migrations and then a field-by-field sanitiser on every load. A corrupt,
truncated or newer-than-this-build save is set aside under
`detector.save.rejected` and the game starts clean instead of crashing. If
storage is unavailable (private browsing), the game falls back to an in-memory
store and keeps working for that session.

## Debug hook

Load any build with `?debug=1` to get a read-only `window.__detector` exposing
game state and the live detector/explore frames. It exists for debugging and
for the end-to-end tests, which use it as their "ears" while driving the game
through real input. It grants nothing a player could not work out by looking
and listening.

## Testing

- `npm test` — unit tests across the signal model, placement, excavation and
  damage, discovery and unlocks, the mechanism, fragment assembly and symbol
  connections, first-person movement/collision/hazard/targeting math (shared
  by every space), save robustness, and content integrity (including that
  every composite's pieces are actually findable, every locked location —
  chain-gated or assembly-gated — is reachable, and every site/scenery-clue
  reference and flag actually resolves to something real).
- `npm run e2e` — plays the whole loop at a 390×844 viewport with touch and
  the real first-person controls: walks a detecting field, sweeps, pinpoints,
  digs, excavates by dragging, extracts, checks the journal, and reloads to
  confirm persistence; finds a fixed scenery clue by looking rather than
  digging; confirms a wrong-place dig stays honestly empty; walks into The
  Silent Court to confirm its 3D scene renders and its contextual prompt goes
  through the same journal pipeline as a dig; and plays both authored
  adventures end to end (the chamber's door puzzle, mechanism and escape; the
  courtyard's puzzle-only path), plus the tablet assembly flow.

Only Chromium is available in this environment, so the phone is emulated
(iPhone-13 viewport, DPR 3, touch, mobile UA) and rendered in software (no
GPU) — WebGL still runs, just slower than on a real device, and this
environment's synthetic keyboard/pointer input has enough of its own timing
jitter that the e2e helpers favour coarse, self-correcting navigation
(turn-then-forward, re-checking after every step) over precise single moves.
Neither of those stand in for a pass on real iOS Safari and Android Chrome.

## Current scope

Built and playable: the full explore → notice → investigate → discover →
reinterpret → follow → uncover loop, entirely in first person, across:

- **Three detecting fields** — Old Park, the Old Railway, and the Abandoned
  Mine — each a walkable plot of rolling, lit, shadowed ground dressed around
  authored landmarks, with a full procedural loot table, a scenery clue found
  by looking, a handful of landmark notes, and a cache from the Surveyor's
  trail that only exists once its page is held.
- **The Silent Court** — a small authored ruin. Two matching serpent carvings
  on opposite walls produce a "wait, that matches" symbol connection by
  looking rather than digging; a buried stone hand (the site's one detector
  find) fits an empty socket on a broken statue, whose payoff is a relic that
  was standing nearby the whole time; one hazard (a collapsed cistern) is
  never flagged by any UI, only discovered by getting too close to it; a
  dropped modern crate and boot prints that are not yours seed a future
  narrative thread without resolving it.
- **Two authored adventures**, reached through the map like anywhere else:
  **The Sealed Chamber** (a door puzzle, a precision artifact extraction under
  rising tension with an ordered clamp release, and a reactive escape) and
  **The Overgrown Courtyard** (a puzzle-only adventure — no mechanism, no
  escape — reached only by assembling a fragmented artifact first).

Three mystery threads run through the ground and converge on the same
patch of it: the three-pointed sun (paperwork → the mine → the sealed
chamber), the woven knot (three ordinary-looking shards, found in the two
starting fields, that turn out to be one object — assemble it and it points
somewhere new), and the Surveyor (a crate, a compass, four pages, four
bearings, and a trail that ends where the other two end — a second way into
the chamber, for a player who reads the ground rather than rolls the dice). The Journal's Links tab
surfaces a connection the moment two held clues share a symbol, whether or not
they belong to the same formal chain and whether they were dug up or simply
noticed; its Assemble tab tracks progress on every fragment set and performs
the assembly.

Deliberately not built: a second authored site, a third adventure, any economy
beyond funds for kit, combat, crafting, currencies, quest logs, experience
points, or a progression system other than equipment, knowledge and unlocked
ground. Nothing in the world is marked with an icon, a distance or a
checklist count; the map draws lines, the journal says "something is still
missing", and the only numbers the player is asked to read are the ones a
surveyor wrote down.
