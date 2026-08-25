import { describe, expect, it } from "vitest";
import { createEmptyProject, createLayer } from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  createRuntimeDefinition,
  generatePhaserCode,
} from "../src/vfx/exporters";
import { deserializeProject, serializeProject } from "../src/vfx/serialization";
import { runtimeDefinitionToProject } from "../packages/phaser-runtime/src/definition";

describe("Beam layers", () => {
  it("fits tightly cropped artwork between authored endpoints", () => {
    const project = createEmptyProject("Beam geometry");
    project.assets.push({
      id: "bolt-strip",
      name: "Bolt strip",
      mimeType: "image/png",
      dataUrl: "data:image/png;base64,Ym9sdA==",
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
    expect(beam.beam).toEqual({ endX: 240, endY: 0 });
  });

  it("round-trips through project and runtime formats", () => {
    const project = createEmptyProject("Portable beam");
    const beam = createLayer("beam", "Arc", "builtin-spark");
    beam.beam = { endX: -180, endY: 75 };
    project.layers.push(beam);

    const editable = deserializeProject(serializeProject(project));
    expect(editable.ok).toBe(true);
    expect(editable.project?.formatVersion).toBe(17);
    expect(editable.project?.layers[0]).toMatchObject({
      type: "beam",
      beam: { endX: -180, endY: 75 },
      spawn: null,
    });

    const runtime = createRuntimeDefinition(project);
    const restored = runtimeDefinitionToProject(runtime);
    expect(runtime.formatVersion).toBe(15);
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
    expect(code).toContain("beamEndpoints?: BeamEndpoints");
    expect(code).toContain("beamEndpoints: options.beamEndpoints");
  });
});
