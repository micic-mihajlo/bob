// The Bob mark as plain data, so that a canvas or a logo file can draw the same mark that `AppLogo`
// draws as SVG: Bob's orb (`bob-face-shape.ts`) on a black tile, lit by a soft white glow, with a
// hairline edge like the liquid glass of the app.

/** The mark is a square of this side, in its own units. */
export const APP_LOGO_SIZE = 240;
/** The corner radius of the square, in the same units. */
export const APP_LOGO_CORNER = 50;

/** The orb on the tile: its 64-unit square is scaled by `scale` and centered on (`x`, `y`). */
export const APP_LOGO_FACE = { x: 120, y: 120, scale: 2.5 } as const;

/** The glow behind the orb, a radial fade of white around the orb center. */
export const APP_LOGO_GLOW = { radius: 118, opacity: 0.2 } as const;

/** The hairline inside the tile edge, white at this opacity, brightest along the top. */
export const APP_LOGO_EDGE = { width: 2, top: 0.22, bottom: 0.05 } as const;

/**
 * Each build has its own orb, so two apps that are open at the same time stay easy to tell apart:
 * the release is Bob's grey orb, dev is a gold orb and preview a mint orb, all on a black tile.
 * `faceHue` goes to `bobFaceColors`; `null` is Bob's grey.
 */
export const APP_LOGO_PALETTES = {
  production: { skyTop: "#161616", skyBottom: "#000000", faceHue: null },
  dev: { skyTop: "#1f1708", skyBottom: "#000000", faceHue: 42 },
  preview: { skyTop: "#0a1f14", skyBottom: "#000000", faceHue: 145 },
} as const;

/**
 * The scribbled eyes of the earlier Bob mark, as SVG `points`. `AppLogo` no longer draws them;
 * they stay exported for the social cards and the landing scene that still import them.
 */
export const APP_LOGO_EYE_POINTS = {
  left: "43.55 93.61 64.69 81.41 36.48 108.04 79.67 83.11 35.93 122.88 91.58 90.74 38.9 132.69 97.66 98.76 42.44 138.88 100.43 105.4 46.9 143.83 101.97 112.04 55.08 149.51 101.83 122.52 73.01 152.43 94.14 140.23",
  right:
    "145.65 93.61 166.79 81.41 140.83 101.52 175.58 81.46 138.3 109.53 183.18 83.63 137.55 117.43 189.67 87.33 139.67 129.39 197.88 95.78 142.92 136.32 201.52 102.48 149.03 143.86 204.07 112.08 159.14 150.37 203.51 124.75 169.28 152.61 199.82 134.98",
} as const;
