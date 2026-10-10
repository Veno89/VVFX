# Changelog

All notable Vvfx editor and Phaser runtime changes are recorded here. The
project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses semantic versions for release artifacts.

## [Unreleased]

### Added

- **Animated preset thumbnails** in the start screen and the layer Add menu.
  They draw the preset's real, deterministic motion with Canvas 2D, show a
  busy still frame at rest, play while hovered or focused, and stay still
  under reduced motion. Experimental WebGL effects are not drawn in them.
- **Sprite sheet + PNG frames export** (.zip) in Export → Preview video, at
  12–30 FPS and new 256 or 512 px square sprite sizes. The archive holds one
  packed sheet, a TexturePacker-style JSON atlas read by Phaser and PixiJS,
  and every frame as its own PNG for engines such as Godot, Unity, GameMaker,
  or Construct. Sheets stay within 8192 px and 240 frames.
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

- Runtime JSON `duration` now ends at the last enabled content when **Loop
  active range** is on, so `onComplete` and loops no longer wait through
  trailing composition silence.
- Learn, Templates, and Export dialogs load on demand, cutting the editor's
  startup chunk from 532 KB to 452 KB.
- The editor preview's Phaser loop sleeps after 400 ms without changes,
  pointer activity, or resizing, so a paused editor stops redrawing every
  frame. Recording and stress previews stay awake.
- Interface text is now sized in rem with an 11 px floor (previously down to
  6.5 px), so browser text settings apply. Sliders, help icons, and switches
  have larger pointer targets; layer rows show a Solo icon instead of "S" and
  keep their actions visible at 60% opacity.
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
