# Vvfx capability matrix

This document is the source of truth for what Vvfx authors, previews, and
exports today. It describes editable project format **version 17**, runtime
format **version 15**, and local runtime package **0.14.0**.

The generated Phaser TypeScript export is an exact integration path: it embeds
the runtime definition and calls `playVvfx` from `@vvfx/phaser-runtime`. It does
not maintain a second, approximate animation implementation.

## Product boundary

| Area                | Vvfx owns                                                                                                                                                                                                                                                | Use another tool for                                                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Asset creation      | Importing transparent PNG/WebP artwork, four simple built-in practice shapes, uniform sprite-sheet slicing, optional Phaser atlas-frame names, and bounded alpha sampling for spawn stencils                                                             | Drawing or repairing silhouettes, smoke texture, lightning branches, runes, painted highlights, detailed gradients, and hand-drawn animation frames           |
| VFX behavior        | Layering, timing, endpoint-fitted beams, layer and copy-finish events, movement, whole-image tinting, color over lifetime, silhouette spawning, randomness, behaviors, trails, paths, flipbooks, property curves, and composition                        | Repainting pixels, procedural lightning branches, collision/gameplay callbacks, or changing the internal drawing without a sprite sheet                       |
| Preview environment | Checkerboard, black, dark, white, or custom-color workspace backgrounds; grid; zoom; selection and path guides                                                                                                                                           | A game scene, camera, lighting system, or final environment art                                                                                               |
| Advanced rendering  | Normal/additive blending plus Experimental WebGL still-image clipping masks, blur, outer glow, brightness/exposure, animated shine, two-color spatial gradient, straight-wipe dissolve, seeded noisy erosion, sprite warp, and sprite-local heat shimmer | Scene-behind refraction/heat haze, animated/layer-to-layer/camera masks, lighting, fluid simulation, a general compositing graph, and custom shader pipelines |

Vvfx is therefore a **2D effect behavior compositor**, not an image editor and
not a general-purpose shader authoring tool.

## Beam layer

| Capability                                                 | Editor preview                                            | Runtime JSON v15              | Generated Phaser TS                                 | Important limits                                                                                           |
| ---------------------------------------------------------- | --------------------------------------------------------- | ----------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Authored endpoints                                         | Exact, with draggable endpoint B                          | Exact                         | Exact via runtime                                   | Endpoint B is stored as a local offset from the layer position (A)                                         |
| Automatic fitting                                          | Centers, rotates, and stretches one image between A and B | Exact                         | Exact via runtime                                   | Source art must be tightly cropped and drawn left to right; this is not a segmented spline or tiled ribbon |
| Flipbook, tint, additive blend, glow, flicker, and opacity | Supported                                                 | Exact                         | Exact via runtime                                   | The current frame is fitted as one sprite; VVFX does not draw procedural branches                          |
| Moving game targets                                        | Not a gameplay simulation                                 | World-space endpoint override | `beamEndpoints` plus `VvfxEffect.setEndpoints(...)` | Target selection, collision, sound, and scene lighting remain owned by the host game                       |

Beam layers use the ordinary layer Timeline and appearance controls. Their
length and angle remain pinned to the endpoints; authored movement paths and
manual rotation do not compete with endpoint fitting.

## Layer and export matrix

`Yes` means the feature is exposed by the editor for that layer type. `Per
copy` means each burst/emitter instance evaluates the feature across its own
lifetime. `--` means the public editor intentionally does not expose it for
that layer type.

| Capability                                                  | Still image             | Animated image            | Burst                     | Repeating copies       | Editor preview          | Runtime JSON v15    | Generated Phaser TS | Presets/help                        | Important limits                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------- | ------------------------- | ------------------------- | ---------------------- | ----------------------- | ------------------- | ------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One positioned image                                        | Yes                     | Yes                       | --                        | --                     | Exact                   | Exact               | Exact via runtime   | First-effect guide                  | A still image has a delay and finite authored lifetime, but no movement/easing controls                                                                                                                                                                             |
| One transforming image                                      | --                      | Yes                       | --                        | --                     | Exact                   | Exact               | Exact via runtime   | Impact flash, Shockwave, Smoke wisp | Changes happen during one layer lifetime                                                                                                                                                                                                                            |
| Simultaneous copies                                         | --                      | --                        | Yes                       | --                     | Exact                   | Exact               | Exact via runtime   | Sparks, Bubble pop                  | Burst count is clamped to 250                                                                                                                                                                                                                                       |
| Repeatedly spawned copies                                   | --                      | --                        | --                        | Yes                    | Exact                   | Exact               | Exact via runtime   | Floating motes, Bubble, Poison ooze | Up to 25 copies per event and 500 alive; the project duration bounds emission                                                                                                                                                                                       |
| X/Y position and direct preview drag                        | Yes                     | Yes                       | Yes                       | Yes                    | Exact                   | Exact               | Exact via runtime   | Tour and contextual help            | Dragging changes authoring position; zoom itself is preview-only                                                                                                                                                                                                    |
| Uniform or separate X/Y scale                               | Starting size           | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Inspector help                      | Scale values are normalized (`1` = 100%)                                                                                                                                                                                                                            |
| Opacity and rotation                                        | Starting value          | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Inspector help                      | Opacity is clamped from 0 to 1                                                                                                                                                                                                                                      |
| Delay and lifetime                                          | Yes                     | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Timeline and layer summary          | Minimum normalized duration is 50 ms                                                                                                                                                                                                                                |
| Timing markers and choreography notes                       | Yes                     | Yes                       | Yes                       | Yes                    | Editor authoring aid    | Omitted             | Omitted             | Timeline timing-plan helper         | Named markers, pasted notes, snapping, and frame readouts organize authoring; they never change effect playback                                                                                                                                                     |
| Exact timing and multi-layer alignment                      | Yes                     | Yes                       | Yes                       | Yes                    | Exact                   | Exact layer values  | Exact via runtime   | Timeline precision bar              | Start/End/Duration use milliseconds; multi-move, align, and stagger commit ordinary layer timing values                                                                                                                                                             |
| Layer events                                                | Source/target           | Source/target             | Source/target             | Start/repeat source    | Exact and deterministic | Exact               | Exact via runtime   | Events Inspector and recipes        | Start/percentage/repeat/finish events play or restart layers; active cycles, depth, and total activations are bounded, while disabled links remain inert stored configuration                                                                                       |
| Copy-finish spatial events                                  | Existing target only    | Source/recommended target | Source/recommended target | Source/existing target | Exact and deterministic | Exact               | Exact via runtime   | Firework / spark-to-smoke guidance  | Each original copy can play a target at its final position; the new-event picker recommends finite, unattached Triggered animated/burst targets, while seeded chance, maximum plays, graph guards, and the shared sprite budget bound fan-out; trails never trigger |
| Repeat, yoyo, and easing                                    | --                      | Yes                       | Yes                       | Per-copy yoyo/easing   | Exact                   | Exact               | Exact via runtime   | Curve preview and tooltips          | An emitter's interval already repeats it; its project duration, not layer repeat count, bounds new emissions                                                                                                                                                        |
| Built-in and custom easing                                  | --                      | Yes                       | Yes                       | Per copy               | Exact                   | Exact               | Exact via runtime   | Visual easing graph                 | Custom cubic controls allow anticipation and overshoot                                                                                                                                                                                                              |
| Transform keyframes/property curves                         | --                      | 2-8                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Timeline diamonds and curve presets | Punch/Quick pop/Slow fade/Pulse presets generate the same canonical property moments; paths own position                                                                                                                                                            |
| Straight movement                                           | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Layer presets                       | Movement values describe total authored displacement, not velocity                                                                                                                                                                                                  |
| Curve, spiral, or waypoint path                             | --                      | Yes                       | Per copy                  | Per copy               | Exact plus handles      | Exact               | Exact via runtime   | Motion-path help                    | Up to six custom intermediate points; no path collision or obstacle avoidance                                                                                                                                                                                       |
| Face movement/path direction                                | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Spawn and path help                 | Spawned copies support artwork-forward angle and seeded variation; right-facing art remains simplest for an animated path                                                                                                                                           |
| Motion trail/afterimages                                    | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Energy/Smoke/Slash/Ghost presets    | 1-16 samples; original sprites take priority within the shared 500-instance evaluator ceiling                                                                                                                                                                       |
| Whole-image tint and tint strength                          | Yes                     | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Asset-prep guidance                 | Tint affects the whole sprite; it cannot paint different colors in different image regions                                                                                                                                                                          |
| Whole-image color over lifetime                             | --                      | 2-5 stops                 | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Appearance help and recipes         | Stops interpolate RGB over normalized copy lifetime; this is not a spatial gradient                                                                                                                                                                                 |
| Normal/additive blend                                       | Yes                     | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Magic/fire/spark presets            | Additive blending brightens overlaps; it is not blur or an outer glow                                                                                                                                                                                               |
| Pulse                                                       | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Behaviors help, aura recipes        | Sine-based scale and/or opacity modulation                                                                                                                                                                                                                          |
| Flicker                                                     | --                      | Yes                       | Per copy                  | Per copy               | Exact and seeded        | Exact               | Exact via runtime   | Behaviors help, fire recipe         | Irregularity is deterministic for the same seed, not live noise from the game                                                                                                                                                                                       |
| Repeating sway / organic movement                           | --                      | Yes                       | Per copy                  | Per copy               | Exact and seeded        | Exact               | Exact via runtime   | Smoke, ooze, aura recipes           | Natural wander uses smooth seeded noise; legacy sway remains visually unchanged; neither is fluid simulation                                                                                                                                                        |
| Behavior strength envelope                                  | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Behaviors Inspector                 | Fade-in/hold/fade-out strength applies to pulse, flicker, sway/organic movement, and gravity inside the existing copy lifetime                                                                                                                                      |
| Gravity                                                     | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Behaviors help, spark recipes       | Constant vertical acceleration in px/s2; no collision or bounce physics                                                                                                                                                                                             |
| Slow down over time                                         | --                      | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Behaviors help                      | A normalized ease-out along the route that still reaches the authored destination; not physical drag integration                                                                                                                                                    |
| Seeded variation                                            | Limited authored fields | Yes                       | Per copy                  | Per copy               | Exact and repeatable    | Exact               | Exact via runtime   | Randomness help                     | Position, size, rotation, duration, movement, delay, and opacity use bounded variation                                                                                                                                                                              |
| Point/rectangle/circle/line/arc/image-silhouette spawn area | --                      | --                        | Yes                       | Yes                    | Exact plus guide        | Exact               | Exact via runtime   | Spawn help and Silhouette embers    | Image silhouettes use a separate asset's bounded precomputed alpha grid; `maskSize` preserves aspect and Random is the only supported distribution                                                                                                                  |
| Random/stratified/edge/even/one-or-many-clump placement     | --                      | --                        | Yes                       | Yes                    | Exact                   | Exact               | Exact via runtime   | Spawn help and recipes              | Even Coverage Inside uses stable cells plus Natural variation; Several clumps supports 2-8 stable clumps and Clump size; image-silhouette spawning intentionally supports Random eligible pixels only                                                               |
| Random/outward/inward/fixed/tangent travel                  | --                      | --                        | Yes                       | Yes                    | Exact                   | Exact               | Exact via runtime   | Sparks and Bubble pop               | Fixed direction supports angle spread; tangent follows the spawn-edge orientation                                                                                                                                                                                   |
| Sprite-sheet/flipbook playback                              | Yes                     | Yes                       | Per copy                  | Per copy               | Exact                   | Exact               | Exact via runtime   | Visual frame-strip preview          | Uniform grid only, 1-60 FPS, range/reverse/ping-pong/loop/random-start; source art must contain the frames                                                                                                                                                          |
| Named texture-atlas frame                                   | Yes                     | Yes                       | Per copy                  | Per copy               | Uploaded fallback image | Exact mapping       | Exact via runtime   | Atlas help                          | The game must preload the atlas texture and provide its texture key                                                                                                                                                                                                 |
| Layer attachment                                            | Yes                     | Yes                       | Yes                       | Yes                    | Exact                   | Exact               | Exact via runtime   | Advanced Inspector help             | Parent cycles are rejected on import; this is transform following, not skeletal rigging                                                                                                                                                                             |
| Effect groups                                               | Yes                     | Yes                       | Yes                       | Yes                    | Exact                   | Flattened on export | Exact via runtime   | Group Inspector                     | Groups provide shared X/Y and delay; they are editor organization, not runtime objects                                                                                                                                                                              |
| Preview background, grid, zoom, guides                      | Preview-only            | Preview-only              | Preview-only              | Preview-only           | Yes                     | Omitted             | Omitted             | Tour and preview help               | These help judge an effect and never become game-runtime data                                                                                                                                                                                                       |
| Layer eye visibility and Solo                               | Preview-only            | Preview-only              | Preview-only              | Preview-only           | Yes                     | Omitted             | Omitted             | Layer-panel help                    | Use **Enabled** as the exported playback switch; hidden-but-enabled layers remain part of the runtime definition                                                                                                                                                    |
| Project seed and active duration                            | Yes                     | Yes                       | Yes                       | Yes                    | Yes                     | Exact               | Exact via runtime   | Preview controls                    | Zoom/background changes do not enter undo history; seed and duration do                                                                                                                                                                                             |
| Effect Performance / stress copies                          | Whole effect            | Whole effect              | Whole effect              | Whole effect           | Measured + estimated    | Omitted             | Omitted             | Preview performance panel           | Stress copies are editor-session-only, capped at 2,000 preview sprites, and never enter undo, projects, capture, or exports                                                                                                                                         |

## Experimental rendering compatibility

These controls are usable and portable, but are marked **Experimental** while
their visual quality and cost are tested across real devices. Phaser's sprite
effects are WebGL-only. On Canvas the runtime keeps the ordinary sprite and
skips the GPU effect; it never drops the layer or silently removes its settings
from exported data.

| Experimental capability    | Inspector | Editor preview     | Runtime JSON v15 | Phaser runtime     | WebM/GIF capture         | Canvas fallback         |
| -------------------------- | --------- | ------------------ | ---------------- | ------------------ | ------------------------ | ----------------------- |
| Outer glow                 | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Blur                       | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Brightness / exposure      | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Animated shine             | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Two-color spatial gradient | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Still-image visual mask    | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain, unmasked sprite  |
| Straight-wipe dissolve     | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Seeded noisy erosion       | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain, un-eroded sprite |
| Sprite warp                | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |
| Sprite-local heat shimmer  | Yes       | Experimental WebGL | Preserved        | Experimental WebGL | Captures rendered canvas | Plain sprite            |

Straight wipe uses one soft moving edge. Noisy erosion removes irregular
sprite-local patches through a static field derived from each copy's seed; it
does not use the image-silhouette spawn stencil or the selected visual-mask
asset.
Erosion is one GPU pass per visible copy. Gradient and warp feed into erosion;
shine, blur, and glow then react to the remaining silhouette. Canvas keeps the
ordinary, un-eroded sprite. A visual mask samples one separate still texture at
rendering resolution and clips the selected sprite; it does not reuse the
bounded spawn-silhouette alpha grid. Canvas keeps the ordinary unmasked sprite.
Sprite warp and local heat shimmer change the selected sprite texture only;
they do not sample or bend the game scene behind it.

## Optional-feature lifecycle

The same state rules apply to every optional capability in this matrix:

| Authored state | Editor preview                                                | Editable project / save-load                                                                        | Runtime JSON v15 and generated Phaser TS                                                   | Undo/redo                                                  |
| -------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Enabled        | Applies immediately                                           | Configuration and `enabled: true` are saved                                                         | Applies through the shared evaluator/runtime                                               | Restores the complete enabled configuration                |
| Disabled       | Contributes nothing; cached visual/transient state is cleared | Tuned configuration is preserved with `enabled: false`                                              | Disabled configuration is intentionally retained but does not play or allocate the feature | Restores the prior enabled state and settings              |
| Removed        | Stops immediately; dependent references are repaired          | List/reference data is deleted or set to `null`; required blocks use canonical disabled defaults    | Removed events/references are absent; required blocks contain only canonical defaults      | Restores or removes the complete authored value atomically |
| Reset          | Re-evaluates with the default value                           | Only the named control or feature scope changes; enabled state and unrelated settings remain intact | Exports the reset authored value                                                           | Is one authoring change                                    |

For numeric or nullable capabilities, neutral values carry the same meaning:
zero gravity/slowdown and randomness contribute nothing, `tint: null` means no
tint, and `blendMode: "normal"` means no additive blend. Property presets are
not hidden runtime modifiers: they generate ordinary editable property moments.
Trail presets likewise populate the ordinary trail configuration. Removing or
resetting either affects only that authored data.

The Advanced **Effect performance** panel includes a collapsed Lifecycle
diagnostic. It lists only modifiers and event links that can affect the selected
layer now, alongside measured live and trail sprite counts. Preserved settings
inside a disabled feature are intentionally absent from that active list.

## Asset and playback support

| Capability                           | Status        | Notes                                                                                                                                                                                           |
| ------------------------------------ | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transparent PNG                      | Supported     | Recommended default for crisp or soft 2D effect artwork                                                                                                                                         |
| Transparent WebP                     | Supported     | Useful when file size matters and the target browser/game pipeline supports it                                                                                                                  |
| Built-in flash, ring, spark, cloud   | Supported     | Procedural practice assets, not a replacement for final game artwork                                                                                                                            |
| Embedded image data                  | Supported     | Editable projects and runtime JSON stay portable; `assetKeys` can map assets to game-preloaded textures                                                                                         |
| Uniform sprite sheet                 | Supported     | Frame width, frame height, frame count, range, FPS, direction, and loop are authored in Vvfx                                                                                                    |
| Phaser texture atlas                 | Supported     | Store an optional frame name in the asset, then map its asset ID to the game's preloaded atlas key                                                                                              |
| SVG, video, PSD, layered image files | Not supported | Export or render these to transparent PNG/WebP or a sprite sheet first                                                                                                                          |
| Image-silhouette spawning            | Supported     | A still uploaded PNG/WebP is precomputed to at most 64 x 64 alpha cells; built-ins and sprite sheets are not mask sources; thresholded Random placement is deterministic in preview and runtime |

## Project and template portability

| Workflow                         | Status    | Behavior                                                                                                                                                   |
| -------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full editable project            | Supported | `.vvfx` keeps the complete project, preview preferences, Timeline notes, markers, groups, assets, and layers                                               |
| Share one reusable effect        | Supported | `.vvfx-template` v2 carries one effect/layer/group scope, only its used embedded images, its project-format version, Timeline anchor, and content duration |
| Back up the template library     | Supported | `.vvfx-templates` v2 wraps up to 100 validated templates                                                                                                   |
| Insert at the current playhead   | Supported | Layer/group templates anchor their earliest Timeline start; complete effects may preserve leading silence; Triggered timing remains activation-relative    |
| Import collision protection      | Supported | Identical IDs/content are skipped; the same ID with different content is imported under a fresh ID and an `(imported)` name, never silently overwritten    |
| Cloud/community template sharing | Deferred  | Templates are local files and IndexedDB entries; there is no account, marketplace, or server storage                                                       |

## Deliberately separate concepts

- A **motion path** controls where a sprite travels. A **motion trail** creates
  fading historical copies behind it.
- **Color over lifetime** changes the whole sprite as time passes. A **spatial
  gradient** colors different places inside one sprite; Vvfx offers a two-color
  Experimental WebGL version, while a painted gradient has wider compatibility.
- **Additive blend** brightens overlapping pixels. **Outer glow** creates a soft
  halo and is a separate Experimental WebGL control.
- **Gravity** adds vertical acceleration. **Slow down over time** reshapes route
  progress while preserving the endpoint. Neither is a collision physics
  system.
- A **sprite sheet** changes the drawing itself frame by frame. Transform
  keyframes change size, opacity, and rotation of the same drawing.
- **Image-silhouette spawning** reads visible pixels only to choose copy start
  positions. It does not visually mask, crop, or recolor the spawned artwork,
  and it does not belong to the Experimental WebGL rendering set.
- **Straight wipe** removes pixels behind one moving edge. **Noisy erosion**
  removes them in repeatable procedural patches. **Noise warp** bends pixels
  without removing them; none of these is an arbitrary imported visual mask.
- A **layer event** plays or restarts one target at a layer-lifecycle moment. A
  **copy-finish event** can play separate bounded target activations at the
  final positions of original burst/emitter copies; trail afterimages are not
  event sources.

## Known rendering boundary

Experimental still-image visual masks, blur, outer glow,
brightness/exposure, animated shine, two-color spatial gradient,
straight-wipe dissolve, seeded noisy erosion, sprite warp, and sprite-local heat
shimmer are preserved by exports and run through Phaser WebGL. Canvas fallback
deliberately shows the plain unmasked and un-eroded sprite; an erosion-only exit
therefore needs an ordinary opacity fade, while essential clipping should be
baked into the source art when Canvas parity matters. True scene-behind
refraction/heat haze is decision-deferred because the portable effect cannot
infer a game's camera capture. Lighting-aware materials are also
decision-deferred: Phaser Light2D depends on scene-owned lights, paired normal
maps, a game-configured light ceiling, camera culling, and a different sprite
pipeline from Vvfx's managed Experimental PreFX. Vvfx does not enable or mutate
the game's LightsManager. A future fixed local normal-map experiment would be a
separate self-contained effect, not Phaser scene-light integration.
Animated/layer-to-layer/camera masks, collision, fluid simulation, a general
compositing graph, and custom shaders are not silently approximated. An
image-silhouette spawn stencil is deterministic position data, not a visual
mask. See [the roadmap](roadmap.md) and
[the beginner guide](vfx-beginner-guide.md) for the remaining boundary.
