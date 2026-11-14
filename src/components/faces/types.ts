export const MOODS = ["idle", "working", "waiting", "needs_you", "failed", "responded"] as const;
export type Mood = (typeof MOODS)[number];

export type FaceSize = 24 | 32 | 36 | 44 | 96;

export const HEAD_SHAPES = ["round", "squircle", "tall", "wide", "egg"] as const;
export const EYE_KINDS = ["dot", "oval", "ring", "sleepy", "bead"] as const;
export const MOUTH_KINDS = ["line", "smile", "cat", "small", "grin"] as const;
export const ACCESSORIES = ["none", "antenna", "tuft", "sprout", "bandage", "headband", "bolt"] as const;

export type Traits = {
  readonly hash: number;
  readonly head: (typeof HEAD_SHAPES)[number];
  readonly eyes: (typeof EYE_KINDS)[number];
  readonly mouth: (typeof MOUTH_KINDS)[number];
  readonly accessory: (typeof ACCESSORIES)[number];
  /** Half the distance between the eyes, in face units (0..100 box). */
  readonly eyeGap: number;
  readonly eyeY: number;
  readonly eyeScale: number;
  readonly tilt: number;
  /** 0..1, desynchronises idle motion between faces. */
  readonly phase: number;
  readonly brows: boolean;
  readonly cheeks: boolean;
  readonly freckles: boolean;
};

export type Vec = { readonly x: number; readonly y: number };

export type Expression = {
  /** 0 closed .. 1 open, above 1 is wide-eyed. */
  readonly eyeOpen: number;
  readonly pupil: number;
  /** Upper-lid droop, 0..1. */
  readonly lid: number;
  /** Closed upturned "^ ^" eyes, 0..1. */
  readonly happy: number;
  /** -1 frown .. 1 smile. */
  readonly mouthCurve: number;
  readonly mouthOpen: number;
  readonly mouthWidth: number;
  /** -1 worried (inner ends up) .. 1 focused (inner ends down). */
  readonly brow: number;
  readonly browLift: number;
  /** Head sinks and tilts, 0..1. */
  readonly droop: number;
  readonly bob: number;
  readonly bobHz: number;
  readonly gaze: Vec;
  /** Colour saturation multiplier, failed faces fade. */
  readonly vivid: number;
};

/** Everything a renderer needs for one frame. Renderers draw into a 100x100 unit box. */
export type FaceFrame = {
  readonly size: number;
  /** Face units per CSS pixel; use it to keep strokes legible at small sizes. */
  readonly unit: number;
  readonly t: number;
  readonly traits: Traits;
  readonly hue: number;
  readonly mood: Mood;
  readonly prevMood: Mood;
  readonly moodT: number;
  readonly expr: Expression;
  /** The mood whose marks show; responded settles to idle. */
  readonly shown: Mood;
  readonly look: Vec;
  readonly blink: number;
};

export type FaceRenderer = {
  readonly label: string;
  readonly fps: 12 | 30;
  readonly technique: string;
  draw(ctx: CanvasRenderingContext2D, frame: FaceFrame): void;
};
