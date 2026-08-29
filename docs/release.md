# Release process

Vvfx is currently a local editor with a private, installable Phaser runtime.
This checklist validates both artifacts without publishing or deploying them.

## Supported environment

- Node.js 22.13.0 or newer
- Phaser 4.2.1 or newer and below 5 for runtime consumers
- The committed `package-lock.json`
- Chromium and Firefox installed once with
  `npx playwright install chromium firefox`
- A clean Git worktree when checking generated declaration drift

## Complete local gate

```bash
npm ci
npm run verify:release
```

The release gate performs the following checks:

1. Audit the complete npm dependency tree and fail on high-severity findings.
2. Check formatting, lint rules, TypeScript, and the Vitest suite with the
   recorded full-production coverage thresholds.
3. Generate runtime declarations into temporary output and fail on committed
   drift without changing the checkout.
4. Build the editor plus the Phaser runtime JavaScript and declarations, then
   enforce the checked-in client/runtime byte budgets.
5. Pack `@vvfx/phaser-runtime`, install it into an isolated temporary consumer,
   type-check its public API, and execute the documented JavaScript exports.
6. Verify the retained N/N-1 editor, project, template, runtime JSON, runtime
   package, tarball-size, and SHA-256 bindings in `release/version-pairs.json`.
7. Build the production editor and run the full Chromium workflow plus the
   tagged renderer-independent Firefox matrix. The suite covers desktop,
   1024 px, 768 px, and 390 px breakpoints; WebGL startup; a forced-Canvas
   fallback through `?renderer=canvas`; repeated restart; 50-copy stress; 100
   trail state transitions; live-object return to baseline; and Chromium
   forced-GC heap comparison.

The browser suite owns its temporary production server on port 4173. To test
an existing server deliberately, set `VVFX_BROWSER_BASE_URL` to its HTTP(S)
origin. External mode does not inspect, start, signal, or stop a local server.

The deterministic build-size profile and its measured baseline live in
`scripts/performance-budgets.mjs`. A budget change requires a reviewed build
diff, a fresh comparable baseline, and an updated rationale. CI byte budgets do
not replace browser traces, representative GPU measurements, or manual release
qualification.

Vitest files run serially so full-editor jsdom mounts and declaration compiler
fixtures cannot starve one another and turn their per-test deadlines into
machine-load flakes. Browser workflows remain independently parallelizable at
the Playwright layer.

## Local runtime artifact

The gate creates and tests one named candidate archive under
`artifacts/runtime/candidate`. It also writes `qualification-manifest.json`
with the archive SHA-256, size, file count, source revision/status, runtime
format, package version, Phaser peer range, tested peer matrix, and source-map
policy. Do not run `npm pack` again after qualification.

Promote only a clean-source candidate, copying the exact tested bytes:

```bash
node scripts/promote-runtime-package.mjs \
  artifacts/runtime/candidate/vvfx-phaser-runtime-0.16.0.tgz \
  artifacts/runtime/candidate/qualification-manifest.json \
  artifacts/runtime/promoted
```

Promotion refuses dirty-source manifests or any hash/size mismatch. Installing
that exact `.tgz` keeps consumer evidence tied to the reviewed artifact.

## Historical compatibility corpus

`tests/fixtures/historical/manifest.json` binds repository-authentic project,
runtime, and template fixtures to the exact commits that emitted schema pairs
16/14, 17/15, and 18/16. The migration suite checks their bytes, current
canonical forms, deterministic evaluated semantics, generated Advanced
TypeScript, future-version rejection, and the exact packed runtime consumer.

The reachable repository has no release tags or exported artifacts for project
formats 1-15 or runtime formats 1-13. Synthetic migration tests still exercise
those accepted versions, but they are not described as release-authentic. A
future release may close that evidence gap only by adding provenance-verifiable
artifacts; never manufacture or relabel a current object as an old release.

## N/N-1 rollback policy

`release/version-pairs.json` is the machine-checked rollback record. Runtime
JSON and `@vvfx/phaser-runtime` are one atomic deployment unit: never deploy a
v16 definition with runtime package 0.15.0, or a v15 definition with an
unrecorded package. Run `npm run check:version-pairs` before a release or drill;
it verifies both source revisions and the retained tarball bytes.

Use this decision order during an incident:

1. Prefer a forward fix on the current project-18/runtime-16 pair.
2. If code rollback is unavoidable, deploy editor revision
   `582ee6eaf92f93aa50ec5c207cba94feee8a3ed4`, runtime JSON v15, and the retained
   0.15.0 tarball together. Verify its recorded SHA-256 before deployment.
3. Do not clear, rewrite, import over, or attempt to downgrade v18 browser
   projects, recovery data, or v18-linked templates. The older editor cannot
   open the newer IndexedDB schema; that `VersionError` is an intentional
   read-only preservation boundary, not permission to delete the database.
4. To recover or export newer records, redeploy the recorded current pair,
   open the preserved library, and export `.vvfx` backups. There is no lossy
   in-place downgrade path.

After a new release commit, retain its exact runtime tarball, add its full Git
SHA, byte size, and SHA-256 as N, move the former N to N-1, and rerun the gate.
Do not edit a manifest hash to fit unexplained bytes; rebuild from the recorded
revision and investigate any mismatch.

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

`.github/workflows/ci.yml` runs the quality/package and Chromium/Firefox jobs
for every pull request and every push to `main`. Browser reports are retained
for seven days. Dependabot checks npm and GitHub Actions weekly, grouping
compatible npm patch/minor updates for review.

CI is a release prerequisite, not evidence of an interactive visual review.
For a user-facing release, also inspect the editor in a connected browser and
exercise the effect preview with representative assets. The heap assertion is
a bounded leak regression after Chromium garbage collection; it is not a GPU
memory benchmark or a substitute for profiling on target hardware.

## Publishing boundary

Neither this checklist nor CI publishes the editor, creates a GitHub release,
or publishes `@vvfx/phaser-runtime` to npm. Those external changes require a
separate explicit release request and version decision.
