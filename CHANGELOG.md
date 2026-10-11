# Changelog

All notable Vvfx editor and Phaser runtime changes are recorded here. The
project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses semantic versions for release artifacts.

## [Unreleased]

### Added

- A **Zoom to fit** button in the preview header picks the zoom (25–300%) that
  fits every clearly visible copy across the active range.
- **Animated preset thumbnails** in the start screen and the layer Add menu.
  They draw the preset's real, deterministic motion with Canvas 2D, show a
  busy still frame at rest, play while hovered or focused, and stay still
  under reduced motion. Experimental WebGL effects are not drawn in them.
- **Sprite sheet + PNG frames export** (.zip) in Export → Preview video, at
  12–30 FPS and new 256 or 512 px square sprite sizes. The archive holds one
  packed sheet, a TexturePacker-style JSON atlas read by Phaser and PixiJS,
  and every frame as its own PNG for engines such as Godot, Unity, GameMaker,
  or Construct. Sheets stay within 8192 px and 240 frames.
- The hosted editor is **installable and works offline**: a web manifest and
  a service worker (registered only over HTTPS) cache the app after the first
  visit, always preferring the network for the page so new deploys arrive.
  The README now links the hosted site.
- The preview shows a "Loading the preview engine…" placeholder while the
  Phaser chunk downloads instead of a blank canvas.
- A **stand-in character** (Preview appearance → Stand-in character) places a
  PNG, JPEG, or WebP sprite behind the effect at an X/Y offset from the origin,
  with pixel size and opacity, to judge the effect at real scale. Like the game
  screenshot it is stored separately in this browser, follows preview zoom,
  never reaches projects or exports, and hides while recording.
- The Shape library gains **Make your own**: a glow, ring, or star with size,
  softness, ring thickness, star points, and inner size, previewed live and
  added as an ordinary white PNG like any library shape.
- **Variations** can now vary **Copy count** for bursts and emitters, and can
  vary **only the selected layer** instead of the whole effect. Options that
  cannot change anything in the chosen scope are disabled with a reason.
- The **Templates** dialog shows animated thumbnails for built-in starters and
  saved templates, playing on hover or focus. Thumbnails now draw uploaded
  images too, including sprite-sheet frames, crops, and Phaser-style
  multiplied tints.
- **Motion curves and an attractor.** Behaviors gain **Change speed over
  life** (a speed curve that keeps the total distance) and **Pull toward a
  point**, an attractor with pull and swirl that also works as a vortex.
  Repeating-copy emitters gain **Change emission rate over time**, a rate
  curve over a set length after the emitter starts. All three are deterministic
  and carried in Runtime JSON as optional fields (additive within format 16;
  older runtimes ignore them), with matching preview and runtime playback. The
  curve graphs share one editor with the keyframe curve.
- A **curve graph** in the Inspector's Keyframes section draws size (or width
  and height), opacity, or rotation over the layer's life with the same
  per-segment easing the engine uses. Drag points in time and value, click the
  graph to add a point, and use arrow keys (Shift for bigger steps) or Delete
  on a focused point. The first and last points stay in step with the layer's
  Start and End values. No format change.
- **Variations** (preview header) offers six versions of the whole effect that
  change any mix of colors, size, speed, and random pattern. Choosing one plays
  it in the real preview; **Keep it** applies it as one undoable change and
  **Back to original** discards it. Speed variations move cues and the
  composition length with the content, and every version is validated like an
  imported project.
- A **Web page** export: one `.html` file that plays the effect in any modern
  browser with the real Phaser runtime, fitted to the window, with Pause,
  Replay, Space, and R. **Works offline** (default) downloads the pinned
  Phaser build once, checks it against its SHA-384 fingerprint, and inlines it
  (about 1.5 MB); otherwise the page links Phaser from jsDelivr with
  Subresource Integrity (about 150 KB). The player script is bundled at build
  time and loads only when this export runs.
- A **game screenshot backdrop** (Preview appearance → Game screenshot) shows
  a PNG, JPEG, or WebP screenshot behind the effect, centered on its origin,
  at 0.5–4× screenshot pixel size and 10–100% opacity, following preview zoom.
  It is kept in this browser's own storage, never in projects, and is hidden
  while recording so it never reaches exports.
- **Runtime transform controls.** `VvfxEffect` gains `setScale`, `setAngle`,
  `setRotation`, `setFlipX`, `setFlipY`, `setTimeScale`, `setTint` /
  `clearTint`, and `follow` / `stopFollow`, plus matching `scale`, `angle`,
  `flipX`, `flipY`, `timeScale`, and `tint` startup options. Mirroring flips
  the artwork and reverses authored spin, Beam endpoints stay exact in world
  space, and following stops when the target is destroyed. No format change.
- **Runtime cues.** Timeline markers within the exported duration travel in
  Runtime JSON as an optional `cues` list (additive within format 16; older
  runtimes ignore it). The runtime's new `onCue` option fires each cue once per
  pass, including loops and restarts, for syncing sound, screen shake,
  hit-stop, or damage numbers. Generated TypeScript exposes `onCue` only when
  the effect has cues, and the Export dialog says how many it has.
- A **Shape library** with 23 ready-made white shapes (glow dot, rings, star,
  sparkle, flare, shard, droplet, slash arc, lightning bolt, rune circle, smoke
  puff, beam band, and more). Picking one adds an ordinary embedded PNG
  through the normal upload path, so it tints, exports, and plays in the
  runtime like any upload with no format change.
- **Beginner / Advanced controls** (status bar). Beginner, the default for new
  browsers, hides effect groups, layer events, attachments, atlas frames,
  visual-mask and spawn-silhouette preparation, relinking, and the seed until
  a layer already uses them; "Show advanced controls" at the end of the
  Inspector switches over. Browsers with an existing workspace keep Advanced.
- A **Text size** setting (100%, 112.5%, 125%) in the status bar, saved with
  the browser workspace.
- An inline app icon, so browsers no longer request a missing `/favicon.ico`.
- A start screen at the end of the workspace tour and over an empty preview:
  begin the guided first-effect lesson or one of four complete starter effects
  in one click.
- Export preflight now summarizes passing checks in one line, with the full
  list one click away, and the dialog reopens on the last export type used.

- Central project, template, runtime, upload, and embedded-image integrity
  limits with adversarial coverage.
- Dependency-aware image removal, typed notices, responsive project actions,
  shared keyboard/focus routing, and interaction-coalesced Undo.
- GitHub Actions gates for formatting, linting, type-checking, unit tests,
  production builds, generated declarations, packed-package consumption,
  dependency auditing, and Chromium smoke tests.
- Persistent resizable workspace regions, per-project Timeline zoom/work
  ranges, layer search/folders/locks, and keyboard layer reordering.
- Mobile, balanced, and showcase export preflight profiles with blocking
  content/reference checks and advisory performance/image budgets.
- Per-copy rendering-effect clips with draggable nested Timeline lanes, exact
  start/end timing, independent fade-in/fade-out controls, and four fade shapes.
- A compact selected-layer Effect toolbelt and contextual Effect Inspector that
  keep effect choice, timing, and effect-specific settings in one workflow.

### Changed

- `npm run build` now produces a static site in `dist/client` (Next.js
  `output: "export"`), and a `netlify.toml` builds and publishes it on
  Netlify. `vinext start` still serves the same build locally.
- Runtime JSON `duration` now ends at the last enabled content when **Loop
  active range** is on, so `onComplete` and loops no longer wait through
  trailing composition silence.
- Learn, Templates, and Export dialogs load on demand, cutting the editor's
  startup chunk from 532 KB to 452 KB.
- The editor preview renders at the screen's pixel ratio (up to 2×), so
  effects look sharp on Retina and 4K displays. Editor geometry stays in CSS
  pixels through a camera zoom, and "Current preview size" exports report CSS
  pixels.
- The editor preview's Phaser loop sleeps after 400 ms without changes,
  pointer activity, or resizing, so a paused editor stops redrawing every
  frame. Recording and stress previews stay awake.
- The editor preview redraws its grid only when size, zoom, or visibility
  change, and looks layers and assets up from per-project maps instead of
  rebuilding sets and scanning the layer list for every copy on every frame.
- Preview copies are no longer individual Phaser input targets: one scene
  handler hit-tests the topmost editable copy (rotation and scale included)
  when the pointer moves or presses, so bursts and emitters stop registering
  hundreds of interactive objects. Dragging, the hand cursor, locked layers,
  and path handles behave as before.
- The Timeline playhead moves with a CSS transform inside a clipping track, so
  playback no longer re-lays it out every frame (about 9% less layout time
  in a three-effect test; script time was unchanged).
- Interface text is now sized in rem with an 11 px floor (previously down to
  6.5 px), so browser text settings apply. Sliders, help icons, and switches
  have larger pointer targets; layer rows show a Solo icon instead of "S" and
  keep their actions visible at 60% opacity.
- The top bar now shows only **File**, Learn, Save, and Export at every width.
  New, Save As, Load, Templates, and Import moved into the File menu, which
  replaces the narrow-screen Actions menu, lists each action's purpose or
  shortcut, and returns focus to File when a dialog it opened closes.
- The Asset Library shows unselected images as a compact grid of tiles, and
  the selected image spans the row with its details, so about three times as
  many images fit in the same height. New browsers give the library 38% of the
  left column (previously 42%) so more layers fit; the divider still resizes
  it. Every per-image control stays available to keyboard and screen readers.
- The Asset Library's upload and Shapes buttons share one compact row, and
  Beginner upload notices no longer mention spawn silhouettes.
- The top bar no longer wraps, the layer panel's explainer paragraphs moved
  into help tips, and the white-artwork tip joined the upload hint so the
  layer list and asset list keep their space. The default left rail is
  272 px wide.
- Learn, Templates, and Export dialogs preload when the pointer or focus
  reaches the top bar.
- The Inspector's plain-language "What is happening?" summary now leads the
  panel instead of sitting below every section.
- The Runtime JSON tab badge reads "For games" instead of "Recommended".
- The Phaser runtime keeps up to 256 hidden, filter-free sprites per effect
  for reuse, so looping bursts and emitters stop creating and destroying a
  game object for every short-lived copy. Restart, stop, completion, and
  destroy still release every sprite.
- The Phaser runtime and editor preview assign sprite depth only when it
  changes, so a playing effect no longer forces a full host display-list sort
  every frame.
- Made compact Runtime JSON the recommended game-integration export and marked
  generated TypeScript as an Advanced wrapper. Point-only effects no longer
  import or expose Beam endpoint options, and unused alpha-sample grids are
  omitted without removing artwork, visual-mask, or stored silhouette state.
- Advanced editable projects to v18 and Runtime JSON to v16. Project v17 and
  Runtime v15 data migrate enabled or tuned rendering effects to explicit
  full-life clips, including tuned disabled settings that may be re-enabled.
- Made the visible layer stack conventional: the top row is frontmost, and the
  actions are Bring forward, Send backward, Bring to front, and Send to back.
  Runtime depth remains deterministic and effects stay owned by their layer
  rather than becoming independent z-order entries.
- Updated compatible React, Vite, vinext, lint, type, icon, and browser-test
  dependencies and patched all transitive npm advisories available without a
  major migration.
- Hardened project/template persistence so committed writes remain truthful
  when list refreshes fail and overlapping saves serialize safely.
- Isolated the 60 FPS playback clock to the Preview and Timeline, made recovery
  autosaves latest-only, released saved-library image data when dialogs close,
  reused the Phaser preview across restarts, and bounded alpha-mask threshold
  caches for steadier long authoring sessions.

### Fixed

- Opened the layer **Add** menu inside the window instead of 39 px past its
  left edge on desktop widths.
- Made **Loop active range** work in projects without a saved Timeline work
  range; preview loops and WebM/GIF capture no longer include trailing silence.
- Kept Space and R controlling playback after a mouse click leaves focus on a
  toolbar button, while keyboard users still get native button activation.
- Prevented attachment cycles, unsafe repeat expansion, malformed image data,
  stale asynchronous asset mutations, and work-budget overrun.
- Corrected responsive overflow, asset-card overlap, clipped template content,
  persistent tooltips, inaccessible selection state, focus loss, and
  destructive new-project behavior.
- Added distinct Inspector removal actions for configured optional modifiers,
  exposed selected layers programmatically, disambiguated template insertion
  names, and corrected remaining mojibake in lifecycle-facing copy.
- Kept layer Actions menus outside scrolling-panel clipping, added announced
  keyboard stacking commands, and exposed Solo with `aria-pressed`.
- Let open editor tabs yield IndexedDB schema upgrades, report legacy-tab
  upgrade blocks with a recovery instruction, and close late database handles.

## [@vvfx/phaser-runtime 0.16.0] - 2026-08-29

### Added

- Runtime JSON v16 playback for project-v18 rendering-effect clips, including
  normalized per-copy timing, fade-in/fade-out, and fade easing.
- Runtime playback controls for short Beam source cropping, independent Beam
  thickness scaling, and optional one-shot duration caps.
- Generated TypeScript declarations plus an isolated packed-consumer test for
  the package's public JavaScript and TypeScript API.

### Changed

- Migrates supported Runtime JSON versions 1 through 15 to v16, preserving
  enabled and tuned-disabled rendering-effect settings with full-life clips.
- Retains the Phaser peer requirement `>=4.2.1 <5` introduced by runtime 0.15.0.
  The 0.16.0 package is prepared as a private/local artifact and is not a
  registry publication.
