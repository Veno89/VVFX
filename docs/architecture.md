# Vvfx architecture

## Design goals

Vvfx separates the reusable effect definition from both React and Phaser. The
editor can evolve without coupling authoring UI to playback, and the game
runtime evaluates the same normalized definitions without importing React.

```text
React editor
    | edits typed project data
    v
VFX model + deterministic evaluator ---- serialization / exports
    | produces evaluated visual instances
    v
Phaser preview bridge and @vvfx/phaser-runtime
```

Project files currently use format version 17. Clean game-facing runtime
definitions use format version 15, and the local `@vvfx/phaser-runtime` package
is version 0.14.0.

## Main modules

### `src/vfx`

This directory has no React dependency.

- `types.ts` defines project v17, assets, settings, the discriminated layer
  union, and evaluated instances.
- `defaults.ts` contains safe defaults, four built-in procedural practice
  assets, and the complete Magic Impact example.
- `random.ts` provides repeatable seeded values.
- `interpolation.ts` maps approachable easing names to animation curves and
  solves editable cubic Bezier easing by elapsed time.
- `color.ts` validates hex colors, normalizes two-to-five lifetime stops,
  interpolates RGB tint, and applies tint strength.
- `alphaMask.ts` validates each asset's optional alpha sample, selects eligible
  cells by opacity threshold and stable seed, maps the bounded grid to world
  dimensions while preserving aspect ratio, and supplies capped editor-guide
  samples. Its maximum is 64 x 64 / 4,096 alpha bytes.
- `renderingEffects.ts` owns safe defaults, deterministic lifetime values,
  WebGL capability checks, Phaser 4 FilterList synchronization, custom render
  nodes for masks/gradient/shine/noisy erosion, bounded padding/pass estimates,
  shared deterministic noise resources, effect ordering, cleanup, and Canvas
  fallback warnings for the Experimental rendering set.
- `behaviors.ts` evaluates pulse, seeded flicker, legacy repeating sway, seeded
  organic X/Y/rotation movement, constant vertical gravity, normalized
  destination-preserving slowdown, and optional per-copy strength envelopes.
- `events.ts` compiles timeline and triggered activations from absolute time. It
  provides stable activation keys, play/restart semantics, independent spatial
  copy-finish origins, cycle/depth/activation safeguards, and event-relative
  reuse of ordinary layer timing.
- `engine.ts` turns a project and playhead time into deterministic sprite
  instances. It applies timing, frame playback, attachments,
  point/area/line/arc/image-silhouette spawning, random/stratified/edge/even/
  one-or-many-clump distributions, direction and alignment, randomness,
  color/behaviors, motion paths, historical motion-trail samples, and the
  500-instance limit.
- `motionPath.ts` evaluates quadratic curves, contracting spirals, and smooth
  Catmull-Rom waypoint routes plus their facing angles.
- `keyframes.ts` normalizes, inserts, moves, and evaluates ordered transform
  moments while keeping legacy start/end controls synchronized.
- `timelineTiming.ts` parses pasted millisecond briefs, handles marker/frame
  snapping and keyboard marker jumps, and formats secondary frame readouts.
- `groups.ts` resolves nondestructive shared position and timing offsets,
  including attachment-aware positioning that avoids applying one group twice.
- `spriteSheet.ts` validates uniform frame grids and evaluates per-layer frame
  playback, including deterministic random sequence offsets.
- `performance.ts` analyzes whole-effect duration, spawn pressure, trails, and
  indefinite layers; stress-copy replication stays editor-session-only.
- `presets.ts` contains guided single-layer presets and complete-effect
  compositions used by both the layer menu and learning material.
- `serialization.ts` treats project imports as untrusted, validates references,
  rejects attachment/event cycles, clamps unsafe values, and fills safe v17
  defaults.
- `templates.ts` owns template/pack v2 creation, v1 migration, project-version
  gating, dependency summaries, bounded embedded-asset validation, raw single
  and pack serialization, content-relative Timeline anchors, and insertion
  remapping for asset, layer, group, attachment, mask, and event-target IDs.
- `exporters.ts` creates runtime v15 and the supported exact Phaser TypeScript
  integration. Generated TypeScript embeds the definition and calls
  `playVvfx`; an explicitly named standalone generator remains only as an
  educational approximation.

### `src/preview`

`PhaserPreview.tsx` owns Phaser's lifecycle. React passes immutable project
data and a playhead time; the bridge creates or reuses Phaser images for the
evaluated instances, including evaluated tint strength and additive blending.
Uploaded data URLs are added to Phaser's texture manager in the browser and
uniform sprite sheets are sliced into numeric frames. Built-in practice
artwork is drawn with Phaser graphics at startup.

The preview never becomes the source of truth. Even a direct drag is reported
to React as an X/Y edit, then rendered back through the deterministic path.
Selected motion paths and spawn areas, including capped eligible silhouette
samples, are authoring guides layered over that output.

Preview-video export reuses the live Phaser canvas through
`previewRecording.ts`. During capture the editor temporarily renders at 100%
authoring scale with selection marks, path handles, and the grid removed. A
small browser-owned recording canvas copies clean frames and feeds them to the
native WebM encoder at 30 FPS. Playback state and the previous playhead are
restored afterward; video data never leaves the browser.

Preview export can render the same clean canvas into centered 16:9, square,
vertical, or current-size output. WebM uses the browser's native media encoder.
`gifEncoder.ts` supplies a dependency-free looping GIF89a encoder with a fixed
transparent 255-color palette; frames are quantized and compressed one at a
time to keep peak memory bounded.

### `src/editor`

`VfxEditor.tsx` coordinates project history, selection, playback, dialogs,
keyboard controls, and persistence. UI is split by responsibility:

- asset and layer panels;
- preview and transport controls;
- a progressively disclosed Inspector;
- visual easing comparison, graph scrubbing, and custom curve controls;
- transform-keyframe cards plus draggable Timeline diamonds and exact
  playhead-inserted property moments;
- beginner property-curve presets that generate those same canonical moments;
- visual flipbook grid/frame preview, layer lifecycle events, organic movement,
  trail presets, and whole-effect performance/stress controls;
- line/arc spawn controls, per-behavior fade-in/hold/fade-out envelopes, and
  artwork-forward alignment controls;
- image-silhouette spawn controls and bounded per-copy finish events, disclosed
  inside the existing Spawn and Layer events sections rather than as parallel
  animation systems;
- a clearly labeled Experimental rendering section for selected Phaser WebGL
  sprite effects plus explicit Canvas fallback guidance;
- saved editor-only timing markers/notes, millisecond and frame snapping,
  keyboard nudging, and batch alignment/staggering;
- effect-group membership, shared positioning, and draggable group timing
  bars;
- first-run onboarding, a hands-on first-effect lesson, product-boundary
  guidance, recipes, glossary, and contextual layer summaries;
- save/load, effect-template, and export dialogs;
- native WebM/GIF capture controls and recording progress;
- shared accessible controls with resettable slider/number pairs;
- responsive project actions, typed live notices, modal background isolation,
  and shared dialog/popup focus routing.

`alphaMaskImport.ts` owns bounded browser decoding for local PNG/WebP data URLs.
Uploads use the decoded image once to downsample alpha to at most 64 x 64 cells;
project/template activation uses the same decoder without allocating a canvas
to reject damaged compressed payloads. The runtime never performs
CORS-sensitive or per-frame image readback.

`guidance.ts` centralizes beginner-facing layer names, pure contextual
descriptions, the Vvfx-vs-image-editor boundary, glossary terms, and asset-prep
guidance so the UI does not invent conflicting explanations.

`useHistoryState.ts` keeps a bounded immutable undo/redo history. Uploaded data
URLs are included, so asset operations can also be undone. Preview-only choices
such as zoom, background, grid, selection, and playback looping are
synchronized across history snapshots instead of creating undo steps.
Authoring changes such as layer position, timing, appearance, behavior, seed,
and project duration remain undoable. Consecutive values emitted while one
text, number, or range control remains focused are grouped into one authoring
interaction, so Undo restores the value from before that edit instead of
stepping through every keystroke or slider sample.

`useFocusRegion.ts` coordinates stacked overlays, traps modal focus, restores
the opener, makes the page behind the top modal inert, and gives nonmodal menus
and popovers consistent Escape/outside-dismissal behavior. `assetReferences.ts`
also reports every artwork, visual-mask, and spawn-silhouette dependency before
a custom image is removed. The editor presents that report first and then
commits image removal plus all reference repairs as one undoable project value.

### `packages/phaser-runtime`

The local `@vvfx/phaser-runtime` package (v0.14.0) validates runtime v15, loads
embedded or mapped Phaser textures, and plays effects through the same
deterministic evaluator used by the editor preview. Its `VvfxEffect` handle
owns scene update registration, sprite reuse, world-origin positioning, Beam
endpoint overrides, pause/restart controls, completion, and cleanup. When
WebGL is active it also
applies exported Experimental sprite effects. Canvas fallback skips those
controllers while retaining the ordinary sprite and all deterministic
behavior. The production bundle contains no React or editor UI.

The generated Phaser TypeScript export is a small typed wrapper around this
package. Because it embeds the runtime definition and calls `playVvfx`, it does
not need separate emitter, randomness, behavior, path, trail, frame, or cleanup
logic that could drift away from the preview.

### `src/persistence`

Named projects are stored as complete objects in an IndexedDB object store
keyed by `metadata.id`. A separate single-record recovery store receives
debounced unsaved drafts, so crash recovery never adds entries to the project
list or silently turns an autosave into a named save. Reusable effect templates
have their own IndexedDB store keyed by template ID. Batch import validates and
plans every entry before one write transaction: identical content is skipped,
an ID conflict is assigned a fresh ID/name, and no different local template is
silently overwritten. This handles embedded image data more reliably than
localStorage. Malformed records and recovery drafts are preserved and surfaced
for explicit removal instead of being silently deleted. Oversized libraries
report their exact record count while validating only a bounded repair window;
complete export is disabled until all records can be included. There is no
server-side storage.

## Playback and determinism

React owns the playhead. A request-animation-frame loop advances it using the
selected playback speed. Scrubbing pauses playback and sets an exact time.

The evaluator combines the project seed, layer ID, and stable global instance
index. Given the same project, seed, and time it produces the same spawn
locations, directions, variations, and flicker. This keeps long-running
emitters stable while scrubbing instead of rerolling recent instances.

Each instance has raw lifetime progress and eased transform progress.
Whole-image color stops use lifetime progress; transform keyframes select their
segment by raw time and apply layer easing inside the segment. Straight
movement or a motion path owns the authored route. Slowdown reshapes route
progress but remains normalized so the endpoint is preserved. Gravity,
repeating sway, and seeded organic movement add deterministic offsets. Optional
behavior envelopes multiply pulse, flicker, wobble, or gravity strength over
the same per-copy lifetime; they do not create a second project Timeline.
Events compile activation origins before layer evaluation, so direct seeking
and stepped playback agree. Copy-finish events carry each original copy's
resolved final position into an independent, bounded target activation; target
delay, easing, property moments, path, and behavior still use the ordinary
activation-relative layer clock. Motion trails reuse the same evaluator
at earlier playhead times, so afterimages follow the real color, behavior,
keyed state, path, frame, and seeded movement.

## Editor state versus effect data

Preview background/custom color, grid, zoom, selection, eye visibility, and
Solo are editor concerns. They can be saved in an editable project where
appropriate, but runtime export omits them. `enabled` is the playback switch
that remains in runtime data.

Project seed and active duration are effect data because they affect game
playback. Groups are authoring structures; export resolves their shared X/Y and
delay into ordinary layer values. Asset data remains embedded for portability,
while games can provide `assetKeys` and `assetFrames` mappings for preloaded
textures.

## Optional-feature lifecycle

The editable `VfxProject` is the single source of truth. React controls commit
new immutable project values; the evaluator, preview bridge, Runtime JSON, and
generated Phaser integration derive their state from those values. Evaluated
scale, opacity, tint, position, frame, and procedural offsets must never be
written back into authored layer settings.

Vvfx uses three distinct lifecycle operations:

- **Disabled** means the configuration remains authored but contributes
  nothing. An `enabled: false` trail, behavior, event, keyframe track, motion
  path, or Experimental rendering effect keeps its tuned values so enabling it
  again restores the same result. Numeric and nullable features use their
  neutral authored value, such as zero gravity/slowdown, `tint: null`, or
  `blendMode: "normal"`.
- **Removed** means authored membership or a reference is gone. Events,
  waypoints, color stops, layers, assets, attachments, masks, and sprite-sheet
  definitions use empty arrays or `null` where the schema supports absence.
  Optional configuration blocks required by the current schema are replaced
  with their canonical disabled defaults. Removing a sprite-sheet definition,
  removing its primary image, or choosing another image also resets per-layer
  frame playback settings. Adding them again therefore starts from defaults
  rather than hidden old settings.
- **Reset** changes only the named control or feature scope to its canonical
  defaults. It does not disable the feature or reset adjacent authored data
  unless the control explicitly says so. For example, resetting a glow value
  cannot change tint, and resetting property moments cannot change movement.

History stores those authored transitions, so Undo restores configuration and
enabled state together and Redo removes or disables them again. Project import,
save/load, templates, Runtime JSON, and the runtime-backed Phaser TypeScript
path preserve the same distinction. Runtime JSON intentionally retains
disabled configuration with `enabled: false`; removed list entries and
references are absent, while required blocks contain canonical defaults.

Transient cleanup belongs to the system that created the transient state.
`PhaserPreview.tsx` and `VvfxEffect` must reconcile sprites, trail samples,
timers, listeners, controllers, masks, and cached references whenever authored
state changes, playback restarts, a layer/project is removed, or the owning
scene/component is destroyed. The rendering adapter clears or rebuilds managed
Phaser FilterList controllers when its enabled signature changes. It removes
only Vvfx-owned filters, leaving host filters intact. Event schedules and
deterministic procedural samples are rebuilt from current project data rather
than retained as a second authored state. Repeated enable/disable cycles must
therefore return live object and registration counts to their baseline.

## Performance and validation boundaries

- Project and Runtime JSON are limited to 40 MiB before parsing. Projects are
  limited to 500 layers, 128 assets, 250 groups, 100 Timeline markers, and an
  attachment depth of 32; nested keyframe, color-stop, motion-point, event,
  alpha-mask, spawn, repeat, and sprite-sheet collections keep their smaller
  feature-specific ceilings.
- IDs use a bounded 128-character ASCII grammar and reject JavaScript
  prototype-reserved names. Human-facing project, layer, group, and asset names
  are limited to 120 characters. Duplicate structural IDs and broken current-v17
  entries are rejected instead of silently discarded.
- Uploaded and embedded images must be canonical base64 PNG or WebP data URLs
  whose declared MIME type matches their bytes. Static PNG/WebP container
  structure is checked completely; PNG CRC/method/chunk ordering and WebP
  feature flags/payload dimensions must be consistent, and animated containers
  are rejected. Each image is limited to 8 MiB, 4096 by 4096 pixels, and
  16,777,216 pixels; a project is limited to 24 MiB of embedded image bytes and
  33,554,432 decoded pixels. Upload batches contain at most 16 files and are
  structurally preflighted before full browser decode.
- Browser image activation is cancellable and has a ten-second per-image
  timeout. The browser may still finish a decode that was already submitted;
  Vvfx clears its candidate source where possible, rejects every late callback,
  and never installs or activates that result. Successful activation reconciles
  decoded dimensions with the inspected header and samples at most a 64 by 64
  alpha grid when a mask is prepared. Imported and stored image collections use
  two concurrent decoders with a 30-second aggregate deadline. Project
  replacement, project edits, dialog closure, and component teardown abort
  outstanding activation work.
- Phaser runtime validation applies the same semantic numeric ceilings before
  evaluation and rejects any non-finite derived sprite state as a final safety
  net. Embedded texture startup uses at most four concurrent decoders under one
  ten-second deadline, is cancelled by scene shutdown or an optional caller
  signal, and rechecks lifecycle state before installing textures or creating
  an effect.
- Browser persistence reports exact counts while inspecting at most 101 records
  from libraries of no more than 100 saved projects or templates. Invalid data
  is preserved for explicit repair. Template export and storage use the same
  validation and image budgets as import, and complete export is unavailable
  while excess records remain outside the bounded inspection window.
- Imported burst counts are clamped to 250.
- Emitter maximum-alive values are clamped to 500.
- One emitter event creates at most 25 copies.
- Originals and motion-trail afterimages share a 500-sprite evaluator limit;
  originals take priority when the limit is reached.
- Active event graphs reject cycles and retain runtime depth/activation
  ceilings. Disabled links are inert stored configuration; re-enabling an event
  or layer revalidates the graph before committing the edit.
- Copy-finish event chance is seeded, per-event maximum plays are clamped, and
  child instances remain inside the shared activation and sprite ceilings.
  Authoring recommends finite, unattached Triggered Animated image or Burst
  targets and warns when an existing target no longer fits that pattern;
  import stays flexible. Trail samples never emit events.
- Stress preview state is never serialized and stops at a separate 2,000-sprite
  editor rendering budget.
- The Performance Inspector's opt-in Lifecycle diagnostic derives the selected
  layer's active modifiers and event links from the authored model and reports
  measured live/trail sprites from the current Phaser preview. Disabled layers
  and features must read as inactive instead of exposing preserved settings as
  live behavior.
- Minimum intervals and durations prevent zero-time spawn loops.
- Behavior values, color stops, spawn distribution, tint, duplicate IDs,
  missing assets/parents/event targets, and attachment/event cycles are
  normalized or rejected before evaluation.
- Line/arc geometry, behavior-envelope stages, alignment offsets, and
  Experimental rendering values are clamped during project and runtime import.
- Noisy erosion scale is clamped from 1 to 16. It adds one GPU pass per visible
  copy, which the performance estimate multiplies across bursts, emitters, and
  trail samples.
- Visual-mask position is clamped to -2..2 target widths/heights, scale to
  .1..4, rotation to -180..180 degrees, and strength to 0..1. One still mask
  texture adds one bounded GPU pass per visible copy.
- Alpha masks are limited to 64 columns, 64 rows, and 4,096 alpha bytes;
  `maskSize` is clamped from 0 to 1,000 px and `maskThreshold` from .01 to 1.
  Missing, malformed, fully ineligible, or nonreferenced mask data cannot
  silently turn into point spawning.

Authoring limits are enforced by validation and UI controls. Evaluator, event,
and stress budgets are enforced again at execution or display time, so
hand-edited project files cannot bypass the relevant safeguard.

## Release validation

Release validation is split into deterministic source/package gates and a real
Chromium workflow suite. GitHub Actions runs formatting, lint, TypeScript,
Vitest, dependency auditing, production builds, generated-declaration drift,
an isolated packed-runtime consumer, and Playwright coverage for the critical
responsive, focus, unsaved-work, template-dialog, WebGL restart,
repeated-toggle, 50-copy stress, and forced-GC heap-growth paths. See
[`release.md`](release.md) for the supported release sequence.

## Extension points and rendering boundary

The layer union is the main extension boundary. Appearance, Experimental
rendering, behavior, motion paths, trails, transform keyframes, group
membership, and frame playback live on layers; shared group offsets live at the
project root, while sprite-sheet grids, optional runtime atlas-frame names, and
bounded alpha samples live on reusable assets. Spawn shape, distribution,
direction, path mode, and easing are closed string unions with centralized
evaluation.

Project `formatVersion` migrations normalize old and untrusted data before it
reaches the editor. Runtime export has its own version because it intentionally
omits preview/editor state. Both runtime JSON and generated Phaser TypeScript
resolve group offsets and omit editor-only concepts, so game integrations do
not depend on the workspace shell.

Project v12/runtime v10 add a deliberately small Experimental rendering layer
over Phaser's WebGL sprite effects: blur, outer glow, brightness/exposure,
animated shine, two-color spatial gradient, directional dissolve/wipe, sprite
warp, and sprite-local animated heat shimmer. These rendering controllers are
not folded into deterministic transform math, but their typed values, lifetime
progress, export, creation, updates, and cleanup remain shared between editor
preview and runtime playback.

Project v13/runtime v11 add deterministic image-silhouette spawning and bounded
copy-finish spatial events. A spawn layer references a separate mask asset,
world size, and opacity threshold; only seeded Random eligible-cell placement
is defined. The event scheduler carries a stable spatial origin rather than
creating a second particle Timeline. These capabilities are CPU/data-model
features and are not part of the Experimental WebGL rendering set.

Project v14/runtime v12 add deterministic Even Coverage Inside and Several
clumps placement. Stratified jitter preserves broad interior coverage while
loosening the grid; shared clump centers, count, and spread stay seeded and
seekable. Template/pack v2 is an editor-portability format rather than Runtime
JSON: it records the source project format, saved scope, Timeline anchor, and
content-relative duration. Older template v1 files migrate on read; future
project formats are rejected instead of guessed.

Project v15/runtime v13 extend the existing dissolve controller with straight
wipe and noisy-erosion patterns. Erosion is a static sprite-local procedural
field derived from each evaluated copy's seed and driven by the same lifetime
progress as the wipe, so no parallel Timeline or property-animation model is
introduced. Sprite-sheet evaluation uses the current frame's local coordinates
without atlas bleed; differently sized frames rescale the field. Gradient and
warp feed into erosion, then shine, blur, and glow react to the remaining
silhouette. The managed erosion effect is removed with the sprite and remains
one estimated GPU pass.

Project v16/runtime v14 add one bounded, static visual mask per layer. The mask
references a separate still asset and samples either its alpha or luminance in
the target sprite's local space. Stretch, contain, and cover fitting plus local
offset, scale, rotation, inversion, and strength remain constant for the copy's
existing lifetime; they do not create another Timeline. Sprite-sheet assets are
excluded as mask sources in this first version, although an animated target can
use the same still mask on every current frame. The render order is visual mask,
brightness/spatial gradient, sprite warp, dissolve/noisy erosion, shine, then
blur/outer glow. This makes later silhouette effects react predictably to
clipping. Templates retain and remap mask-only assets just like spawn-silhouette
dependencies.

Project v17/runtime v15 add an endpoint-fitted Beam layer. The ordinary layer
position is authored endpoint A and `beam.endX/endY` is endpoint B's local
offset. Evaluation converts those points into one sprite midpoint, angle, and
horizontal fit scale using the source frame width. Phaser runtime overrides
are supplied to the same evaluator, so `VvfxEffect.setEndpoints(...)` can pin
the Beam to moving world-space targets without mutating or reparsing the
definition. This is deliberately one fitted sprite, not a spline mesh,
segmented ribbon, or procedural branching system.

Phaser's sprite effects have no Canvas counterpart. The defined fallback is the
ordinary undistorted sprite, never a missing layer or an export-time omission.
For visual masks and noisy erosion this is specifically the ordinary unmasked,
un-eroded sprite; an ordinary opacity fade provides a cross-renderer
disappearance when needed, while essential clipping should be baked into the
source artwork for Canvas parity.
Warp and local heat shimmer modify that sprite's own texture; they do not sample
or bend the game scene behind it. True scene refraction and camera-wide heat
haze are decision-deferred: they require a game-supplied scene-color capture,
shared camera-sized render textures, feedback-safe ordering, resize behavior,
and explicit multi-camera ownership that the portable Vvfx effect format cannot
honestly infer. Animated masks, layer-to-layer masks, camera masks, nested masks,
general compositing, and a shader graph remain future work. The image-silhouette
alpha grid remains CPU spawn-position data and is not fed into the visual-mask
or erosion shaders. The [capability matrix](capability-matrix.md) records this
boundary.

No lighting-aware material setting is serialized in project v17/runtime v15.
Phaser 4 lighting reads scene-owned LightsManager state, camera-culled lights,
a game-configured maximum light count, and normal maps paired with diffuse
textures. Those host resources cannot be inferred safely from a portable
effect, so Vvfx neither enables the scene LightsManager nor creates, edits, or
destroys game lights. Canvas and ordinary WebGL sprites stay unchanged. A
future self-contained fixed local normal-map pass could be evaluated under a
separate name, but it would not be Phaser scene-light integration.
