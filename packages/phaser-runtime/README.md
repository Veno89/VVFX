# @vvfx/phaser-runtime

This local package plays Vvfx runtime JSON inside a Phaser 4.2+ scene. It uses the
same deterministic evaluator as the editor, including sprite-sheet frames,
transform keyframes/property curves, motion paths, trails, layer events,
flipbooks, seeded organic movement, bursts, repeating emitters, spawn placement
patterns including lines/arcs, even interior coverage, multiple stable clumps,
and precomputed image silhouettes, seeded randomness, artwork-forward
alignment, bounded copy-finish spatial events,
attachments, whole-image color over time, pulse, flicker, legacy repeating
sway, gravity, behavior strength envelopes, slowdown, tint, blending, and the
500-sprite safety limit. Curated rendering effects use explicit per-copy clips
with start/end timing and fade weights. Endpoint-fitted Beam layers can use
authored points or world-space endpoints supplied by the game.

The package also applies Vvfx's clearly marked Experimental Phaser WebGL sprite
effects: blur, outer glow, brightness/exposure, animated shine, two-color
spatial gradient, one-still-image visual clipping, straight-wipe dissolve,
seeded noisy erosion, sprite warp, and sprite-local heat shimmer. A Canvas
renderer keeps the ordinary unmasked and un-eroded sprite and skips these GPU
effects with one warning. Use an ordinary opacity fade when erosion must still
disappear, and bake essential clipping into the source art when Canvas must
match. Sprite warp and shimmer never refract the scene behind the effect.

From the Vvfx repository, build it with `npm run build:runtime`. This produces
the JavaScript bundle and regenerates the package declarations from the same
TypeScript source. A local Phaser game can then install the package folder, for
example with `npm install ../Vvfx/packages/phaser-runtime`.

To prepare and install the assigned local tarball instead:

```bash
npm pack ./packages/phaser-runtime --pack-destination ./artifacts/runtime
npm install ./artifacts/runtime/vvfx-phaser-runtime-0.16.0.tgz
```

Before sharing a runtime build, run `npm run test:runtime-package`. The check
creates the real npm tarball, installs it into an isolated consumer, validates
the published file list, type-checks its public API, and executes its JavaScript
exports. The package remains marked private/local; publishing it to a registry
requires an explicit release decision.

```ts
import { playVvfx } from "@vvfx/phaser-runtime";
import impact from "./impact.vvfx-runtime.json";

const effect = await playVvfx(this, impact, {
  originX: player.x,
  originY: player.y,
});

effect.setPosition(player.x, player.y);
```

Calls to `setPosition`, `setEndpoints`, and `clearEndpoints` made in the same
JavaScript turn are coalesced into one render. A Scene `update` flushes the
latest values immediately, so following a moving target does not double-render.

For a Beam effect, tightly crop the source artwork and draw it left to right.
Supply world-space endpoints at startup or update them while targets move:

```ts
const lightning = await playVvfx(this, chainLink, {
  beamEndpoints: {
    startX: caster.x,
    startY: caster.y,
    endX: target.x,
    endY: target.y,
  },
  beamFit: "crop",
  beamThicknessScale: 0.75,
  maxDurationMs: 420,
});

lightning.setEndpoints(caster.x, caster.y, target.x, target.y);
```

Without a layer ID, `setEndpoints` updates every Beam layer in the effect so a
core and glow can stay aligned. Pass a Beam layer ID as the fifth argument for
one layer, or call `clearEndpoints()` to restore authored endpoints.

Beam playback stretches all source pixels by default, preserving existing
exports and integrations. Set `beamFit: "crop"` to keep the artwork's authored
horizontal pixel density when dynamic endpoints are closer than its authored
Beam length. The runtime uses a centered source crop for shorter links; links
longer than the authored length still stretch to reach both endpoints.
`beamThicknessScale` multiplies only a Beam's evaluated vertical scale, so it
can match a game's character or enemy size without changing endpoint-fitted
length. Both controls are playback-only and never mutate Runtime JSON.

Embedded PNG/WebP data and Vvfx built-in shapes load automatically. A game can
replace embedded sources with its own preloaded Phaser textures:

```ts
await playVvfx(this, impact, {
  assetKeys: {
    "asset-spark": "game-spark-texture",
  },
});
```

Automatically loaded images use a private, content-derived Phaser texture
namespace. They never reuse a host texture merely because its key matches a
Vvfx asset ID, and leased images are removed only after the last Vvfx effect
releases them. Explicit `assetKeys` remain host-owned and are never removed.

Embedded sprite sheets are sliced automatically. When mapping a sheet to a
game texture through `assetKeys`, preload it as a Phaser sprite sheet with
numeric frames starting at zero and the same frame dimensions used in Vvfx.

Image loading is cancelled automatically if the Phaser scene shuts down. A
caller can also cancel startup explicitly; no effect is constructed after a
cancelled or timed-out load:

```ts
const controller = new AbortController();
const loading = playVvfx(this, impact, { signal: controller.signal });

controller.abort();
try {
  await loading;
} catch (error) {
  if (!(error instanceof Error) || error.name !== "AbortError") throw error;
}
```

Embedded images decode with bounded concurrency and share one 10-second
startup deadline. `loadVvfxAssets(scene, definition, assetKeys, signal)`
accepts the same optional cancellation signal for manual preload workflows.
Browser image decoding itself cannot always be interrupted after the browser
has started it. Cancellation stops Vvfx startup immediately, clears the
candidate source where possible, and rejects late callbacks; any decode that
still finishes is not installed as a Phaser texture and cannot create an
effect.

Package 0.16.0 emits runtime format version 16 and accepts
versions 1 through 16. Older exports are migrated with safe defaults for
capabilities that did not yet exist. Project JSON uses its own version number;
the current project format is version 18.

The package remains private and intended for local folder or tarball
installation. Assigning version 0.16.0 identifies the Runtime v16 artifact; it
does not imply that the package has been published to a registry.

Package 0.15 migrates rendering integration from Phaser 3 PreFX pipelines to
Phaser 4 filter lists and render nodes. The Runtime JSON schema remains version
15, so existing valid exports continue to load; host games must upgrade their
Phaser peer dependency to 4.2.1 or newer before adopting this package version.

Runtime v12 adds project-v14 `stratified` and `clusters` placement. Natural
variation preserves broad rectangle/circle interior coverage; clump count and
spread create two-to-eight stable activity pockets. Both remain deterministic
when replaying or seeking and use the same bounded fields as the editor.

Runtime v13 adds project-v15 straight-wipe/noisy-erosion selection and bounded
noise scale. The static procedural field comes from each copy's seed and uses
that copy's existing lifetime progress, so seeking and replaying remain
repeatable. Gradient and warp feed into erosion; shine, blur, and glow react to
the remaining silhouette. Each eroding visible copy costs one GPU pass. The
effect changes only sprite alpha: it neither consumes the image-silhouette
spawn grid nor accepts an arbitrary image as a visual mask. Sprite sheets use
the current frame's local coordinates without sampling neighboring atlas
pixels; differently sized frames rescale the pattern.

Runtime v14 adds project-v16 visual masks. One separate still texture clips the
target sprite in local coordinates through alpha or luminance, with bounded
fit, position, scale, rotation, inversion, and strength settings. The target
itself may animate, but sprite sheets are not mask sources in this version. The
render order is mask, brightness/spatial gradient, warp, dissolve/erosion,
shine, then blur/glow. Each masked visible copy adds one bounded GPU pass and
releases its controller when the sprite is destroyed. `assetKeys` must map a
custom mask asset just like any other referenced texture. A missing mask or
Canvas renderer reports a warning and leaves the ordinary unmasked sprite.

Runtime v15 adds project-v17 Beam layers. Authored endpoint B is stored as a
local offset from the layer position (A). Runtime endpoint overrides are
world-space and feed the same evaluator used by the editor preview; the
definition is not mutated when `setEndpoints(...)` is called.

Runtime v16 adds project-v18 `appearance.effectClips`. Each curated rendering
effect can have one normalized per-copy start/end range, fade-in/fade-out
fractions, and a linear, smooth, ease-in, or ease-out fade shape. Timing follows
raw chronological copy progress rather than transform easing or yoyo; new clips
persist `progressMode: "chronological"`, and marker-less Runtime v16 drafts
normalize to that mode. Repeated, burst, and emitter copies each replay the same
local clip. Runtime versions 1 through 15 receive full-life clips for enabled
and tuned-disabled effects. Migrated directional dissolves use the internal
`legacy-transform` marker to retain their former eased/yoyo progression; other
effects remain chronological. Their prior appearance and disable/re-enable
behavior are therefore preserved.

Runtime `depth` remains derived from the stored back-to-front layer array. The
editor presents that stack conventionally with the frontmost layer at the top.
An effect clip modifies only its parent sprite and has no independent depth; a
painted glow that must sit behind a core image needs its own lower layer.

The current runtime deliberately has no lighting-aware material setting. It
does not enable `scene.lights`, change ambient light, create or destroy game
lights, or enable Phaser lighting on Vvfx sprites. Those resources and their
camera-specific behavior belong to the host game. A future fixed local
normal-map effect could be evaluated separately, but would not be Phaser
scene-light integration.

Image-silhouette spawning uses the bounded alpha sample stored with an uploaded
PNG/WebP asset. The runtime does not read pixels from mapped Phaser textures or
depend on CORS: it samples eligible alpha cells using the same stable seed,
opacity threshold, aspect-preserving size, and Random placement as the editor.
This is spawn-position data, not a visual sprite mask or WebGL effect. Visual
masking samples the referenced full texture instead of this compact CPU grid.

A copy-finish event carries each original burst/emitter copy's resolved final
position into an independent target activation. Seeded chance, per-event
maximum plays, graph/depth/activation guards, and the shared sprite ceiling
bound fan-out. Trail afterimages never emit child events. The editor recommends
a finite, unattached Triggered Animated image or Burst, but the runtime keeps
the normalized format flexible. Target delay, duration, easing, property
moments, path, and behaviors remain relative to the ordinary activation clock.

Editor effect groups do not add runtime-only state. Their shared position and
timing offsets are flattened into ordinary layer values when Runtime JSON is
exported.

For a preloaded Phaser texture atlas, set an asset's optional atlas-frame name
in Vvfx and map its asset ID to the containing texture:

```ts
await playVvfx(scene, impact, {
  assetKeys: { "asset-spark": "game-vfx-atlas" },
  assetFrames: { "asset-spark": "particles/spark-01" }, // optional override
});
```

Effects play once and clean themselves up by default. Set `maxDurationMs` to a
positive finite duration when a one-shot should clean up before an authored
idle tail ends. The cap never extends an effect and is ignored by looping
playback. Invalid fit, scale, and duration values fall back to the existing safe
defaults. Set `loop: true` to keep replaying or `autoDestroy: false` when the
same handle should be restarted.

The editor recommends compact Runtime JSON as the stable boundary for a shared
game-side effect library. Its Advanced TypeScript option is a small, exact
wrapper around this package: it embeds the same definition and calls
`playVvfx`. That wrapper includes `BeamEndpoints` only if its definition has a
Beam layer. Pass `assetKeys` for preloaded game textures. Preview background,
grid, zoom, selection, and editor-only visibility never enter the runtime
definition. The export includes only images referenced by a layer, including
stored choices for disabled visual-mask and spawn-mask features. CPU alpha
samples are retained for active or stored spawn silhouettes and omitted from
assets used only as artwork or visual masks.

The supported Phaser peer range is `>=4.2.1 <5`. Install Phaser and this
package together with ordinary npm peer resolution; `--legacy-peer-deps` is not
a supported integration path. The release gate qualifies the published floor
and fails an installation below it. Phaser 4.2.1 is currently both the floor
and latest stable 4.x release; add a separate current-version matrix cell when
a later stable 4.x is published.
