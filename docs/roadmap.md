# Vvfx roadmap

The planned implementation roadmap is complete. This document stays open as a
research register so real effects can justify a future proposal without making
deferred ideas look like an already scheduled phase.

The [capability matrix](capability-matrix.md) is the source of truth for what
works now; this file describes what was delivered and what should be explored
next.

**Current phase status:** the planned implementation roadmap is complete.
Rendering ideas that did not earn an implementation are checked as explicit
decision-deferrals below, not left looking like a queued phase.

## Delivered foundation

### Project safety and workflow

- [x] Empty new projects with built-in practice assets.
- [x] IndexedDB project saves, Save As, duplication, portable `.vvfx` files,
      and separate recovery autosaves.
- [x] Reusable local layer, group/component, and complete-effect templates with
      rename, duplicate, local storage, playhead-relative insertion, true
      single-template export, portable packs, migrations, bounded validation,
      and collision-safe import that never silently overwrites local work.
- [x] Authoring-only undo/redo that ignores zoom, playback, selection, and
      other workspace-only choices.
- [x] Interaction-coalesced text, number, and slider edits, so one focused edit
      is one understandable Undo step rather than one step per emitted value.
- [x] Dependency-aware custom-image removal with a consequence preflight and
      one-step restoration of the image, artwork, visual-mask, and spawn-mask
      references.
- [x] Responsive project actions, modal background isolation, shared
      dialog/popup keyboard routing, and typed success, information, warning,
      and error notices.
- [x] Persistent resizable workspace regions plus per-project layer search,
      folders, editing locks, conventional top-is-front stacking, Timeline zoom,
      and work ranges. These remain browser-local rather than changing project
      files.
- [x] Mobile, balanced, and showcase export preflight profiles with blocking
      content/reference integrity checks and advisory sprite, pass, image, and
      duration budgets.
- [x] Layer rename, automatic asset-based names, duplicate, reorder, attach,
      group, visibility, Solo, and enable/disable controls.
- [x] Stable preview dragging plus draggable Timeline timing bars, handles,
      group bars, and keyframe diamonds.
- [x] A compact selected-layer Effect toolbelt, contextual Effect Inspector,
      and collapsible nested FX lanes with draggable/resizable per-copy clips,
      exact timing, fade controls, keyboard adjustments, and fade shapes.
- [x] Progressive Timeline disclosure that keeps work-range/marker planning and
      detailed property moments available without crowding the primary controls.
- [x] Saved named timing markers with magnetic snapping and draggable ruler
      flags.
- [x] Exact Start, End, and Duration editing; 1 ms/10 ms keyboard nudging;
      optional 1/5/10 ms and 30/60 FPS snapping; and Alt snap bypass.
- [x] Pasteable timing briefs that turn millisecond ranges and continuation
      lines into named milestones.
- [x] Multi-layer move, playhead alignment, and deterministic stagger tools
      committed as one undoable authoring change.
- [x] Add transform-property moments at the playhead and inspect their absolute
      millisecond positions from the Timeline.
- [x] Content-aware preview looping and clean WebM/GIF capture.

### Core authoring

- [x] Still, animated, endpoint-fitted Beam, burst, and repeating-copy layers.
- [x] Beam endpoint authoring, exact editor/runtime fitting, draggable endpoint
      B, and world-space Phaser `setEndpoints(...)` overrides.
- [x] Transform animation, separate X/Y scale, opacity, rotation, delay,
      repeats, yoyo, built-in easing, and custom cubic easing.
- [x] Seeded variation for position, size, rotation, duration, movement,
      delay, and opacity.
- [x] Point, rectangle, and circle spawn areas with random, outward, inward,
      fixed, and tangent travel directions.
- [x] Uniform sprite sheets, named Phaser atlas frames, transform keyframes,
      motion paths, and fading motion trails.
- [x] Visual flipbook frame setup and preview, rows/columns, playback ranges,
      reverse/ping-pong/loop, and seeded random start frames.
- [x] Beginner Punch, Quick pop, Slow fade, Pulse, and burst/settle curve
      presets backed by the same Timeline property moments and keyframes.
- [x] Deterministic layer start/percentage/repeat/finish events with Play and
      Restart actions, activation-relative timing, cycle rejection, and runtime
      depth/activation guards.
- [x] Seeded organic movement that remains stable during scrubbing and runtime
      playback while preserving legacy repeating sway.
- [x] Beginner trail presets and early shared evaluation budgets.
- [x] Effect Performance counts, estimates, warnings, and a guarded local
      1/10/25/50-copy stress preview.
- [x] Layer attachments and effect groups with shared position and delay.

### Capability expansion - Tier 1

- [x] Two-to-five-stop whole-image color over lifetime.
- [x] Pulse controls for rhythmic size and opacity.
- [x] Seeded flicker with adjustable speed, amount, and irregularity.
- [x] Repeating sway and seeded natural X/Y/rotation wander for smoke, bubbles,
      wisps, and hovering magic.
- [x] Constant vertical gravity for sparks, debris, and rising fragments.
- [x] Normalized Slow down over time that preserves the authored route
      endpoint.
- [x] Random-inside, edge, evenly spaced edge, and center-clustered placement
      for rectangle/circle spawn areas.
- [x] Clear language separating additive blending from true glow and
      whole-image color changes from spatial gradients.
- [x] Versioned project v18 and runtime v16 normalization, including full-life
      effect-clip migration from project v17/runtime v15, and assigned local
      runtime package v0.16.0. Timeline markers and notes remain editor-only
      while playback capabilities retain exact runtime parity.

### Learning and integration

- [x] Replayable workspace onboarding and a guided first-effect lesson.
- [x] Contextual plain-language layer summaries and focused control help.
- [x] Complete-effect starting points for Magic impact, Critical hit, Poison
      ooze, Fire impact, Healing aura, Magic projectile, and the bounded
      Spark-to-smoke firework.
- [x] Beginner guide, effect recipes, glossary, product-boundary guidance, and
      an explicit capability/export matrix.
- [x] Phaser runtime JSON playback with deterministic preview parity, texture
      mapping, attachments, spawn behavior, sprite sheets, atlas frames, paths,
      trails, keyframes, and cleanup.
- [x] Generated Phaser TypeScript that embeds the exact runtime definition and
      calls `playVvfx`, avoiding a second approximate implementation.

## Tier 2 - deeper behavior without shaders

Tier 2 extends the deterministic sprite evaluator. Its delivered items use the
same project/runtime data in preview and Phaser export. The one geometry idea
that did not earn an implementation is recorded as explicitly deferred.

- [x] **Line and arc spawn regions.** Copies can begin along a rotated line or
      a chosen arc, with deterministic random, even, and clustered placement.
- [x] **Image-silhouette spawning.** A Burst or Repeating copies layer can use
      the visible pixels of a separate Asset Library PNG/WebP as a deterministic
      placement stencil. Upload preprocessing stores at most a 64 x 64 alpha
      grid; `maskSize` preserves source aspect, `maskThreshold` chooses eligible
      cells, and Random is the deliberately supported distribution. Runtime
      playback never needs CORS-sensitive pixel readback or a GPU mask.
- [x] **Bounded copy-finish events.** Each original Burst or Repeating copies
      instance can play a layer at its resolved final position. New-event
      guidance recommends finite, unattached Triggered Animated image or Burst
      targets, while seeded chance, a per-event maximum-play limit, cycle/depth
      and activation guards, plus the shared sprite budget prevent unbounded
      sub-effects. Trail afterimages never fire these events.
- [x] **Endpoint-fitted Beam layer.** One prepared horizontal image or flipbook
      is fitted between authored or runtime-provided endpoints. True segmented
      ribbon meshes and procedural branching remain deferred until concrete
      effects justify the extra geometry and fallback behavior.
- [x] **Behavior envelopes and timing stages.** Pulse, flicker, organic
      movement/sway, and gravity can fade in, hold, and fade out across each
      copy's existing lifetime without creating another project Timeline.
- [x] **Richer placement patterns.** Even Coverage Inside uses deterministic
      stratified cells with adjustable Natural variation; Several clumps uses
      two-to-eight stable clumps with adjustable Clump size. Existing Random,
      edge/ring, evenly spaced, and one-center-clump choices remain distinct.
- [x] **Alignment polish.** Direction-facing copies support an independent
      artwork-forward angle plus seeded angular variation.
- [x] **Portable template sharing.** Template v2 records its project format,
      saved scope, Timeline anchor, and content-relative duration. A layer or
      group starts at the destination playhead while Triggered timing stays
      activation-relative; a complete effect may keep intentional leading
      silence. Users can export one `.vvfx-template` or all templates as a
      `.vvfx-templates` pack. Imports are bounded, atomic, migration-aware, and
      collision-safe. The built-in library now includes Spark-to-smoke.

Tier 2 should not introduce a feature if the runtime export would need to
silently approximate it.

## Tier 3 - experimental rendering and future shader work

Tier 3 features are clearly marked **Experimental** in the editor. They save and
export, render through Phaser WebGL, and fall back to the ordinary sprite on
Canvas-only devices. They remain open to visual and performance feedback rather
than being presented as universally compatible rendering.

- [x] **Outer glow and blur (Experimental).** Apply a colored soft halo or
      soften the selected sprite through Phaser's WebGL effects.
- [x] **Brightness/exposure and animated shine (Experimental).** Adjust sprite
      light response or sweep a highlight through Phaser's curated WebGL
      effects without exposing shader code.
- [x] **Spatial gradients (Experimental).** Apply two colors across one sprite
      while keeping this distinct from whole-image color over lifetime.
- [x] **Straight-wipe dissolve (Experimental).** Remove a sprite with one soft
      directional edge across its existing lifetime.
- [x] **Noise erosion (Experimental).** Remove irregular sprite-local patches
      through a static procedural field derived from each copy's seed. It
      shares the dissolve lifetime controls, uses the current sprite-sheet
      frame without atlas bleed, costs one GPU pass per visible copy, and keeps
      the ordinary un-eroded sprite on Canvas. Gradient and warp feed erosion;
      shine, blur, and glow react to the remaining silhouette. Arbitrary image
      masks remain separate.
- [x] **Sprite warp and local heat shimmer (Experimental).** Distort the
      selected sprite texture, optionally with animated local shimmer.
- [x] **True scene-behind refraction and heat haze — decision-deferred.** An
      honest implementation needs an explicit scene-color capture supplied by
      the game, shared camera-sized render textures, feedback-safe ordering,
      resize behavior, and defined multi-camera ownership. The editor has no
      exportable game scene to capture, and a transparent WebM/GIF cannot retain
      pixels that will only exist behind the effect later. Sprite-local warp
      remains the supported substitute; no misleading refraction control was
      added.
- [x] **Bounded visual masks (Experimental).** One still mask texture can clip
      each copy in local sprite space using opacity or brightness, stretch/fit/
      fill sizing, local position, scale, rotation, inversion, and strength.
      This is one bounded GPU pass with an ordinary unmasked Canvas fallback.
      It is separate from the image-silhouette spawn-position stencil. Animated
      masks, layer-to-layer masks, camera masks, nested masks, and a general
      compositing graph remain deliberately deferred.
- [x] **Lighting-aware materials — decision-deferred.** Phaser 4 lighting
      depends on scene-owned LightsManager state, normal maps paired with
      diffuse textures, a game-configured light ceiling, and camera-specific
      culling. Creating or changing lights from a portable effect would mutate
      shared game state and make preview,
      recording, and runtime results depend on host cameras and lights that
      Vvfx cannot safely own or clean up. Ordinary unlit effects remain
      unchanged. A future separately named fixed local normal-map light may be
      evaluated, but it must not be presented as Phaser scene-light integration.

Any future capability proposal continues to use these release questions:

1. Does it work in the live preview and the runtime-backed Phaser export?
2. What happens on Canvas or unsupported WebGL devices?
3. Does WebM/GIF capture match the preview?
4. How are GPU resources released when an effect is destroyed?
5. Can a beginner understand the control without knowing shader vocabulary?
6. Does disable/remove return preview, evaluation, runtime, and export to the
   correct baseline without stale objects, callbacks, or authored values?

## Asset-side responsibilities and non-goals

The following stay in an image editor unless a future proposal clearly changes
the product boundary:

- drawing and painting silhouettes, smoke detail, lightning branches, runes,
  scratches, highlights, shadows, and gradients that need the widest renderer
  compatibility;
- creating hand-drawn sprite-sheet frames;
- repairing transparency, removing backgrounds, upscaling, or retouching
  source images;
- authoring 3D models, meshes, skeletal animation, or scene lighting.

Current non-goals:

- becoming a full raster/vector image editor;
- a general shader-node editor;
- rigid-body collision, target seeking, gameplay hit detection, or a general
  physics simulator;
- fluid, fire, or smoke simulation;
- replacing a game's scene, camera, post-processing, or asset pipeline;
- cloud accounts or server-side project storage.

Vvfx should remain excellent at composing understandable 2D image behavior.
When a richer result is best achieved by preparing a better asset, the app and
documentation should say so plainly.

## Lifecycle hardening follow-through

- [x] Centralize Disabled, Removed, and Reset semantics across editor mutation,
      normalization, evaluation, preview, export, and runtime playback.
- [x] Reconcile sprites, trails, effects, textures, event links, attachments,
      flipbooks, and restart state without zombie objects or revived settings.
- [x] Add an opt-in Performance Inspector diagnostic for active modifiers,
      event links, live sprites, and trail sprites.
- [x] Exercise 50-copy stress, 100 trail state transitions, repeated preview
      restart, WebGL effect startup, and forced-GC JavaScript heap comparison in
      the production Chromium suite.
- [x] Reuse the runtime's internally normalized definition across asset loading
      and effect construction while keeping every public entry point fully
      validated.
- [ ] Repeat the representative visual scenarios on target desktop and mobile
      GPUs before a user-facing release. Automated Chromium verifies lifecycle
      and WebGL invariants, but it does not replace human visual judgment.

## Quality gates for every future capability

- A beginner-facing name, short help text, and at least one recipe or preset.
- Typed project data, safe defaults, import normalization, and a documented
  format-version decision.
- Deterministic evaluator behavior and focused regression tests.
- Live-preview and `@vvfx/phaser-runtime` parity.
- Generated Phaser TypeScript coverage through the runtime-backed definition.
- Performance limits that cannot be bypassed by hand-edited imports.
- Manual browser inspection on representative impact, ooze, aura, and
  projectile effects.
- Lifecycle coverage for add, enable, configure, disable, re-enable, reset,
  remove, Undo, Redo, save/load, Runtime JSON, and generated Phaser TypeScript.
  Shared helpers may cover repeated behavior, but every optional feature must
  prove that disabled state contributes nothing, removed state has no obsolete
  references, and re-enabling restores only intentionally preserved settings.
- Cleanup ownership for every sprite, trail sample, Graphics object, filter
  controller, texture, timer, tween, listener, subscription, and cache the
  capability creates. Repeated toggle and preview-restart tests must return
  currently live objects and registrations to baseline.
