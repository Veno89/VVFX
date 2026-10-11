/**
 * Procedural starter artwork. Each shape is drawn white on transparency with
 * Canvas 2D and enters the project as an ordinary embedded PNG through the
 * normal upload path, so it needs no format change and plays in any runtime.
 */

export interface LibraryShape {
  id: string;
  name: string;
  /** What the shape is good for, shown under its thumbnail. */
  use: string;
  width: number;
  height: number;
  draw: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
}

type Context = CanvasRenderingContext2D;

const WHITE = "rgba(255, 255, 255, 1)";

function radialGlow(
  context: Context,
  x: number,
  y: number,
  radius: number,
  stops: Array<[number, number]>,
) {
  const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
  for (const [offset, alpha] of stops)
    gradient.addColorStop(offset, `rgba(255, 255, 255, ${alpha})`);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.fill();
}

function starPath(
  context: Context,
  cx: number,
  cy: number,
  points: number,
  outer: number,
  inner: number,
  rotation = -Math.PI / 2,
) {
  context.beginPath();
  for (let index = 0; index < points * 2; index += 1) {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = rotation + (index * Math.PI) / points;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function softStroke(context: Context, draw: () => void, width: number) {
  context.strokeStyle = "rgba(255, 255, 255, 0.22)";
  context.lineWidth = width * 3;
  draw();
  context.stroke();
  context.strokeStyle = WHITE;
  context.lineWidth = width;
  draw();
  context.stroke();
}

/** Small deterministic generator so seeded shapes look the same every time. */
function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export const LIBRARY_SHAPES: LibraryShape[] = [
  {
    id: "glow-dot",
    name: "Glow dot",
    use: "Sparks, motes, embers",
    width: 128,
    height: 128,
    draw: (context) =>
      radialGlow(context, 64, 64, 62, [
        [0, 1],
        [0.18, 0.9],
        [0.45, 0.32],
        [1, 0],
      ]),
  },
  {
    id: "hard-dot",
    name: "Hard dot",
    use: "Droplets, pixels, debris",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.arc(64, 64, 40, 0, Math.PI * 2);
      context.fill();
    },
  },
  {
    id: "soft-ring",
    name: "Soft ring",
    use: "Shockwaves, auras",
    width: 128,
    height: 128,
    draw: (context) =>
      radialGlow(context, 64, 64, 62, [
        [0, 0],
        [0.55, 0],
        [0.76, 0.95],
        [0.86, 0.45],
        [1, 0],
      ]),
  },
  {
    id: "thin-ring",
    name: "Thin ring",
    use: "Targets, ripples",
    width: 128,
    height: 128,
    draw: (context) =>
      softStroke(
        context,
        () => {
          context.beginPath();
          context.arc(64, 64, 50, 0, Math.PI * 2);
        },
        2.5,
      ),
  },
  {
    id: "double-ring",
    name: "Double ring",
    use: "Spell circles, pulses",
    width: 128,
    height: 128,
    draw: (context) => {
      softStroke(
        context,
        () => {
          context.beginPath();
          context.arc(64, 64, 54, 0, Math.PI * 2);
        },
        2,
      );
      softStroke(
        context,
        () => {
          context.beginPath();
          context.arc(64, 64, 38, 0, Math.PI * 2);
        },
        3,
      );
    },
  },
  {
    id: "shockwave",
    name: "Shockwave band",
    use: "Impacts, landings",
    width: 128,
    height: 128,
    draw: (context) =>
      radialGlow(context, 64, 64, 62, [
        [0, 0],
        [0.3, 0.05],
        [0.82, 0.55],
        [0.9, 1],
        [1, 0],
      ]),
  },
  {
    id: "star",
    name: "Star",
    use: "Pickups, magic, stuns",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      starPath(context, 64, 66, 5, 56, 23);
      context.fill();
    },
  },
  {
    id: "sparkle",
    name: "Sparkle",
    use: "Glints, twinkles",
    width: 128,
    height: 128,
    draw: (context) => {
      radialGlow(context, 64, 64, 30, [
        [0, 0.8],
        [1, 0],
      ]);
      context.fillStyle = WHITE;
      starPath(context, 64, 64, 4, 60, 7);
      context.fill();
    },
  },
  {
    id: "flare",
    name: "Cross flare",
    use: "Hits, lens glints",
    width: 128,
    height: 128,
    draw: (context) => {
      radialGlow(context, 64, 64, 34, [
        [0, 1],
        [0.3, 0.6],
        [1, 0],
      ]);
      for (const [dx, dy, length] of [
        [1, 0, 62],
        [0, 1, 62],
        [0.7071, 0.7071, 36],
        [0.7071, -0.7071, 36],
      ] as const) {
        const gradient = context.createLinearGradient(
          64 - dx * length,
          64 - dy * length,
          64 + dx * length,
          64 + dy * length,
        );
        gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
        gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.95)");
        gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
        context.strokeStyle = gradient;
        context.lineWidth = 3;
        context.beginPath();
        context.moveTo(64 - dx * length, 64 - dy * length);
        context.lineTo(64 + dx * length, 64 + dy * length);
        context.stroke();
      }
    },
  },
  {
    id: "shard",
    name: "Shard",
    use: "Glass, ice, debris",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.moveTo(118, 64);
      context.lineTo(18, 46);
      context.lineTo(34, 64);
      context.lineTo(18, 82);
      context.closePath();
      context.fill();
    },
  },
  {
    id: "diamond",
    name: "Diamond",
    use: "Gems, sparks",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.moveTo(64, 8);
      context.lineTo(100, 64);
      context.lineTo(64, 120);
      context.lineTo(28, 64);
      context.closePath();
      context.fill();
    },
  },
  {
    id: "droplet",
    name: "Droplet",
    use: "Water, blood, slime",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.moveTo(64, 10);
      context.bezierCurveTo(64, 10, 30, 58, 30, 82);
      context.arc(64, 82, 34, Math.PI, 0, true);
      context.bezierCurveTo(98, 58, 64, 10, 64, 10);
      context.fill();
    },
  },
  {
    id: "slash",
    name: "Slash arc",
    use: "Sword swings, claws",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.arc(64, 64, 56, Math.PI * 0.85, Math.PI * 2.15);
      context.arc(64, 76, 46, Math.PI * 2.1, Math.PI * 0.9, true);
      context.closePath();
      context.fill();
    },
  },
  {
    id: "streak",
    name: "Tapered streak",
    use: "Speed lines, sparks",
    width: 128,
    height: 128,
    draw: (context) => {
      const gradient = context.createLinearGradient(6, 64, 122, 64);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      gradient.addColorStop(0.75, "rgba(255, 255, 255, 0.9)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 1)");
      context.fillStyle = gradient;
      context.beginPath();
      context.moveTo(6, 64);
      context.lineTo(116, 58);
      context.arc(116, 64, 6, -Math.PI / 2, Math.PI / 2);
      context.closePath();
      context.fill();
    },
  },
  {
    id: "bolt",
    name: "Lightning bolt",
    use: "Electric hits, storms",
    width: 128,
    height: 128,
    draw: (context) => {
      const path = () => {
        context.beginPath();
        context.moveTo(74, 6);
        context.lineTo(44, 58);
        context.lineTo(68, 60);
        context.lineTo(40, 122);
        context.lineTo(90, 52);
        context.lineTo(64, 50);
        context.closePath();
      };
      context.fillStyle = "rgba(255, 255, 255, 0.25)";
      context.lineJoin = "round";
      context.strokeStyle = "rgba(255, 255, 255, 0.25)";
      context.lineWidth = 8;
      path();
      context.stroke();
      context.fillStyle = WHITE;
      path();
      context.fill();
    },
  },
  {
    id: "rune-circle",
    name: "Rune circle",
    use: "Summons, wards",
    width: 128,
    height: 128,
    draw: (context) => {
      softStroke(
        context,
        () => {
          context.beginPath();
          context.arc(64, 64, 54, 0, Math.PI * 2);
        },
        2,
      );
      context.strokeStyle = WHITE;
      context.lineWidth = 3;
      for (let tick = 0; tick < 12; tick += 1) {
        const angle = (tick * Math.PI) / 6;
        const inner = tick % 3 === 0 ? 36 : 42;
        context.beginPath();
        context.moveTo(
          64 + Math.cos(angle) * inner,
          64 + Math.sin(angle) * inner,
        );
        context.lineTo(64 + Math.cos(angle) * 50, 64 + Math.sin(angle) * 50);
        context.stroke();
      }
      context.lineWidth = 2;
      starPath(context, 64, 64, 3, 30, 30);
      context.stroke();
    },
  },
  {
    id: "hexagon",
    name: "Hexagon",
    use: "Shields, tech effects",
    width: 128,
    height: 128,
    draw: (context) =>
      softStroke(
        context,
        () => starPath(context, 64, 64, 3, 52, 52, -Math.PI / 2),
        3,
      ),
  },
  {
    id: "smoke-puff",
    name: "Smoke puff",
    use: "Dust, steam, clouds",
    width: 128,
    height: 128,
    draw: (context) => {
      const random = seededRandom(17);
      for (let index = 0; index < 9; index += 1) {
        const x = 34 + random() * 60;
        const y = 38 + random() * 52;
        radialGlow(context, x, y, 22 + random() * 16, [
          [0, 0.42],
          [1, 0],
        ]);
      }
    },
  },
  {
    id: "speck-cluster",
    name: "Speck cluster",
    use: "Glitter, dust, pollen",
    width: 128,
    height: 128,
    draw: (context) => {
      const random = seededRandom(91);
      for (let index = 0; index < 26; index += 1) {
        const angle = random() * Math.PI * 2;
        const distance = Math.sqrt(random()) * 54;
        radialGlow(
          context,
          64 + Math.cos(angle) * distance,
          64 + Math.sin(angle) * distance,
          2 + random() * 5,
          [
            [0, 1],
            [1, 0],
          ],
        );
      }
    },
  },
  {
    id: "square",
    name: "Rounded square",
    use: "Pixels, confetti, UI pops",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.roundRect(30, 30, 68, 68, 12);
      context.fill();
    },
  },
  {
    id: "heart",
    name: "Heart",
    use: "Healing, charm",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.moveTo(64, 112);
      context.bezierCurveTo(8, 72, 14, 18, 64, 40);
      context.bezierCurveTo(114, 18, 120, 72, 64, 112);
      context.fill();
    },
  },
  {
    id: "leaf",
    name: "Leaf",
    use: "Nature, wind, petals",
    width: 128,
    height: 128,
    draw: (context) => {
      context.fillStyle = WHITE;
      context.beginPath();
      context.moveTo(12, 64);
      context.quadraticCurveTo(64, 14, 116, 64);
      context.quadraticCurveTo(64, 114, 12, 64);
      context.fill();
    },
  },
  {
    id: "beam-band",
    name: "Beam band",
    use: "Beam layers, lasers",
    width: 256,
    height: 64,
    draw: (context, width) => {
      const gradient = context.createLinearGradient(0, 0, 0, 64);
      gradient.addColorStop(0, "rgba(255, 255, 255, 0)");
      gradient.addColorStop(0.35, "rgba(255, 255, 255, 0.35)");
      gradient.addColorStop(0.5, "rgba(255, 255, 255, 1)");
      gradient.addColorStop(0.65, "rgba(255, 255, 255, 0.35)");
      gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, 64);
    },
  },
];

/** Draws one shape and returns it as a PNG file ready for the upload path. */
export async function renderLibraryShape(shape: LibraryShape): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = shape.width;
  canvas.height = shape.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot draw library shapes.");
  shape.draw(context, shape.width, shape.height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png"),
  );
  if (!blob) throw new Error(`${shape.name} could not be prepared.`);
  return new File([blob], `${shape.name}.png`, { type: "image/png" });
}

export type ShapeMakerKind = "glow" | "ring" | "star";

/** Settings for a made-to-order glow, ring, or star. */
export interface ShapeMakerSettings {
  kind: ShapeMakerKind;
  /** Square canvas size in pixels, 32–512. */
  size: number;
  /** 0 is a crisp edge, 1 is a fully soft falloff. */
  softness: number;
  /** Ring line width as a share of its radius, 0.04–0.8. */
  thickness: number;
  /** Star points, 3–12. */
  points: number;
  /** Star inner radius as a share of the outer radius, 0.15–0.9. */
  innerRadius: number;
}

export const DEFAULT_SHAPE_MAKER: ShapeMakerSettings = {
  kind: "glow",
  size: 128,
  softness: 0.6,
  thickness: 0.18,
  points: 5,
  innerRadius: 0.45,
};

const clampNumber = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

export function normalizeShapeMaker(
  settings: ShapeMakerSettings,
): ShapeMakerSettings {
  return {
    kind: ["glow", "ring", "star"].includes(settings.kind)
      ? settings.kind
      : "glow",
    size: Math.round(clampNumber(settings.size, 32, 512)),
    softness: clampNumber(settings.softness, 0, 1),
    thickness: clampNumber(settings.thickness, 0.04, 0.8),
    points: Math.round(clampNumber(settings.points, 3, 12)),
    innerRadius: clampNumber(settings.innerRadius, 0.15, 0.9),
  };
}

/** A white shape drawn from maker settings, ready for the upload path. */
export function makeCustomShape(input: ShapeMakerSettings): LibraryShape {
  const settings = normalizeShapeMaker(input);
  const { kind, size, softness } = settings;
  const label =
    kind === "glow"
      ? `Custom glow ${size}`
      : kind === "ring"
        ? `Custom ring ${size}`
        : `Custom ${settings.points}-point star ${size}`;
  return {
    id: `custom-${kind}-${size}-${softness}-${settings.thickness}-${settings.points}-${settings.innerRadius}`,
    name: label,
    use: "Made with the shape maker",
    width: size,
    height: size,
    draw: (context, width, height) => {
      const cx = width / 2;
      const cy = height / 2;
      if (kind === "glow") {
        // Softness widens the falloff around a solid core.
        const core = Math.max(0.02, (1 - softness) * 0.9);
        radialGlow(context, cx, cy, width / 2, [
          [0, 1],
          [core, 1],
          [1, 0],
        ]);
        return;
      }
      // Edges blur outward, so leave room for the blur inside the canvas.
      const blur = softness * width * 0.12;
      const outer = width / 2 - blur - 2;
      context.shadowColor = WHITE;
      context.shadowBlur = blur;
      if (kind === "ring") {
        const lineWidth = Math.max(1, outer * settings.thickness);
        context.strokeStyle = WHITE;
        context.lineWidth = lineWidth;
        context.beginPath();
        context.arc(cx, cy, Math.max(1, outer - lineWidth / 2), 0, Math.PI * 2);
        context.stroke();
        return;
      }
      context.fillStyle = WHITE;
      starPath(
        context,
        cx,
        cy,
        settings.points,
        outer,
        outer * settings.innerRadius,
      );
      context.fill();
    },
  };
}
