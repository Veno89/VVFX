# Vvfx

Vvfx is a local visual playground for building layered 2D game effects from
transparent PNG and WebP images. It is designed to be understandable on the
first day while still exposing useful timing, movement, spawning, randomness,
behavior, blending, and Phaser export controls.

New projects begin with an empty layer list and four built-in practice shapes.
A first-run workspace tour explains each area, and the Learn menu includes a
guided build, complete-effect recipes, a glossary, and clear advice about what
belongs in Vvfx versus an image editor.

## Run locally

Vvfx requires Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Open the local address printed in the terminal, normally
`http://localhost:3000`. Everything stays on your device; Vvfx has no account,
backend, cloud save, or required deployment.

Do not paste or drag a `file:///` URL into the app. Browsers block a localhost
page from reading arbitrary local-file URLs. Use the Asset Library upload/drop
control, which safely reads and embeds PNG/WebP files selected by you.

## Basic workflow

```text
Upload or choose an image
-> use it in a layer
-> change size, movement, opacity, color, behavior, and timing
-> combine several focused layers
-> play or scrub the preview
-> save locally or export
```

Start with white or grayscale transparent artwork when possible. Tint and
color-over-lifetime can then reuse the same image in many whole-image colors.

## What is included

- Live Phaser 4 preview with play, pause, restart, content-aware loop, four
  playback speeds, zoom, grid, and several test backgrounds.
- Still image, animated image, endpoint-fitted Beam, burst, and
  repeating-copy/emitter layers.
- Beam endpoint authoring with a draggable preview handle, automatic rotation
  and length fitting for left-to-right artwork, plus Phaser world-space
  `setEndpoints(...)` updates for moving targets.
- Undoable **Change type** actions for one layer or a multi-selection. Shared
  timing, appearance, effects, links, and stack position survive conversion;
  changing artwork to Beam seeds sensible endpoints instead of forcing a
  rebuild.
- Position, separate or uniform scale, opacity, rotation, movement, visual
  easing presets, editable cubic curves, delay, duration, repeats, yoyo, tint,
  tint strength, and normal/additive blending.
- Two-to-five-stop whole-image color over lifetime.
- Procedural Pulse, seeded Flicker, repeating sway or seeded Organic movement,
  vertical Gravity, and destination-preserving Slow down over time, with
  optional fade-in/hold/fade-out behavior envelopes.
- Point, rectangle, circle, line, and arc spawn areas with random, stable even
  interior coverage, edge/ring, evenly spaced edge, one center clump, and
  configurable multi-clump placement where applicable.
- Image-silhouette spawning that uses the visible pixels of an imported PNG or
  WebP as a precomputed, deterministic placement stencil. This chooses where
  copies begin; it does not visually mask their artwork or require WebGL.
- Outward, inward, fixed, random, and tangent travel with optional
  direction/path alignment. Spawned direction-facing copies also support an
  artwork-forward angle and seeded alignment variation.
- Seeded variation for position, size, rotation, timing, movement, delay, and
  opacity.
- Curved, spiral, and custom waypoint motion paths with draggable preview
  handles and optional path-facing rotation.
- Deterministic fading motion trails for animated images and spawned copies,
  with beginner Energy Bolt, Smoke, Slash, and Ghost presets.
- Two-to-eight transform keyframes for size, opacity, and rotation, editable as
  Inspector cards or Timeline diamonds.
- Visual uniform-grid flipbook setup with rows/columns, frame thumbnails,
  animated preview, frame ranges, 1-60 FPS, forward/reverse/ping-pong playback,
  looping, and optional seeded random starting frames.
- Beginner property-curve presets such as Punch, Quick pop, Slow fade, Pulse,
  and Fast burst then settle. They generate the same transform-property moments
  already shown as draggable diamonds on the main Timeline.
- Deterministic layer events for start, chosen percentage, repeat, and finish;
  targets can play or restart with cycle and activation safeguards. Bounded
  copy-finish events can also play a layer at each original copy's resolved
  final position; finite Triggered-only targets are recommended.
- Optional named Phaser atlas frames with game-side texture/frame mapping.
- Conventional layer stacking with the top row rendered frontmost, plus
  Bring forward, Send backward, Bring to front, and Send to back actions. Layer
  rename, eye visibility, enable/disable, Solo, duplicate, delete, settings
  copy/paste, attachment, and stable direct preview dragging remain available.
- Browser-local layer search, folders, editing locks, keyboard reordering, and
  per-project Timeline zoom/work ranges. Resizable asset, layer, preview,
  Inspector, and Timeline regions persist without changing project data.
- Named effect groups with shared X/Y positioning, shared timing offsets,
  membership controls, and draggable group Timeline bars.
- Timeline layer bars with draggable start/duration handles, exact millisecond
  Start/End/Duration fields, frame-aware snapping, and intermediate keyframe
  diamonds. Expand a layer's FX badge for nested effect clips that can be moved
  or resized without turning effects into separate visual layers.
- Timeline work-range and timing-plan tools live behind **More**, while detailed
  property moments expand only when needed; primary transport, snap, zoom, and
  selected timing stay visible without the former wall of controls.
- Saved named timing markers, pasted-feedback-to-marker extraction, 1/10 ms
  keyboard nudging, and multi-layer move/align/stagger choreography.
- Reset buttons that restore slider defaults.
- Authoring-only undo/redo that ignores zoom, playback, selection, and other
  workspace choices; focused field and slider edits collapse into one clear
  undo step.
- Dependency-aware image removal that previews every affected layer and
  restores the image plus repaired references with one Undo.
- Responsive project actions, keyboard-routed dialogs and popups, modal
  background isolation, and typed live status notices.
- IndexedDB project saves, Save As, duplication, separate recovery autosaves,
  `.vvfx` import/export, and reusable local layer/group/effect templates and
  portable sharing. Export one raw `.vvfx-template` or back up the whole local
  library as a `.vvfx-templates` pack; collision-safe import never silently
  replaces a different local template.
- Optional Effect Performance details with live/peak sprites, creation rate,
  estimated duration and spawn pressure, friendly warnings, and guarded
  1/10/25/50-copy stress previews.
- Recommended compact Runtime JSON for drop-in game integration, plus an
  Advanced TypeScript wrapper when a standalone typed helper file is useful.
  Both call the exact `@vvfx/phaser-runtime` evaluator.
- Export preflight profiles for mobile, balanced gameplay, and showcase targets
  report content/reference errors, point-versus-endpoint placement capability,
  and sprite, WebGL-pass, image, and duration budgets before game-facing exports
  are downloaded.
- Clean local WebM (30 FPS) and GIF (15 FPS) export using the active Timeline
  range, with editor guides removed automatically.
- A compact Effect toolbelt on the selected layer and a contextual Effect
  Inspector for adding, selecting, tuning, disabling, or removing effects. Each
  effect has a per-copy Timeline clip with exact timing, fade-in/fade-out, and a
  selectable fade shape.
- Clearly marked Experimental WebGL rendering for blur, outer glow,
  brightness/exposure, animated shine, two-color spatial gradients,
  still-image visual clipping masks, straight-wipe dissolve, seeded noisy
  erosion, sprite warp, and sprite-local heat shimmer. Canvas playback safely
  keeps the ordinary unmasked and un-eroded sprite.
- Centered 16:9 game/HD, square, vertical, and current-preview media sizes.
- Guided layer presets for impact flashes, shockwaves, sparks, smoke, motes,
  bubbles, and pops.
- Complete-effect starting points for Magic impact, Critical hit, Poison ooze,
  Fire impact, Healing aura, Magic projectile, and Spark-to-smoke firework.
- Safe import normalization and a hard 500-sprite per-effect evaluator ceiling
  shared by preview and runtime playback.
- A local Phaser runtime package with deterministic bursts, emitters,
  attachments, sprite sheets, atlas frames, keyframes, paths, trails,
  image-silhouette spawning, spatial copy-finish events, appearance/behavior
  evaluation, texture mapping, and cleanup.

## Product boundary

Vvfx is a 2D effect behavior compositor, not an image editor or shader graph.
It moves, grows, fades, tints, repeats, scatters, pulses, flickers, drifts,
combines prepared images, and offers a small experimental set of curated WebGL
rendering effects.

Draw silhouettes, texture, internal gradients, highlights, runes, complex
lightning, smoke detail, and hand-made animation frames in an image editor.
Vvfx can use the visible pixels of one imported silhouette as a spawn-position
stencil, but it does not draw, repair, or visually apply that mask.
Experimental blur, outer glow, brightness/exposure, animated shine, spatial
gradient, one-still-image visual clipping, straight-wipe dissolve, noisy
erosion, and sprite-local distortion controls are available in Vvfx when Phaser
WebGL is a suitable target. A visual mask samples a separate still texture; the
compact spawn-silhouette grid only chooses positions. Noisy erosion instead
uses generated procedural noise on the sprite itself. True refraction or heat
haze that bends the game scene is decision-deferred because it needs an
explicit game-camera capture contract. Additive blending still only brightens
overlaps; it is separate from outer glow.

See the [capability matrix](docs/capability-matrix.md) for the exact layer,
preview, Runtime JSON, generated-TypeScript, and limitation boundary.

## Keyboard shortcuts

| Shortcut                             | Action                   |
| ------------------------------------ | ------------------------ |
| Space                                | Play or pause            |
| R                                    | Restart preview          |
| Delete                               | Delete selected layer    |
| Ctrl/Cmd + D                         | Duplicate selected layer |
| Ctrl/Cmd + Z or Alt + Z              | Undo authoring change    |
| Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z | Redo                     |
| Arrow left/right on Timeline item    | Nudge by 1 ms            |
| Shift + Arrow on Timeline item       | Nudge by 10 ms           |
| Ctrl/Cmd + Arrow on Timeline item    | Jump to timing marker    |
| Ctrl/Cmd + S                         | Save in this browser     |
| Ctrl/Cmd + Shift + S                 | Save as a separate copy  |

Shortcuts are ignored while typing in a field.

## Phaser integration

Build the local runtime package, then link or install it in the target Phaser
game:

```bash
npm run build:runtime
```

Runtime JSON is the recommended integration boundary: give the
`*.vvfx-runtime.json` file a stable effect ID, commit it with the game, and pass
it directly to `playVvfx`. Replacing that one file is enough to update an
authored effect. The **Advanced
TypeScript** tab embeds the same definition in a typed helper file for projects
that do not use a shared loader. Both are exact evaluator paths; the generated
file is not a separate set of approximate tweens. Map asset IDs to textures
already loaded by the game with `assetKeys`, and optionally override atlas
frames with `assetFrames`.

Every export can play at an origin x/y. Endpoint options appear only when the
effect actually contains a Beam layer. Ordinary animated-image effects do not
advertise a `beamEndpoints` option that cannot affect them.

For a shared game-side effect library, the intended loop is:

1. Export **Runtime JSON** and give the file a stable name such as
   `meteor-strike.vvfx-runtime.json`.
2. Place it in the game's effect catalog and preload the catalog once per
   Phaser scene.
3. Play point effects at x/y and Beam effects between world-space endpoints.
4. Replace the same JSON file after later Vvfx edits; weapon logic and imports
   do not need to change.

Embedded images make the first integration portable. A production game may map
asset IDs to already-loaded texture keys to avoid decoding duplicate artwork.
For short dynamic Beams, runtime `beamFit: "crop"` uses a centered part of the
source instead of squeezing every source pixel; `beamThicknessScale` tunes only
the cross-axis size, and `maxDurationMs` can trim an unused authored tail. These
are game-side playback options and do not modify the export.

The current unreleased source emits editable project **v18** and Runtime JSON
**v16**. Older supported formats are normalized during import; project v17 and
Runtime v15 effects receive explicit full-life clips so they keep their prior
appearance. Unknown future versions are rejected.

The private/local `@vvfx/phaser-runtime` package is **v0.16.0**. It emits
Runtime JSON v16, accepts supported exports from v1 through v16, and requires
Phaser `>=4.2.1 <5`. The assigned version identifies the local folder/tarball
artifact; the package has not been published to a registry.

## Long-session behavior

Vvfx keeps one preview game/canvas alive across normal playback restarts,
reconciles sprites and WebGL controllers instead of stacking them, and bounds
mask-related caches. The 60 FPS playback clock is isolated to Preview and
Timeline consumers so editing unrelated controls does not re-render the entire
workspace every frame. Recovery autosaves serialize the latest pending change,
and saved-project/template dialogs release full embedded image data when they
close. These are implementation safeguards; the Effect Performance panel and
stress preview remain the tools for judging whether an individual effect is too
expensive for its target game.

## Development commands

```bash
npm run dev           # start the local editor
npm run typecheck     # check TypeScript without emitting files
npm run test          # run Vitest once
npm run test:watch    # rerun tests while editing
npm run test:browser  # build and run the Chromium/Firefox workflow suite
npm run test:runtime-package # install/type-check/execute the packed runtime
npm run lint          # lint TypeScript and React
npm run format        # format source, tests, and docs
npm run format:check  # check formatting without changing files
npm run build         # create an editor production build
npm run build:runtime # bundle runtime JavaScript and generate declarations
npm run build:all     # build both runtime and editor
npm run verify        # run the local non-browser quality and package gates
npm run verify:release # run the complete release gate, including browser tests
```

`npm run test:browser` uses a temporary production server on port 4173 and
shuts it down afterward. Install its browsers once with
`npx playwright install chromium firefox`. Set `VVFX_BROWSER_BASE_URL` only when you
deliberately want Playwright to test an already-running server instead.

The runtime declarations under `packages/phaser-runtime/types` are generated
from source. Do not edit them by hand. `npm run check:runtime-types` regenerates
them and fails when a committed declaration is stale.

## Project structure

```text
app/                     App route, metadata, and visual system
src/editor/              React editor shell and focused UI components
src/preview/             Phaser preview bridge
src/vfx/                 Framework-independent data model and runtime math
src/persistence/         IndexedDB project, recovery, and template storage
packages/phaser-runtime/ Reusable Phaser 4 runtime for exported effects
tests/                   Model, export, history, runtime, and control tests
docs/                    Architecture, format, capability, guide, and roadmap
```

## Documentation

- [Beginner guide and effect recipes](docs/vfx-beginner-guide.md)
- [Capability and product-boundary matrix](docs/capability-matrix.md)
- [Architecture](docs/architecture.md)
- [Project and runtime formats](docs/vfx-format.md)
- [Open roadmap](docs/roadmap.md)
- [Release process](docs/release.md)
- [Changelog](CHANGELOG.md)
- [MIT license](LICENSE)

## Current limitations

- Color over lifetime and Tint affect the whole sprite. Experimental spatial
  gradients color different locations on one sprite through WebGL; paint the
  gradient into the asset when Canvas compatibility is required.
- Additive blending brightens overlaps but does not create a blur halo. The
  Experimental outer-glow and blur controls are WebGL-only and safely disappear
  on Canvas while leaving the source sprite visible.
- Rendering-effect clips time a modifier on its parent layer; they do not create
  another z-order entry. Use separate artwork on a lower layer when a painted
  halo must sit behind a lightning core or other foreground image.
- Experimental straight-wipe dissolve and noisy erosion remove sprite pixels
  only in WebGL. Canvas keeps the ordinary, un-eroded sprite, so add a normal
  opacity fade when the fallback must still disappear. Gradient and warp feed
  into erosion; shine, blur, and glow then react to its remaining silhouette.
  Every visible copy adds one GPU pass.
- Experimental visual clipping uses one separate still image per layer and one
  bounded GPU pass per visible copy. Sprite-sheet masks, animated masks,
  layer-to-layer masks, and a general compositor are not supported. Canvas shows
  the full unmasked sprite, so bake essential clipping into the source art when
  Canvas parity matters.
- Experimental warp and local heat shimmer bend the selected sprite texture,
  not the scene behind it. True scene refraction and camera-wide heat haze are
  decision-deferred pending explicit scene capture and multi-camera rules.
- Gravity is constant vertical acceleration without collision. Slow down over
  time is a normalized route ease-out that still reaches the authored endpoint,
  not physical drag integration.
- Image-silhouette spawning reads a bounded precomputed alpha sample from an
  uploaded still PNG/WebP. Built-ins and sprite sheets are not mask sources. It
  currently chooses random eligible visible positions; this is placement data,
  not a visual mask, collision shape, or shader.
- Copy-finish events fire only for original burst/emitter copies, never trail
  afterimages. Chance, per-event play limits, event-graph guards, and the shared
  sprite budget keep child effects bounded. The editor recommends a finite,
  unattached Triggered Animated image or Burst and warns when an existing
  target no longer fits that beginner-safe pattern.
- Preview background, grid, zoom, selection, eye visibility, and Solo are not
  game-runtime data. Use **Enabled** to control exported playback.
- Advanced TypeScript requires the local `@vvfx/phaser-runtime` package. Games
  must preload texture keys supplied through `assetKeys`; use the recommended
  Runtime JSON route for a reusable game-side effect library.
- WebM uses the browser's native encoder and requires a current Chrome, Edge,
  or Firefox build. GIF is the fallback, with a compact palette and
  transparency.
- Browser saves, recovery drafts, and effect templates stay in one browser
  profile. Export `.vvfx` projects for full-project backups, one
  `.vvfx-template` for a reusable effect, or `.vvfx-templates` to back up the
  whole local template library.
- The editor is desktop-first, while responsive project actions and stacked
  workspace panels keep the complete workflow reachable at narrower widths.

The planned implementation phases are complete. Deliberately deferred research
items—such as true ribbon geometry, scene-behind refraction, animated masks, and
a general compositor—plus the decision not to couple portable effects to
Phaser's scene-owned Light2D state remain recorded in
[docs/roadmap.md](docs/roadmap.md). They are not an active next phase. A
separately named fixed local normal-map experiment may be evaluated later, but
would not claim to react to a game's Phaser lights.
