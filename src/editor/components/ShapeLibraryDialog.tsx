import { Shapes, X } from "lucide-react";
import { useEffect, useState } from "react";
import { LIBRARY_SHAPES, type LibraryShape } from "../shapeLibrary";
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

/**
 * Ready-made white artwork for people who have none yet. Picking a shape adds
 * it to the Asset Library as an ordinary PNG, tintable like any upload.
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
