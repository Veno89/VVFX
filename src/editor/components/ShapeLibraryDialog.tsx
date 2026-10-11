import { Plus, Shapes, X } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  DEFAULT_SHAPE_MAKER,
  LIBRARY_SHAPES,
  makeCustomShape,
  type LibraryShape,
  type ShapeMakerKind,
  type ShapeMakerSettings,
} from "../shapeLibrary";
import { useFocusRegion } from "../useFocusRegion";

function shapeThumbnail(shape: LibraryShape): string | null {
  const canvas = document.createElement("canvas");
  canvas.width = shape.width;
  canvas.height = shape.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  shape.draw(context, shape.width, shape.height);
  return canvas.toDataURL("image/png");
}

const MAKER_KINDS: { id: ShapeMakerKind; label: string }[] = [
  { id: "glow", label: "Glow" },
  { id: "ring", label: "Ring" },
  { id: "star", label: "Star" },
];

/** A labelled slider for one maker setting. */
function MakerSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const id = useId();
  return (
    <div className="shape-maker__field">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{format(value)}</output>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

/**
 * Ready-made white artwork for people who have none yet, plus a small maker
 * for custom glows, rings, and stars. Picking either adds an ordinary PNG to
 * the Asset Library, tintable like any upload.
 */
export function ShapeLibraryDialog({
  onPick,
  onClose,
}: {
  onPick: (shape: LibraryShape) => void;
  onClose: () => void;
}) {
  const dialogRef = useFocusRegion<HTMLElement>({ onEscape: onClose });
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const [maker, setMaker] = useState<ShapeMakerSettings>(DEFAULT_SHAPE_MAKER);
  const [makerPreview, setMakerPreview] = useState<string | null>(null);
  const updateMaker = (patch: Partial<ShapeMakerSettings>) =>
    setMaker((current) => ({ ...current, ...patch }));

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      setMakerPreview(shapeThumbnail(makeCustomShape(maker))),
    );
    return () => window.cancelAnimationFrame(frame);
  }, [maker]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const next: Record<string, string> = {};
      for (const shape of LIBRARY_SHAPES) {
        const url = shapeThumbnail(shape);
        if (url) next[shape.id] = url;
      }
      setThumbnails(next);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className="dialog shape-library-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shape-library-title"
      >
        <header>
          <div>
            <span className="eyebrow">Starter artwork</span>
            <h2 id="shape-library-title">Shape library</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shape library"
          >
            <X size={18} />
          </button>
        </header>
        <p className="shape-library-intro">
          White shapes on transparency. Add one to the Asset Library, then tint
          it any color in the Inspector.
        </p>
        <section className="shape-maker" aria-labelledby="shape-maker-title">
          <span className="shape-maker__art is-checkerboard">
            {makerPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={makerPreview} alt="" />
            ) : (
              <Shapes size={22} aria-hidden="true" />
            )}
          </span>
          <div className="shape-maker__controls">
            <strong id="shape-maker-title">Make your own</strong>
            <div
              role="radiogroup"
              aria-label="Shape"
              className="shape-maker__kinds"
            >
              {MAKER_KINDS.map((kind) => (
                <button
                  key={kind.id}
                  type="button"
                  role="radio"
                  aria-checked={maker.kind === kind.id}
                  className={maker.kind === kind.id ? "is-active" : ""}
                  onClick={() => updateMaker({ kind: kind.id })}
                >
                  {kind.label}
                </button>
              ))}
            </div>
            <MakerSlider
              label="Size"
              value={maker.size}
              min={32}
              max={512}
              step={16}
              format={(value) => `${value} px`}
              onChange={(size) => updateMaker({ size })}
            />
            <MakerSlider
              label="Softness"
              value={maker.softness}
              min={0}
              max={1}
              step={0.05}
              format={(value) => `${Math.round(value * 100)}%`}
              onChange={(softness) => updateMaker({ softness })}
            />
            {maker.kind === "ring" && (
              <MakerSlider
                label="Thickness"
                value={maker.thickness}
                min={0.04}
                max={0.8}
                step={0.02}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={(thickness) => updateMaker({ thickness })}
              />
            )}
            {maker.kind === "star" && (
              <>
                <MakerSlider
                  label="Points"
                  value={maker.points}
                  min={3}
                  max={12}
                  step={1}
                  format={(value) => String(value)}
                  onChange={(points) => updateMaker({ points })}
                />
                <MakerSlider
                  label="Inner size"
                  value={maker.innerRadius}
                  min={0.15}
                  max={0.9}
                  step={0.05}
                  format={(value) => `${Math.round(value * 100)}%`}
                  onChange={(innerRadius) => updateMaker({ innerRadius })}
                />
              </>
            )}
            <button
              type="button"
              className="primary-action"
              onClick={() => onPick(makeCustomShape(maker))}
            >
              <Plus size={14} aria-hidden="true" /> Add this shape
            </button>
          </div>
        </section>
        <div className="shape-library-grid">
          {LIBRARY_SHAPES.map((shape) => (
            <button
              key={shape.id}
              type="button"
              className="shape-library-tile"
              aria-label={`Add ${shape.name}`}
              onClick={() => onPick(shape)}
            >
              <span className="shape-library-tile__art is-checkerboard">
                {thumbnails[shape.id] ? (
                  // Generated data URLs; next/image adds nothing here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnails[shape.id]} alt="" />
                ) : (
                  <Shapes size={22} aria-hidden="true" />
                )}
              </span>
              <strong>{shape.name}</strong>
              <small>{shape.use}</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
