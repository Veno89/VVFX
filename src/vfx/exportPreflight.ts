import { referencedAssetIds } from "./assetReferences";
import { analyzeRuntimeExportCapabilities } from "./exporters";
import { analyzeProjectPerformance } from "./performance";
import { inspectPortableImageDataUrl } from "./portableImage";
import { hasEnabledRenderingEffects } from "./renderingEffects";
import type { VfxProject } from "./types";

export type ExportPreflightProfileId = "mobile" | "balanced" | "showcase";
export type ExportPreflightSeverity = "pass" | "warning" | "error";

export interface ExportPreflightProfile {
  id: ExportPreflightProfileId;
  name: string;
  description: string;
  maximumPeakSprites: number;
  maximumRenderingPasses: number;
  maximumImageBytes: number;
  maximumImagePixels: number;
  maximumDuration: number;
}

export interface ExportPreflightCheck {
  id: string;
  severity: ExportPreflightSeverity;
  label: string;
  detail: string;
}

export interface ExportPreflightReport {
  profile: ExportPreflightProfile;
  status: ExportPreflightSeverity;
  checks: ExportPreflightCheck[];
  stats: {
    referencedAssets: number;
    embeddedImageBytes: number;
    embeddedImagePixels: number;
    estimatedPeakSprites: number;
    estimatedRenderingPasses: number;
    durationMs: number;
  };
}

export const EXPORT_PREFLIGHT_PROFILES: readonly ExportPreflightProfile[] = [
  {
    id: "mobile",
    name: "Mobile gameplay",
    description: "Conservative budget for several effects on modest devices.",
    maximumPeakSprites: 150,
    maximumRenderingPasses: 400,
    maximumImageBytes: 4 * 1024 * 1024,
    maximumImagePixels: 4 * 1024 * 1024,
    maximumDuration: 4_000,
  },
  {
    id: "balanced",
    name: "Balanced gameplay",
    description: "General desktop and modern mobile target.",
    maximumPeakSprites: 300,
    maximumRenderingPasses: 1_200,
    maximumImageBytes: 12 * 1024 * 1024,
    maximumImagePixels: 12 * 1024 * 1024,
    maximumDuration: 10_000,
  },
  {
    id: "showcase",
    name: "Showcase / cinematic",
    description: "The full Vvfx safety envelope for one featured effect.",
    maximumPeakSprites: 500,
    maximumRenderingPasses: 3_000,
    maximumImageBytes: 24 * 1024 * 1024,
    maximumImagePixels: 32 * 1024 * 1024,
    maximumDuration: 30_000,
  },
] as const;

const severityRank: Record<ExportPreflightSeverity, number> = {
  pass: 0,
  warning: 1,
  error: 2,
};

export function analyzeExportPreflight(
  project: VfxProject,
  profileId: ExportPreflightProfileId,
): ExportPreflightReport {
  const profile =
    EXPORT_PREFLIGHT_PROFILES.find((candidate) => candidate.id === profileId) ??
    EXPORT_PREFLIGHT_PROFILES[1];
  const referencedIds = referencedAssetIds(project.layers);
  const referencedAssets = project.assets.filter((asset) =>
    referencedIds.has(asset.id),
  );
  let embeddedImageBytes = 0;
  let embeddedImagePixels = 0;
  let damagedAssetName: string | null = null;
  for (const asset of referencedAssets) {
    if (asset.builtIn) continue;
    const inspection = inspectPortableImageDataUrl(
      asset.dataUrl,
      asset.mimeType === "image/webp" ? "image/webp" : "image/png",
    );
    if (!inspection.ok) {
      damagedAssetName ??= asset.name;
      continue;
    }
    embeddedImageBytes += inspection.byteLength;
    embeddedImagePixels += inspection.width * inspection.height;
  }
  const performance = analyzeProjectPerformance(project);
  const activeLayers = project.layers.filter(
    (layer) => layer.enabled && layer.visible && layer.assetId,
  );
  const missingReferences = [...referencedIds].filter(
    (assetId) => !project.assets.some((asset) => asset.id === assetId),
  );
  const usesWebglEffects = project.layers.some(
    (layer) =>
      layer.enabled && hasEnabledRenderingEffects(layer.appearance.effects),
  );
  const runtimeCapabilities = analyzeRuntimeExportCapabilities(project);
  const checks: ExportPreflightCheck[] = [];
  checks.push(
    activeLayers.length > 0
      ? {
          id: "content",
          severity: "pass",
          label: "Visible content",
          detail: `${activeLayers.length} enabled visible layer${activeLayers.length === 1 ? "" : "s"} will render.`,
        }
      : {
          id: "content",
          severity: "error",
          label: "No visible content",
          detail: "Enable a visible layer with an image before exporting.",
        },
  );
  if (missingReferences.length > 0)
    checks.push({
      id: "references",
      severity: "error",
      label: "Missing image references",
      detail: `${missingReferences.length} referenced image${missingReferences.length === 1 ? " is" : "s are"} unavailable.`,
    });
  else if (damagedAssetName)
    checks.push({
      id: "references",
      severity: "error",
      label: "Damaged embedded image",
      detail: `Replace or remove "${damagedAssetName}" before exporting.`,
    });
  else
    checks.push({
      id: "references",
      severity: "pass",
      label: "Image references",
      detail: `${referencedAssets.length} referenced image${referencedAssets.length === 1 ? "" : "s"}; unused library images are excluded from runtime export.`,
    });
  checks.push(
    runtimeCapabilities.beamEndpoints
      ? {
          id: "placement",
          severity: "pass",
          label: "Point + endpoint placement",
          detail: `${runtimeCapabilities.beamLayerCount} Beam layer${runtimeCapabilities.beamLayerCount === 1 ? "" : "s"}; the game may supply world-space endpoints.`,
        }
      : {
          id: "placement",
          severity: "pass",
          label: "Point placement only",
          detail:
            "No Beam layers. This effect plays at an origin x/y; endpoint fitting is intentionally unavailable.",
        },
  );
  checks.push({
    id: "sprites",
    severity:
      performance.estimatedPeakSprites > profile.maximumPeakSprites
        ? "warning"
        : "pass",
    label: "Peak sprite estimate",
    detail: `${Math.round(performance.estimatedPeakSprites)} estimated at once; ${profile.maximumPeakSprites} recommended for this profile.`,
  });
  checks.push({
    id: "passes",
    severity:
      performance.estimatedRenderingPasses > profile.maximumRenderingPasses
        ? "warning"
        : "pass",
    label: "WebGL pass estimate",
    detail: `${Math.round(performance.estimatedRenderingPasses)} estimated passes; ${profile.maximumRenderingPasses} recommended.`,
  });
  checks.push({
    id: "images",
    severity:
      embeddedImageBytes > profile.maximumImageBytes ||
      embeddedImagePixels > profile.maximumImagePixels
        ? "warning"
        : "pass",
    label: "Referenced image budget",
    detail: `${(embeddedImageBytes / 1024 / 1024).toFixed(2)} MB encoded and ${(embeddedImagePixels / 1_000_000).toFixed(2)} megapixels referenced.`,
  });
  checks.push({
    id: "duration",
    severity:
      performance.durationMs > profile.maximumDuration ? "warning" : "pass",
    label: "Active duration",
    detail: `${(performance.durationMs / 1000).toFixed(2)} seconds; ${(profile.maximumDuration / 1000).toFixed(0)} seconds recommended.`,
  });
  if (usesWebglEffects)
    checks.push({
      id: "renderer",
      severity: profile.id === "mobile" ? "warning" : "pass",
      label: "WebGL compatibility",
      detail:
        "Experimental pixel effects require Phaser WebGL; Canvas keeps the ordinary sprite and reports a warning.",
    });
  const status = checks.reduce<ExportPreflightSeverity>(
    (current, check) =>
      severityRank[check.severity] > severityRank[current]
        ? check.severity
        : current,
    "pass",
  );
  return {
    profile,
    status,
    checks,
    stats: {
      referencedAssets: referencedAssets.length,
      embeddedImageBytes,
      embeddedImagePixels,
      estimatedPeakSprites: performance.estimatedPeakSprites,
      estimatedRenderingPasses: performance.estimatedRenderingPasses,
      durationMs: performance.durationMs,
    },
  };
}
