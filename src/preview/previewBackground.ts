import type { VfxProject } from "../vfx/types";

/** The solid preview background as a CSS hex color. */
export function previewBackgroundHex(project: VfxProject): string {
  return project.preview.background === "black"
    ? "#000000"
    : project.preview.background === "dark"
      ? "#11151f"
      : project.preview.background === "white"
        ? "#ffffff"
        : project.preview.background === "custom"
          ? project.preview.customColor
          : "#141723";
}
