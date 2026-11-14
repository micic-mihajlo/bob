/**
 * Bob, the builder of the factory: a pixel-art builder in a yellow hard hat, a checked shirt, blue
 * overalls, a tool belt and work boots. Framework-free, so the desktop app and the web app draw the
 * same pixels.
 *
 * Two drawings: `small` is a 16x16 head and shoulders for rows, tabs and headers (16 to 24 px), and
 * `large` is a 24x32 full figure on a 32x32 canvas for empty states and the welcome (64 to 96 px).
 * Four states: idle, working (a two-frame hammer loop), needs-you (a raised hand and a sign) and error.
 */

export type BuilderState = "idle" | "working" | "needs-you" | "error";
export type BuilderSize = "small" | "large";

export const BUILDER_STATES: readonly BuilderState[] = ["idle", "working", "needs-you", "error"];

/** One letter per colour. "." is transparent, and "x" in a layer clears the pixel under it. */
export const BUILDER_PALETTE: Record<string, string> = {
  K: "#2a2220",
  H: "#f7c42f",
  h: "#c99716",
  L: "#ffe68a",
  N: "#7a4a26",
  S: "#f4c7a1",
  s: "#dc9f74",
  E: "#2a2220",
  C: "#f19a86",
  M: "#9a3d2c",
  O: "#d8582c",
  o: "#f2a65e",
  J: "#3d72c2",
  j: "#2d5698",
  B: "#7b4a26",
  b: "#e8bd4f",
  D: "#6b4426",
  T: "#9aa3ad",
  t: "#a8643a",
  W: "#ffffff",
  R: "#e5483a",
  U: "#7ab8e6",
};

interface Layer {
  x: number;
  y: number;
  rows: string[];
  /** Drawn only in this frame of an animated state. */
  frame?: 0 | 1;
}

const SMALL: string[] = [
  "................",
  "......KKKK......",
  "....KKHHHLKK....",
  "...KHHHhHHHLK...",
  "...KHHHhHHHHK...",
  ".KKHHHHHHHHHHKK.",
  ".KhhhhhhhhhhhhK.",
  "..KNSSSSSSSSNK..",
  "..KNSESSSSESNK..",
  "..KSCSSssSSCSK..",
  "..KSSMSSSSMSSK..",
  "...KKSMMMMSKK...",
  "..KOOKKSSKKOOK..",
  ".KOoOJKKKKJOoOK.",
  ".KoOoJJjjJJoOoK.",
  ".KOoOJJJJJJOoOK.",
];

const LARGE: string[] = [
  "........................",
  ".........KKKKKK.........",
  ".......KKHHHHHLKK.......",
  "......KHHHHHhHHHLK......",
  ".....KHHHHHHhHHHHLK.....",
  ".....KHHHHHHhHHHHHK.....",
  ".....KHHHHHHhHHHHHK.....",
  "...KKHHHHHHHHHHHHHHKK...",
  "...KhhhhhhhhhhhhhhhhK...",
  "....KNSSSSSSSSSSSSNK....",
  "....KNSSEESSSSEESSNK....",
  "....KNSSEESSSSEESSNK....",
  "....KSCCSSSssSSSCCSK....",
  "....KSSSMSSSSSSMSSSK....",
  "....KSSSSMMMMMMSSSSK....",
  ".....KSSSSSSSSSSSSK.....",
  "......KKSSSSSSSSKK......",
  "...KKOoOoOKSSKOoOoOKK...",
  "..KOoOoOJKKKKKKJOoOoOK..",
  ".KOoOKJJJJJJJJJJJJKOoOK.",
  ".KoOoKJJJjjjjjjJJJKoOoK.",
  ".KOoOKJJJjjjjjjJJJKOoOK.",
  ".KoOoKJJJJJJJJJJJJKoOoK.",
  ".KSSKJJJJJJJJJJJJJJKSSK.",
  ".KSSKBBBBBBbbBBBBBBKSSK.",
  "...KJJJJJJJJJJJJJJJJK...",
  "...KJJJJJJJKKJJJJJJJK...",
  "...KJJJJJJK..KJJJJJJK...",
  "...KjJJJJJK..KJJJJJjK...",
  "..KDDDDDDDK..KDDDDDDDK..",
  "..KKKKKKKKK..KKKKKKKKK..",
  "........................",
];

const MARK = [".KK.", "KRRK", "KRRK", "KRRK", "KRRK", ".KK.", "KRRK", ".KK."];

const OVERLAYS: Record<BuilderSize, Record<BuilderState, Layer[]>> = {
  small: {
    idle: [],
    working: [
      { x: 12, y: 6, frame: 0, rows: ["TTT.", "TTT.", ".t..", ".t.."] },
      { x: 12, y: 9, frame: 1, rows: ["....", ".t..", "TTTt", "TTT."] },
    ],
    "needs-you": [{ x: 13, y: 0, rows: ["KRK", "KRK", "KRK", ".K.", "KRK", ".K."] }],
    error: [
      { x: 4, y: 8, rows: ["ESESSESE".slice(0, 8), "SESSSSES", "ESESSESE"] },
      { x: 6, y: 10, rows: ["SSSS"] },
      { x: 6, y: 11, rows: ["MMMM"] },
      { x: 13, y: 7, rows: ["U", "U"] },
    ],
  },
  large: {
    idle: [],
    working: [
      { x: 20, y: 13, frame: 0, rows: ["KKKK", "KTTK", "KTTKK", "KTTTK", ".KtK.", ".KtK.", ".KtK.", ".KSSK", ".KSSK", ".KSSK"] },
      { x: 20, y: 21, frame: 1, rows: ["..KK...", ".KSSK..", ".KSSKtK", "KKKKKtK", "KTTTTKK", "KTTTTK.", "KKKKKK."] },
    ],
    "needs-you": [
      { x: 1, y: 20, rows: ["xxxx", "xxxx", "xxxx", "xxxK", "xxxK"] },
      { x: 0, y: 6, rows: [".KKK.", "KSSSK", "KSSSK", ".KOK.", ".KoK.", ".KOK.", ".KoK.", ".KOK.", ".KoK.", ".KOK.", ".KoKK", ".KOoK", ".KoOK", ".KOoK"] },
      { x: 20, y: 0, rows: MARK },
    ],
    error: [
      { x: 7, y: 9, rows: ["ESSE", "SEES", "SEES", "ESSE"] },
      { x: 13, y: 9, rows: ["ESSE", "SEES", "SEES", "ESSE"] },
      { x: 8, y: 13, rows: ["SSMMMMSS", "SMSSSSMS"] },
      { x: 19, y: 9, rows: ["U", "UU", "UU"] },
    ],
  },
};

/** The pixel grid of one drawing and frame, base first and the state's layers on top. */
export function builderPixels(state: BuilderState, size: BuilderSize, frame: 0 | 1 = 0): string[][] {
  const base = size === "small" ? SMALL : LARGE;
  const width = size === "small" ? 16 : 32;
  const height = size === "small" ? 16 : 32;
  const offsetX = size === "small" ? 0 : 4;
  const grid = Array.from({ length: height }, () => Array.from({ length: width }, () => "."));
  const paint = (x0: number, y0: number, rows: string[]) =>
    rows.forEach((row, y) =>
      [...row].forEach((cell, x) => {
        const gx = x0 + x;
        const gy = y0 + y;
        const line = grid[gy];
        if (cell !== "." && line && gx >= 0 && gx < width) line[gx] = cell === "x" ? "." : cell;
      }),
    );
  paint(offsetX, 0, base);
  for (const layer of OVERLAYS[size][state]) {
    if (layer.frame === undefined || layer.frame === frame) paint(layer.x + offsetX, layer.y, layer.rows);
  }
  return grid;
}

function rects(grid: string[][]): string {
  let out = "";
  grid.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const cell = row[x] ?? ".";
      let end = x + 1;
      while (end < row.length && row[end] === cell) end += 1;
      if (cell !== ".") out += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${BUILDER_PALETTE[cell]}"/>`;
      x = end;
    }
  });
  return out;
}

/**
 * The SVG markup of Bob in one state. "working" holds both hammer frames and swaps them every 280 ms;
 * with reduced motion it rests on the first frame.
 */
export function builderSvg(state: BuilderState, size: BuilderSize, title = "Bob"): string {
  const box = size === "small" ? 16 : 32;
  const open = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges" role="img" aria-label="${title}">`;
  if (state !== "working") return `${open}${rects(builderPixels(state, size))}</svg>`;
  const style =
    "<style>.f1{animation:bob-hammer 560ms steps(1) infinite}.f0{animation:bob-hammer 560ms steps(1) infinite reverse}@keyframes bob-hammer{0%{opacity:1}50%{opacity:0}}@media (prefers-reduced-motion:reduce){.f0,.f1{animation:none}.f1{opacity:0}}</style>";
  return `${open}${style}<g class="f0">${rects(builderPixels(state, size, 0))}</g><g class="f1">${rects(builderPixels(state, size, 1))}</g></svg>`;
}
