/**
 * What an agent is doing, as far as its face is concerned.
 *
 * `idle`, `working`, `waiting`, `failed` and `responded` are derived from the agent's own runtime
 * signals. `connecting` and `asleep` belong to the surface around it - a remote desktop dialling
 * in, a snoozed or disconnected agent - so they are passed in rather than derived.
 */
export type AvatarMood = "idle" | "working" | "waiting" | "failed" | "responded" | "connecting" | "asleep";

export interface AvatarMoodPresentation {
  /** A turning ring around a photo avatar, which cannot show the mood on its own face. */
  rings: boolean;
  /**
   * Amplitude of the breathing scale, as a fraction of the avatar's size. It moves the whole
   * rendered avatar, so it can never edit a silhouette - 0 holds still.
   */
  breathe: number;
}

const MOOD_PRESENTATIONS: Readonly<Record<AvatarMood, AvatarMoodPresentation>> = {
  idle: { rings: false, breathe: 0 },
  working: { rings: true, breathe: 0.03 },
  waiting: { rings: false, breathe: 0 },
  failed: { rings: false, breathe: 0 },
  responded: { rings: false, breathe: 0 },
  connecting: { rings: true, breathe: 0 },
  asleep: { rings: false, breathe: 0 },
};

export function avatarMoodPresentation(mood: AvatarMood): AvatarMoodPresentation {
  return MOOD_PRESENTATIONS[mood];
}

/** Whether a mood keeps moving on its own, rather than only settling into a face. */
export function avatarMoodIsBusy(mood: AvatarMood): boolean {
  const presentation = MOOD_PRESENTATIONS[mood];
  return presentation.rings || presentation.breathe > 0;
}
