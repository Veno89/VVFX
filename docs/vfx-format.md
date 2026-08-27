# Vvfx formats

Vvfx produces two JSON shapes for different purposes.

## Editable `.vvfx` project

The `.vvfx` file is UTF-8 JSON. It contains editor metadata, embedded image data, preview preferences, and every layer setting.

```json
{
  "formatVersion": 17,
  "metadata": {
    "id": "project-...",
    "name": "Simple Magic Impact",
    "createdAt": "2026-08-20T12:00:00.000Z",
    "updatedAt": "2026-08-20T12:05:00.000Z"
  },
  "assets": [],
  "preview": {
    "background": "checkerboard",
    "customColor": "#142039",
    "showGrid": false,
    "zoom": 1,
    "loop": true,
    "duration": 3000,
    "randomSeed": 8421
  },
  "timeline": {
    "markers": [{ "id": "marker-impact", "time": 0, "label": "Impact" }],
    "notes": "0–40 ms flash and expansion"
  },
  "groups": [],
  "layers": []
}
```

Uploaded images use an exact `data:image/png;base64,...` or
`data:image/webp;base64,...` source. Standard, canonically padded base64, the
matching PNG/WebP signature, complete static container structure, valid PNG
chunk CRCs, consistent WebP canvas/payload dimensions, and bounded image
dimensions are required. APNG, animated WebP, URL-safe base64, media
parameters, external URLs, SVG, and MIME-mismatched bytes are rejected. The
browser then fully decodes embedded images before a project or template is
activated, so a structurally plausible but corrupt compressed payload cannot
enter playback. Built-in tutorial shapes use
`image/builtin` plus their canonical stable ID and built-in name. Import treats
the file as untrusted: required containers and layer types are checked, numbers
are normalized, unsafe spawn counts are clamped, and missing built-in assets
are restored.

Before JSON parsing, editable project files are limited to 40 MiB. A project
can contain at most 500 layers, 128 assets, 250 groups, and 100 Timeline
markers. Each embedded image is at most 8 MiB and 4096 by 4096 / 16,777,216
pixels; all embedded images together are limited to 24 MiB and 33,554,432
decoded pixels. IDs are at most 128 characters using letters, digits, `.`, `_`,
and `-`, must start with a letter or digit, and cannot use prototype-reserved
names. Project, layer, group, and asset names are at most 120 characters. Image
decode batches use at most two concurrent decoders and a 30-second collection
deadline; each individual decoder retains its shorter 10-second deadline.

Version 2 assets can include their source `width` and `height` plus a uniform
`spriteSheet` grid containing `frameWidth`, `frameHeight`, and `frameCount`.
Each layer has separate `frameAnimation` settings for FPS, first/last frame,
forward/reverse/ping-pong playback, and looping. This lets one sheet be reused
with different playback on different layers, including particles.

Version 3 layers add a `trail` object. `enabled` turns afterimages on, `count`
limits how many historical samples are used, `spacing` and `lifetime` are in
milliseconds, and `opacity` plus `scaleFalloff` control how older samples fade
and shrink. Trails sample the layer's actual earlier state, so they follow
easing, parents, sprite frames, and deterministic particle movement.

Version 4 layers add a `motionPath` object. Disabled paths preserve ordinary
straight movement. Enabled paths can use a quadratic `curve`, a contracting
`spiral`, or a smooth `custom` route through up to six intermediate points.
The existing horizontal and vertical movement values remain the route endpoint.
`orientToPath` optionally rotates each image along the current path tangent.

Version 5 timing adds `custom` to the easing choices and stores its cubic curve
as `customEasing: { x1, y1, x2, y2 }`. The two X values are normalized time and
are clamped from zero to one. Y values may move below zero or above one to
create anticipation and overshoot. Built-in easing choices keep ignoring these
custom handle values, so switching presets is nondestructive.

Version 6 layers add a `keyframes` object for richer transform animation.
`enabled` activates the track, `initialized` records whether it has been seeded
from the legacy start/end controls, and `frames` contains two to eight ordered
moments. Each moment stores normalized `time` from zero to one plus `scaleX`,
`scaleY`, `opacity`, and a rotation offset in degrees. The first and last
moments stay at zero and one; intermediate moments can move between their
neighbors. Position remains controlled by ordinary movement or motion paths,
so keyframes compose with routes, particles, and motion trails.

Version 7 adds a project-level `groups` array and nullable `groupId` on each
layer. A group stores `id`, `name`, shared `x` and `y` position offsets, and a
shared non-negative `delay`. These values are applied without changing the
member layers' own position or timing. When attached parent and child layers
belong to the same group, the shared position is applied once through the
parent; every member still receives the shared timing offset.

Version 8 assets add optional `atlasFrame`. It names the frame to use when the
asset is mapped to a preloaded Phaser texture atlas at runtime. The uploaded
data URL remains the editor preview and portable fallback. Sprite-sheet frame
playback takes priority over a single atlas-frame name.

Version 9 adds three related capability groups to every normalized layer:

- `appearance.colorOverLifetime` stores `enabled` plus two to five
  `{ time, color }` stops. Time is normalized from zero to one and color is a
  validated `#rrggbb` value. It changes the whole sprite across one copy's
  lifetime; it is not a spatial gradient.
- `behavior` stores `pulse`, `flicker`, `wobble`, and `physics`. Pulse modulates
  scale/opacity, flicker applies seeded opacity variation, wobble provides
  repeating X/Y/rotation drift, and physics stores vertical `gravity` plus
  normalized destination-preserving `drag` (shown in the UI as **Slow down over
  time**).
- Spawn settings add `distribution`: `random`, `edge`, `even`, or `clustered`.
  Rectangle and circle areas use it; a point spawn ignores it.

Version 10 adds project-level editor authoring data in `timeline`. `markers`
stores up to 100 named millisecond positions and `notes` stores the pasted
timing brief used by the marker helper. These values save with editable
projects but are deliberately omitted from Runtime JSON and generated Phaser
TypeScript because they organize authoring rather than change playback.

Version 11 adds the professional-inspired 2D behavior pass without adding a
second timeline:

- `frameAnimation.randomStartFrame` optionally chooses a deterministic offset
  inside the configured flipbook frame sequence for each layer copy.
- `behavior.wobble.style` is either `sway` (the legacy repeating motion) or
  `organic` (smooth seeded wandering); `smoothness` controls how gently organic
  movement changes direction.
- Every layer has `startMode: "timeline" | "triggered"` and an `events` list.
  Events use `start`, `percentage`, `repeat`, or `finish`, then `play` or
  `restart` a target layer. Existing `timing.delay` is interpreted relative to
  each activation origin, so exact Start/Duration, keyframes, property moments,
  easing, paths, and trails remain one coherent animation model.

Version 11 events are layer-lifecycle signals. Project version 13 later adds
the deterministic `copy-finish` signal, but still does not provide collision or
gameplay callbacks. Import rejects missing targets, duplicate event IDs,
self-links, and active directed cycles. Disabled events and links owned by a
disabled layer remain stored but inert; enabling either side revalidates the
active graph before the edit commits. Runtime scheduling also applies depth
and total-activation guards.

Version 12 adds Tier 2 placement/alignment, behavior timing stages, and a
curated Experimental rendering pass:

- Spawn `shape` accepts `line` and `arc`. `lineLength` and `lineAngle` describe
  the centered line. `radius`, `arcStartAngle`, and `arcSweep` describe the arc.
- `artworkForwardAngle` tells direction-facing copies which way their source
  image points; `alignmentVariation` adds a deterministic signed angle per copy.
- Pulse, flicker, wobble/organic movement, and gravity receive an optional
  strength envelope. Its normalized `start`, `attackEnd`, `releaseStart`, and
  `end` stages fade the behavior in, hold it, and fade it out inside the copy's
  existing lifetime. This does not create another Timeline.
- `appearance.effects` stores Experimental blur, outer glow,
  brightness/exposure, animated shine, two-color spatial gradient, directional
  dissolve/wipe, and sprite warp/local heat shimmer. These settings export with
  each layer and render through Phaser WebGL. Canvas fallback keeps the ordinary
  sprite and skips the GPU effect.

The Experimental rendering groups are all present with `enabled: false` by
default:

- `blur`: `quality`, X/Y offset, `strength`, `color`, and pass `steps`;
- `outerGlow`: `color`, `outerStrength`, and `innerStrength`;
- `brightnessExposure`: a neutral-at-one `brightness` multiplier and signed
  `exposure` stops;
- `animatedShine`: `speed`, `lineWidth`, and highlight `gradient`;
- `spatialGradient`: `colorA`, `colorB`, `strength`, normalized start/end X/Y,
  and optional color `bands`;
- `directionalDissolve`: lifetime `start`/`end`, edge `softness`, horizontal or
  vertical `axis`, and `reverse`. Version 12 implicitly uses the straight
  directional pattern;
- `spriteWarp`: `mode` (`barrel`, `noise`, or `heat-shimmer`), barrel amount,
  X/Y displacement amounts, and animation `speed`.

Sprite warp and local heat shimmer modify the selected sprite's texture; they
do not sample or bend the scene behind it.

Version 13 adds deterministic image-silhouette spawning and bounded spatial
copy-finish events without adding a second Timeline:

- An uploaded PNG/WebP asset may contain
  `alphaMask: { columns, rows, alpha }`, where `alpha` is a row-major list of
  8-bit opacity values. Upload preprocessing preserves the source aspect ratio
  while reducing the grid to at most 64 x 64 and 4,096 cells. Built-ins and old
  assets may use `alphaMask: null`.
- Spawn `shape` accepts `"mask"`. `maskAssetId` references the separate asset
  whose alpha supplies eligible positions, `maskSize` is the longest
  world-space side from 0 to 1,000 px (default 160), and `maskThreshold` is
  normalized from .01 to 1 (default .2). The other side preserves the sampled
  image's aspect ratio. The first version defines seeded `random` placement
  only; visual masking, edge/even/clustered mask distributions, and runtime
  texture readback are not implied. A built-in asset, sprite sheet, missing
  alpha grid, or grid with no pixels meeting the threshold is rejected instead
  of silently changing the spawn shape to Point.
- Layer event `trigger` accepts `"copy-finish"`. Its `chance` is a deterministic
  normalized gate from 0 to 1 (default 1), while `maxTriggers` caps accepted
  copies per source activation from 1 to 250 (default 32). Every accepted
  original copy carries its resolved final X/Y and seed into an independent
  target activation. Trail afterimages do not trigger events. The existing
  `action`, `targetLayerId`, cycle/depth/activation guards, and target layer
  timing model are reused.

Version 14 adds two deterministic placement patterns for non-mask spawn shapes:

- `distribution: "stratified"` divides a rectangle or circle interior into
  stable coverage cells. `stratifiedJitter` ranges from 0 (tidy placement) to 1
  (natural movement within each cell) without losing broad coverage.
- `distribution: "clusters"` shares copies across repeatable clump centers.
  `clusterCount` is clamped from 2 to 8 and `clusterSpread` from 0 to .5.
  If a batch has fewer copies than requested clumps, only that many clumps can
  appear. Point and image-silhouette shapes normalize unsupported choices to
  Random; line/arc shapes do not offer stratified interiors.

Version 15 extends the existing Experimental dissolve/erase settings instead
of adding another property-animation system:

- `directionalDissolve.pattern` is `"directional"` for the existing straight
  wipe or `"noise"` for seeded noisy erosion. Older projects normalize to
  `"directional"`, preserving their appearance.
- `noiseScale` is clamped from 1 to 16 and defaults to 6. Lower values create
  larger chunks; higher values create finer, busier patches. It is retained but
  ignored while the directional pattern is selected.
- Both patterns reuse `enabled`, normalized lifetime `start`/`end`, edge
  `softness`, and `reverse`. `axis` affects only the directional wipe. In noise
  mode `reverse` inverts which patches disappear first; it does not run the
  layer backward.
- The erosion field is static and derived from each evaluated copy's seed, so
  seeking and replaying stay repeatable. Sprite sheets use the current rendered
  frame's local coordinates without atlas bleed; differently sized frames
  rescale the local pattern.

Noisy erosion removes only the selected sprite's pixels. It is not the bounded
image-silhouette spawn-position stencil and does not accept an arbitrary image
as a visual mask. Gradient and warp feed into erosion; shine, blur, and glow
then react to the remaining silhouette. The effect costs one GPU pass per
visible copy. Phaser Canvas keeps the ordinary, un-eroded sprite, so authors
should add a normal opacity fade when the fallback must still disappear.

Version 16 adds one bounded Experimental visual mask per layer:

- `appearance.effects.visualMask` stores `enabled`, `maskAssetId`, `channel`
  (`"alpha"` or `"luminance"`), `invert`, `fit` (`"stretch"`, `"contain"`, or
  `"cover"`), normalized local `offsetX`/`offsetY`, `scale`, `rotation`, and
  `strength`.
- `maskAssetId` references a separate still asset. Sprite sheets are rejected as
  mask sources in this first version. The target layer may still be animated;
  the same mask clips its current rendered frame.
- Alpha mode reads the mask texture's opacity. Luminance mode reads its visible
  dark-to-light values. Fit and local transform settings map that texture inside
  the target's sprite-local coordinates. Position is clamped from -2 to 2,
  scale from .1 to 4, rotation from -180 to 180 degrees, and strength from 0 to 1.
- The mask is constant for each copy's existing lifetime. It adds no envelope,
  frames, property moments, or competing Timeline. Animated masks and
  layer-to-layer mask sources remain outside this bounded format.
- Rendering order is visual mask, brightness/spatial gradient, sprite warp,
  directional dissolve/noisy erosion, shine, then blur/outer glow. A visual mask
  costs one GPU pass per visible copy. Canvas keeps the ordinary, unmasked
  sprite; essential cross-renderer clipping should be baked into the source
  PNG/WebP.

The stored 64 x 64 `asset.alphaMask` grid remains CPU spawn-position data. The
visual mask samples the referenced still texture at rendering resolution and
does not reuse that compact grid.

Version 17 adds the `beam` layer type and a nullable `beam` field on every
normalized layer. A Beam stores `{ endX, endY }`, measured as a local offset
from the layer position (endpoint A) to endpoint B. The evaluator centers and
rotates a tightly cropped, left-to-right image between those points and fits
its horizontal scale to the connection length. Sprite-sheet frame width,
uploaded image width, or a safe 128 px fallback supplies the source length.
Other layer types normalize to `beam: null`; Beam layers use `spawn: null`.

For example, a spawn layer can use a separate silhouette asset and fire smoke
at accepted copy endpoints:

```json
{
  "events": [
    {
      "id": "event-spark-smoke",
      "enabled": true,
      "trigger": "copy-finish",
      "percentage": 0.5,
      "action": "play",
      "targetLayerId": "layer-smoke",
      "chance": 0.6,
      "maxTriggers": 24
    }
  ],
  "spawn": {
    "shape": "mask",
    "distribution": "random",
    "maskAssetId": "asset-silhouette",
    "maskSize": 240,
    "maskThreshold": 0.2
  }
}
```

`percentage` remains present on every normalized event but is ignored by a
`copy-finish` trigger. The mask asset's stored alpha bytes—not the Phaser
texture—are the source of truth for placement, so mapped game textures retain
preview parity and never need CORS-sensitive pixel reads.

For example, an animated or spawn layer may contain:

```json
{
  "appearance": {
    "tint": "#ffffff",
    "tintStrength": 1,
    "blendMode": "add",
    "colorOverLifetime": {
      "enabled": true,
      "stops": [
        { "time": 0, "color": "#fff2a6" },
        { "time": 0.55, "color": "#ffb141" },
        { "time": 1, "color": "#e84b2c" }
      ]
    }
  },
  "behavior": {
    "pulse": { "enabled": false, "scale": 0.1, "opacity": 0, "speed": 2 },
    "flicker": {
      "enabled": false,
      "amount": 0.25,
      "speed": 8,
      "randomness": 0.65
    },
    "wobble": {
      "enabled": false,
      "x": 12,
      "y": 0,
      "rotation": 4,
      "speed": 1.5,
      "style": "organic",
      "smoothness": 0.7
    },
    "physics": { "gravity": 300, "drag": 0.5 }
  }
}
```

### Optional-feature state

Current project v17 keeps most optional behavior blocks structurally present so
old projects normalize to one predictable shape. Their `enabled` flag has an
intentional meaning:

- `enabled: true` applies the stored configuration;
- `enabled: false` preserves the stored configuration but contributes nothing
  to evaluation or playback;
- removing a feature that uses a required block replaces it with the canonical
  disabled defaults, so adding it again starts cleanly;
- resetting a control writes that control's canonical default without changing
  the feature's enabled state or unrelated settings.

Features whose schema supports true absence use it: no tint is `null`, no
attachment/group/mask reference is `null`, no events are `[]`, and an asset
without flipbook slicing has `spriteSheet: null`. Removing sprite-sheet slicing,
removing the layer's primary image, or choosing another image also resets that
layer's `frameAnimation` block to canonical defaults, so a later sheet does not
revive an old frame range or playback mode. Removing a layer also removes
events that target it and detaches its children. Import rejects broken current
references rather than retaining ghost data.

These are authored-data rules, not preview-only conventions. Disabled settings
remain disabled after `.vvfx` export/import, save/load, template use, and
undo/redo. Removed entries and references do not reappear after those
boundaries. Derived evaluator values are never serialized back into the layer.

### Layer categories

Every layer has identity, image assignment, visibility, attachment, transform,
timing, appearance, behavior, and randomness. Its `type` discriminates
additional spawn data:

- `static`: one image that remains in place;
- `animated`: one image evaluated through its timing curve;
- `beam`: one image fitted between endpoint A and a local endpoint-B offset;
- `burst`: several instances starting together;
- `emitter`: instances scheduled repeatedly over time.

Only `burst` and `emitter` layers contain a non-null `spawn` object. Only a
`beam` layer contains a non-null `beam` object.

### Units

- position, movement, and Beam endpoint offsets: pixels;
- delay, duration, intervals: milliseconds;
- rotation, line/arc angles, artwork-forward angle, and alignment variation:
  degrees;
- spawn line length and arc radius: pixels;
- gravity: pixels per second squared;
- scale and opacity: normalized numbers (`1` means 100%);
- color-stop time, behavior `drag`, envelope stages, gradient coordinates, and
  dissolve progress: normalized numbers from zero to one;
- tint: `#rrggbb` or `null`;
- random values: maximum signed variation, except delay which varies from zero to its maximum.

## Runtime JSON

Runtime export removes preview background, editor selection/solo state, browser metadata, and help UI concerns. Its root is:

```json
{
  "format": "vvfx-runtime",
  "formatVersion": 15,
  "name": "Simple Magic Impact",
  "duration": 3000,
  "seed": 8421,
  "assets": [],
  "layers": []
}
```

Runtime layers add an explicit numeric `depth` based on their editor order.
`attachTo` references another layer ID or is `null`. Asset sources remain
embedded for this local version, while runtime options may map asset IDs to
texture keys already loaded by a game. Effect groups are flattened into layer
position/timing during export. Preview background, custom color, grid, zoom,
selection, eye visibility, and Solo state are omitted. The layer `enabled`
flag remains the game-facing playback switch.

Runtime JSON intentionally retains disabled feature blocks and their tuned
values with `enabled: false`. This lets the runtime consume the same normalized
shape while guaranteeing the feature contributes no evaluated behavior and
creates no feature-owned transient objects. Removed events and nullable
references are absent; required blocks have canonical disabled defaults.
Generated Phaser TypeScript embeds this exact definition and calls the same
runtime, so it does not maintain a second lifecycle implementation.

### Phaser runtime usage

Build local `@vvfx/phaser-runtime` v0.15.0 with `npm run build:runtime`, then
add `packages/phaser-runtime` to a Phaser game as a local package. Runtime JSON
can be played directly:

```ts
import { playVvfx } from "@vvfx/phaser-runtime";
import impact from "./impact.runtime.json";

await playVvfx(scene, impact, {
  originX: player.x,
  originY: player.y,
});
```

A Beam effect can receive world-space endpoints at startup or while targets
move:

```ts
const lightning = await playVvfx(scene, chainLink, {
  beamEndpoints: {
    startX: caster.x,
    startY: caster.y,
    endX: target.x,
    endY: target.y,
  },
});

lightning.setEndpoints(caster.x, caster.y, target.x, target.y);
```

Omit the optional layer ID to update every Beam layer in the effect, which is
useful for a core/glow stack. Pass a Beam layer ID as the fifth argument to
override only that layer. `clearEndpoints()` restores authored endpoints.

Embedded PNG/WebP data, sprite-sheet/flipbook frames, transform keyframes,
motion paths, motion trails, layer events, whole-image color stops, pulse,
flicker, repeating sway or seeded organic movement, behavior envelopes,
gravity, normalized slowdown, line/arc spawning, alignment controls,
image-silhouette spawning, bounded copy-finish spatial events, Experimental
sprite rendering, and built-in shapes load automatically.
`assetKeys` can
map Vvfx asset IDs to textures already loaded by the game. Mapped sprite sheets
should use numeric Phaser frame names starting at zero. The runtime validates
the format and version before registering its scene update handler, reproduces
deterministic spawn behavior, and removes its sprites and listeners when a
one-shot effect completes.

Runtime version 7 assets introduced optional `atlasFrame`. Map their asset IDs to
the containing preloaded atlas texture through `assetKeys`; `assetFrames` can
override frame names per game without editing the exported JSON.

Runtime version 8 adds project-v9 appearance, behavior, and spawn-distribution
settings. These use the same deterministic evaluator as the editor preview.

Runtime version 9 adds deterministic flipbook random starts, organic movement,
and layer activation events. Generated TypeScript embeds this same definition,
so it does not maintain separate callback or tween semantics.

Runtime version 10 adds line/arc spawn geometry, behavior strength envelopes,
artwork-forward alignment and seeded angular variation, plus the versioned
Experimental WebGL sprite-rendering settings. Canvas keeps the ordinary sprite
when those GPU effects are unavailable.

Runtime version 11 adds the same bounded asset alpha grids, mask spawn
references/settings, and deterministic copy-finish event fields as project
version 13. The runtime samples stored alpha data rather than reading a mapped
texture. Spatial targets use the ordinary activation-relative layer clock and
remain subject to event-graph, depth, activation, per-event, and shared sprite
ceilings.

Runtime version 12 adds project-v14 stratified and multi-clump placement plus
their bounded jitter/count/spread fields. Preview, seeked playback, generated
Phaser TypeScript, and the runtime use the same seeded placement evaluator.

Runtime version 13 adds project-v15 `directionalDissolve.pattern` and
`noiseScale`. The seeded procedural erosion uses the same per-copy lifetime
progress and one-pass ordering as the editor preview. Runtime versions 1
through 12 normalize to the straight directional pattern and scale 6. Canvas
keeps the ordinary, un-eroded sprite and reports the existing one-time
Experimental rendering warning.

Runtime version 14 adds project-v16 `visualMask` settings and the referenced
mask asset. Preview and runtime use the same local fitting, transform, channel,
inversion, strength, pass ordering, and cleanup behavior. Runtime versions 1
through 13 receive a disabled visual-mask default. Canvas and missing-mask
fallback keep the ordinary unmasked sprite and issue a one-time warning.

Runtime version 15 adds project-v17 Beam layers, authored endpoint offsets, and
world-space `beamEndpoints`/`setEndpoints(...)` overrides. The same evaluator
fits preview and runtime sprites, so moving endpoints do not require rewriting
or reloading Runtime JSON.

### Generated Phaser TypeScript

The Phaser TypeScript tab is a runtime-backed export, not a hand-written tween
approximation. It embeds a `VvfxRuntimeDefinition`, imports `playVvfx` and the
runtime types from `@vvfx/phaser-runtime`, and exports a typed play function.
The function accepts world origin, texture/frame mappings, optional Beam
endpoints, seed override, depth, looping, and auto-destroy options, then
returns `Promise<VvfxEffect>`.

This keeps burst/emitter scheduling, color/behavior evaluation, paths, trails,
keyframes, attachments, frame animation, cleanup, and future runtime fixes on
one supported implementation path. The target Phaser project must install or
link the local runtime package and preload any texture keys supplied through
`assetKeys`.

## Effect templates and packs

A reusable template is a smaller editor-portability document with its own
version. Template v2 contains one selected layer, one selected group/component,
or a complete effect, its content-relative duration, and only the assets and
groups referenced by those layers:

```json
{
  "format": "vvfx-template",
  "formatVersion": 2,
  "projectFormatVersion": 17,
  "id": "template-...",
  "name": "Enemy hit",
  "description": "Short blue impact",
  "createdAt": "2026-08-22T08:00:00.000Z",
  "updatedAt": "2026-08-22T08:00:00.000Z",
  "scope": "group",
  "timelineAnchor": 620,
  "duration": 1800,
  "assets": [],
  "groups": [],
  "layers": []
}
```

`scope` is `effect`, `layer`, or `group`. For layer/group scope,
`timelineAnchor` is the earliest selected Timeline-layer start, so that content
begins at the destination playhead. Effect scope uses anchor zero and may keep
intentional leading silence. Triggered-layer delay stays activation-relative;
it is not shifted by the destination playhead. `duration` measures content from
the anchor rather than copying the source project's whole preview length.

Templates are stored in IndexedDB on the current device. Before saving, the UI
summarizes included layers/assets and any parent or event links that leave the
selected scope; those outside links are omitted. Orphan groups are pruned.
Insertion appends fresh ordinary editable layers and remaps group, layer,
attachment, silhouette-asset, and internal event IDs. Compatible assets are
reused; conflicting asset IDs receive fresh IDs.

Exporting one card writes the raw document above as `.vvfx-template`.
`.vvfx-templates` is a library pack of up to 100 entries:

```json
{
  "format": "vvfx-template-pack",
  "formatVersion": 2,
  "exportedAt": "2026-08-22T08:15:00.000Z",
  "templates": []
}
```

The one importer accepts either extension (and ordinary JSON). Every entry is
validated before one atomic write transaction. Duplicate IDs inside one pack
are rejected. If an imported ID and semantic content are already local, that
entry is reported as **already here**. If the ID matches but content differs,
the import receives a fresh ID and an `(imported)` name; local work is never
silently overwritten.

Safety bounds are 24 MiB per selected file, 100 templates per pack, 250 layers,
100 groups, 100 assets, and 12 MB of embedded image bytes per template, with a
20 MB embedded-image total and the project decoded-pixel budget per pack. Shared assets must be canonical Vvfx
built-ins or embedded PNG/WebP data; `file:`, `http:`, and other external image
links are rejected. Template v1 and pack v1 migrate to v2 on read. Because v1
did not record its source project version/scope/anchor, it is interpreted as a
project-v13 complete-effect template with anchor zero. A v2 document that names
a future project format is rejected rather than guessed.

## Compatibility

The current editor emits project `formatVersion: 17`; versions 1 through 17 are
accepted, with versions 1 through 16 normalized to the current shape. Version 1
receives still-image frame defaults, versions 1 and 2 receive disabled
motion-trail defaults, versions 1 through 3 receive disabled motion-path
defaults, and all older versions receive a safe custom easing curve. Versions 1
through 5 receive disabled keyframes seeded from their existing start/end
transforms. Versions 1 through 6 receive an empty group list and ungrouped
layers. Versions 1 through 7 receive no atlas-frame mapping. Versions 1 through
8 receive disabled color-over-lifetime and behavior defaults, plus random spawn
distribution. Versions 1 through 9 receive an empty Timeline marker list and
timing brief. Versions 1 through 10 receive timeline start mode, no event links,
legacy `sway` motion, and disabled random flipbook starts.
Version 11 receives safe point/area spawn geometry, disabled behavior
envelopes, legacy alignment converted to an artwork-forward angle, zero
alignment variation, and disabled Experimental rendering defaults.
Version 12 receives nullable asset alpha samples, non-mask spawn defaults, and
default `chance`/`maxTriggers` fields on its existing layer events. It does not
gain copy-finish links during migration.
Version 13 receives Random-compatible defaults for `stratifiedJitter`,
`clusterCount`, and `clusterSpread`; no existing layer is changed to a new
placement pattern during migration.
Version 14 receives `pattern: "directional"` and `noiseScale: 6` on its existing
dissolve settings, preserving the straight-wipe appearance.
Version 15 receives a disabled visual-mask default with no mask asset reference.
Version 16 receives `beam: null` on its existing layer types; migration never
converts an existing image into a Beam automatically.

Runtime JSON is `formatVersion: 15`; versions 1 through 15 inclusive are
accepted and normalized. Effect
group position and timing remain flattened into ordinary layer values during
export. Unknown future versions are rejected rather than guessed. Runtime
consumers should check both `format` and `formatVersion` before creating effects.
