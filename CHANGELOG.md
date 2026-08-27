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
- Generated TypeScript declarations and an isolated consumer test for
  `@vvfx/phaser-runtime`.

### Changed

- Migrated the editor preview and `@vvfx/phaser-runtime` from Phaser 3.90 PreFX
  pipelines to Phaser 4.2 filter lists and render nodes. Runtime package 0.15.0
  now requires Phaser 4.2.1 or newer and below 5; Runtime JSON remains v15.
- Updated compatible React, Vite, vinext, lint, type, icon, and browser-test
  dependencies and patched all transitive npm advisories available without a
  major migration.
- Hardened project/template persistence so committed writes remain truthful
  when list refreshes fail and overlapping saves serialize safely.

### Fixed

- Prevented attachment cycles, unsafe repeat expansion, malformed image data,
  stale asynchronous asset mutations, and work-budget overrun.
- Corrected responsive overflow, asset-card overlap, clipped template content,
  persistent tooltips, inaccessible selection state, focus loss, and
  destructive new-project behavior.
