# VVFX audit evidence index — 2026-08-29 — 2283b70

This index records concise, reproducible evidence for the audit report. It is not a raw transcript. Evidence was gathered from committed HEAD or from an archive made with `git archive` at the exact target SHA. No product source was edited.

<a id="ev-rev"></a>

## EV-REV — revision identity and cleanliness

- Repository: `C:\Users\Zhitn\Desktop\Vvfx`
- Branch: `main`
- Commit: `2283b70d8142835df0a037d37c0db244d20aa0f7`
- Commit timestamp: `2026-08-29T15:57:41+02:00`
- Parent: `582ee6eaf92f93aa50ec5c207cba94feee8a3ed4`
- Subject: `feat: redesign effect authoring and runtime workflow`
- Local `HEAD`, `origin/main`, and `origin/HEAD` matched. A live read-only `git ls-remote origin refs/heads/main` also returned the target SHA.
- No tag pointed at the target.
- Initial status was clean: `## main...origin/main`, with empty `git status --porcelain=v1 --untracked-files=all`.
- The audit report and this evidence directory are the only intended final additions; final state is recorded in the report.

<a id="ev-env"></a>

## EV-ENV — execution environment

- Windows 11 Home 25H2, build `26200.9168`, x64; registry also exposed the legacy `ProductName` string `Windows 10 Home`.
- CPU: AMD Ryzen 9 5900X 12-Core Processor; 24 logical processors.
- Memory: 34,269,720,576 bytes total (31.91 GiB); 17,852,776,448 bytes free at the snapshot.
- GPU: NVIDIA GeForce RTX 3080; Windows driver value `32.0.15.9186`, dated 2026-01-20. The browser WebGL renderer string was not captured.
- Node `v22.15.0`; npm `11.6.3`; culture `en-US`; Windows time zone `W. Europe Standard Time` (Europe/Stockholm).
- Installed Playwright `1.62.1`; bundled Chrome for Testing `151.0.7922.34`.
- Automated browser device: Chrome 151 user agent, 1280x720 viewport, 1920x1080 screen, DPR 1, non-touch; tests also set 1024x720, 768x720, 390x844, and 1440x900 viewports.
- High Contrast registry flags were captured, but no screen-reader, zoom, reduced-motion, forced-colors, or assistive-technology session was exercised.
- CIM/system-information queries were permission-blocked; equivalent read-only Node/registry evidence supplied the CPU, memory, OS, and GPU facts above.

<a id="ev-lock"></a>

## EV-LOCK — dependency and clean-install state

- Root requires Node `>=22.13.0` and uses exact declared dependency versions.
- `package-lock.json` lockfile v3 SHA-256: `023F226F3F74761253CF0F06B9719BB9B0AD1447054B70CC0ACE33453AA89487`.
- `npm ls --depth=0` passed with all direct dependencies satisfied.
- `npm ci` in the isolated archive passed: 500 packages installed in about 14 seconds.
- The install-state lock under `node_modules` had a different hash, as expected for npm install metadata; conclusions use the committed root lockfile.

<a id="ev-gate"></a>

## EV-GATE — exact clean release gate

- Canonical command revalidated from `package.json`: `npm.cmd run verify:release`.
- Before execution, TCP port 4173 was confirmed available. The wrapper owned the production server lifecycle and stopped it; it did not emit the child PID, so that PID is not available as evidence.
- First sandboxed attempt stopped at `npm audit` because registry/cache access was denied. This is an infrastructure attempt, not a VVFX failure.
- The exact command was rerun with approved network access in `C:\Users\Zhitn\AppData\Local\Temp\vvfx-audit-20260829-2283b70-01`, a clean `git archive` extraction that self-identified as the target SHA.
- Result: exit 0, approximately 155 seconds.
- `npm audit --audit-level=high`: pass, zero advisories.
- Prettier check: pass.
- ESLint: pass.
- TypeScript: pass.
- Vitest: 52 files, 564 tests passed; 49.93 seconds in the release run.
- Runtime JavaScript build, editor production build, declaration generation/check, packed consumer, and browser suite all passed.
- Playwright: 12/12 Chromium cases passed in 53.8 seconds.
- Build warnings: Node experimental `glob`; build-plugin timing; client chunks over 500 kB; vinext could not statically classify route `/`. No subprocess failure or unhandled rejection was reported.
- A delegated concurrent-load Vitest attempt timed out in one help-tip test; that test passed alone and a later serial 52-file/564-test run passed. This is a resource-contention signal, not a confirmed defect.

<a id="ev-browser-auto"></a>

## EV-BROWSER-AUTO — automated browser coverage

The 12 production-Chromium cases covered focus/new-project safety; responsive action access at 1024x720, 768x720, and 390x844; layer actions and reordering; template footer; feature removal plus Undo; workspace persistence and preflight; effect timing lanes; effect-authoring focus and reversibility; a trail/stress scenario with 50 toggles and a forced-GC heap delta below 8 MiB; and WebGL startup with 10 restarts and one remaining canvas. The suite proves its assertions in Chrome for Testing 151; it is not hands-on visual, network, screen-reader, Canvas, Firefox, WebKit, or representative-GPU evidence.

<a id="ev-browser-block"></a>

## EV-BROWSER-BLOCK — direct browser limitation

The required in-app browser runtime was initialized according to its skill instructions. `getDefault()` returned `No browser is available`; the single allowed browser listing returned `[]`. Therefore direct page control, visual inspection, screenshots, continuous console/network capture, keyboard exploration, browser zoom, forced colors, reduced motion, screen-reader work, and real export interaction were Blocked. Repository Playwright remained supporting Automated evidence and was not relabeled as hands-on observation.

<a id="ev-model"></a>

## EV-MODEL — model, lifecycle, persistence, and runtime tests

- The full release suite included the relevant tests within its 564-test denominator.
- Two focused read-only runs additionally passed 21 distinct files / 341 tests in 4.23 s and 8.82 s. Coverage included serialization, lifecycle, capability, asset removal, templates, persistence, runtime ownership, Beam, rendering effects, events, adversarial placement, spawn, behavior envelopes, visual masks, data integrity, workspace helpers, recording helpers, clipboard, presets/export, and history/controls.
- These tests do not prove physical rendering, real MediaRecorder behavior, cross-tab IndexedDB ordering, storage-policy denial at editor integration, or independent package-host behavior.

<a id="ev-sec"></a>

## EV-SEC — security and adversarial evidence

- Current `npm audit --json`: zero info/low/moderate/high/critical advisories across 526 dependencies.
- All 526 lockfile resolution URLs used `https://registry.npmjs.org` and had integrity entries. Only optional macOS `fsevents` entries declared install scripts.
- Two focused read-only batches passed 20 files / 250 tests covering input bounds, portable images, hostile templates, runtime, rendering effects, performance helpers, recording/GIF helpers, lifecycle, persistence, data integrity, embedded image validation, export preflight, generated exports, and clipboard behavior.
- Static application search found no app `fetch`, XHR, WebSocket, EventSource, remote font/asset, analytics, telemetry, `eval`, `new Function`, or `dangerouslySetInnerHTML` path.
- No tracked secret/environment filename or common high-confidence credential pattern was found.
- This evidence does not prove absence of unknown dependency or application vulnerabilities.

<a id="ev-pack"></a>

## EV-PACK — package and artifact evidence

- Runtime package: `@vvfx/phaser-runtime` `0.16.0`, private ESM, MIT, Phaser peer `>=4.2.1 <5`.
- Fresh and tracked `artifacts/runtime/vvfx-phaser-runtime-0.16.0.tgz` were byte-identical.
- SHA-256: `1D406DB82F2CFAAE994F3944584652D209CA42B2FDE63C0A895460E4A52FF6F8`; 203,182 bytes; 34 archive entries.
- Archive contained package metadata, README, LICENSE, JavaScript, source map, and 29 declaration files. All 28 embedded source-map sources matched target source.
- The consumer gate passed, but its use of `--legacy-peer-deps` and a repository Phaser type path is the basis of `VVFX-AUD-TEST-001`.

<a id="ev-build"></a>

## EV-BUILD — output composition

- Editor `dist`: 49 files, 4,880,289 bytes; client 12 files / 2,403,715 bytes; server 36 files / 2,476,543 bytes.
- Runtime `dist`: 2 files / 813,238 bytes including source map.
- Largest client chunks: Phaser 1,374,706 bytes; `VfxEditor` 519,022; framework 190,109; vinext 110,107; index 108,678.
- Client output contained no source maps. Runtime source-map inclusion is documented and intentional.
- No enforced bundle-size budget exists.

<a id="ev-perf"></a>

## EV-PERF — bounded microbenchmark and existing resource check

- Existing automated browser stress asserts a 2,000-instance ceiling, 50 trail toggles, post-GC heap delta below 8 MiB, WebGL restarts, and one canvas. It is a narrow regression check, not a GPU benchmark.
- Static maximum for the advertised 30-second, 15-fps, 1280x720 GIF path is 450 frames, 414,720,000 pixel visits, and 1,658,880,000 cumulative RGBA bytes presented to encoding before encoder-internal copies.
- Exact current `GifEncoder`, one deterministic high-entropy 1280x720 frame under Node: 128.1 ms, 1,249,782 output bytes, +67.3 MiB heap, +89.1 MiB RSS.
- A linear 450-frame projection is approximately 57.6 s encoder CPU and 536 MiB retained compressed chunks. That projection is explicitly Inferred; a maximum export was not run because it could lock/crash the tab and no direct browser was available.
- No p50/p95/p99 frame-time, long-task, input-latency, React-commit, draw-call, GPU allocation, storage-latency, export-peak-memory, or sustained-session measurement was obtained.

<a id="ev-a11y"></a>

## EV-A11Y — static accessibility evidence

- `--faint` is `#687184`; confirmed background pair ratios are 4.01:1 on `#090b11`, 3.79:1 on `#10131b`, 3.58:1 on `#151923`, and 3.36:1 on `#1a1f2b`.
- Current CSS applies `--faint` to meaningful normal text at 7.5–10 px in project status, metadata, menus, section notes, performance descriptions, timeline labels, and export summaries.
- WCAG 2.2 SC 1.4.3 requires 4.5:1 for normal text; these confirmed pairs fail that threshold. Large-text and logo exemptions were not used as evidence.
- Unit/component accessibility coverage is extensive for dialog focus, Escape, focus return, ARIA state, menus, and keyboard reordering. Direct visual, keyboard, screen-reader, 200% zoom, reduced-motion, and forced-colors qualification was Blocked.

<a id="ev-deploy-block"></a>

## EV-DEPLOY-BLOCK — hosting/deployment limitation

- `.openai/hosting.json` contains only `d1: null` and `r2: null`; it has no `project_id`.
- The build plugin copies that file into output, but no bound Sites target or verified deployed URL was discoverable from the checkout.
- No deployment was authorized or performed. Live TLS, CSP, frame policy, `nosniff`, referrer/permissions policy, cache headers, service workers, and deployed network behavior are therefore Blocked, not failed.

<a id="ev-isolation"></a>

## EV-ISOLATION — reproducibility boundary

- Isolated archive: `C:\Users\Zhitn\AppData\Local\Temp\vvfx-audit-20260829-2283b70-01`.
- Archive SHA-256: `5F71F1963DA2CD1853079F5D0A5CEE5EC75A05505994EC3C9D54B5A9F4AAB4EE`.
- The shared checkout was not installed, built, formatted, generated, reset, or cleaned as part of the release-gate run.
- The temporary copy was retained rather than deleted during the audit; it is outside the repository and not a deliverable.
