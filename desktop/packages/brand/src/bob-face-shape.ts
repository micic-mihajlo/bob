// Bob's bot as plain data, so the avatar, the app logo, the app icons and a canvas all draw the same
// character: a grey orb lit from the upper left, with two black pill-shaped eyes. Every number is in
// the units of a square of `BOB_FACE_SIZE`. The orb is the one in `design/app-ui/README.md`:
// radial-gradient(70% 70% at 32% 28%, #fff 0%, #e4e4e4 16%, #8c8c8c 50%, #161616 100%).

export const BOB_FACE_SIZE = 64;

export const BOB_FACE_BODY = { cx: 32, cy: 32, r: 28 } as const;

/** The two eyes are upright pills centered on (`leftX` | `rightX`, `y`), so a blink is a scale on Y. */
export const BOB_FACE_EYES = { leftX: 26, rightX: 38, y: 32, width: 4.8, height: 9 } as const;

/** A drooping eye for a failed turn: shorter, and lower on the orb. */
export const BOB_FACE_SAD_EYES = { height: 6.2, drop: 1.6 } as const;

/** The width of the closed eyes, which are strokes. */
export const BOB_FACE_STROKE = 3.2;

export const BOB_FACE_PATHS = {
  /** Closed, smiling eyes: the face after a good answer. */
  happyEyes: "M23.4 33.6Q26 28.8 28.6 33.6M35.4 33.6Q38 28.8 40.6 33.6",
  /** Closed, resting eyes: an agent that sleeps. */
  sleepyEyes: "M23.4 32.4Q26 35.2 28.6 32.4M35.4 32.4Q38 35.2 40.6 32.4",
} as const;

/** The orb is a radial gradient lit from the upper left: white at the highlight, `deep` at the rim. */
export const BOB_FACE_GRADIENT = { cx: 0.32, cy: 0.28, r: 0.7, lightOffset: 0.16, midOffset: 0.5 } as const;

export interface BobFaceColors {
  light: string;
  mid: string;
  deep: string;
  /** The eyes. */
  ink: string;
}

/** Bob's own colors: the grey orb of the design reference, with black eyes. */
export const BOB_FACE_COLORS: BobFaceColors = {
  light: "#e4e4e4",
  mid: "#8c8c8c",
  deep: "#161616",
  ink: "#000000",
};

/**
 * The orb in another hue, for an agent that has one: the same lightness steps as Bob's grey orb, so
 * every orb reads as one family, and the same black eyes. `null` is Bob's own grey.
 */
export function bobFaceColors(hue: number | null): BobFaceColors {
  if (hue === null) return BOB_FACE_COLORS;
  return {
    light: hsl(hue, 70, 90),
    mid: hsl(hue, 42, 56),
    deep: hsl(hue, 30, 9),
    ink: BOB_FACE_COLORS.ink,
  };
}

/**
 * One color for the agent's name and its marks beside text. With a hue, its relative luminance is
 * held near 0.2, which gives about 4.7:1 against the black canvas whatever the hue. Bob's own is the
 * light grey of its orb.
 */
export function bobFaceAccent(hue: number | null): string {
  if (hue === null) return BOB_FACE_COLORS.light;
  let low = 20;
  let high = 80;
  for (let step = 0; step < 12; step += 1) {
    const lightness = (low + high) / 2;
    if (luminance(hsl(hue, 55, lightness)) < 0.2) low = lightness;
    else high = lightness;
  }
  return hsl(hue, 55, low);
}

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const linear = (channel: number) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear((value >> 16) & 255) + 0.7152 * linear((value >> 8) & 255) + 0.0722 * linear(value & 255);
}

function hsl(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) =>
    Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
