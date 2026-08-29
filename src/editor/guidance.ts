import type { LayerType, VfxLayer } from "../vfx/types";
import { hasEnabledRenderingEffects } from "../vfx/renderingEffectsModel";
import { isSpawnLayer } from "../vfx/types";

export const LAYER_TYPE_LABELS: Record<LayerType, string> = {
  static: "Still image",
  animated: "Animated image",
  beam: "Beam",
  burst: "Burst",
  emitter: "Repeating copies",
};

export const layerTypeLabel = (type: LayerType) => LAYER_TYPE_LABELS[type];

const seconds = (milliseconds: number) =>
  `${(milliseconds / 1000).toFixed(milliseconds % 1000 === 0 ? 0 : 1)} seconds`;

const directionLabel = (
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
) => {
  const labels = {
    random: "in random directions",
    outward: "outward from the center",
    inward: "inward toward the center",
    fixed: `at about ${Math.round(layer.spawn.directionAngle)}°`,
    tangent: "around the spawn edge",
  } as const;
  return labels[layer.spawn.direction];
};

const spawnPlacementLabel = (
  layer: Extract<VfxLayer, { type: "burst" | "emitter" }>,
) => {
  const labels: Record<string, string> = {
    point: "from one point",
    rectangle: "inside a box",
    circle: "inside a circle",
    line: "along a line",
    arc: "along a curved arc",
    mask: "inside an image silhouette",
    silhouette: "inside an image silhouette",
    "alpha-mask": "inside an image silhouette",
    "image-mask": "inside an image silhouette",
  };
  return labels[String(layer.spawn.shape)] ?? "inside its spawn area";
};

const isCopyFinishEvent = (event: VfxLayer["events"][number]) => {
  const candidate = event as unknown as Record<string, unknown>;
  return (
    candidate.scope === "copy" ||
    candidate.trigger === "copy-finish" ||
    candidate.trigger === "particle-finish"
  );
};

/** A pure, beginner-facing summary shared by the Inspector and learning UI. */
export function describeLayer(layer: VfxLayer): string {
  const name = `“${layer.name.trim() || "Unnamed"}”`;
  const timing =
    layer.startMode === "triggered"
      ? layer.timing.delay > 0
        ? `It begins ${seconds(layer.timing.delay)} after another layer triggers it and lasts ${seconds(layer.timing.duration)}.`
        : `It begins when another layer triggers it and lasts ${seconds(layer.timing.duration)}.`
      : layer.timing.delay > 0
        ? `It starts after ${seconds(layer.timing.delay)} and lasts ${seconds(layer.timing.duration)}.`
        : `It lasts ${seconds(layer.timing.duration)}.`;

  if (layer.type === "static") {
    const size = layer.transform.separateScale
      ? `${Math.round(layer.transform.startScaleX * 100)}% wide by ${Math.round(layer.transform.startScaleY * 100)}% tall`
      : `${Math.round(layer.transform.startScale * 100)}% size`;
    const appearance = layer.appearance.tint
      ? ` It uses a ${layer.appearance.tint} whole-image tint${layer.appearance.blendMode === "add" ? " with additive light mixing" : ""}.`
      : "";
    const rendering = hasEnabledRenderingEffects(layer.appearance.effects)
      ? " It also uses Experimental WebGL pixel effects, with a plain-image Canvas fallback."
      : "";
    return `${name} is a still image at ${size} and ${Math.round(layer.transform.startOpacity * 100)}% opacity. ${timing}${appearance}${rendering}`;
  }

  if (layer.type === "beam") {
    const length = Math.round(Math.hypot(layer.beam.endX, layer.beam.endY));
    const extras = [
      layer.appearance.blendMode === "add" ? "additive blending" : null,
      layer.behavior.flicker.enabled ? "flicker" : null,
      hasEnabledRenderingEffects(layer.appearance.effects)
        ? "Experimental WebGL pixel effects"
        : null,
    ].filter(Boolean);
    return `${name} fits one left-to-right image across a ${length} px connection and keeps both ends joined while it plays. ${timing}${extras.length ? ` It uses ${extras.join(", ")}.` : ""}`;
  }

  const changes: string[] = [];
  if (
    layer.transform.separateScale &&
    (layer.transform.endScaleX !== layer.transform.startScaleX ||
      layer.transform.endScaleY !== layer.transform.startScaleY)
  )
    changes.push(
      `changes from ${Math.round(layer.transform.startScaleX * 100)}% × ${Math.round(layer.transform.startScaleY * 100)}% to ${Math.round(layer.transform.endScaleX * 100)}% × ${Math.round(layer.transform.endScaleY * 100)}% size`,
    );
  else if (
    !layer.transform.separateScale &&
    layer.transform.endScale !== layer.transform.startScale
  )
    changes.push(
      `${layer.transform.endScale > layer.transform.startScale ? "grows" : "shrinks"} from ${Math.round(layer.transform.startScale * 100)}% to ${Math.round(layer.transform.endScale * 100)}%`,
    );
  if (layer.motionPath.enabled)
    changes.push(
      `follows a ${layer.motionPath.mode === "custom" ? "waypoint" : layer.motionPath.mode} path`,
    );
  else if (layer.transform.movementX || layer.transform.movementY)
    changes.push(
      `moves ${Math.round(layer.transform.movementX)} px horizontally and ${Math.round(layer.transform.movementY)} px vertically`,
    );
  if (layer.transform.endOpacity !== layer.transform.startOpacity)
    changes.push(
      `${layer.transform.endOpacity < layer.transform.startOpacity ? "fades" : "brightens"} from ${Math.round(layer.transform.startOpacity * 100)}% to ${Math.round(layer.transform.endOpacity * 100)}% opacity`,
    );
  if (layer.transform.rotationDuring)
    changes.push(`turns ${Math.round(layer.transform.rotationDuring)}°`);

  const opening = isSpawnLayer(layer)
    ? layer.type === "burst"
      ? `${name} releases ${layer.spawn.count} copies at once ${spawnPlacementLabel(layer)}, moving ${directionLabel(layer)}.`
      : `${name} creates ${layer.spawn.count} ${layer.spawn.count === 1 ? "copy" : "copies"} every ${Math.round(layer.spawn.intervalMin)}–${Math.round(layer.spawn.intervalMax)} ms ${spawnPlacementLabel(layer)}, up to ${layer.spawn.maxAlive} alive, moving ${directionLabel(layer)}.`
    : `${name} is one animated image${changes.length ? ` that ${changes.join(", ")}` : ""}.`;
  const copyChanges =
    isSpawnLayer(layer) && changes.length
      ? ` Each copy ${changes.join(", ")}.`
      : "";

  const extras: string[] = [];
  if (layer.appearance.colorOverLifetime.enabled)
    extras.push("changes whole-image color over time");
  else if (layer.appearance.tint) extras.push("uses a whole-image tint");
  if (layer.appearance.blendMode === "add") extras.push("brightens overlaps");
  if (hasEnabledRenderingEffects(layer.appearance.effects))
    extras.push("uses Experimental WebGL pixel effects");
  if (layer.behavior.pulse.enabled) extras.push("pulses");
  if (layer.behavior.flicker.enabled) extras.push("flickers");
  if (layer.behavior.wobble.enabled)
    extras.push(
      layer.behavior.wobble.style === "organic"
        ? "wanders organically"
        : "gently sways",
    );
  if (layer.behavior.physics.gravity) extras.push("falls under gravity");
  if (layer.behavior.physics.drag) extras.push("slows along its route");
  if (layer.trail.enabled) extras.push("leaves fading trail copies");
  if (layer.keyframes.enabled) extras.push("uses multiple transform keyframes");
  const enabledEvents = layer.events.filter((event) => event.enabled);
  if (enabledEvents.some(isCopyFinishEvent))
    extras.push(
      "plays another layer where each original copy finishes, within a safety limit",
    );
  if (enabledEvents.some((event) => !isCopyFinishEvent(event)))
    extras.push("starts another layer at a chosen layer moment");

  const repeat =
    layer.timing.repeatForever || layer.timing.loop
      ? " It repeats continuously."
      : layer.timing.repeat > 0
        ? ` It repeats ${layer.timing.repeat} extra ${layer.timing.repeat === 1 ? "time" : "times"}.`
        : "";
  return `${opening}${copyChanges} ${timing}${repeat}${extras.length ? ` It also ${extras.join(", ")}.` : ""}`;
}

export const PRODUCT_BOUNDARY = [
  {
    area: "Asset creation",
    use: "Draw smoke puffs, lightning, splatters, runes, silhouettes, texture, and painted highlights in Krita or Aseprite.",
  },
  {
    area: "VFX behavior",
    use: "Use Vvfx to move, grow, fade, tint, repeat, scatter, pulse, flicker, drift, and combine those images over time.",
  },
  {
    area: "Image silhouette spawning",
    use: "Use an imported image's visible pixels as a deterministic placement stencil. Vvfx does not paint, repair, or visually mask the source art.",
  },
  {
    area: "Canvas only",
    use: "Preview backgrounds, the grid, selection outlines, and zoom help you work but are never exported into the effect.",
  },
  {
    area: "Advanced rendering",
    use: "Try WebGL clipping masks, blur, glow, brightness, shine, gradients, straight-wipe or noisy erosion, and sprite-local warp in Experimental rendering. True scene-behind refraction remains decision-deferred because it needs game-camera capture.",
  },
] as const;

export const VFX_GLOSSARY = [
  [
    "Additive blend",
    "Brightens pixels where images overlap. It is not a soft blur or outer halo.",
  ],
  [
    "Burst",
    "Creates several copies at one moment, such as impact sparks or debris.",
  ],
  [
    "Emitter",
    "The game-engine term for a layer that keeps creating copies over time.",
  ],
  [
    "Behavior envelope",
    "Fades pulse, flicker, wandering, or gravity in and out inside each copy's existing lifetime. It is not another Timeline.",
  ],
  [
    "Curve",
    "Controls how a value changes while a layer is alive. Vvfx keeps these property moments on the main Timeline.",
  ],
  [
    "Easing",
    "Controls whether a change starts quickly, ends gently, bounces, or overshoots.",
  ],
  [
    "Event",
    "Lets one layer start or restart another at a chosen layer moment. A copy-finish event can instead play a bounded target where each original copy ends.",
  ],
  [
    "Effect template",
    "A reusable editable copy of a complete effect, group, or layer plus the images it uses. It inserts at the playhead; it is smaller than a full project.",
  ],
  [
    "Template pack",
    "One portable file containing several effect templates. Share one effect as .vvfx-template; back up the whole local library as .vvfx-templates.",
  ],
  [
    "Copy-finish event",
    "Plays a target where each original burst or repeating copy finishes. A finite, unattached Triggered Animated image or Burst is the recommended target; trails do not trigger it.",
  ],
  [
    "Image silhouette",
    "An imported image whose visible pixels act as a spawn-position stencil. It does not crop or recolor the spawned artwork.",
  ],
  [
    "Spatial event origin",
    "The final position carried by a copy-finish event. The target layer's normal position and timing are evaluated relative to that point.",
  ],
  [
    "Experimental",
    "A usable feature that saves and exports but still needs compatibility and performance feedback. Experimental pixel effects fall back to the plain, unmasked and un-eroded image without WebGL.",
  ],
  [
    "Flipbook",
    "Several animation frames stored in one image and played quickly in order.",
  ],
  [
    "Motion path",
    "The route an image follows. A trail is the fading copies left behind.",
  ],
  [
    "Straight wipe",
    "Erases an image with one soft moving line during its existing lifetime. It does not use irregular noise patches.",
  ],
  [
    "Noise erosion",
    "Erases one sprite in irregular, repeatable patches using seeded procedural noise. It changes visible pixels, not where copies spawn.",
  ],
  [
    "Image distortion",
    "Bends one sprite's own pixels. It does not bend the game world behind that sprite.",
  ],
  [
    "Visual mask",
    "A separate still image that clips another sprite's visible pixels. This changes what is drawn; an image silhouette only chooses where copies begin.",
  ],
  [
    "Organic movement",
    "Seeded natural wandering that stays repeatable when you scrub or replay the effect.",
  ],
  [
    "Sprite sheet",
    "One image file containing several hand-drawn animation frames in a grid.",
  ],
  [
    "Stress test",
    "Shows several preview copies at once to help judge repeated gameplay use.",
  ],
  [
    "Trail",
    "Fading copies left behind something moving quickly, such as a bolt, slash, or rocket.",
  ],
  [
    "Tint",
    "A color applied to the entire image. It does not paint a gradient across the image.",
  ],
  [
    "WebGL",
    "The browser and game rendering mode used by Experimental pixel effects. Canvas mode keeps the ordinary sprite as a safe fallback.",
  ],
] as const;

export const ASSET_PREP_CHECKLIST = [
  "Export a transparent PNG or WebP.",
  "Use white or grayscale artwork when you want flexible tinting.",
  "Leave visible padding around soft edges so they are not clipped.",
  "For streaks and arrows, note whether the artwork points right, up, down, or left so movement alignment can turn it correctly.",
  "Use a sprite sheet when the drawing itself must change frame by frame.",
  "For image silhouette spawning, make the intended spawn area visible and everything else transparent; the image is a placement stencil, not a visual mask.",
  "For a visual mask, use a still PNG or WebP. Opacity mode reads transparency; Brightness mode reads dark and light pixels. Sprite-sheet masks are not supported.",
] as const;
