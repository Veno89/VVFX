import { seededRandom } from "./random";
import type { BehaviorEnvelopeSettings, BehaviorSettings } from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

function organicNoise(
  seed: number,
  salt: number,
  phase: number,
  smoothness: number,
): number {
  const step = Math.floor(Math.max(0, phase));
  const fraction = Math.max(0, phase) - step;
  const smoothFraction = fraction * fraction * (3 - 2 * fraction);
  const mix = fraction + (smoothFraction - fraction) * clamp01(smoothness);
  const from = seededRandom(seed, salt + step * 2) * 2 - 1;
  const to = seededRandom(seed, salt + (step + 1) * 2) * 2 - 1;
  return from + (to - from) * mix;
}

function anchoredOrganicNoise(
  seed: number,
  salt: number,
  phase: number,
  smoothness: number,
): number {
  const start = organicNoise(seed, salt, 0, smoothness);
  return (organicNoise(seed, salt, phase, smoothness) - start) * 0.5;
}

export interface EvaluatedBehavior {
  x: number;
  y: number;
  rotation: number;
  scaleMultiplier: number;
  opacityMultiplier: number;
}

export function behaviorEnvelopeWeight(
  envelope: BehaviorEnvelopeSettings,
  progress: number,
): number {
  if (!envelope.enabled) return 1;
  const time = clamp01(progress);
  const start = clamp01(envelope.start);
  const attackEnd = Math.max(start, clamp01(envelope.attackEnd));
  const releaseStart = Math.max(attackEnd, clamp01(envelope.releaseStart));
  const end = Math.max(releaseStart, clamp01(envelope.end));
  if (time < start || time >= end) return 0;
  if (time < attackEnd && attackEnd > start)
    return (time - start) / (attackEnd - start);
  if (time <= releaseStart) return 1;
  if (end <= releaseStart) return 0;
  return 1 - (time - releaseStart) / (end - releaseStart);
}

function integrateLinearEnvelopeSegment(
  until: number,
  from: number,
  to: number,
  fromWeight: number,
  toWeight: number,
): number {
  const upper = Math.min(until, to);
  if (upper <= from || to <= from) return 0;
  const slope = (toWeight - fromWeight) / (to - from);
  const intercept = fromWeight - slope * from;
  const squaredDelta = upper * upper - from * from;
  const cubedDelta = upper * upper * upper - from * from * from;
  return (
    until * (0.5 * slope * squaredDelta + intercept * (upper - from)) -
    (slope * cubedDelta) / 3 -
    0.5 * intercept * squaredDelta
  );
}

/**
 * Integrates a normalized acceleration envelope twice far enough to obtain
 * displacement. Unlike multiplying an already-computed gravity position by a
 * fading weight, this preserves velocity and cannot pull a particle backward
 * when the force releases.
 */
export function integratedBehaviorEnvelope(
  envelope: BehaviorEnvelopeSettings,
  progress: number,
): number {
  const time = clamp01(progress);
  if (!envelope.enabled) return 0.5 * time * time;
  const start = clamp01(envelope.start);
  const attackEnd = Math.max(start, clamp01(envelope.attackEnd));
  const releaseStart = Math.max(attackEnd, clamp01(envelope.releaseStart));
  const end = Math.max(releaseStart, clamp01(envelope.end));
  let displacement = 0;
  if (attackEnd > start)
    displacement += integrateLinearEnvelopeSegment(
      time,
      start,
      attackEnd,
      0,
      1,
    );
  if (releaseStart > attackEnd)
    displacement += integrateLinearEnvelopeSegment(
      time,
      attackEnd,
      releaseStart,
      1,
      1,
    );
  if (end > releaseStart)
    displacement += integrateLinearEnvelopeSegment(
      time,
      releaseStart,
      end,
      1,
      0,
    );
  return displacement;
}

export function movementProgress(progress: number, drag: number): number {
  const time = clamp01(progress);
  const strength = clamp01(drag) * 4;
  if (strength < 0.0001) return time;
  return (1 - Math.exp(-strength * time)) / (1 - Math.exp(-strength));
}

export function evaluateBehavior(
  behavior: BehaviorSettings,
  elapsedMs: number,
  durationMs: number,
  seed: number,
): EvaluatedBehavior {
  const seconds = Math.max(0, elapsedMs) / 1000;
  const durationSeconds = Math.max(0.001, durationMs / 1000);
  const lifetimeProgress = clamp01(elapsedMs / Math.max(1, durationMs));
  let x = 0;
  let y =
    behavior.physics.gravity *
    durationSeconds *
    durationSeconds *
    integratedBehaviorEnvelope(
      behavior.physics.gravityEnvelope,
      lifetimeProgress,
    );
  let rotation = 0;
  let scaleMultiplier = 1;
  let opacityMultiplier = 1;

  if (behavior.pulse.enabled) {
    const wave = Math.sin(seconds * behavior.pulse.speed * Math.PI * 2);
    const strength = behaviorEnvelopeWeight(
      behavior.pulse.envelope,
      lifetimeProgress,
    );
    scaleMultiplier = Math.max(0, 1 + behavior.pulse.scale * wave * strength);
    opacityMultiplier *= Math.max(
      0,
      1 + behavior.pulse.opacity * wave * strength,
    );
  }

  if (behavior.flicker.enabled) {
    const phase = seconds * behavior.flicker.speed;
    const step = Math.floor(phase);
    const fraction = phase - step;
    const smooth = fraction * fraction * (3 - 2 * fraction);
    const randomWave =
      seededRandom(seed, 1000 + step) * (1 - smooth) +
      seededRandom(seed, 1001 + step) * smooth;
    const regularWave = (1 - Math.cos(phase * Math.PI * 2)) / 2;
    const wave =
      regularWave +
      (randomWave - regularWave) * clamp01(behavior.flicker.randomness);
    const strength = behaviorEnvelopeWeight(
      behavior.flicker.envelope,
      lifetimeProgress,
    );
    opacityMultiplier *= Math.max(
      0,
      1 - behavior.flicker.amount * wave * strength,
    );
  }

  if (behavior.wobble.enabled) {
    const strength = behaviorEnvelopeWeight(
      behavior.wobble.envelope,
      lifetimeProgress,
    );
    if (behavior.wobble.style === "organic") {
      const phase = seconds * Math.max(0.05, behavior.wobble.speed);
      x +=
        anchoredOrganicNoise(seed, 2100, phase, behavior.wobble.smoothness) *
        behavior.wobble.x *
        strength;
      y +=
        anchoredOrganicNoise(
          seed,
          3100,
          phase * 1.07,
          behavior.wobble.smoothness,
        ) *
        behavior.wobble.y *
        strength;
      rotation +=
        anchoredOrganicNoise(
          seed,
          4100,
          phase * 0.83,
          behavior.wobble.smoothness,
        ) *
        behavior.wobble.rotation *
        strength;
    } else {
      const phase = seconds * behavior.wobble.speed * Math.PI * 2;
      x += Math.sin(phase) * behavior.wobble.x * strength;
      y += Math.sin(phase * 2) * behavior.wobble.y * strength;
      rotation += Math.sin(phase * 0.5) * behavior.wobble.rotation * strength;
    }
  }

  return { x, y, rotation, scaleMultiplier, opacityMultiplier };
}
