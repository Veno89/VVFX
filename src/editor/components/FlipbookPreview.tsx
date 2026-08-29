"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { seededRandom } from "../../vfx/random";
import { spriteFrameSequence, spriteSheetGrid } from "../../vfx/spriteSheet";
import type { FrameAnimationSettings, VfxAsset } from "../../vfx/types";

const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

function frameBackground(
  asset: VfxAsset,
  frame: number,
  backgroundImage: string,
): CSSProperties {
  if (!asset.spriteSheet) return {};
  const grid = spriteSheetGrid(asset, asset.spriteSheet);
  const column = frame % grid.columns;
  const row = Math.floor(frame / grid.columns);
  return {
    aspectRatio: `${asset.spriteSheet.frameWidth} / ${asset.spriteSheet.frameHeight}`,
    backgroundImage,
    backgroundPosition: `${grid.columns === 1 ? 0 : (column / (grid.columns - 1)) * 100}% ${grid.rows === 1 ? 0 : (row / (grid.rows - 1)) * 100}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${grid.columns * 100}% ${grid.rows * 100}%`,
  };
}

export function FlipbookPreview({
  asset,
  animation,
}: {
  asset: VfxAsset;
  animation: FrameAnimationSettings;
}) {
  const sequence = useMemo(
    () => spriteFrameSequence(asset, animation),
    [animation, asset],
  );
  const backgroundImage = useMemo(
    () => `url(${JSON.stringify(asset.dataUrl)})`,
    [asset.dataUrl],
  );
  const randomStart = animation.randomStartFrame
    ? Math.floor(seededRandom(hashText(asset.id), 73) * sequence.length)
    : 0;
  const [sequenceIndex, setSequenceIndex] = useState(randomStart);
  const [playing, setPlaying] = useState(false);
  const safeIndex = sequence.length
    ? Math.max(0, Math.min(sequence.length - 1, sequenceIndex))
    : 0;
  const currentFrame = sequence[safeIndex] ?? 0;

  useEffect(() => {
    if (!playing || sequence.length < 2) return;
    const timer = window.setTimeout(
      () => {
        if (safeIndex >= sequence.length - 1) {
          if (animation.loop) setSequenceIndex(0);
          else setPlaying(false);
        } else setSequenceIndex(safeIndex + 1);
      },
      Math.max(16, Math.round(1000 / animation.framesPerSecond)),
    );
    return () => window.clearTimeout(timer);
  }, [animation.framesPerSecond, animation.loop, playing, safeIndex, sequence]);

  if (!asset.spriteSheet || sequence.length === 0) return null;
  const start = Math.min(
    asset.spriteSheet.frameCount - 1,
    Math.max(0, animation.startFrame),
  );
  const end = Math.min(
    asset.spriteSheet.frameCount - 1,
    Math.max(start, animation.endFrame ?? asset.spriteSheet.frameCount - 1),
  );
  const range = Array.from({ length: end - start + 1 }, (_, index) =>
    Math.min(end, start + index),
  );
  const visibleFrames =
    range.length > 24 ? [...range.slice(0, 23), range.at(-1)!] : range;

  return (
    <div className="flipbook-preview" aria-label="Flipbook preview">
      <div className="flipbook-preview__stage">
        <span
          className="flipbook-frame flipbook-frame--large"
          style={frameBackground(asset, currentFrame, backgroundImage)}
          role="img"
          aria-label={`Previewing frame ${currentFrame + 1}`}
        />
        <span>
          <strong>Frame {currentFrame + 1}</strong>
          <small>
            {animation.framesPerSecond} pictures per second
            {animation.randomStartFrame ? " · random start per copy" : ""}
          </small>
        </span>
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          aria-label={
            playing ? "Pause flipbook preview" : "Play flipbook preview"
          }
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
          {playing ? "Pause" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setSequenceIndex(randomStart);
          }}
          aria-label="Restart flipbook preview"
          title="Restart preview"
        >
          <RotateCcw size={14} />
        </button>
      </div>
      <div className="flipbook-preview__strip" aria-label="Sprite frames">
        {visibleFrames.map((frame, index) => (
          <button
            type="button"
            key={`${frame}-${index}`}
            className={frame === currentFrame ? "is-active" : ""}
            aria-label={`Inspect frame ${frame + 1}`}
            aria-pressed={frame === currentFrame}
            onClick={() => {
              const nextIndex = sequence.indexOf(frame);
              if (nextIndex >= 0) {
                setPlaying(false);
                setSequenceIndex(nextIndex);
              }
            }}
          >
            <span
              className="flipbook-frame"
              style={frameBackground(asset, frame, backgroundImage)}
            />
            <small>{frame + 1}</small>
          </button>
        ))}
        {range.length > visibleFrames.length && (
          <span className="flipbook-preview__overflow">
            +{range.length - visibleFrames.length} more
          </span>
        )}
      </div>
      <p>
        Click a frame to inspect it. The effect preview uses the main Timeline,
        so frame playback stays synchronized with every other layer.
      </p>
    </div>
  );
}
