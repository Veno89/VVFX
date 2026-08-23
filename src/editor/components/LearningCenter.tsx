"use client";

import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  Flame,
  FlaskConical,
  HeartPulse,
  ImageIcon,
  Layers3,
  MousePointer2,
  Palette,
  PanelRight,
  Route,
  Save,
  SlidersHorizontal,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { COMPOSITION_PRESETS } from "../../vfx/presets";
import {
  ASSET_PREP_CHECKLIST,
  PRODUCT_BOUNDARY,
  VFX_GLOSSARY,
} from "../guidance";

export type TourFocus =
  | "welcome"
  | "assets"
  | "layers"
  | "preview"
  | "inspector"
  | "timeline"
  | "projects";

interface TourStep {
  focus: TourFocus;
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  icon: ReactNode;
}

export const TOUR_STEPS: TourStep[] = [
  {
    focus: "welcome",
    eyebrow: "Welcome to Vvfx",
    title: "Build effects one understandable part at a time",
    description:
      "Vvfx combines simple images into animated game effects. This quick tour points out where everything lives.",
    detail:
      "Nothing in the tour changes your project. You can replay it anytime from Learn.",
    icon: <Sparkles size={22} />,
  },
  {
    focus: "assets",
    eyebrow: "1 · Your ingredients",
    title: "The Asset Library holds your images",
    description:
      "Drop transparent PNG or WebP artwork here. The built-in shapes let you experiment before drawing anything yourself.",
    detail:
      "One image can be reused by many different layers and tinted into different colors.",
    icon: <ImageIcon size={22} />,
  },
  {
    focus: "layers",
    eyebrow: "2 · Your recipe",
    title: "Layers combine into one complete effect",
    description:
      "Each layer has one job: a flash, a ring, sparks, smoke, or any other part you need. Drag to reorder and double-click a name to rename it.",
    detail:
      "Use Solo to inspect one layer without permanently hiding the others.",
    icon: <Layers3 size={22} />,
  },
  {
    focus: "preview",
    eyebrow: "3 · Immediate feedback",
    title: "The preview shows every change as you make it",
    description:
      "Play, pause, change speed, zoom, or drag a visible part into position. Try dark and light backgrounds before finishing an effect.",
    detail: "Press Space to play or pause and R to restart.",
    icon: <CirclePlay size={22} />,
  },
  {
    focus: "inspector",
    eyebrow: "4 · Shape the selected layer",
    title: "The Inspector controls movement, timing, and appearance",
    description:
      "Open one section at a time and experiment. Every slider also has a precise number field and a reset button when it differs from its default.",
    detail: "Hover the small question marks whenever a control is unfamiliar.",
    icon: <PanelRight size={22} />,
  },
  {
    focus: "timeline",
    eyebrow: "5 · Arrange the moment",
    title: "The Timeline explains what happens first",
    description:
      "Click to inspect any moment, then drag a layer’s handles to change when it starts or how long it lasts.",
    detail: "Scrubbing pauses playback so you can study one exact frame.",
    icon: <Timer size={22} />,
  },
  {
    focus: "projects",
    eyebrow: "6 · Keep your work",
    title: "Save locally, load later, or export for a game",
    description:
      "Save stores the editable project in this browser. Load reopens it. Export creates a portable .vvfx file, runtime JSON, or readable Phaser code.",
    detail:
      "Use both Save and an occasional .vvfx export if the project matters to you.",
    icon: <Save size={22} />,
  },
];

export function OnboardingOverlay({
  step,
  onBack,
  onNext,
  onSkip,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const item = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  return (
    <div
      className={`onboarding-overlay onboarding-overlay--${item.focus}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <section className="tour-card">
        <button
          className="tour-close"
          type="button"
          onClick={onSkip}
          aria-label="Close app tour"
        >
          <X size={17} />
        </button>
        <span className="tour-card__icon">{item.icon}</span>
        <span className="eyebrow">{item.eyebrow}</span>
        <h2 id="tour-title">{item.title}</h2>
        <p>{item.description}</p>
        <div className="tour-detail">
          <MousePointer2 size={14} />
          <span>{item.detail}</span>
        </div>
        <div
          className="tour-dots"
          aria-label={`Step ${step + 1} of ${TOUR_STEPS.length}`}
        >
          {TOUR_STEPS.map((candidate, index) => (
            <i
              key={candidate.focus}
              className={index === step ? "is-active" : ""}
            />
          ))}
        </div>
        <footer>
          <button
            type="button"
            className="quiet-button"
            onClick={onBack}
            disabled={step === 0}
          >
            <ChevronLeft size={15} /> Back
          </button>
          <span>
            {step + 1} / {TOUR_STEPS.length}
          </span>
          <button type="button" className="primary-action" onClick={onNext}>
            {last ? "Start creating" : "Next"}{" "}
            {!last && <ChevronRight size={15} />}
          </button>
        </footer>
      </section>
    </div>
  );
}

type LearningTabId =
  | "start"
  | "recipes"
  | "professional"
  | "experimental"
  | "boundary"
  | "glossary";

const LEARNING_TABS: {
  id: LearningTabId;
  label: string;
  icon: ReactNode;
}[] = [
  { id: "start", label: "Start here", icon: <BookOpen size={15} /> },
  { id: "recipes", label: "Recipes", icon: <Sparkles size={15} /> },
  {
    id: "professional",
    label: "How game VFX works",
    icon: <Layers3 size={15} />,
  },
  {
    id: "experimental",
    label: "Experimental lab",
    icon: <FlaskConical size={15} />,
  },
  {
    id: "boundary",
    label: "Vvfx or image editor?",
    icon: <Palette size={15} />,
  },
  { id: "glossary", label: "Glossary", icon: <BookOpen size={15} /> },
];

const FIRST_EFFECT_BEATS = [
  {
    title: "Flash",
    timing: "0–0.3 seconds",
    text: "One bright animated image appears immediately, expands quickly, and fades. It makes the hit readable.",
  },
  {
    title: "Ring",
    timing: "0–0.8 seconds",
    text: "A second animated image grows farther and fades more slowly. It carries the energy away from the center.",
  },
  {
    title: "Sparks",
    timing: "0–0.7 seconds",
    text: "A burst throws several small copies outward. Random size and distance keep the copies from looking cloned.",
  },
  {
    title: "Smoke",
    timing: "0.15–1.6 seconds",
    text: "A delayed wisp rises, drifts, grows, and fades. This quiet final layer gives the impact a soft ending.",
  },
] as const;

const EFFECT_RECIPES: {
  id: string;
  name: string;
  summary: string;
  ingredients: readonly string[];
  finishingMove: string;
  icon: ReactNode;
  buildable?: boolean;
}[] = [
  {
    id: "critical-hit",
    name: "Critical hit",
    summary:
      "A compact 700 ms choreography with a bright contact, snap, settle, and slower fade.",
    ingredients: [
      "Contact flash — tiny 0–60 ms beat",
      "Main splatter — Punch property moments",
      "Impact ring — fast 20–140 ms expansion",
      "Droplets — short outward burst",
    ],
    finishingMove:
      "Replace the built-in cloud with your own transparent splatter artwork; keep the timing and property moments as a starting rhythm.",
    icon: <Sparkles size={18} />,
  },
  {
    id: "magic-impact",
    name: "Magic impact",
    summary: "A crisp four-beat hit that reads clearly even at game scale.",
    ingredients: [
      "Impact flash — fast animated image",
      "Shockwave — expanding ring",
      "Sparks — outward burst",
      "Smoke wisp — delayed soft finish",
    ],
    finishingMove:
      "Give the flash, ring, and sparks one color family; let the smoke stay quieter.",
    icon: <Sparkles size={18} />,
  },
  {
    id: "poison-ooze",
    name: "Poison ooze",
    summary: "A persistent puddle with small signs of toxic activity.",
    ingredients: [
      "Ooze base — flattened still image",
      "Rising bubbles — repeating copies",
      "Toxic smoke — slow repeating wisps",
      "Occasional pop — tiny burst",
    ],
    finishingMove:
      "Vary bubble timing and size. Perfectly regular bubbles make liquid feel mechanical.",
    icon: <CirclePlay size={18} />,
  },
  {
    id: "fire-impact",
    name: "Fire impact",
    summary: "A hot center, flying embers, and a smoky after-beat.",
    ingredients: [
      "White-hot flash — short additive layer",
      "Orange ring — quick expanding layer",
      "Embers — outward burst with gravity",
      "Dark smoke — delayed growing wisps",
    ],
    finishingMove:
      "Let color cool from pale yellow through orange to dark gray as the effect ends.",
    icon: <Flame size={18} />,
  },
  {
    id: "animated-fire",
    name: "Animated fire",
    summary:
      "Bring a real flame flipbook from an art tool, then add flicker, color, variation, and smoke behavior.",
    ingredients: [
      "Flame sprite sheet — drawn outside Vvfx",
      "Flipbook playback — rows, columns, FPS, and range",
      "Flicker and color over time",
      "Organic smoke — separate repeating layer",
    ],
    finishingMove:
      "This recipe is instructional until you assign your own sprite-sheet asset; Vvfx will not pretend a static practice shape is hand-drawn fire animation.",
    icon: <Flame size={18} />,
    buildable: false,
  },
  {
    id: "healing-aura",
    name: "Healing aura",
    summary:
      "A gentle looping effect that supports a character without hiding them.",
    ingredients: [
      "Ground ring — slow pulse",
      "Soft glow shape — low-opacity additive layer",
      "Rising motes — repeating copies",
      "Small sparkle — occasional delayed accent",
    ],
    finishingMove:
      "Use long timings, low opacity, and modest movement. Healing usually feels calm rather than explosive.",
    icon: <HeartPulse size={18} />,
  },
  {
    id: "projectile-trail",
    name: "Projectile trail",
    summary:
      "A moving source with fading copies that make its direction obvious.",
    ingredients: [
      "Projectile artwork — points consistently to the right",
      "Motion path — defines where it travels",
      "Trail — leaves fading copies behind",
      "End flash — optional impact accent",
    ],
    finishingMove:
      "Use Align to movement for directional artwork. The path moves the image; the trail only shows where it has been.",
    icon: <Route size={18} />,
  },
  {
    id: "silhouette-embers",
    name: "Silhouette embers",
    summary:
      "Use the visible pixels of an imported image as a stencil for deterministic ember starting positions.",
    ingredients: [
      "Silhouette image — transparent PNG or WebP from the Asset Library",
      "Embers — burst or repeating copies",
      "Inside an image silhouette — visible-pixel placement",
      "Movement and fade — ordinary per-copy animation",
    ],
    finishingMove:
      "The silhouette chooses where copies begin; it does not clip, recolor, or replace the ember artwork. Lower Minimum opacity only when soft pixels should also count.",
    icon: <ImageIcon size={18} />,
    buildable: false,
  },
  {
    id: "spark-to-smoke-firework",
    name: "Firework: spark to smoke",
    summary:
      "Let each original firework spark play a small smoke puff at the exact spot where it finishes.",
    ingredients: [
      "Spark burst — finite outward copies",
      "Smoke puff — preferably a finite Triggered-only layer",
      "Copy-finish event — Play layer at this spot",
      "Chance and Maximum plays — deterministic safety limits",
    ],
    finishingMove:
      "Keep the smoke target small and finite. Its Delay, Duration, easing, and property moments use the same Timeline relative to each event point; trail afterimages never trigger it.",
    icon: <Sparkles size={18} />,
    buildable: false,
  },
].map((recipe) => {
  const preset = COMPOSITION_PRESETS.find(
    (candidate) => candidate.id === recipe.id,
  );
  return preset
    ? {
        ...recipe,
        buildable: true,
        name: preset.name,
        summary: preset.description,
        ingredients: preset.ingredients,
        finishingMove: preset.lesson,
      }
    : recipe;
});

export function TutorialCenter({
  onClose,
  onStartTour,
  onStartFirstEffect,
  onBuildRecipe,
}: {
  onClose: () => void;
  onStartTour: () => void;
  onStartFirstEffect: () => void;
  onBuildRecipe?: (recipeId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<LearningTabId>("start");
  const activeIndex = LEARNING_TABS.findIndex((tab) => tab.id === activeTab);

  const handleTabKeys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const tabButtons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>("[role='tab']"),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? LEARNING_TABS.length - 1
          : (activeIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              LEARNING_TABS.length) %
            LEARNING_TABS.length;
    setActiveTab(LEARNING_TABS[nextIndex].id);
    tabButtons[nextIndex]?.focus();
  };

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="dialog learning-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="learning-title"
      >
        <header>
          <div>
            <span className="eyebrow">Learn by doing</span>
            <h2 id="learning-title">Vvfx learning center</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close learning center"
          >
            <X size={18} />
          </button>
        </header>

        <div
          className="dialog-tabs learning-tabs"
          role="tablist"
          tabIndex={-1}
          aria-label="Learning center sections"
          onKeyDown={handleTabKeys}
        >
          {LEARNING_TABS.map((tab) => (
            <button
              key={tab.id}
              id={`learning-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`learning-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              className={activeTab === tab.id ? "is-active" : ""}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        <div
          id={`learning-panel-${activeTab}`}
          className="learning-scroll"
          role="tabpanel"
          tabIndex={0}
          aria-labelledby={`learning-tab-${activeTab}`}
        >
          {activeTab === "start" && (
            <div className="learning-panel">
              <div className="learning-intro">
                <BookOpen size={18} />
                <p>
                  Vvfx takes images and makes them move, grow, fade, glow,
                  repeat, scatter, and change over time. Start with a guided
                  action, then see how four simple layers combine into one
                  complete game effect.
                </p>
              </div>
              <div className="learning-cards">
                <button type="button" onClick={onStartTour}>
                  <span className="learning-card__icon">
                    <SlidersHorizontal size={20} />
                  </span>
                  <span className="eyebrow">About 2 minutes</span>
                  <strong>Tour the workspace</strong>
                  <p>
                    Learn what the Asset Library, Layers, Preview, Inspector,
                    Timeline, and project controls do.
                  </p>
                  <span className="learning-card__action">
                    Start app tour <ChevronRight size={14} />
                  </span>
                </button>
                <button type="button" onClick={onStartFirstEffect}>
                  <span className="learning-card__icon is-mint">
                    <Sparkles size={20} />
                  </span>
                  <span className="eyebrow">About 5 minutes</span>
                  <strong>Build your first shockwave</strong>
                  <p>
                    Start empty, choose artwork, add and rename a layer, animate
                    it, play it, and save the project.
                  </p>
                  <span className="learning-card__action">
                    Start guided build <ChevronRight size={14} />
                  </span>
                </button>
                <article className="learning-template-card">
                  <span className="learning-card__icon">
                    <Save size={20} />
                  </span>
                  <span className="eyebrow">Reuse across projects</span>
                  <strong>Share one effect safely</strong>
                  <p>
                    A project keeps the whole editable workspace. A template
                    keeps one effect, group, or layer plus the images it uses,
                    then inserts an editable copy at the playhead.
                  </p>
                  <span className="learning-card__action">
                    `.vvfx-template` shares one · `.vvfx-templates` backs up all
                  </span>
                </article>
              </div>

              <section
                className="first-effect-lesson"
                aria-labelledby="first-effect-title"
              >
                <div className="learning-section-heading">
                  <div>
                    <span className="eyebrow">Your first complete effect</span>
                    <h3 id="first-effect-title">
                      Build a readable magic impact
                    </h3>
                  </div>
                  <span className="learning-section-badge">4 layers</span>
                </div>
                <p className="learning-lead">
                  Think of layers as beats in one tiny story: contact, energy,
                  debris, then atmosphere. They overlap, but each has one clear
                  job.
                </p>
                <ol className="effect-beats">
                  {FIRST_EFFECT_BEATS.map((beat, index) => (
                    <li key={beat.title}>
                      <span className="effect-beat__number">{index + 1}</span>
                      <div>
                        <header>
                          <strong>{beat.title}</strong>
                          <span>{beat.timing}</span>
                        </header>
                        <p>{beat.text}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="learning-note">
                  <Sparkles size={16} />
                  <p>
                    The complete effect comes from combining simple ingredients.
                    Make one layer do one job; if the result feels muddy, Solo
                    each layer and ask whether you can describe its job in one
                    sentence.
                  </p>
                </div>
              </section>
            </div>
          )}

          {activeTab === "recipes" && (
            <div className="learning-panel">
              <div className="learning-section-heading learning-section-heading--padded">
                <div>
                  <span className="eyebrow">Layer combinations</span>
                  <h3>Recipes to copy and remix</h3>
                </div>
              </div>
              <p className="learning-lead learning-lead--padded">
                Recipes are starting points, not rules. Build the listed layers,
                press Solo to understand each one, then change color, timing,
                scale, and artwork to make the effect yours.
              </p>
              <div className="recipe-grid">
                {EFFECT_RECIPES.map((recipe) => (
                  <article className="recipe-card" key={recipe.id}>
                    <header>
                      <span className="recipe-card__icon">{recipe.icon}</span>
                      <div>
                        <h4>{recipe.name}</h4>
                        <p>{recipe.summary}</p>
                      </div>
                    </header>
                    <span className="eyebrow">Ingredients</span>
                    <ul>
                      {recipe.ingredients.map((ingredient) => (
                        <li key={ingredient}>
                          <Check size={13} />
                          <span>{ingredient}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="recipe-card__tip">
                      <strong>Finishing move</strong>
                      <span>{recipe.finishingMove}</span>
                    </div>
                    {onBuildRecipe && recipe.buildable && (
                      <button
                        className="recipe-build-button"
                        type="button"
                        onClick={() => onBuildRecipe(recipe.id)}
                      >
                        Build this recipe <ChevronRight size={14} />
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </div>
          )}

          {activeTab === "boundary" && (
            <div className="learning-panel learning-panel--padded">
              <div className="learning-section-heading">
                <div>
                  <span className="eyebrow">Choose the right tool</span>
                  <h3>Artwork first, behavior second</h3>
                </div>
              </div>
              <p className="learning-lead">
                An image editor creates the pixels. Vvfx tells those pixels how
                to behave over time. Phaser rendering code handles effects that
                need shaders or per-pixel distortion.
              </p>
              <div className="tool-choice-strip" aria-label="Tool choice guide">
                <div>
                  <ImageIcon size={18} />
                  <strong>Need to draw or reshape it?</strong>
                  <span>Use Krita, Aseprite, or another image editor.</span>
                </div>
                <ChevronRight size={16} aria-hidden="true" />
                <div>
                  <Timer size={18} />
                  <strong>Need it to move or change?</strong>
                  <span>Bring the artwork into Vvfx and animate layers.</span>
                </div>
              </div>
              <div className="boundary-grid">
                {PRODUCT_BOUNDARY.map((item) => (
                  <article key={item.area}>
                    <strong>{item.area}</strong>
                    <p>{item.use}</p>
                  </article>
                ))}
              </div>
              <div className="learning-note learning-note--wide">
                <Palette size={16} />
                <p>
                  <strong>Color over time</strong> changes the whole image as it
                  plays. A <strong>spatial gradient</strong> puts different
                  colors across different parts of one image. Paint that in the
                  source for broad compatibility, or try the Experimental WebGL
                  gradient.
                </p>
              </div>
              <section
                className="asset-checklist"
                aria-labelledby="asset-checklist-title"
              >
                <div>
                  <span className="learning-card__icon is-mint">
                    <ImageIcon size={20} />
                  </span>
                  <div>
                    <span className="eyebrow">Before importing</span>
                    <h4 id="asset-checklist-title">
                      Asset preparation checklist
                    </h4>
                  </div>
                </div>
                <ul>
                  {ASSET_PREP_CHECKLIST.map((item) => (
                    <li key={item}>
                      <Check size={14} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}

          {activeTab === "professional" && (
            <div className="learning-panel learning-panel--padded">
              <div className="learning-section-heading">
                <div>
                  <span className="eyebrow">
                    Professional ideas, simplified
                  </span>
                  <h3>Most game effects combine small ingredients</h3>
                </div>
              </div>
              <p className="learning-lead">
                Professional VFX artists rarely rely on one complicated image.
                They combine a flash, a shape, particles, and a softer ending,
                then choreograph those pieces over a few milliseconds.
              </p>
              <div
                className="tool-choice-strip tool-choice-strip--three"
                aria-label="Game VFX workflow"
              >
                <div>
                  <ImageIcon size={18} />
                  <strong>Art program</strong>
                  <span>Creates the visual ingredient.</span>
                </div>
                <ChevronRight size={16} aria-hidden="true" />
                <div>
                  <SlidersHorizontal size={18} />
                  <strong>Vvfx</strong>
                  <span>Controls how it behaves over time.</span>
                </div>
                <ChevronRight size={16} aria-hidden="true" />
                <div>
                  <CirclePlay size={18} />
                  <strong>Your game</strong>
                  <span>Chooses when and where it plays.</span>
                </div>
              </div>
              <div className="boundary-grid">
                <article>
                  <strong>Smoke</strong>
                  <p>
                    Draw the puff and its shading in an art program. In Vvfx,
                    make copies rise, grow, fade, vary, and wander organically.
                  </p>
                </article>
                <article>
                  <strong>Blood</strong>
                  <p>
                    Draw the splatter silhouette and texture. In Vvfx, add the
                    fast flash, overshoot, outward droplets, settling, and fade.
                  </p>
                </article>
                <article>
                  <strong>Fire</strong>
                  <p>
                    Draw a flame or sprite-sheet flipbook. In Vvfx, control FPS,
                    flicker, color, size variation, smoke, and repetition.
                  </p>
                </article>
                <article>
                  <strong>Projectile</strong>
                  <p>
                    Draw the projectile head or streak. In Vvfx, give it a path,
                    trail, movement alignment, glow-like additive mixing, and an
                    impact event.
                  </p>
                </article>
              </div>
              <div className="learning-note learning-note--wide">
                <Timer size={16} />
                <p>
                  <strong>One coherent clock:</strong> flipbooks, property
                  curves, event delays, and trail samples all use the same layer
                  timing shown on the main Timeline. An event simply gives a
                  layer a new starting point; it does not create a second
                  animation system.
                </p>
              </div>
              <div className="boundary-grid">
                <article>
                  <strong>Flipbook</strong>
                  <p>
                    Several drawings stored in one grid and played quickly. Vvfx
                    controls the frame range, speed, direction, and looping.
                  </p>
                </article>
                <article>
                  <strong>Curve</strong>
                  <p>
                    Property moments describe a value during the layer lifetime.
                    Try Punch when something should grow too large, then settle.
                  </p>
                </article>
                <article>
                  <strong>Event</strong>
                  <p>
                    One layer starts another: bubble finishes, then pop plays.
                    Event links are deterministic and protected from loops.
                  </p>
                </article>
                <article>
                  <strong>Image silhouette spawning</strong>
                  <p>
                    Visible pixels in an imported image act like a placement
                    stencil. Copies start inside that shape; the stencil does
                    not crop or recolor their own artwork.
                  </p>
                </article>
                <article>
                  <strong>Copy-finish event</strong>
                  <p>
                    Each original burst or repeating copy can play a layer at
                    its final position. Start with a finite, unattached
                    Triggered Animated image or Burst; chance and a maximum-play
                    limit keep the result deterministic and bounded.
                  </p>
                </article>
                <article>
                  <strong>Trail and organic movement</strong>
                  <p>
                    Trails show where something has been. Organic movement makes
                    smoke or magic wander naturally while remaining seed-safe.
                  </p>
                </article>
                <article>
                  <strong>Effect performance</strong>
                  <p>
                    Alive and peak sprites are measured. Duration and spawn
                    pressure are estimates. Stress copies are a guarded preview,
                    not a promise about every device.
                  </p>
                </article>
              </div>
            </div>
          )}

          {activeTab === "experimental" && (
            <div className="learning-panel learning-panel--padded">
              <div className="learning-section-heading">
                <div>
                  <span className="eyebrow">
                    Safe to try, still being tested
                  </span>
                  <h3>Experimental rendering lab</h3>
                </div>
                <span className="learning-section-badge learning-section-badge--experimental">
                  Experimental
                </span>
              </div>
              <p className="learning-lead">
                Experimental effects are real, usable controls. They save with
                the project and export to the Phaser runtime, but they use the
                GPU and still need feedback across different browsers, devices,
                and game scenes.
              </p>
              <div className="learning-note learning-note--wide">
                <ImageIcon size={16} />
                <p>
                  <strong>Image silhouette spawning is not a shader:</strong> it
                  turns an imported image&apos;s visible pixels into
                  deterministic spawn positions. It belongs to the normal Tier 2
                  spawn tools, does not visually mask a sprite, and does not
                  require WebGL.
                </p>
              </div>
              <div
                className="boundary-grid"
                role="list"
                aria-label="Experimental rendering compatibility"
              >
                <article role="listitem">
                  <strong>Editor and Phaser WebGL</strong>
                  <p>
                    Visual clipping masks, blur, outer glow,
                    brightness/exposure, animated shine, gradients,
                    straight-wipe dissolve, noisy erosion, sprite warp, and
                    local heat shimmer render through Phaser WebGL.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Canvas fallback</strong>
                  <p>
                    Canvas-only devices keep the ordinary, unmasked and
                    un-eroded sprite visible but skip these GPU effects instead
                    of breaking playback. Add a normal opacity fade when it must
                    still disappear.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Projects and game export</strong>
                  <p>
                    Experimental settings are stored in .vvfx files, Runtime
                    JSON, and runtime-backed Phaser TypeScript.
                  </p>
                </article>
                <article role="listitem">
                  <strong>WebM and GIF</strong>
                  <p>
                    Preview recording captures the rendered Phaser canvas. Test
                    an important export on the browser and device you will use.
                  </p>
                </article>
              </div>
              <div className="learning-note learning-note--wide learning-note--experimental">
                <FlaskConical size={16} />
                <p>
                  <strong>What the warp changes:</strong> it bends the selected
                  sprite itself. The local heat shimmer is also contained inside
                  that sprite. True refraction or heat haze that bends the game
                  scene is decision-deferred because it needs explicit
                  game-camera capture and multi-camera rules.
                </p>
              </div>
              <div className="learning-note learning-note--wide learning-note--experimental">
                <ImageIcon size={16} />
                <p>
                  <strong>What clipping changes:</strong> a separate still mask
                  decides which pixels of this sprite remain visible. It does
                  not choose spawn positions. Opacity mode reads transparency;
                  Brightness mode reads dark and light artwork.
                </p>
              </div>
              <div className="learning-note learning-note--wide learning-note--experimental">
                <FlaskConical size={16} />
                <p>
                  <strong>What erosion changes:</strong> seeded procedural noise
                  removes this sprite&apos;s own pixels. Gradient and warp feed
                  into erosion; shine, blur, and glow then react to the
                  remaining silhouette. Each visible copy adds one GPU pass, so
                  bursts, emitters, and trails multiply that work.
                </p>
              </div>
              <div
                className="boundary-grid experimental-scope-grid"
                role="list"
                aria-label="Experimental rendering tools"
              >
                <article role="listitem">
                  <strong>Clip with another image</strong>
                  <p>
                    A still mask crops every copy of the selected layer. The
                    mask follows that copy for its existing lifetime instead of
                    adding another Timeline.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Soft light</strong>
                  <p>
                    Outer glow adds a colored halo. Blur softens the selected
                    image. Both can cost more when many copies are alive.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Brightness and shine</strong>
                  <p>
                    Brightness/exposure lightens or darkens the selected image.
                    Animated shine sweeps a bright band across it.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Color across an image</strong>
                  <p>
                    A spatial gradient colors different places on one sprite.
                    Color over lifetime still changes the whole sprite as time
                    passes.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Straight wipe</strong>
                  <p>
                    One soft edge erases the sprite across or down the image.
                    Reverse wipe changes which side it travels from.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Noisy erosion</strong>
                  <p>
                    Irregular patches disappear according to repeatable seeded
                    noise. This changes sprite alpha; image-silhouette spawning
                    chooses copy positions, while Noise warp only bends pixels.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Sprite warp and shimmer</strong>
                  <p>
                    Warp bends the image texture. Local heat shimmer animates
                    that bend for fire, energy, or unstable magic.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Try: Dissolving spirit</strong>
                  <p>
                    Add the Experimental Dissolving spirit layer preset. Watch
                    its medium-size noise patches erase the rising cloud, then
                    replace the cloud with a tightly cropped rune, ghost, or
                    splatter. Test one copy before stress-testing a burst.
                  </p>
                </article>
                <article role="listitem">
                  <strong>Try: Masked energy ring</strong>
                  <p>
                    Add the Experimental Masked energy ring preset. A soft cloud
                    is kept only inside the Energy ring mask. Swap the kept and
                    hidden areas, then replace the mask with your own still PNG
                    or WebP.
                  </p>
                </article>
              </div>
            </div>
          )}

          {activeTab === "glossary" && (
            <div className="learning-panel learning-panel--padded">
              <div className="learning-section-heading">
                <div>
                  <span className="eyebrow">Plain-language reference</span>
                  <h3>VFX words you will see in the app</h3>
                </div>
              </div>
              <p className="learning-lead">
                You do not need to memorize these. Use this page whenever a
                control sounds unfamiliar.
              </p>
              <dl className="glossary-grid">
                {VFX_GLOSSARY.map(([term, meaning]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{meaning}</dd>
                  </div>
                ))}
              </dl>
              <div className="learning-note learning-note--wide">
                <Layers3 size={16} />
                <p>
                  The fastest way to learn is to duplicate a preset, change one
                  control, and compare the result. Reset buttons take individual
                  controls back to their starting value.
                </p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const GUIDE_STEPS = [
  {
    focus: "projects" as TourFocus,
    title: "Start with a clean project",
    text: "A new Vvfx project begins with no effect layers. The built-in shapes stay available as practice artwork.",
    action: "Create empty project",
  },
  {
    focus: "assets" as TourFocus,
    title: "Choose the Energy ring",
    text: "Images are ingredients. Select the built-in Energy ring so the next layer knows which artwork to use.",
    action: "Select Energy ring",
  },
  {
    focus: "layers" as TourFocus,
    title: "Add one animated layer",
    text: "An animated layer creates one image and changes it over time. This is perfect for a shockwave.",
    action: "Add animated layer",
  },
  {
    focus: "inspector" as TourFocus,
    title: "Name it and shape the motion",
    text: "A shockwave starts small, expands quickly, and fades. The guided action applies those settings; inspect them afterward to see the connection.",
    action: "Apply shockwave settings",
  },
  {
    focus: "preview" as TourFocus,
    title: "Watch the result",
    text: "Restart the preview and watch the ring expand. Try changing Ending size or How long it lasts after the tutorial.",
    action: "Play my shockwave",
  },
  {
    focus: "projects" as TourFocus,
    title: "Save it for later",
    text: "Save keeps the editable project in this browser. Use Load in the top bar whenever you want to reopen it.",
    action: "Save project",
  },
];

export function FirstEffectGuide({
  step,
  actionComplete,
  onStepChange,
  onAction,
  onClose,
}: {
  step: number;
  actionComplete: boolean;
  onStepChange: (step: number) => void;
  onAction: (step: number) => void;
  onClose: () => void;
}) {
  const item = GUIDE_STEPS[step];
  const last = step === GUIDE_STEPS.length - 1;
  return (
    <aside
      className="tutorial-coach"
      role="dialog"
      aria-label="Build your first shockwave tutorial"
    >
      <header>
        <div>
          <span className="eyebrow">
            First effect · step {step + 1} of {GUIDE_STEPS.length}
          </span>
          <strong>{item.title}</strong>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close guided tutorial"
        >
          <X size={16} />
        </button>
      </header>
      <div className="tutorial-progress">
        <span
          style={{ width: `${((step + 1) / GUIDE_STEPS.length) * 100}%` }}
        />
      </div>
      <p>{item.text}</p>
      <button
        className="tutorial-action"
        type="button"
        disabled={actionComplete}
        onClick={() => onAction(step)}
      >
        {actionComplete ? "Done — inspect the result" : item.action}
        {!actionComplete && <ChevronRight size={14} />}
      </button>
      <footer>
        <button
          type="button"
          onClick={() => onStepChange(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ChevronLeft size={14} /> Back
        </button>
        <button
          type="button"
          onClick={() => (last ? onClose() : onStepChange(step + 1))}
        >
          {last ? "Finish" : actionComplete ? "Continue" : "Skip this step"}
          {!last && <ChevronRight size={14} />}
        </button>
      </footer>
    </aside>
  );
}
