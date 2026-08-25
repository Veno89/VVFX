# Beginner guide to Vvfx

Vvfx turns prepared 2D images into layered game effects. Think of each layer
as one job in a short visual sentence: **flash**, then **ring**, then **sparks**,
then **smoke**. The app controls when those images appear, how they move and
change, and how copies are distributed.

## Vvfx or an image editor?

Use this quick test:

| What needs to change?                                                                                                                                                              | Best tool                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| The outline, brush texture, internal detail, painted highlight, rune, lightning branch, or detailed gradient inside an image                                                       | Krita, Aseprite, Photoshop, Affinity Photo, or another image editor                            |
| When an image appears, where it moves, how it grows/fades/rotates, how it repeats, or how copies scatter                                                                           | Vvfx                                                                                           |
| The drawing itself must change frame by frame                                                                                                                                      | Draw a sprite sheet, then configure its frame playback in Vvfx                                 |
| Copies should begin inside the visible shape of an imported image                                                                                                                  | Use **Inside an image silhouette** in Vvfx; the image acts as a placement stencil              |
| You want a still-image clipping mask, curated blur, outer glow, brightness/exposure, shine, a two-color gradient, straight wipe, noisy erosion, sprite warp, or local heat shimmer | Try Vvfx's Experimental rendering controls with a Phaser WebGL target                          |
| You need the game scene behind an effect to bend like true refraction or camera-wide heat haze                                                                                     | Use a purpose-built game render pipeline; Vvfx sprite warp does not sample the scene behind it |
| You only need to see whether the effect reads on a dark or light scene                                                                                                             | Change the Vvfx preview background; it is not exported to the runtime                          |

Vvfx's tint and color-over-lifetime controls color the **whole image** as time
passes. Experimental spatial gradient colors different locations on one sprite.
Additive blending only brightens overlaps; Experimental outer glow creates the
actual soft halo.

## How professional 2D VFX works

Most game effects combine simple pieces and control their behavior over a very
short time:

```text
ART PROGRAM            VVFX                         GAME
creates the ingredient -> controls its behavior -> chooses when/where it plays
```

- For smoke, draw the puff and internal shading, then make copies rise, grow,
  fade, vary, and wander organically in Vvfx.
- For blood, draw the splatter silhouette, then choreograph its flash,
  overshoot, outward droplets, settle, and slower fade.
- For fire, draw a flame or flipbook sheet, then control FPS, flicker, tint,
  repetition, and smoke.
- For a projectile, draw the head/streak, then add its route, facing, trail, and
  an event that starts the impact.

Flipbooks, property curves, and events all reuse the same layer lifetime and
the same main Timeline. An event gives a layer a new start origin; the layer's
ordinary Delay, Duration, easing, property moments, path, and trail continue to
mean the same thing.

## Tier 2 controls in plain language

- **Line spawning** places copies along a straight segment. Rotate the line to
  turn a row of sparks or rain in any direction.
- **Arc spawning** places copies around part of a circle. Use it for fan-shaped
  slashes, shockwave fragments, or a curved spray.
- **Even Coverage Inside** divides a rectangle/circle interior into stable
  regions. Natural variation loosens each position without leaving accidental
  empty zones.
- **Several clumps** creates two-to-eight repeatable activity pockets. Number
  of clumps chooses how many; Clump size controls how tight each one feels.
- **Image silhouette spawning** places copies in the visible pixels of a
  separate imported PNG/WebP. Think of it as a stencil for starting positions,
  not a visual mask. Transparent pixels are skipped; Minimum opacity controls
  which soft pixels count. The app stores a bounded 64 x 64 alpha sample so the
  same seeded Random placement works in preview and Phaser without WebGL or
  browser pixel readback.
- **Copy-finish events** let each original Burst or Repeating copies instance
  play a layer where it ends. Start with a finite, unattached Triggered
  Animated image or Burst target. Chance and Maximum plays are deterministic
  safety controls. Trail afterimages do not fire events, and the target's Delay,
  Duration, easing, and property moments still use the same main Timeline
  relative to each event point.
- **Behavior envelope** controls when Pulse, Flicker, Organic movement/sway, or
  Gravity becomes strong and quiet during each copy's existing lifetime. It is
  a fade-in, hold, and fade-out for that behavior—not another Timeline.
- **Artwork-forward angle** tells spawned, direction-facing copies which way
  the source image was drawn. Alignment variation gives those copies a small
  seeded turn so they do not look mechanically identical.

## Experimental rendering

Experimental means the feature is usable, saved, and exported, but is still
being tested on different browsers, GPUs, and game scenes. The current set is:

- blur and colored outer glow;
- clipping one sprite with a separate still mask image;
- brightness/exposure and an animated shine sweep;
- a two-color spatial gradient across one sprite;
- straight-wipe dissolve with one soft edge;
- seeded noisy erosion with irregular disappearing patches;
- sprite warp and animated heat shimmer inside that sprite.

These effects use Phaser WebGL. Canvas-only playback safely shows the plain
sprite and skips the GPU effect. For visual masks and noisy erosion this means
Canvas keeps the ordinary unmasked, un-eroded sprite; add a normal opacity fade
when it must still disappear, and bake essential clipping into the source art
when Canvas must match. WebM/GIF records the rendered Phaser canvas, so test an
important media export on the browser and device you plan to use.

Straight wipe removes pixels behind one moving edge. Noisy erosion removes
irregular sprite-local patches through a static pattern derived from each
copy's seed. Image-silhouette spawning chooses **where copies begin**, while
Noise warp bends pixels without removing them. Visual masking instead uses a
separate still texture to clip the target. The compact
spawn-silhouette alpha grid is never used for visual clipping. Visual masks,
gradient, and warp feed into erosion; shine, blur, and glow then react to the
remaining silhouette. Each visible masked or eroding copy adds bounded GPU
work, so bursts, emitters, and trails multiply the cost. Sprite-local heat
shimmer is not true heat haze: it cannot bend characters, scenery, or other
pixels behind the effect. True scene refraction is decision-deferred because it
needs an explicit game-camera capture and multi-camera rules.

Lighting-aware materials are decision-deferred too. Phaser's Light2D renderer
depends on lights, ambient settings, camera culling, a fixed game-level light
limit, and normal maps owned by the game scene. Vvfx does not turn that shared
system on or change a game's lights from inside a portable effect. A possible
future **fixed local surface light** would be a separate self-contained
normal-map experiment, not a promise that the effect reacts to Phaser scene
lights.

Image silhouette spawning is not part of Experimental rendering. It converts
an imported image's alpha into ordinary deterministic spawn-position data and
works without WebGL.

## The five layer types

- **Still image**: one image with a position, starting look, delay, and finite
  lifetime. Use it for a puddle, scorch mark, persistent rune, or base shape.
- **Animated image**: one image that can move, grow, fade, rotate, change
  color, pulse, flicker, drift, follow a path, and leave a trail.
- **Beam**: one tightly cropped, left-to-right image automatically rotated and
  stretched between endpoints A and B. Drag B in the preview; a Phaser game
  can replace both points with `setEndpoints(...)` while targets move.
- **Burst**: several copies created together. Use it for sparks, debris,
  droplets, petals, or a one-moment spray.
- **Repeating copies**: an emitter that keeps making copies at an interval.
  Use it for smoke, bubbles, embers, rain, or ambient motes. The project
  duration bounds how long it emits.

## First complete effect: Magic Impact

The fastest way to study the finished construction is **Layers -> Add -> Magic
impact - complete effect**. The preset adds Flash, Shockwave, Sparks, and Smoke
without replacing your existing layers. To learn the system, build the same
effect from an empty project using the steps below.

### 1. Start clean

Create a new empty project and name it `Magic Impact`. The four built-in shapes
remain in the Asset Library. Set the preview duration to **3000 ms** and keep
looping on while tuning. Try both the dark and white backgrounds before you
finish.

### 2. Add the Flash

Select the built-in **Flash**, choose **Layers -> Add -> Animated image**, and
rename the layer `Flash`.

| Section    | Setting                            | Value          |
| ---------- | ---------------------------------- | -------------- |
| Basic      | Starting size -> Ending size       | 20% -> 150%    |
| Basic      | Starting opacity -> Ending opacity | 100% -> 0%     |
| Timing     | Start delay / duration             | 0 ms / 320 ms  |
| Timing     | Easing                             | Fast then slow |
| Appearance | Tint                               | `#c9f7ff`      |
| Appearance | Light mixing                       | Additive       |

Why it works: the eye reads the fastest, brightest layer as the exact moment
of impact.

### 3. Add the Ring

Select **Energy ring**, add an **Animated image**, and name it `Shockwave`.

| Section    | Setting                            | Value          |
| ---------- | ---------------------------------- | -------------- |
| Basic      | Starting size -> Ending size       | 25% -> 220%    |
| Basic      | Starting opacity -> Ending opacity | 90% -> 0%      |
| Timing     | Start delay / duration             | 90 ms / 760 ms |
| Timing     | Easing                             | Fast then slow |
| Appearance | Tint                               | `#73d9ff`      |
| Appearance | Light mixing                       | Additive       |

The short delay makes the ring feel like a consequence of the flash instead of
a duplicate of it.

### 4. Add the Sparks

Select **Spark streak**, add a **Burst**, and name it `Sparks`.

| Section    | Setting                        | Value                                                |
| ---------- | ------------------------------ | ---------------------------------------------------- |
| Basic      | Starting size -> Ending size   | 75% -> 15%                                           |
| Basic      | Ending opacity                 | 0%                                                   |
| Movement   | Horizontal / vertical movement | 135 px / 0 px                                        |
| Timing     | Start delay / duration         | 40 ms / 680 ms                                       |
| Timing     | Easing                         | Fast then slow                                       |
| Spawn      | Copies / area                  | 14 / circle, 10 px radius                            |
| Spawn      | Placement / direction          | Around the edge / Outward from center                |
| Spawn      | Alignment                      | Face travel direction                                |
| Randomness | Starting size / rotation       | 28% / 18 degrees                                     |
| Randomness | Horizontal / vertical movement | 55 px / 55 px                                        |
| Randomness | Duration                       | 170 ms                                               |
| Behaviors  | Gravity / Slow down over time  | 300 px/s2 / 50%                                      |
| Appearance | Light mixing                   | Additive                                             |
| Appearance | Color over lifetime            | `#fff2a6` at 0%, `#ffb141` at 55%, `#e84b2c` at 100% |

The movement amount establishes travel distance. Outward direction rotates
that distance around the center. Gravity bends the result downward, while
Slow down over time gives the first part of the route more energy but still
reaches the authored destination.

### 5. Add the Smoke

Select **Soft cloud**, add **Repeating copies**, and name it `Smoke`.

| Section    | Setting                            | Value                                                     |
| ---------- | ---------------------------------- | --------------------------------------------------------- |
| Basic      | Position Y                         | 10 px                                                     |
| Basic      | Starting size -> Ending size       | 35% -> 115%                                               |
| Basic      | Starting opacity -> Ending opacity | 48% -> 0%                                                 |
| Movement   | Vertical movement                  | -72 px                                                    |
| Timing     | Start delay / copy lifetime        | 220 ms / 1300 ms                                          |
| Timing     | Easing                             | Fast then slow                                            |
| Spawn      | Copies per event / gap             | 1 / 260-420 ms                                            |
| Spawn      | Maximum alive                      | 12                                                        |
| Spawn      | Area                               | 46 x 8 px rectangle                                       |
| Spawn      | Placement                          | Clustered near center                                     |
| Randomness | Position X / starting size         | 20 px / 15%                                               |
| Randomness | Horizontal movement / duration     | 22 px / 280 ms                                            |
| Behaviors  | Gentle drift                       | 16 px side-to-side, 3 px bob, 6 degree turn, 0.8 cycles/s |
| Appearance | Tint / light mixing                | `#7c8aa0` / Normal                                        |

Smoke begins last, lasts longest, and uses normal blending so it reads as an
aftermath rather than another light flash.

### 6. Read, tune, and save

Restart, watch once at normal speed, then once at 0.5x. Scrub the Timeline and
ask whether each layer owns a distinct beat. If the result feels muddy, solo
one layer at a time. If it feels weak, adjust timing before adding more layers.

Save keeps the editable project in this browser's IndexedDB. Also export a
`.vvfx` project for a portable backup. When the effect is ready for Phaser,
export Runtime JSON or generated Phaser TypeScript; both use the same exact
runtime evaluator.

### Reuse or share this effect

Open **Effect templates** when you want an editable copy in another project.
Choose the complete effect, selected group, or selected layer. Before saving,
Vvfx lists the layers/images that will travel and warns when an attachment or
event link points outside the chosen scope.

- A layer/group template places its earliest Timeline layer at the destination
  playhead. Triggered-only timing remains relative to its event.
- A complete-effect template may keep intentional silence before its first
  layer.
- Export one card as `.vvfx-template` to share just that reusable effect.
  **Export all** writes a `.vvfx-templates` backup of the local library.
- Import accepts either file. An identical template is reported as already
  here; an ID collision with different content is kept as a new `(imported)`
  copy, never written over local work.

Templates include referenced uploaded PNG/WebP data, groups, internal events,
and image-silhouette alpha samples. They are not full projects: preview
backgrounds, markers, notes, and unrelated layers stay behind.

## Recipe variations

These recipes are also available as complete-effect starting points in the
Layers Add menu. Treat the values as a direction, not a rule.

### Critical Hit

The built-in recipe turns millisecond feedback into four readable beats:

1. **Contact flash** — a tiny white/red flash during the first 60 ms.
2. **Main splatter** — Punch property moments grow past full size almost
   immediately, settle by about 250 ms, then fade through 700 ms.
3. **Impact ring** — starts at 20 ms, explodes outward, and is gone around
   140 ms.
4. **Droplets** — a short outward burst starting around 40 ms.

Replace the practice cloud with your own transparent splatter artwork. The
timing and property moments remain a useful starting choreography.

### Poison Ooze

Build a slow effect with four jobs:

1. **Ooze base** - a Still image using a flattened cloud, normal blend, and a
   saturated green tint. This anchors the effect.
2. **Rising bubbles** - Repeating ring copies moving upward from a circular
   area. Use random size and Organic movement so they do not rise mechanically.
3. **Toxic smoke** - Repeating cloud copies with a clustered spawn region,
   slow upward movement, Organic movement, and whole-image color stops from pale
   yellow-green through green to desaturated dark green.
4. **Occasional pop** - a small outward Burst of streaks, delayed and repeated.

Keep additive blend for the bubbles/pop and normal blend for opaque smoke or
the puddle. A spatial green-to-purple swirl must be painted into the image; a
green-to-purple change over time can be authored directly in Vvfx.

### Fire Impact

Use three speeds and three brightness levels:

1. **Hot flash** - Animated flash, 200-350 ms, additive, with color stops from
   white-yellow to orange-red. Add a small fast Flicker.
2. **Ember sparks** - Burst streaks, outward edge placement, face direction,
   Gravity around 250-500 px/s2, and 40-65% Slow down over time.
3. **Fire smoke** - Repeating clouds after a 150-250 ms delay. Move upward,
   grow, fade, use Clustered placement and Organic movement, and transition from
   warm brown to charcoal.

Prepare a soft flame or smoke image externally for a richer silhouette. The
built-in cloud is intentionally simple practice artwork.

### Healing Aura

Make the rhythm slow and supportive:

1. **Breathing ring** - Animated ring, 1.2-1.8 seconds, yoyo and repeat
   continuously. Add a gentle 5-10% Pulse and green-cyan color stops.
2. **Healing motes** - Repeating flashes or custom specks. Spawn six copies
   evenly around a circle and move them upward with mild size/position
   variation.
3. **Soft center** - Animated flash at low opacity and additive blend, slowly
   pulsing rather than sharply flashing.

Additive overlap suggests light. For a true blurred aura, try Experimental outer
glow on WebGL, or bake the halo into the artwork when Canvas compatibility is
important.

### Magic Projectile

Use one Animated image when you need an asset to move in a direction:

1. Set horizontal and vertical movement to the destination offset.
2. Turn on a curve, spiral, or custom waypoint Motion path. Enable path-facing
   rotation if the artwork points to the right.
3. Turn on Motion trail and start with 6-8 afterimages, 45-70 ms spacing, and
   350-550 ms lifetime.
4. Use ending opacity/size to taper the projectile and trail.
5. Make the impact layer **Triggered only**, then add a Finish event on the
   projectile that restarts it. The trail itself only shows where the
   projectile has been.

For a projectile controlled by game logic, export the Vvfx effect and position
its runtime origin from the game. Vvfx paths are authored local routes, not
target-seeking gameplay code.

### Silhouette Embers

Use one image to describe **where** many other images should begin:

1. Upload a still transparent PNG/WebP silhouette through the Asset Library.
   Vvfx stores a small alpha sample with the asset, so export does not need to
   read the image's pixels again. Built-in shapes and sprite sheets are not mask
   sources in this first version.
2. Create a Burst or Repeating copies layer using your ember, mote, leaf, or
   sparkle artwork.
3. In Spawn, choose **Inside an image silhouette**, then choose the separate
   silhouette asset. **Silhouette size** sets the longest side while preserving
   the source aspect ratio.
4. Start with **Minimum opacity** at 20%. Raise it to keep copies away from very
   soft edges, or lower it to include more of a translucent shape.
5. Add ordinary movement, fade, color, and variation to the spawned copies.

The first version intentionally uses Random placement among eligible visible
cells. It does not crop the ember art, paint a mask, collide with the shape, or
require Experimental WebGL rendering. A fully transparent silhouette cannot
spawn copies; choose another image or lower Minimum opacity if no eligible
pixels remain.

### Firework: Spark to Smoke

Insert the built-in **Spark-to-smoke firework** starter to inspect a finished,
bounded example, or build the smallest useful copy-finish event recipe:

1. Make a finite Burst of outward sparks.
2. Make one small, unattached smoke-puff Animated image or Burst, set it to
   **Triggered only**, and keep its lifetime and copy count finite.
3. On the spark source, open Layer events, find **When each copy finishes**, and
   add a copy-finish event. Choose **Play layer at this spot** and target the
   smoke puff.
4. Use **Chance for each copy** when only some sparks should smoke. Use
   **Maximum plays** to cap the total child puffs from one source activation.
5. Scrub the Timeline. Each puff's ordinary Delay, Duration, easing, property
   moments, path, and behaviors run relative to its spark's final position and
   finish time.

Every original spark can produce an independent puff, even when several sparks
finish together. Trail afterimages never produce child effects. Vvfx also
rejects event cycles and applies event-depth, activation, maximum-play, and
shared sprite budgets so a hand-edited project cannot create unlimited fan-out.

### Dissolving Spirit: Noisy Erosion

Use the built-in **Dissolving spirit** Experimental layer preset to study one
clear erosion setup:

1. Add the preset to an empty project and play its 1.4-second lifetime. The
   erase starts around 48% and finishes with the layer.
2. In Experimental rendering, leave **Erase pattern** on **Noisy erosion**.
   Pattern size 6 produces medium patches; lower values make larger chunks and
   higher values make finer, busier breakup.
3. Replace the practice cloud with a tightly cropped rune, ghost, splatter, or
   other transparent image. The generated noise removes the selected sprite's
   own pixels; it is not a separate mask asset.
4. Add an ordinary opacity fade if the layer must also vanish on Canvas. Canvas
   safely shows the un-eroded image when the GPU effect is unavailable.
5. Start with one Animated image, then use Effect Performance and stress copies
   before applying erosion to a large burst, emitter, or trail.

The seeded pattern stays repeatable while scrubbing and replaying. A sprite
sheet uses the current rendered frame without reading neighboring atlas pixels;
frames with different dimensions rescale the local pattern.

### Masked Energy Ring: Visual Clipping

Use the built-in **Masked energy ring** Experimental layer preset to learn the
difference between a visual mask and a spawn silhouette:

1. Add the preset to an empty project. Its source is the soft Cloud image, but
   the separate Energy ring mask keeps only a ring-shaped part visible.
2. In Experimental rendering, open **Clipping**. **Clip with another image** is
   enabled and **Mask image** is Energy ring.
3. Leave **Read mask from** on **Opacity** for transparent PNG/WebP masks. Choose
   **Brightness** when dark and light values in visible artwork should control
   the result instead.
4. Try **Fit mask**, position, size, rotation, strength, and **Swap kept and
   hidden areas**. These are local settings that follow every copy; they do not
   add another Timeline or choose spawn positions.
5. Replace the practice mask with your own still image. Sprite sheets cannot be
   mask sources in this bounded version, although the clipped target itself may
   use a sprite sheet.
6. Canvas safely shows the ordinary unmasked sprite. If the clip is essential,
   bake it into the source PNG/WebP in an image editor for Canvas parity.

The full-resolution mask texture is used for rendering. **Prepare as spawn
silhouette** remains a separate Asset Library action that creates a compact CPU
placement grid; that grid is never used to crop visible pixels.

### Animated Fire and flipbooks

Vvfx does not invent flame drawings. Export a frame strip or grid from Aseprite,
Krita, EmberGen, or another art tool, mark the asset as a sprite sheet, then set
rows/columns and preview the frames. Use FPS, range, reverse, ping-pong, loop,
or a seeded random starting frame to control playback. Add Flicker, color over
time, size variation, and a separate smoke layer around that real flipbook.

## Preparing artwork

- Export transparent PNG or WebP. Do not drag a `file:///` URL into the web
  app; use the Asset Library upload/drop control so the browser can read and
  embed the file safely.
- Start from white or grayscale when one image should accept many tint colors.
- Leave transparent padding around soft smoke and halos so their edges are not
  clipped.
- Keep erosion artwork tightly cropped when you want its pattern size to read
  consistently; large empty padding still occupies local texture space.
- Point streaks and projectiles to the right before using Face direction or
  Face along path.
- Bake silhouettes, detailed gradients, texture, highlights, shadows, complex
  lightning, and runes into the source art. A painted blur halo or gradient has
  wider renderer compatibility than the Experimental WebGL controls.
- For image-silhouette spawning, make the intended spawn area visible and
  everything else transparent. Upload it through the Asset Library so Vvfx can
  store the bounded alpha sample used by preview and runtime.
- Use a uniform sprite sheet when the drawing itself changes. Keep every frame
  the same size and align the visual center consistently.
- For a Phaser atlas, keep the uploaded image as the portable editor fallback,
  set the optional atlas frame name, and map the Vvfx asset ID to the preloaded
  atlas texture key at runtime.

## What is preview-only and what is exported?

| Data                                                                                                                                                                                | Editable `.vvfx` | Runtime JSON                         | Generated Phaser TS                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------ | ---------------------------------------------- |
| Layers, enabled/start mode, layer/copy-finish events, transforms, timing, appearance, behaviors, Experimental rendering, flipbooks, silhouette spawn data, paths, trails, keyframes | Yes              | Yes                                  | Yes, embedded as runtime JSON                  |
| Project duration and random seed                                                                                                                                                    | Yes              | Yes                                  | Yes                                            |
| Uploaded image data and built-in asset references                                                                                                                                   | Yes              | Yes                                  | Yes; may be replaced with `assetKeys` mappings |
| Effect-group shared position/delay                                                                                                                                                  | Yes              | Flattened into ordinary layer values | Flattened in embedded runtime definition       |
| Timing markers and pasted choreography notes                                                                                                                                        | Yes              | No                                   | No                                             |
| Effect Performance measurements and stress-copy choice                                                                                                                              | No, session only | No                                   | No                                             |
| Preview background, custom background color, grid, and zoom                                                                                                                         | Yes              | No                                   | No                                             |
| Selection, eye visibility, Solo, and guides                                                                                                                                         | Editor state     | No                                   | No                                             |
| Project metadata and browser save identity                                                                                                                                          | Yes              | Only effect name                     | Only generated function/definition naming      |

The eye icon and Solo are inspection tools. To stop a layer from playing in an
exported effect, turn off **Enabled** or remove the layer.

### Turning timing feedback into an effect

Open **Timing plan** above the Timeline and paste feedback using lines such as
`0 ms impact`, `0–40 ms flash expands`, and `250–700 ms blood fades`.
**Create markers** turns single times into milestones and ranges into named
start/end markers. Drag the flags to revise them, or use magnetic marker
snapping while moving layers and keyframes.

For exact work, select one layer and edit Start, End, or Duration in
milliseconds. Arrow keys nudge a focused Timeline bar by 1 ms; Shift uses 10
ms; Ctrl/Cmd jumps to the next marker; Alt temporarily bypasses snapping.
Shift/Ctrl/Cmd-click several layer names to move them together, align their
starts or ends to the playhead, or stagger them by a chosen interval. Markers
and the pasted brief are planning data only—the resulting layer timings and
property keyframes are what the game export plays.

### Choosing an export

- **`.vvfx` project**: editable, includes preview preferences and project
  metadata; use for backups and returning to Vvfx.
- **`.vvfx-template`**: one reusable effect/layer/group with its used images;
  inserts an editable copy at the playhead.
- **`.vvfx-templates`**: backup or transfer of the whole local template
  library.
- **Runtime JSON**: clean game-facing definition, currently format version 14;
  play it with `@vvfx/phaser-runtime`.
- **Generated Phaser TypeScript**: embeds that same definition and returns the
  `VvfxEffect` handle from `playVvfx`. It needs the local runtime package and is
  the convenient exact-code integration path.
- **WebM/GIF**: rendered media for sharing or non-interactive use, not an
  editable or game-runtime effect definition.

## Glossary

| Term                       | Plain-language meaning                                                                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Additive blend             | Brightens pixels where sprites overlap. It is separate from Experimental outer glow and blur.                                                                |
| Asset                      | One reusable source image, built-in shape, sprite sheet, or atlas-frame mapping.                                                                             |
| Attachment                 | Makes a child layer follow another layer's position.                                                                                                         |
| Behavior envelope          | Fades a behavior's strength in, holds it, then fades it out during the existing copy lifetime.                                                               |
| Burst                      | Several copies created at the same moment.                                                                                                                   |
| Color over lifetime        | Whole-image color stops evaluated from the start to end of each copy.                                                                                        |
| Duration/lifetime          | How long a layer or spawned copy remains active.                                                                                                             |
| Straight wipe              | An Experimental erase that removes one sprite behind a soft moving edge.                                                                                     |
| Noise erosion              | Experimental seeded procedural patches that remove one sprite's pixels; not a spawn stencil or imported visual mask.                                         |
| Experimental               | Usable and exported, but still being tested across WebGL browsers, GPUs, captures, and game scenes. Canvas keeps the plain unmasked and un-eroded sprite.    |
| Easing                     | The rhythm of a change: steady, fast first, slow first, smooth, bouncing, overshooting, elastic, or custom.                                                  |
| Emitter / Repeating copies | A layer that creates new copies at intervals until the effect duration ends.                                                                                 |
| Effect template            | A reusable editable effect/layer/group that inserts at the playhead; it is smaller than a full project.                                                      |
| Event                      | A deterministic link that starts or restarts another layer at a chosen lifecycle moment.                                                                     |
| Copy-finish event          | Plays a target at each original copy's final position; a finite, unattached Triggered Animated image or Burst is recommended.                                |
| Flipbook                   | Several drawings in one grid, played quickly to make the artwork itself animate.                                                                             |
| Flicker                    | Seeded opacity variation over time.                                                                                                                          |
| Gentle drift               | Repeating side-to-side, bobbing, and/or turning motion.                                                                                                      |
| Gravity                    | Constant vertical acceleration; positive values pull downward.                                                                                               |
| Heat shimmer               | Experimental animated distortion inside one sprite; scene-behind heat haze/refraction is decision-deferred pending an explicit game-camera capture contract. |
| Image silhouette           | An imported image whose visible pixels choose spawn positions; it does not crop or recolor spawned artwork.                                                  |
| Group                      | Editor organization that shares X/Y position and delay across member layers.                                                                                 |
| Keyframe                   | A chosen moment for size, opacity, and rotation inside a layer lifetime.                                                                                     |
| Motion path                | The curve, spiral, or waypoint route an image follows.                                                                                                       |
| Motion trail               | Fading historical copies left behind a moving layer.                                                                                                         |
| Organic movement           | Smooth seeded wandering that remains repeatable while scrubbing and in the game runtime.                                                                     |
| Property curve             | Two to eight property moments controlling size, opacity, and rotation across one layer lifetime.                                                             |
| Pulse                      | Rhythmic scale and/or opacity change.                                                                                                                        |
| Random seed                | A number that makes authored variation repeatable in preview and runtime.                                                                                    |
| Spawn area                 | The point, rectangle, circle, line, or arc where burst/emitter copies begin.                                                                                 |
| Spawn distribution         | Random, even interior coverage, edge/ring, evenly spaced edge, one center clump, or several stable clumps.                                                   |
| Sprite sheet               | One image containing equally sized animation frames in a grid.                                                                                               |
| Stress test                | A guarded editor-only preview of several copies; it is not a device performance guarantee.                                                                   |
| Template pack              | One portable `.vvfx-templates` file containing several reusable effect templates.                                                                            |
| Slow down over time        | Destination-preserving ease-out along a route, not physical drag.                                                                                            |
| Spatial gradient           | Different colors in different locations inside one sprite; available as a two-color Experimental WebGL effect.                                               |
| Spatial event origin       | The final position carried into a copy-finish event; the target is evaluated relative to this point.                                                         |
| Sprite warp                | Bends the selected sprite texture. It does not bend the game scene behind the effect.                                                                        |
| Visual mask                | A separate still image that clips another sprite. It changes visible pixels; a spawn silhouette only chooses copy positions.                                 |
| Tint                       | One color applied across an entire sprite, mixed by Tint strength.                                                                                           |
| Yoyo                       | Plays a change forward and then back toward its starting state.                                                                                              |

For the implementation-level boundary, see the
[capability matrix](capability-matrix.md). For integration and compatibility,
see [Vvfx formats](vfx-format.md).
