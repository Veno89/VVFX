"use client";

import { AlertTriangle, Gauge, Info } from "lucide-react";
import { useMemo } from "react";
import {
  MAX_STRESS_INSTANCES,
  STRESS_COPY_OPTIONS,
  analyzeProjectPerformance,
  type PreviewPerformanceSample,
  type StressCopyCount,
} from "../../vfx/performance";
import type { VfxProject } from "../../vfx/types";
import { HelpTip } from "./Controls";

const millisecondsLabel = (milliseconds: number) =>
  `${(Math.max(0, milliseconds) / 1_000).toFixed(milliseconds >= 10_000 ? 1 : 2)}s`;

export function PerformanceInspector({
  project,
  sample,
  peakSprites,
  requestedCopies,
  captureMode,
  onCopiesChange,
  onResetPeak,
}: {
  project: VfxProject;
  sample: PreviewPerformanceSample;
  peakSprites: number;
  requestedCopies: StressCopyCount;
  captureMode: boolean;
  onCopiesChange: (copies: StressCopyCount) => void;
  onResetPeak: () => void;
}) {
  const estimate = useMemo(() => analyzeProjectPerformance(project), [project]);
  const displayedEffectiveCopies =
    sample.requestedCopies === requestedCopies
      ? sample.effectiveCopies
      : requestedCopies;
  const limited =
    captureMode ||
    (sample.requestedCopies === requestedCopies && sample.stressLimited);

  return (
    <section
      className="performance-menu"
      role="dialog"
      aria-label="Effect performance"
    >
      <header className="performance-menu__header">
        <span className="performance-menu__icon">
          <Gauge size={16} />
        </span>
        <div>
          <strong>Effect performance</strong>
          <p>Simple counts and warnings, not a GPU benchmark.</p>
        </div>
      </header>

      <div className="performance-stat-grid">
        <article>
          <small>Measured</small>
          <strong>{sample.liveSprites}</strong>
          <span>
            Sprites alive now{" "}
            <HelpTip text="The image objects currently drawn in this preview, including stress-test copies and trails." />
          </span>
        </article>
        <article>
          <small>Measured</small>
          <strong>{peakSprites}</strong>
          <span>Peak this run</span>
        </article>
        <article>
          <small>Measured</small>
          <strong>{sample.newSpritesPerSecond}</strong>
          <span>New sprites / second</span>
        </article>
        <article>
          <small>Estimated</small>
          <strong>{millisecondsLabel(estimate.durationMs)}</strong>
          <span>
            {estimate.durationIsPreviewWindow
              ? "Preview window"
              : "Effect duration"}
          </span>
        </article>
      </div>

      <dl className="performance-details">
        <div>
          <dt>Longest-running layer</dt>
          <dd>{estimate.longestLayerName ?? "No active layers"}</dd>
        </div>
        <div>
          <dt>Authored peak pressure</dt>
          <dd>about {Math.round(estimate.estimatedPeakSprites)} sprites</dd>
        </div>
        <div>
          <dt>Repeating layers</dt>
          <dd>{estimate.repeatingLayerCount}</dd>
        </div>
      </dl>

      <div className="stress-test">
        <div className="stress-test__heading">
          <div>
            <strong>Stress test</strong>
            <span>Preview several effect copies at once.</span>
          </div>
          <HelpTip text="This is a rough check on this browser and computer. It does not predict exact game performance." />
        </div>
        <div className="stress-test__options" aria-label="Stress test copies">
          {STRESS_COPY_OPTIONS.map((copies) => (
            <button
              key={copies}
              type="button"
              className={requestedCopies === copies ? "is-active" : ""}
              disabled={captureMode}
              aria-pressed={requestedCopies === copies}
              onClick={() => onCopiesChange(copies)}
            >
              {copies}×
            </button>
          ))}
        </div>
        <p
          className={
            limited ? "stress-test__result is-limited" : "stress-test__result"
          }
        >
          {captureMode
            ? "Recording temporarily uses one clean effect copy."
            : limited
              ? `Requested ${requestedCopies}; safely showing ${displayedEffectiveCopies}.`
              : `Showing ${displayedEffectiveCopies} of ${requestedCopies} requested copies.`}
        </p>
        <p className="stress-test__limit">
          <Info size={12} /> Stress mode stops at{" "}
          {MAX_STRESS_INSTANCES.toLocaleString()} sprites and never changes the
          saved project.
        </p>
      </div>

      {estimate.warnings.length > 0 && (
        <div className="performance-warnings">
          <span className="performance-evidence">Heuristic warnings</span>
          {estimate.warnings.map((warning) => (
            <p key={warning.id}>
              <AlertTriangle size={13} />
              <span>{warning.message}</span>
            </p>
          ))}
        </div>
      )}

      <button className="performance-reset" type="button" onClick={onResetPeak}>
        Reset measured peak
      </button>
    </section>
  );
}
