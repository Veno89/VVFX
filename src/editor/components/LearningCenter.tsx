"use client";

import {
  ChevronLeft,
  ChevronRight,
  CirclePlay,
  ImageIcon,
  Layers3,
  MousePointer2,
  PanelRight,
  Save,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import { StartChoices } from "./StartChoices";
import { type ReactNode, type RefObject } from "react";
import { useFocusRegion } from "../useFocusRegion";

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
      "Save stores the editable project in this browser. File → Load reopens it. Export creates a portable .vvfx file, recommended .vvfx-runtime.json, or an Advanced TypeScript wrapper.",
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
  onStartGuide,
  onStartPreset,
}: {
  step: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  /** When provided, the last step offers a first project to start from. */
  onStartGuide?: () => void;
  onStartPreset?: (presetId: string) => void;
}) {
  const item = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const offerStart = last && onStartGuide && onStartPreset;
  const dialogRef = useFocusRegion<HTMLDivElement>({ onEscape: onSkip });
  return (
    <div
      ref={dialogRef}
      className={`onboarding-overlay onboarding-overlay--${item.focus}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <section className={`tour-card ${offerStart ? "tour-card--start" : ""}`}>
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
        {offerStart && (
          <StartChoices
            onStartGuide={onStartGuide}
            onStartPreset={onStartPreset}
          />
        )}
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
            {offerStart ? "Empty project" : last ? "Start creating" : "Next"}{" "}
            {!last && <ChevronRight size={15} />}
          </button>
        </footer>
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
    text: "Save keeps the editable project in this browser. Use File → Load in the top bar whenever you want to reopen it.",
    action: "Save project",
  },
];

export function FirstEffectGuide({
  step,
  actionComplete,
  onStepChange,
  onAction,
  onClose,
  continueRef,
}: {
  step: number;
  actionComplete: boolean;
  onStepChange: (step: number) => void;
  onAction: (step: number) => void;
  onClose: () => void;
  continueRef?: RefObject<HTMLButtonElement | null>;
}) {
  const item = GUIDE_STEPS[step];
  const last = step === GUIDE_STEPS.length - 1;
  const dialogRef = useFocusRegion<HTMLElement>({
    autoFocus: false,
    onEscape: onClose,
    trapFocus: false,
  });
  return (
    <aside
      ref={dialogRef}
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
          ref={continueRef}
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
