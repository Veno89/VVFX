import { createExampleProject, createLayer, makeId } from "./defaults";
import { reconcileRenderingEffectClips } from "./renderingEffects";
import type { VfxLayer } from "./types";

function addPresetRenderingEffectClips(layer: VfxLayer): VfxLayer {
  layer.appearance.effectClips = reconcileRenderingEffectClips(
    layer.appearance.effects,
    layer.appearance.effectClips,
    (effect) => makeId(`effect-${effect}`),
  );
  return layer;
}

export interface LayerPreset {
  id: string;
  name: string;
  description: string;
  goodFor: string;
  maturity?: "experimental";
  create: (assetId?: string | null) => VfxLayer;
}

export interface CompositionPreset {
  id: string;
  name: string;
  description: string;
  ingredients: string[];
  lesson: string;
  create: () => VfxLayer[];
}

export const COMPOSITION_PRESETS: CompositionPreset[] = [
  {
    id: "magic-impact",
    name: "Magic impact",
    description:
      "Combines a flash, shockwave ring, outward sparks, and a delayed smoke tail.",
    ingredients: ["Flash", "Ring", "Sparks", "Smoke"],
    lesson:
      "The hit feels complete because each simple layer owns one visual job and starts on a slightly different beat.",
    create: () => createExampleProject().layers,
  },
  {
    id: "critical-hit",
    name: "Critical hit",
    description:
      "Choreographs a tiny flash, overshooting red splatter, exploding ring, and outward droplets across 700 ms.",
    ingredients: ["Contact flash", "Main splatter", "Impact ring", "Droplets"],
    lesson:
      "The property moments make the splatter grow too large in the first instant, settle by 250 ms, then fade more slowly.",
    create: () => {
      const flash = createLayer("animated", "Contact flash", "builtin-flash");
      flash.timing = { ...flash.timing, duration: 60, easing: "fast-slow" };
      flash.transform = {
        ...flash.transform,
        startScale: 0.25,
        endScale: 1.25,
        startOpacity: 1,
        endOpacity: 0,
      };
      flash.appearance = {
        ...flash.appearance,
        tint: "#fff7f4",
        blendMode: "add",
      };

      const splatter = createLayer(
        "animated",
        "Main splatter",
        "builtin-cloud",
      );
      splatter.timing = {
        ...splatter.timing,
        duration: 700,
        easing: "smooth",
      };
      splatter.transform = {
        ...splatter.transform,
        startScale: 0.28,
        endScale: 1,
        startOpacity: 1,
        endOpacity: 0,
        rotation: -8,
      };
      splatter.keyframes = {
        enabled: true,
        initialized: true,
        frames: [
          { time: 0, scaleX: 0.28, scaleY: 0.28, opacity: 1, rotation: 0 },
          { time: 0.06, scaleX: 1.34, scaleY: 1.34, opacity: 1, rotation: 4 },
          { time: 0.18, scaleX: 1.08, scaleY: 1.08, opacity: 1, rotation: 1 },
          { time: 0.36, scaleX: 1, scaleY: 1, opacity: 0.92, rotation: 0 },
          { time: 1, scaleX: 1, scaleY: 1, opacity: 0, rotation: 0 },
        ],
      };
      splatter.appearance = {
        ...splatter.appearance,
        tint: "#b61e2e",
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#ff5263" },
            { time: 0.35, color: "#b61e2e" },
            { time: 1, color: "#54131e" },
          ],
        },
      };

      const ring = createLayer("animated", "Impact ring", "builtin-ring");
      ring.timing = {
        ...ring.timing,
        delay: 20,
        duration: 120,
        easing: "fast-slow",
      };
      ring.transform = {
        ...ring.transform,
        startScale: 0.15,
        endScale: 2.25,
        startOpacity: 0.9,
        endOpacity: 0,
      };
      ring.appearance = {
        ...ring.appearance,
        tint: "#ff4355",
        blendMode: "add",
      };

      const droplets = createLayer("burst", "Droplets", "builtin-spark");
      droplets.timing = {
        ...droplets.timing,
        delay: 40,
        duration: 250,
        easing: "fast-slow",
      };
      droplets.transform = {
        ...droplets.transform,
        startScale: 0.38,
        endScale: 0.08,
        movementX: 80,
        endOpacity: 0,
      };
      droplets.spawn = {
        ...droplets.spawn,
        count: 7,
        shape: "circle",
        distribution: "edge",
        radius: 8,
        direction: "outward",
        rotateToDirection: true,
      };
      droplets.random = {
        ...droplets.random,
        movementX: 40,
        movementY: 32,
        startScale: 0.14,
      };
      droplets.appearance = {
        ...droplets.appearance,
        tint: "#8f1725",
      };
      return [flash, splatter, ring, droplets];
    },
  },
  {
    id: "poison-ooze",
    name: "Poison ooze",
    description:
      "Builds a complete puddle recipe from a base, rising bubbles, toxic smoke, and an occasional pop.",
    ingredients: [
      "Ooze base",
      "Rising bubbles",
      "Toxic smoke",
      "Occasional pop",
    ],
    lesson:
      "A still base anchors the effect while several slower repeating layers make the surface feel alive.",
    create: () => {
      const base = createLayer("static", "Ooze base", "builtin-cloud");
      base.transform = {
        ...base.transform,
        y: 34,
        startScale: 1.35,
        endScale: 1.35,
        startScaleX: 1.5,
        startScaleY: 0.55,
        endScaleX: 1.5,
        endScaleY: 0.55,
        separateScale: true,
      };
      base.appearance = { ...base.appearance, tint: "#5bd34d" };

      const bubbles = LAYER_PRESETS.find(
        (preset) => preset.id === "bubble",
      )!.create();
      bubbles.name = "Rising bubbles";
      bubbles.parentId = base.id;

      const smoke = createLayer("emitter", "Toxic smoke", "builtin-cloud");
      smoke.parentId = base.id;
      smoke.transform = {
        ...smoke.transform,
        y: -4,
        startScale: 0.25,
        endScale: 0.9,
        startOpacity: 0.38,
        endOpacity: 0,
        movementY: -76,
      };
      smoke.timing = {
        ...smoke.timing,
        delay: 280,
        duration: 1500,
        easing: "fast-slow",
      };
      smoke.random = {
        ...smoke.random,
        positionX: 45,
        movementX: 24,
        startScale: 0.12,
        duration: 280,
      };
      smoke.spawn = {
        ...smoke.spawn,
        count: 1,
        intervalMin: 520,
        intervalMax: 980,
        maxAlive: 8,
        shape: "circle",
        radius: 42,
      };
      smoke.appearance = {
        ...smoke.appearance,
        tint: "#7fdc5c",
        blendMode: "add",
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#c8ff78" },
            { time: 0.55, color: "#61d84f" },
            { time: 1, color: "#385c42" },
          ],
        },
      };
      smoke.behavior.wobble = {
        ...smoke.behavior.wobble,
        enabled: true,
        x: 18,
        y: 4,
        rotation: 5,
        speed: 0.8,
        style: "organic",
      };

      const pop = LAYER_PRESETS.find((preset) => preset.id === "pop")!.create();
      if (pop.type !== "burst")
        throw new Error("Bubble pop preset must be a burst layer.");
      pop.name = "Occasional pop";
      pop.parentId = base.id;
      pop.timing = {
        ...pop.timing,
        delay: 820,
        repeatForever: true,
        loop: false,
        duration: 900,
      };
      pop.spawn = { ...pop.spawn, count: 5, shape: "circle", radius: 28 };
      pop.appearance = { ...pop.appearance, tint: "#b4ff66", blendMode: "add" };
      pop.startMode = "triggered";
      bubbles.events = [
        {
          id: "poison-bubble-pop",
          enabled: true,
          trigger: "repeat",
          percentage: 0.99,
          action: "play",
          targetLayerId: pop.id,
          chance: 1,
          maxTriggers: 32,
        },
      ];
      return [base, bubbles, smoke, pop];
    },
  },
  {
    id: "fire-impact",
    name: "Fire impact",
    description:
      "Layers a hot flash, a fast spark burst, and flickering smoke that rises after the hit.",
    ingredients: ["Hot flash", "Ember sparks", "Fire smoke"],
    lesson:
      "Fast bright pieces sell the impact first; darker, slower smoke carries the aftermath.",
    create: () => {
      const flash = LAYER_PRESETS.find(
        (preset) => preset.id === "impact",
      )!.create();
      flash.name = "Hot flash";
      flash.appearance = {
        ...flash.appearance,
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#fff6b0" },
            { time: 0.45, color: "#ff9d2e" },
            { time: 1, color: "#e33c24" },
          ],
        },
      };
      flash.behavior.flicker = {
        ...flash.behavior.flicker,
        enabled: true,
        amount: 0.2,
        speed: 14,
        randomness: 0.55,
      };

      const sparks = LAYER_PRESETS.find(
        (preset) => preset.id === "sparks",
      )!.create();
      sparks.name = "Ember sparks";
      sparks.timing = { ...sparks.timing, delay: 35 };

      const smoke = createLayer("burst", "Fire smoke", "builtin-cloud");
      smoke.transform = {
        ...smoke.transform,
        y: 8,
        startScale: 0.28,
        endScale: 1.05,
        startOpacity: 0.48,
        endOpacity: 0,
        movementY: -82,
      };
      smoke.timing = { ...smoke.timing, delay: 180, duration: 1450 };
      smoke.spawn = {
        ...smoke.spawn,
        count: 4,
        shape: "rectangle",
        distribution: "clustered",
        width: 48,
        height: 12,
        direction: "fixed",
        directionAngle: -90,
        directionSpread: 22,
      };
      smoke.appearance = {
        ...smoke.appearance,
        tint: "#5f5350",
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#ff9d3c" },
            { time: 0.22, color: "#8d5544" },
            { time: 1, color: "#3d4149" },
          ],
        },
      };
      smoke.behavior.wobble = {
        ...smoke.behavior.wobble,
        enabled: true,
        x: 16,
        y: 3,
        rotation: 7,
        speed: 0.9,
        style: "organic",
      };
      smoke.behavior.flicker = {
        ...smoke.behavior.flicker,
        enabled: true,
        amount: 0.12,
        speed: 7,
        randomness: 0.8,
      };
      return [flash, sparks, smoke];
    },
  },
  {
    id: "healing-aura",
    name: "Healing aura",
    description:
      "Combines a breathing ring with evenly spaced rising motes and a soft center glow.",
    ingredients: ["Breathing ring", "Healing motes", "Soft center"],
    lesson:
      "Slow repetition and gentle vertical movement read as sustained support rather than a sharp hit.",
    create: () => {
      const ring = LAYER_PRESETS.find(
        (preset) => preset.id === "shockwave",
      )!.create();
      ring.name = "Breathing ring";
      ring.transform = {
        ...ring.transform,
        startScale: 0.75,
        endScale: 1.25,
        startOpacity: 0.65,
        endOpacity: 0.2,
      };
      ring.timing = {
        ...ring.timing,
        duration: 1500,
        yoyo: true,
        repeatForever: true,
      };
      ring.appearance = {
        ...ring.appearance,
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#72ffb2" },
            { time: 0.5, color: "#c8fff0" },
            { time: 1, color: "#72dfff" },
          ],
        },
      };
      ring.behavior.pulse = {
        ...ring.behavior.pulse,
        enabled: true,
        scale: 0.08,
        opacity: 0.12,
        speed: 1.2,
      };

      const motes = LAYER_PRESETS.find(
        (preset) => preset.id === "motes",
      )!.create();
      if (motes.type !== "emitter")
        throw new Error("Motes preset must be a repeating layer.");
      motes.name = "Healing motes";
      motes.spawn = {
        ...motes.spawn,
        shape: "circle",
        radius: 58,
        distribution: "even",
        count: 6,
        intervalMin: 520,
        intervalMax: 720,
      };
      motes.appearance = { ...motes.appearance, tint: "#8dffcb" };

      const center = createLayer("animated", "Soft center", "builtin-flash");
      center.transform = {
        ...center.transform,
        startScale: 0.35,
        endScale: 0.55,
        startOpacity: 0.35,
        endOpacity: 0.1,
      };
      center.timing = {
        ...center.timing,
        duration: 1300,
        yoyo: true,
        repeatForever: true,
      };
      center.appearance = {
        ...center.appearance,
        tint: "#baffdf",
        blendMode: "add",
      };
      return [ring, motes, center];
    },
  },
  {
    id: "projectile-trail",
    name: "Magic projectile",
    description:
      "Moves one streak along a curved route, leaves fading copies, then triggers an impact flash.",
    ingredients: [
      "Moving streak",
      "Curved motion path",
      "Fading afterimages",
      "Triggered impact",
    ],
    lesson:
      "Path means where the artwork moves; trail means the fading copies it leaves behind; the finish event starts the impact.",
    create: () => {
      const projectile = createLayer(
        "animated",
        "Moving streak",
        "builtin-spark",
      );
      projectile.transform = {
        ...projectile.transform,
        startScale: 0.7,
        endScale: 0.4,
        movementX: 260,
        movementY: -40,
        startOpacity: 1,
        endOpacity: 0.15,
      };
      projectile.timing = {
        ...projectile.timing,
        duration: 1100,
        easing: "smooth",
      };
      projectile.motionPath = {
        ...projectile.motionPath,
        enabled: true,
        mode: "curve",
        controlX: 100,
        controlY: -160,
        orientToPath: true,
      };
      projectile.trail = {
        ...projectile.trail,
        enabled: true,
        count: 8,
        spacing: 55,
        lifetime: 480,
        opacity: 0.5,
      };
      projectile.appearance = {
        ...projectile.appearance,
        tint: "#8be9ff",
        blendMode: "add",
      };
      const impact = createLayer("animated", "Impact flash", "builtin-flash");
      impact.startMode = "triggered";
      impact.timing = { ...impact.timing, duration: 220, easing: "fast-slow" };
      impact.transform = {
        ...impact.transform,
        x: 260,
        y: -40,
        startScale: 0.15,
        endScale: 1.4,
        endOpacity: 0,
      };
      impact.appearance = {
        ...impact.appearance,
        tint: "#b8f4ff",
        blendMode: "add",
      };
      projectile.events = [
        {
          id: "projectile-impact",
          enabled: true,
          trigger: "finish",
          percentage: 0.99,
          action: "restart",
          targetLayerId: impact.id,
          chance: 1,
          maxTriggers: 32,
        },
      ];
      return [projectile, impact];
    },
  },
  {
    id: "spark-to-smoke-firework",
    name: "Spark-to-smoke firework",
    description:
      "Launches a bounded spark burst, then places a small smoke puff where selected sparks finish.",
    ingredients: ["Firework sparks", "Copy-finish event", "Triggered smoke"],
    lesson:
      "Copy-finish carries each spark endpoint into a finite Triggered layer; Chance and Max triggers keep the secondary effect controlled.",
    create: () => {
      const sparks = createLayer("burst", "Firework sparks", "builtin-spark");
      sparks.timing = {
        ...sparks.timing,
        duration: 760,
        easing: "fast-slow",
      };
      sparks.transform = {
        ...sparks.transform,
        startScale: 0.55,
        endScale: 0.08,
        movementX: 145,
        endOpacity: 0,
      };
      sparks.spawn = {
        ...sparks.spawn,
        count: 12,
        shape: "circle",
        distribution: "edge",
        radius: 8,
        direction: "outward",
        rotateToDirection: true,
      };
      sparks.random = {
        ...sparks.random,
        movementX: 55,
        movementY: 42,
        duration: 100,
        startScale: 0.16,
      };
      sparks.appearance = {
        ...sparks.appearance,
        blendMode: "add",
        tint: "#ffc45d",
      };
      sparks.behavior.physics = {
        ...sparks.behavior.physics,
        gravity: 210,
        drag: 0.25,
      };

      const smoke = createLayer("animated", "Endpoint smoke", "builtin-cloud");
      smoke.startMode = "triggered";
      smoke.timing = {
        ...smoke.timing,
        duration: 920,
        easing: "fast-slow",
      };
      smoke.transform = {
        ...smoke.transform,
        startScale: 0.18,
        endScale: 0.62,
        startOpacity: 0.42,
        endOpacity: 0,
        movementY: -34,
      };
      smoke.random = {
        ...smoke.random,
        movementX: 16,
        rotation: 14,
        startScale: 0.08,
      };
      smoke.appearance = { ...smoke.appearance, tint: "#707784" };
      smoke.behavior.wobble = {
        ...smoke.behavior.wobble,
        enabled: true,
        x: 8,
        y: 2,
        rotation: 4,
        speed: 0.75,
        style: "organic",
      };
      sparks.events = [
        {
          id: "firework-spark-smoke",
          enabled: true,
          trigger: "copy-finish",
          percentage: 0.99,
          action: "play",
          targetLayerId: smoke.id,
          chance: 0.65,
          maxTriggers: 8,
        },
      ];
      return [sparks, smoke];
    },
  },
];

export const LAYER_PRESETS: LayerPreset[] = [
  {
    id: "impact",
    name: "Impact flash",
    description:
      "Appears instantly, grows fast, then disappears. A bright first beat for a hit.",
    goodFor: "hits, magic casts, explosions",
    create: (assetId = "builtin-flash") => {
      const layer = createLayer("animated", "Impact flash", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.15,
        endScale: 1.65,
        endOpacity: 0,
      };
      layer.timing = { ...layer.timing, duration: 300, easing: "fast-slow" };
      layer.appearance = {
        ...layer.appearance,
        blendMode: "add",
        tint: "#ffe9a8",
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#ffffff" },
            { time: 0.45, color: "#ffe89a" },
            { time: 1, color: "#ff9652" },
          ],
        },
      };
      return layer;
    },
  },
  {
    id: "shockwave",
    name: "Shockwave",
    description: "Starts small, expands rapidly, and fades into the scene.",
    goodFor: "impacts, spells, landings",
    create: (assetId = "builtin-ring") => {
      const layer = createLayer("animated", "Shockwave", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.2,
        endScale: 2.2,
        endOpacity: 0,
      };
      layer.timing = { ...layer.timing, duration: 720, easing: "fast-slow" };
      layer.appearance = {
        ...layer.appearance,
        blendMode: "add",
        tint: "#7be7ff",
      };
      return layer;
    },
  },
  {
    id: "sparks",
    name: "Sparks",
    description:
      "Throws a small group outward with varied speed, size, and direction.",
    goodFor: "hits, metal, fire, energy",
    create: (assetId = "builtin-spark") => {
      const layer = createLayer("burst", "Sparks", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.7,
        endScale: 0.1,
        movementX: 130,
        endOpacity: 0,
      };
      layer.random = {
        ...layer.random,
        startScale: 0.25,
        movementX: 70,
        movementY: 45,
        rotation: 15,
        duration: 160,
      };
      layer.spawn = {
        ...layer.spawn,
        count: 12,
        direction: "outward",
        shape: "circle",
        radius: 8,
        distribution: "edge",
        rotateToDirection: true,
      };
      layer.timing = { ...layer.timing, duration: 620, easing: "fast-slow" };
      layer.appearance = {
        ...layer.appearance,
        blendMode: "add",
        tint: "#ffb44a",
        colorOverLifetime: {
          enabled: true,
          stops: [
            { time: 0, color: "#fff3a8" },
            { time: 0.5, color: "#ffad38" },
            { time: 1, color: "#dc4a25" },
          ],
        },
      };
      layer.behavior.physics = {
        ...layer.behavior.physics,
        gravity: 320,
        drag: 0.55,
      };
      return layer;
    },
  },
  {
    id: "smoke",
    name: "Smoke wisp",
    description:
      "Slowly rises, grows, and fades. A little sideways variation keeps it natural.",
    goodFor: "smoke, steam, poison, dust",
    create: (assetId = "builtin-cloud") => {
      const layer = createLayer("animated", "Smoke wisp", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.55,
        endScale: 1.35,
        startOpacity: 0.62,
        endOpacity: 0,
        movementY: -75,
      };
      layer.random = {
        ...layer.random,
        movementX: 18,
        duration: 240,
        rotation: 12,
      };
      layer.timing = { ...layer.timing, duration: 1350, easing: "fast-slow" };
      layer.appearance = { ...layer.appearance, tint: "#aab4c3" };
      layer.behavior.wobble = {
        ...layer.behavior.wobble,
        enabled: true,
        x: 14,
        y: 3,
        rotation: 6,
        speed: 0.75,
        style: "organic",
      };
      return layer;
    },
  },
  {
    id: "motes",
    name: "Floating motes",
    description:
      "Creates soft specks again and again with gentle, varied movement.",
    goodFor: "ambient magic, dust, embers",
    create: (assetId = "builtin-flash") => {
      const layer = createLayer("emitter", "Floating motes", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.12,
        endScale: 0.05,
        startOpacity: 0.75,
        endOpacity: 0,
        movementY: -55,
      };
      layer.random = {
        ...layer.random,
        positionX: 80,
        positionY: 25,
        movementX: 35,
        movementY: 25,
        startScale: 0.08,
        duration: 450,
      };
      layer.spawn = {
        ...layer.spawn,
        count: 1,
        intervalMin: 180,
        intervalMax: 420,
        maxAlive: 24,
        shape: "rectangle",
        width: 180,
        height: 60,
      };
      layer.timing = { ...layer.timing, duration: 1600, easing: "smooth" };
      layer.appearance = {
        ...layer.appearance,
        blendMode: "add",
        tint: "#8af6ff",
      };
      layer.behavior.pulse = {
        ...layer.behavior.pulse,
        enabled: true,
        scale: 0.15,
        opacity: 0.2,
        speed: 1.6,
      };
      return layer;
    },
  },
  {
    id: "bubble",
    name: "Bubble",
    description:
      "Starts tiny, grows while rising, and drifts slightly to one side.",
    goodFor: "poison, water, potions",
    create: (assetId = "builtin-ring") => {
      const layer = createLayer("emitter", "Bubbles", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.12,
        endScale: 0.48,
        startOpacity: 0.72,
        endOpacity: 0,
        movementY: -48,
      };
      layer.random = {
        ...layer.random,
        positionX: 32,
        startScale: 0.08,
        movementX: 13,
        duration: 240,
        delay: 120,
      };
      layer.spawn = {
        ...layer.spawn,
        count: 1,
        intervalMin: 380,
        intervalMax: 850,
        maxAlive: 10,
        shape: "circle",
        radius: 38,
      };
      layer.timing = { ...layer.timing, duration: 1100, easing: "smooth" };
      layer.appearance = {
        ...layer.appearance,
        tint: "#9cff72",
        blendMode: "add",
      };
      layer.behavior.wobble = {
        ...layer.behavior.wobble,
        enabled: true,
        x: 11,
        y: 3,
        rotation: 4,
        speed: 1.1,
        style: "organic",
      };
      return layer;
    },
  },
  {
    id: "pop",
    name: "Bubble pop",
    description:
      "A tiny, quick burst that sends droplets away from the center.",
    goodFor: "bubbles, splashes, slime",
    create: (assetId = "builtin-spark") => {
      const layer = createLayer("burst", "Bubble pop", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.22,
        endScale: 0.05,
        movementX: 55,
        endOpacity: 0,
      };
      layer.random = {
        ...layer.random,
        movementX: 28,
        movementY: 20,
        startScale: 0.08,
      };
      layer.spawn = {
        ...layer.spawn,
        count: 7,
        direction: "outward",
        rotateToDirection: true,
      };
      layer.timing = { ...layer.timing, duration: 360, easing: "fast-slow" };
      return layer;
    },
  },
  {
    id: "arc-sparks",
    name: "Arc sparks",
    description:
      "Spaces directional sparks across a curved edge with precise artwork alignment.",
    goodFor: "sword swings, shields, curved impacts",
    create: (assetId = "builtin-spark") => {
      const layer = createLayer("burst", "Arc sparks", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.52,
        endScale: 0.08,
        movementX: 95,
        endOpacity: 0,
      };
      layer.spawn = {
        ...layer.spawn,
        count: 11,
        shape: "arc",
        distribution: "even",
        radius: 46,
        arcStartAngle: -155,
        arcSweep: 130,
        direction: "outward",
        rotateToDirection: true,
        artworkForwardAngle: 0,
        alignmentVariation: 7,
      };
      layer.random = {
        ...layer.random,
        movementX: 28,
        movementY: 18,
        startScale: 0.12,
      };
      layer.timing = { ...layer.timing, duration: 480, easing: "fast-slow" };
      layer.appearance = {
        ...layer.appearance,
        tint: "#ffd86b",
        blendMode: "add",
      };
      return layer;
    },
  },
  {
    id: "neon-projectile-experimental",
    name: "Neon projectile",
    description:
      "Combines a spatial gradient, real glow, animated shine, and a fading energy trail.",
    goodFor: "magic bolts, lasers, charged projectiles",
    maturity: "experimental",
    create: (assetId = "builtin-spark") => {
      const layer = createLayer("animated", "Neon projectile", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.75,
        endScale: 0.42,
        movementX: 260,
        movementY: -35,
        endOpacity: 0.12,
      };
      layer.timing = { ...layer.timing, duration: 900, easing: "smooth" };
      layer.motionPath = {
        ...layer.motionPath,
        enabled: true,
        mode: "curve",
        controlX: 115,
        controlY: -125,
        orientToPath: true,
      };
      layer.trail = {
        ...layer.trail,
        enabled: true,
        count: 8,
        spacing: 45,
        lifetime: 380,
        opacity: 0.55,
      };
      layer.appearance = {
        ...layer.appearance,
        tint: "#c5fbff",
        blendMode: "add",
      };
      layer.appearance.effects.outerGlow = {
        ...layer.appearance.effects.outerGlow,
        enabled: true,
        color: "#4de7ff",
        outerStrength: 4,
      };
      layer.appearance.effects.spatialGradient = {
        ...layer.appearance.effects.spatialGradient,
        enabled: true,
        colorA: "#ffffff",
        colorB: "#3b8cff",
        strength: 0.72,
        fromX: 0,
        fromY: 0.5,
        toX: 1,
        toY: 0.5,
      };
      layer.appearance.effects.animatedShine = {
        ...layer.appearance.effects.animatedShine,
        enabled: true,
        speed: 1.2,
        lineWidth: 0.28,
      };
      return addPresetRenderingEffectClips(layer);
    },
  },
  {
    id: "dissolving-spirit-experimental",
    name: "Dissolving spirit",
    description:
      "A tinted wisp that breaks into seeded, irregular disappearing patches.",
    goodFor: "ghosts, teleport exits, magical vanish effects",
    maturity: "experimental",
    create: (assetId = "builtin-cloud") => {
      const layer = createLayer("animated", "Dissolving spirit", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.65,
        endScale: 1.2,
        movementY: -58,
        startOpacity: 0.9,
        endOpacity: 0.75,
      };
      layer.timing = { ...layer.timing, duration: 1400, easing: "smooth" };
      layer.behavior.wobble = {
        ...layer.behavior.wobble,
        enabled: true,
        style: "organic",
        x: 15,
        y: 5,
        speed: 0.85,
      };
      layer.appearance = {
        ...layer.appearance,
        tint: "#d7eeff",
        blendMode: "add",
      };
      layer.appearance.effects.spatialGradient = {
        ...layer.appearance.effects.spatialGradient,
        enabled: true,
        colorA: "#efffff",
        colorB: "#6f63ff",
        strength: 0.8,
        fromX: 0,
        fromY: 0,
        toX: 1,
        toY: 1,
      };
      layer.appearance.effects.directionalDissolve = {
        ...layer.appearance.effects.directionalDissolve,
        enabled: true,
        pattern: "noise",
        noiseScale: 6,
        start: 0.48,
        end: 1,
        softness: 0.18,
        axis: "vertical",
        reverse: true,
      };
      return addPresetRenderingEffectClips(layer);
    },
  },
  {
    id: "masked-energy-ring-experimental",
    name: "Masked energy ring",
    description:
      "Clips a soft cloud through the Energy ring so you can see exactly what a visual mask keeps and hides.",
    goodFor: "portals, magical seals, contained energy",
    maturity: "experimental",
    create: (assetId = "builtin-cloud") => {
      const layer = createLayer("animated", "Masked energy ring", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.55,
        endScale: 1.45,
        startOpacity: 0.9,
        endOpacity: 0,
        rotationDuring: 18,
      };
      layer.timing = { ...layer.timing, duration: 1200, easing: "smooth" };
      layer.appearance = {
        ...layer.appearance,
        tint: "#a8f3ff",
        blendMode: "add",
      };
      layer.appearance.effects.visualMask = {
        ...layer.appearance.effects.visualMask,
        enabled: true,
        maskAssetId: "builtin-ring",
        channel: "alpha",
        fit: "stretch",
        strength: 1,
      };
      layer.appearance.effects.spatialGradient = {
        ...layer.appearance.effects.spatialGradient,
        enabled: true,
        colorA: "#d7fbff",
        colorB: "#765cff",
        strength: 0.72,
        fromX: 0,
        fromY: 0,
        toX: 1,
        toY: 1,
      };
      layer.appearance.effects.outerGlow = {
        ...layer.appearance.effects.outerGlow,
        enabled: true,
        color: "#67ddff",
        outerStrength: 2.6,
      };
      return addPresetRenderingEffectClips(layer);
    },
  },
  {
    id: "heat-shimmer-experimental",
    name: "Heat shimmer ring",
    description:
      "A pulsing ring whose own pixels ripple like rising heat without claiming scene refraction.",
    goodFor: "fire auras, hot impacts, unstable portals",
    maturity: "experimental",
    create: (assetId = "builtin-ring") => {
      const layer = createLayer("animated", "Heat shimmer ring", assetId);
      layer.transform = {
        ...layer.transform,
        startScale: 0.45,
        endScale: 1.55,
        startOpacity: 0.78,
        endOpacity: 0,
      };
      layer.timing = { ...layer.timing, duration: 1050, easing: "smooth" };
      layer.appearance = {
        ...layer.appearance,
        tint: "#ffb55e",
        blendMode: "add",
      };
      layer.appearance.effects.spriteWarp = {
        ...layer.appearance.effects.spriteWarp,
        enabled: true,
        mode: "heat-shimmer",
        amountX: 0.007,
        amountY: 0.004,
        speed: 2.8,
      };
      layer.appearance.effects.blur = {
        ...layer.appearance.effects.blur,
        enabled: true,
        quality: 0,
        strength: 0.6,
        steps: 1,
      };
      return addPresetRenderingEffectClips(layer);
    },
  },
];
