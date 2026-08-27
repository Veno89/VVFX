# Release process

Vvfx is currently a local editor with a private, installable Phaser runtime.
This checklist validates both artifacts without publishing or deploying them.

## Supported environment

- Node.js 22.13.0 or newer
- Phaser 4.2.1 or newer and below 5 for runtime consumers
- The committed `package-lock.json`
- Chromium installed once with `npx playwright install chromium`
- A clean Git worktree when checking generated declaration drift

## Complete local gate

```bash
npm ci
npm run verify:release
```

The release gate performs the following checks:

1. Audit the complete npm dependency tree and fail on high-severity findings.
2. Check formatting, lint rules, TypeScript, and the Vitest suite.
3. Build the editor plus the Phaser runtime JavaScript and declarations.
4. Regenerate declarations and fail if the committed output has drifted.
5. Pack `@vvfx/phaser-runtime`, install it into an isolated temporary consumer,
   type-check its public API, and execute the documented JavaScript exports.
6. Build the production editor and run the Chromium workflow suite at the
   desktop, 1024 px, 768 px, and 390 px breakpoints. The desktop checks also
   cover WebGL effect startup, repeated restart, 50-copy stress, 100 trail state
   transitions, live-object return to baseline, and forced-GC heap comparison.

The Chromium suite owns its temporary production server on port 4173. To test
an existing server deliberately, set `VVFX_BROWSER_BASE_URL` to its origin.

## Version and documentation review

Before creating a release commit:

- Update the root editor version only when distributing a new editor release.
- Update `packages/phaser-runtime/package.json` when distributing a new runtime
  artifact.
- Keep the project format, runtime format, runtime package version, README, and
  changelog descriptions consistent.
- Treat a Phaser peer-major change as a breaking host-integration migration even
  when the Vvfx Runtime JSON schema itself does not change.
- Move the relevant `CHANGELOG.md` entries from **Unreleased** into a dated
  version section.
- Confirm the runtime tarball includes `LICENSE`, `README.md`, JavaScript,
  source maps, declarations, and `package.json`—the consumer gate enforces the
  required subset.

## CI

`.github/workflows/ci.yml` runs the quality/package and Chromium jobs for every
pull request and every push to `main`. Browser reports are retained for seven
days. Dependabot checks npm and GitHub Actions weekly, grouping compatible npm
patch/minor updates for review.

CI is a release prerequisite, not evidence of an interactive visual review.
For a user-facing release, also inspect the editor in a connected browser and
exercise the effect preview with representative assets. The heap assertion is
a bounded leak regression after Chromium garbage collection; it is not a GPU
memory benchmark or a substitute for profiling on target hardware.

## Publishing boundary

Neither this checklist nor CI publishes the editor, creates a GitHub release,
or publishes `@vvfx/phaser-runtime` to npm. Those external changes require a
separate explicit release request and version decision.
