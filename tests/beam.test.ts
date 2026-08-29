import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  analyzeRuntimeExportCapabilities,
  createRuntimeDefinition,
  generatePhaserCode,
} from "../src/vfx/exporters";
import { deserializeProject, serializeProject } from "../src/vfx/serialization";
import { runtimeDefinitionToProject } from "../packages/phaser-runtime/src/definition";
import { validPngDataUrl } from "./fixtures/portableImages";

describe("Beam layers", () => {
  it("fits tightly cropped artwork between authored endpoints", () => {
    const project = createEmptyProject("Beam geometry");
    project.assets.push({
      id: "bolt-strip",
      name: "Bolt strip",
      mimeType: "image/png",
      dataUrl: validPngDataUrl(200, 32),
      transparency: "yes",
      width: 200,
      height: 32,
      spriteSheet: null,
      atlasFrame: null,
      alphaMask: null,
    });
    const beam = createLayer("beam", "Main bolt", "bolt-strip");
    beam.id = "main-bolt";
    beam.transform.x = 10;
    beam.transform.y = 20;
    beam.transform.startOpacity = 1;
    beam.transform.endOpacity = 1;
    beam.behavior.flicker.enabled = false;
    beam.beam = { endX: 300, endY: 400 };
    project.layers.push(beam);

    const [instance] = evaluateProject(project, 100, beam.id);

    expect(instance).toMatchObject({ x: 160, y: 220, selected: true });
    expect(instance.rotation).toBeCloseTo(53.1301, 3);
    expect(instance.scaleX).toBeCloseTo(2.5);
    expect(instance.scaleY).toBeCloseTo(1);
    expect(instance.sourceCrop).toBeNull();
  });

  it("accepts exact endpoint overrides without mutating the project", () => {
    const project = createEmptyProject("Dynamic beam");
    const beam = createLayer("beam", "Runtime bolt", "builtin-spark");
    beam.id = "runtime-bolt";
    beam.behavior.flicker.enabled = false;
    project.layers.push(beam);

    const [instance] = evaluateProject(project, 50, null, {
      [beam.id]: { startX: 50, startY: 60, endX: 350, endY: 60 },
    });

    expect(instance).toMatchObject({ x: 200, y: 60, rotation: 0 });
    expect(instance.scaleX).toBeCloseTo(300 / 128);
    expect(instance.sourceCrop).toBeNull();
    expect(beam.beam).toEqual({ endX: 240, endY: 0 });
  });

  it("optionally crops short dynamic links without compressing source pixels", () => {
    const project = createEmptyProject("Cropped dynamic beam");
    const beam = createLayer("beam", "Runtime bolt", "builtin-spark");
    beam.id = "cropped-runtime-bolt";
    beam.behavior.flicker.enabled = false;
    beam.transform.startScale = 2;
    beam.transform.endScale = 2;
    beam.beam = { endX: 240, endY: 0 };
    project.layers.push(beam);
    const endpoints = {
      [beam.id]: { startX: 0, startY: 0, endX: 60, endY: 0 },
    };

    const [legacy] = evaluateProject(project, 50, null, endpoints);
    const [cropped] = evaluateProject(project, 50, null, endpoints, undefined, {
      beamFit: "crop",
      beamThicknessScale: 0.5,
    });

    expect(legacy.scaleX).toBeCloseTo(60 / 128);
    expect(legacy.scaleY).toBeCloseTo(2);
    expect(legacy.sourceCrop).toBeNull();
    expect(cropped.scaleX).toBeCloseTo(240 / 128);
    expect(cropped.scaleY).toBeCloseTo(1);
    expect(cropped.sourceCrop).toEqual({
      x: 0.375,
      y: 0,
      width: 0.25,
      height: 1,
    });

    const [longer] = evaluateProject(
      project,
      50,
      null,
      { [beam.id]: { startX: 0, startY: 0, endX: 300, endY: 0 } },
      undefined,
      { beamFit: "crop", beamThicknessScale: 0.5 },
    );
    expect(longer.scaleX).toBeCloseTo(300 / 128);
    expect(longer.scaleY).toBeCloseTo(1);
    expect(longer.sourceCrop).toBeNull();
  });

  it("round-trips through project and runtime formats", () => {
    const project = createEmptyProject("Portable beam");
    const beam = createLayer("beam", "Arc", "builtin-spark");
    beam.beam = { endX: -180, endY: 75 };
    project.layers.push(beam);

    const editable = deserializeProject(serializeProject(project));
    expect(editable.ok).toBe(true);
    expect(editable.project?.formatVersion).toBe(18);
    expect(editable.project?.layers[0]).toMatchObject({
      type: "beam",
      beam: { endX: -180, endY: 75 },
      spawn: null,
    });

    const runtime = createRuntimeDefinition(project);
    const restored = runtimeDefinitionToProject(runtime);
    expect(runtime.formatVersion).toBe(16);
    expect(runtime.layers[0].beam).toEqual(beam.beam);
    expect(restored.layers[0]).toMatchObject({
      type: "beam",
      beam: beam.beam,
    });
  });

  it("exposes endpoint startup options in generated Phaser integration", () => {
    const project = createEmptyProject("Exported beam");
    project.layers.push(createLayer("beam", "Arc", "builtin-spark"));

    const code = generatePhaserCode(project);

    expect(code).toContain("type BeamEndpoints");
    expect(code).toContain("type BeamFit");
    expect(code).toContain("beamEndpoints?: BeamEndpoints");
    expect(code).toContain("beamFit?: BeamFit");
    expect(code).toContain("beamThicknessScale?: number");
    expect(code).toContain("maxDurationMs?: number");
    expect(code).toContain("beamEndpoints: options.beamEndpoints");
    expect(code).toContain("beamFit: options.beamFit");
    expect(code).toContain("beamThicknessScale: options.beamThicknessScale");
    expect(code).toContain("maxDurationMs: options.maxDurationMs");
    expect(analyzeRuntimeExportCapabilities(project)).toEqual({
      pointPlacement: true,
      beamEndpoints: true,
      beamLayerCount: 1,
    });
  });

  it("does not advertise endpoint options for point-only effects", () => {
    const project = createEmptyProject("Point effect");
    project.layers.push(createLayer("animated", "Impact", "builtin-flash"));

    const code = generatePhaserCode(project);

    expect(code).not.toContain("BeamEndpoints");
    expect(code).not.toContain("beamEndpoints");
    expect(code).not.toContain("BeamFit");
    expect(code).not.toContain("beamFit");
    expect(code).not.toContain("beamThicknessScale");
    expect(code).toContain("maxDurationMs?: number");
    expect(code).toContain("maxDurationMs: options.maxDurationMs");
    expect(code).toContain(
      "This effect has no Beam layers, so endpoint options are intentionally omitted.",
    );
    expect(analyzeRuntimeExportCapabilities(project)).toEqual({
      pointPlacement: true,
      beamEndpoints: false,
      beamLayerCount: 0,
    });
  });
});
