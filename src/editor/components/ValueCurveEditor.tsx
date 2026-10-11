"use client";

import {
  addCurvePoint,
  curveEditRange,
  MAX_CURVE_POINTS,
  moveCurvePoint,
  removeCurvePoint,
} from "../../vfx/curves";
import type { CurvePoint } from "../../vfx/types";
import { CurvePlot } from "./CurvePlot";

/** A multiplier curve (1× is unchanged) over a span of time. */
export function ValueCurveEditor({
  label,
  points,
  durationMs,
  help,
  onChange,
}: {
  label: string;
  points: CurvePoint[];
  durationMs: number;
  help: string;
  onChange: (points: CurvePoint[]) => void;
}) {
  return (
    <div className="curve-graph">
      <CurvePlot
        label={label}
        points={points}
        samples={points}
        range={curveEditRange(points)}
        formatValue={(value) => `${Number(value.toFixed(2))}×`}
        formatTime={(time) => `${Math.round(time * durationMs)} ms`}
        valueStep={0.05}
        maxPoints={MAX_CURVE_POINTS}
        onMovePoint={(index, time, value) =>
          onChange(moveCurvePoint(points, index, time, value))
        }
        onAddPoint={(time, value) =>
          onChange(addCurvePoint(points, time, value))
        }
        onRemovePoint={(index) => onChange(removeCurvePoint(points, index))}
        help={help}
      />
    </div>
  );
}
