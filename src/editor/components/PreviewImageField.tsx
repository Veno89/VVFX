"use client";

import { ImagePlus, Trash2 } from "lucide-react";
import { useId } from "react";
import {
  BACKDROP_PIXEL_SCALES,
  type PreviewBackdrop,
} from "../../persistence/previewBackdrop";
import type { PreviewBackdropState } from "../usePreviewBackdrop";
import { HelpTip } from "./Controls";

/**
 * Controls for one editor-only preview image: the game screenshot or the
 * stand-in character. The file input lives outside the menu, so choosing a
 * file keeps working even if the menu closes while the picker is open.
 */
export function PreviewImageField({
  title,
  help,
  noun,
  state,
  onChooseFile,
  showPosition = false,
}: {
  title: string;
  help: string;
  /** Short name used in labels, e.g. "Screenshot" or "Character". */
  noun: string;
  state: PreviewBackdropState;
  onChooseFile: () => void;
  showPosition?: boolean;
}) {
  const scaleId = useId();
  const opacityId = useId();
  const xId = useId();
  const yId = useId();
  const image = state.backdrop;

  return (
    <div className="view-menu-field backdrop-field">
      <span className="view-menu-field__label">
        {title} <HelpTip label={title} text={help} />
      </span>
      {image ? (
        <>
          <span className="backdrop-field__name" title={image.name}>
            {image.name} · {image.width}×{image.height}
          </span>
          <label htmlFor={scaleId}>{noun} pixel size</label>
          <select
            id={scaleId}
            value={image.pixelScale}
            onChange={(event) =>
              state.update({ pixelScale: Number(event.target.value) })
            }
          >
            {BACKDROP_PIXEL_SCALES.map((scale) => (
              <option key={scale} value={scale}>
                {scale === 1 ? "1× (same as effect pixels)" : `${scale}×`}
              </option>
            ))}
          </select>
          {showPosition && (
            <>
              <label htmlFor={xId}>
                {noun} X {image.x}
              </label>
              <input
                id={xId}
                type="range"
                min={-400}
                max={400}
                step={2}
                value={image.x}
                onChange={(event) =>
                  state.update({ x: Number(event.target.value) })
                }
              />
              <label htmlFor={yId}>
                {noun} Y {image.y}
              </label>
              <input
                id={yId}
                type="range"
                min={-400}
                max={400}
                step={2}
                value={image.y}
                onChange={(event) =>
                  state.update({ y: Number(event.target.value) })
                }
              />
            </>
          )}
          <label htmlFor={opacityId}>
            {noun} opacity {Math.round(image.opacity * 100)}%
          </label>
          <input
            id={opacityId}
            type="range"
            min={10}
            max={100}
            step={5}
            value={Math.round(image.opacity * 100)}
            onChange={(event) =>
              state.update({ opacity: Number(event.target.value) / 100 })
            }
          />
          <span className="backdrop-field__actions">
            <button
              type="button"
              aria-label={`Replace ${noun.toLowerCase()}`}
              onClick={onChooseFile}
            >
              <ImagePlus size={14} aria-hidden="true" /> Replace
            </button>
            <button
              type="button"
              aria-label={`Remove ${noun.toLowerCase()}`}
              onClick={state.remove}
            >
              <Trash2 size={14} aria-hidden="true" /> Remove
            </button>
          </span>
        </>
      ) : (
        <button type="button" onClick={onChooseFile}>
          <ImagePlus size={14} aria-hidden="true" /> Add {title.toLowerCase()}
        </button>
      )}
      {state.error && (
        <span className="backdrop-field__error" role="alert">
          {state.error}
        </span>
      )}
    </div>
  );
}

/** Where an editor-only image sits in the canvas, following preview zoom. */
export function previewImageStyle(image: PreviewBackdrop, zoom: number) {
  return {
    opacity: image.opacity,
    transform: `translate(-50%, -50%) translate(${image.x * zoom}px, ${image.y * zoom}px) scale(${image.pixelScale * zoom})`,
  };
}
