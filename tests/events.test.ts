import { describe, expect, it } from "vitest";
import { validateRuntimeDefinition } from "../packages/phaser-runtime/src";
import {
  createEmptyProject,
  createGroup,
  createLayer,
} from "../src/vfx/defaults";
import { evaluateProject } from "../src/vfx/engine";
import {
  compileLayerActivations,
  MAX_EVENT_ACTIVATIONS,
} from "../src/vfx/events";
import {
  createRuntimeDefinition,
  generatePhaserCode,
  generateStandalonePhaserCode,
} from "../src/vfx/exporters";
import { activeTimelineEnd } from "../src/vfx/projectState";
import { validateProject } from "../src/vfx/serialization";
import {
  createTemplateFromProject,
  insertTemplateIntoProject,
} from "../src/vfx/templates";
import type { LayerEvent, VfxLayer } from "../src/vfx/types";

function event(
  id: string,
  target: VfxLayer,
  trigger: LayerEvent["trigger"],
  action: LayerEvent["action"] = "play",
  percentage = 0.5,
): LayerEvent {
  return {
    id,
    enabled: true,
    trigger,
    percentage,
    action,
    targetLayerId: target.id,
    chance: 1,
    maxTriggers: 32,
  };
}

describe("deterministic layer events", () => {
  it("plays a triggered target after source finish using the target's normal delay", () => {
    const project = createEmptyProject("Event timing");
    const source = createLayer("animated", "Projectile", "builtin-spark");
    source.timing.delay = 20;
    source.timing.duration = 100;
    const target = createLayer("animated", "Impact", "builtin-flash");
    target.startMode = "triggered";
    target.timing.delay = 30;
    target.timing.duration = 80;
    source.events = [event("impact", target, "finish", "restart")];
    project.layers.push(source, target);

    const schedule = compileLayerActivations(project, 230);
    expect(schedule.byLayer.get(source.id)).toMatchObject([
      { origin: 0, start: 20, end: 120 },
    ]);
    expect(schedule.byLayer.get(target.id)).toMatchObject([
      { origin: 120, start: 150, end: 230 },
    ]);
    expect(
      evaluateProject(project, 149, null).some(
        (instance) => instance.layerId === target.id,
      ),
    ).toBe(false);
    expect(
      evaluateProject(project, 150, null).some(
        (instance) => instance.layerId === target.id,
      ),
    ).toBe(true);
    expect(activeTimelineEnd(project)).toBe(230);
  });

  it("fires percentage events in every finite repeat cycle and finish once", () => {
    const project = createEmptyProject("Repeated event timing");
    const source = createLayer("animated", "Pulse", "builtin-ring");
    source.timing.duration = 100;
    source.timing.repeat = 2;
    const percentageTarget = createLayer(
      "animated",
      "Midpoint flash",
      "builtin-flash",
    );
    percentageTarget.startMode = "triggered";
    percentageTarget.timing.duration = 50;
    const finishTarget = createLayer(
      "animated",
      "Final flash",
      "builtin-flash",
    );
    finishTarget.startMode = "triggered";
    finishTarget.timing.duration = 50;
    source.events = [
      event("halfway", percentageTarget, "percentage", "play", 0.5),
      event("done", finishTarget, "finish"),
    ];
    project.layers.push(source, percentageTarget, finishTarget);

    const schedule = compileLayerActivations(project, 350);
    expect(
      schedule.byLayer.get(percentageTarget.id)?.map(({ origin }) => origin),
    ).toEqual([50, 150, 250]);
    expect(
      schedule.byLayer.get(finishTarget.id)?.map(({ origin }) => origin),
    ).toEqual([300]);
  });

  it("keeps Play non-overlapping while Restart replaces active playback", () => {
    const build = (action: LayerEvent["action"]) => {
      const project = createEmptyProject(`${action} semantics`);
      const source = createLayer("animated", "Clock", "builtin-ring");
      source.timing.duration = 100;
      source.timing.repeat = 2;
      const target = createLayer("animated", "Long flash", "builtin-flash");
      target.startMode = "triggered";
      target.timing.duration = 180;
      source.events = [event("tick", target, "percentage", action, 0.5)];
      project.layers.push(source, target);
      return { project, target };
    };

    const play = build("play");
    expect(
      compileLayerActivations(play.project, 400)
        .byLayer.get(play.target.id)
        ?.map(({ origin }) => origin),
    ).toEqual([50, 250]);

    const restart = build("restart");
    const activations =
      compileLayerActivations(restart.project, 400).byLayer.get(
        restart.target.id,
      ) ?? [];
    expect(activations.map(({ origin }) => origin)).toEqual([50, 150, 250]);
    expect(activations.map(({ cancelledAt }) => cancelledAt)).toEqual([
      150,
      250,
      null,
    ]);
    expect(
      evaluateProject(restart.project, 160, null).filter(
        (instance) => instance.layerId === restart.target.id,
      ),
    ).toHaveLength(1);
  });

  it("uses seeded emitter batches as repeat events", () => {
    const project = createEmptyProject("Emitter events");
    const source = createLayer("emitter", "Bubbles", "builtin-ring");
    source.spawn.intervalMin = 100;
    source.spawn.intervalMax = 100;
    source.spawn.count = 1;
    const target = createLayer("burst", "Pop", "builtin-spark");
    target.startMode = "triggered";
    target.timing.duration = 50;
    source.events = [event("pop", target, "repeat")];
    project.layers.push(source, target);

    const first = compileLayerActivations(project, 350);
    const second = compileLayerActivations(project, 350);
    expect(first).toEqual(second);
    expect(first.byLayer.get(target.id)?.map(({ origin }) => origin)).toEqual([
      100, 200, 300,
    ]);
  });

  it("reconstructs identical output after arbitrary scrubbing", () => {
    const project = createEmptyProject("Scrub-safe events");
    const source = createLayer("animated", "Source", "builtin-ring");
    source.timing.duration = 120;
    source.timing.repeat = 3;
    const target = createLayer("burst", "Triggered sparks", "builtin-spark");
    target.startMode = "triggered";
    target.timing.duration = 180;
    target.random.positionX = 40;
    source.events = [event("restart", target, "repeat", "restart")];
    project.layers.push(source, target);

    const at360 = evaluateProject(project, 360, null);
    evaluateProject(project, 90, null);
    expect(evaluateProject(project, 360, null)).toEqual(at360);
  });

  it("starts one independent target at every copy's exact final position", () => {
    const project = createEmptyProject("Spatial copy endings");
    const parent = createLayer("static", "Moving-space parent", "builtin-ring");
    parent.transform.x = 20;
    parent.transform.y = -10;
    const source = createLayer("burst", "Traveling sparks", "builtin-spark");
    source.parentId = parent.id;
    source.timing.duration = 100;
    source.timing.easing = "constant";
    source.spawn.count = 2;
    source.spawn.shape = "line";
    source.spawn.distribution = "even";
    source.spawn.lineLength = 100;
    source.spawn.lineAngle = 0;
    source.spawn.direction = "fixed";
    source.spawn.directionAngle = 0;
    source.spawn.directionSpread = 0;
    source.transform.movementX = 100;
    source.transform.y = 30;
    const target = createLayer("animated", "Impact", "builtin-flash");
    target.startMode = "triggered";
    target.transform.x = 5;
    target.transform.y = 5;
    source.events = [event("each-impact", target, "copy-finish")];
    project.layers.push(parent, source, target);

    const schedule = compileLayerActivations(project, 100);
    const targetActivations = schedule.byLayer.get(target.id) ?? [];

    expect(targetActivations).toHaveLength(2);
    expect(targetActivations.map((activation) => activation.origin)).toEqual([
      100, 100,
    ]);
    expect(
      targetActivations.map((activation) => activation.context?.x),
    ).toEqual([70, 170]);
    expect(
      targetActivations.map((activation) => activation.context?.y),
    ).toEqual([20, 20]);
    expect(
      new Set(targetActivations.map((activation) => activation.context?.id))
        .size,
    ).toBe(2);
    expect(
      evaluateProject(project, 100, null)
        .filter((instance) => instance.layerId === target.id)
        .map((instance) => ({ x: instance.x, y: instance.y })),
    ).toEqual([
      { x: 75, y: 25 },
      { x: 175, y: 25 },
    ]);
  });

  it("uses actual randomized death timing and forwards stable source seeds", () => {
    const project = createEmptyProject("Random spatial endings");
    const source = createLayer("burst", "Fragments", "builtin-spark");
    source.spawn.count = 3;
    source.timing.duration = 120;
    source.random.duration = 40;
    source.random.delay = 35;
    const target = createLayer("burst", "Pops", "builtin-flash");
    target.startMode = "triggered";
    source.events = [event("fragment-pop", target, "copy-finish")];
    project.layers.push(source, target);

    const first = compileLayerActivations(project, 300);
    const replay = compileLayerActivations(project, 300);
    const activations = first.byLayer.get(target.id) ?? [];

    expect(activations).toHaveLength(3);
    expect(activations.map((activation) => activation.origin)).not.toEqual([
      120, 120, 120,
    ]);
    expect(activations.map((activation) => activation.context?.seed)).toEqual(
      replay.byLayer
        .get(target.id)
        ?.map((activation) => activation.context?.seed),
    );
    evaluateProject(project, 40, null);
    expect(evaluateProject(project, 300, null)).toEqual(
      evaluateProject(project, 300, null),
    );
  });

  it("inherits one spatial context through ordinary downstream events", () => {
    const project = createEmptyProject("Spatial event component");
    const source = createLayer("burst", "Source", "builtin-spark");
    source.spawn.count = 1;
    source.timing.duration = 100;
    source.transform.x = 70;
    const middle = createLayer("animated", "Middle", "builtin-ring");
    middle.startMode = "triggered";
    const child = createLayer("animated", "Child", "builtin-flash");
    child.startMode = "triggered";
    source.events = [event("source-end", middle, "copy-finish")];
    middle.events = [event("middle-start", child, "start")];
    project.layers.push(source, middle, child);

    const schedule = compileLayerActivations(project, 100);
    const middleContext = schedule.byLayer.get(middle.id)?.[0].context;
    const childContext = schedule.byLayer.get(child.id)?.[0].context;

    expect(middleContext).not.toBeNull();
    expect(childContext).toEqual(middleContext);
  });

  it("applies deterministic chance and per-activation maximums before fan-out", () => {
    const project = createEmptyProject("Bounded spatial fan-out");
    const source = createLayer("burst", "Many sparks", "builtin-spark");
    source.spawn.count = 100;
    source.timing.duration = 50;
    const target = createLayer("animated", "Tiny pop", "builtin-flash");
    target.startMode = "triggered";
    const bounded = event("bounded", target, "copy-finish");
    bounded.maxTriggers = 3;
    source.events = [bounded];
    project.layers.push(source, target);

    expect(
      compileLayerActivations(project, 100).byLayer.get(target.id),
    ).toHaveLength(3);
    bounded.chance = 0;
    expect(
      compileLayerActivations(project, 100).byLayer.get(target.id) ?? [],
    ).toHaveLength(0);
  });

  it("stops spatial fan-out at the shared activation safety cap", () => {
    const project = createEmptyProject("Globally bounded spatial fan-out");
    const target = createLayer("animated", "Tiny pop", "builtin-flash");
    target.startMode = "triggered";
    const sources = Array.from({ length: 5 }, (_, index) => {
      const source = createLayer(
        "burst",
        `Spark group ${index + 1}`,
        "builtin-spark",
      );
      source.spawn.count = 250;
      source.timing.duration = 50;
      const finish = event(`finish-${index}`, target, "copy-finish");
      finish.maxTriggers = 250;
      source.events = [finish];
      return source;
    });
    project.layers.push(...sources, target);

    const schedule = compileLayerActivations(project, 50);

    expect(schedule.truncated).toBe(true);
    expect(schedule.activations).toHaveLength(MAX_EVENT_ACTIVATIONS);
    expect(schedule.byLayer.get(target.id)).toHaveLength(
      MAX_EVENT_ACTIVATIONS - sources.length,
    );
  });

  it("suppresses cancelled copy deaths and never treats trails as particles", () => {
    const project = createEmptyProject("Cancelled copy endings");
    const source = createLayer("burst", "Source", "builtin-spark");
    source.spawn.count = 1;
    source.timing.duration = 100;
    source.trail.enabled = true;
    source.trail.count = 8;
    const clock = createLayer("animated", "Restart clock", "builtin-ring");
    clock.timing.duration = 100;
    const target = createLayer("animated", "Impact", "builtin-flash");
    target.startMode = "triggered";
    source.events = [event("copy-end", target, "copy-finish")];
    clock.events = [event("restart-source", source, "percentage", "restart")];
    project.layers.push(source, clock, target);

    const beforeReplacementEnds = compileLayerActivations(project, 100);
    expect(beforeReplacementEnds.byLayer.get(target.id) ?? []).toHaveLength(0);
    const afterReplacementEnds = compileLayerActivations(project, 150);
    expect(afterReplacementEnds.byLayer.get(target.id) ?? []).toHaveLength(1);
  });
});

describe("event validation and portability", () => {
  it("migrates v10 layers to ordinary timeline playback", () => {
    const project = createEmptyProject("Legacy events") as unknown as Record<
      string,
      unknown
    >;
    project.formatVersion = 10;
    const layers = project.layers as Array<Record<string, unknown>>;
    layers.push(
      createLayer(
        "animated",
        "Legacy flash",
        "builtin-flash",
      ) as unknown as Record<string, unknown>,
    );
    delete layers[0].startMode;
    delete layers[0].events;

    const result = validateProject(project);
    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(16);
    expect(result.project?.layers[0]).toMatchObject({
      startMode: "timeline",
      events: [],
    });
  });

  it("migrates v12 events with safe copy-finish fan-out defaults", () => {
    const project = createEmptyProject(
      "Legacy event bounds",
    ) as unknown as Record<string, unknown>;
    project.formatVersion = 12;
    const source = createLayer("burst", "Source", "builtin-spark");
    const target = createLayer("animated", "Target", "builtin-flash");
    target.startMode = "triggered";
    const legacyEvent = event(
      "legacy",
      target,
      "copy-finish",
    ) as unknown as Record<string, unknown>;
    delete legacyEvent.chance;
    delete legacyEvent.maxTriggers;
    const unsafeEvent = {
      ...event("unsafe", target, "copy-finish"),
      chance: -4,
      maxTriggers: 999,
    };
    source.events = [legacyEvent as unknown as LayerEvent, unsafeEvent];
    (project.layers as VfxLayer[]).push(source, target);

    const result = validateProject(project);

    expect(result.ok).toBe(true);
    expect(result.project?.formatVersion).toBe(16);
    expect(result.project?.layers[0].events[0]).toMatchObject({
      trigger: "copy-finish",
      chance: 1,
      maxTriggers: 32,
    });
    expect(result.project?.layers[0].events[1]).toMatchObject({
      chance: 0,
      maxTriggers: 250,
    });
  });

  it("rejects missing targets, duplicate IDs, unsupported emitter points, and cycles", () => {
    const missing = createEmptyProject("Missing event target");
    const source = createLayer("animated", "Source", "builtin-ring");
    source.events = [
      {
        ...event("missing", source, "finish"),
        targetLayerId: "gone",
      },
    ];
    missing.layers.push(source);
    expect(validateProject(missing).error).toMatch(/no longer exists/i);

    const duplicate = createEmptyProject("Duplicate events");
    const first = createLayer("animated", "First", "builtin-ring");
    const second = createLayer("animated", "Second", "builtin-flash");
    first.events = [
      event("same", second, "finish"),
      event("same", second, "start"),
    ];
    duplicate.layers.push(first, second);
    expect(validateProject(duplicate).error).toMatch(/same identifier/i);

    first.events = [first.events[0]];
    second.events = [event("other", first, "start")];
    expect(validateProject(duplicate).error).toMatch(/circular layer event/i);

    const emitter = createEmptyProject("Invalid emitter event");
    const bubbles = createLayer("emitter", "Bubbles", "builtin-ring");
    const pop = createLayer("burst", "Pop", "builtin-spark");
    bubbles.events = [event("finish", pop, "finish")];
    emitter.layers.push(bubbles, pop);
    expect(validateProject(emitter).error).toMatch(/no single percentage/i);

    const stillProject = createEmptyProject("Invalid still copy event");
    const still = createLayer("static", "Still", "builtin-ring");
    const stillTarget = createLayer("animated", "Pop", "builtin-spark");
    still.events = [event("copy-end", stillTarget, "copy-finish")];
    stillProject.layers.push(still, stillTarget);
    expect(validateProject(stillProject).error).toMatch(
      /no animated copy ending/i,
    );
  });

  it("round-trips events through the current Runtime JSON", () => {
    const project = createEmptyProject("Runtime events");
    const source = createLayer("animated", "Projectile", "builtin-spark");
    const target = createLayer("animated", "Impact", "builtin-flash");
    target.startMode = "triggered";
    source.events = [event("impact", target, "finish", "restart")];
    project.layers.push(source, target);

    const definition = createRuntimeDefinition(project);
    const result = validateRuntimeDefinition(definition);
    expect(definition.formatVersion).toBe(14);
    expect(result.ok).toBe(true);
    expect(result.definition?.layers[0].events).toEqual(source.events);
    expect(result.definition?.layers[1].startMode).toBe("triggered");
    const legacyRuntime = JSON.parse(JSON.stringify(definition)) as Record<
      string,
      unknown
    >;
    legacyRuntime.formatVersion = 10;
    const legacyLayers = legacyRuntime.layers as Array<Record<string, unknown>>;
    const legacyEvents = legacyLayers[0].events as Array<
      Record<string, unknown>
    >;
    delete legacyEvents[0].chance;
    delete legacyEvents[0].maxTriggers;
    const migratedRuntime = validateRuntimeDefinition(legacyRuntime).definition;
    expect(migratedRuntime?.formatVersion).toBe(14);
    expect(migratedRuntime?.layers[0].events[0]).toMatchObject({
      chance: 1,
      maxTriggers: 32,
    });
    expect(generatePhaserCode(project)).toContain('"id": "impact"');
    expect(() => generateStandalonePhaserCode(project)).toThrow(
      /does not support layer events/i,
    );
  });

  it("remaps event targets when inserting reusable templates", () => {
    const sourceProject = createEmptyProject("Event component");
    const source = createLayer("animated", "Source", "builtin-ring");
    const target = createLayer("animated", "Target", "builtin-flash");
    target.startMode = "triggered";
    source.events = [event("component-event", target, "finish")];
    sourceProject.layers.push(source, target);
    const template = createTemplateFromProject(sourceProject);

    const inserted = insertTemplateIntoProject(
      createEmptyProject("Destination"),
      template,
    );
    const [insertedSource, insertedTarget] = inserted.project.layers;
    expect(insertedSource.events[0].targetLayerId).toBe(insertedTarget.id);
    expect(insertedSource.events[0].targetLayerId).not.toBe(target.id);
    expect(insertedSource.events[0].id).not.toBe(source.events[0].id);
    expect(insertedSource.events[0]).toMatchObject({
      chance: 1,
      maxTriggers: 32,
    });
    const insertedTwice = insertTemplateIntoProject(inserted.project, template);
    expect(validateProject(insertedTwice.project).ok).toBe(true);
  });

  it("keeps scoped templates self-contained and offsets only timeline starts", () => {
    const sourceProject = createEmptyProject("Scoped component");
    const group = createGroup("Mixed starts");
    group.delay = 100;
    const source = createLayer("animated", "Source", "builtin-ring");
    const target = createLayer("animated", "Target", "builtin-flash");
    source.groupId = group.id;
    target.groupId = group.id;
    target.startMode = "triggered";
    target.timing.delay = 40;
    source.events = [event("component-event", target, "finish")];
    sourceProject.groups.push(group);
    sourceProject.layers.push(source, target);

    const sourceOnly = createTemplateFromProject(
      sourceProject,
      "Source only",
      "",
      [source.id],
    );
    expect(sourceOnly.layers).toHaveLength(1);
    expect(sourceOnly.layers[0].events).toEqual([]);

    const component = createTemplateFromProject(sourceProject);
    const inserted = insertTemplateIntoProject(
      createEmptyProject("Destination"),
      component,
      700,
    );
    const [insertedSource, insertedTarget] = inserted.project.layers;
    expect(inserted.project.groups[0].delay).toBe(100);
    expect(insertedSource.timing.delay).toBe(source.timing.delay + 700);
    expect(insertedTarget.timing.delay).toBe(40);
  });
});
