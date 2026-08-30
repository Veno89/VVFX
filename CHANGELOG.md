# Changelog

All notable Vvfx editor and Phaser runtime changes are recorded here. The
project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses semantic versions for release artifacts.

## [Unreleased]

### Added

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
