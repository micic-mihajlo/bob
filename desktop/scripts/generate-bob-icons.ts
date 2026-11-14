/**
 * Writes the Bob app icons: `build/icon.svg`, the release, dev and preview PNG, ICO and ICNS icons,
 * the macOS safe-area PNG files, one icon for each logo color in `build/logo-colors/`, the layer of
 * the macOS 26 Icon Composer file and the DMG background.
 *
 * The mark is the landing site's glass Eye of Ra (`apps/web/src/landing/mark-paths.ts`) on a black
 * tile (`packages/brand/src/app-logo-shape.ts`). The dev and preview builds tint the glass so two
 * apps that are open at the same time stay easy to tell apart, and each logo color tints the glass.
 *
 * The ICNS file has all ten images of a macOS icon set, 16 to 512 points at 1x and 2x. The 16 and 32
 * pixel images are ARGB (`ic04`, `ic05`), as `iconutil` writes them; the others are PNG.
 *
 * It needs no image tool but `sharp`: ICO and ICNS files are images in a small container.
 * After a change, run `bun scripts/compile-macos-icon.ts` on a Mac to make `build/macos/Assets.car`.
 *
 * Run with `bun scripts/generate-bob-icons.ts`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";
// The landing site's mark, so the app icon and apps/web draw the same paths.
import { BITE, BODY, PUPIL, SPIRAL, VIEW_H, VIEW_W } from "../../web/src/landing/mark-paths";
import {
  APP_LOGO_CORNER,
  APP_LOGO_EDGE,
  APP_LOGO_FACE,
  APP_LOGO_GLOW,
  APP_LOGO_PALETTES,
  APP_LOGO_SIZE,
} from "../packages/brand/src/app-logo-shape";
import { BOB_FACE_COLORS, type BobFaceColors, bobFaceColors } from "../packages/brand/src/bob-face-shape";
import { APP_LOGO_COLOR_HEX, APP_LOGO_COLORS, DEFAULT_APP_LOGO_COLOR } from "../packages/contracts/src/app-logo-color";

interface Palette {
  skyTop: string;
  skyBottom: string;
  orb: BobFaceColors;
}

const BUILD = resolve(import.meta.dirname, "../build");
const CANVAS = 1600;
const SAFE_AREA_INSET = 156;
/** The width of the mark, as a share of the tile. */
const MARK_WIDTH = 0.76;
/** The padding around the mark in the Icon Composer layer, in mark units, room for the halo. */
const LAYER_PAD = 40;
const ICO_SIZES = [16, 32, 48, 64, 128, 256] as const;
/** Each ICNS type with its pixel size, in the order of an icon set: 16, 32, 128, 256 and 512 points, 1x then 2x. */
const ICNS_TYPES = [
  ["ic04", 16],
  ["ic11", 32],
  ["ic05", 32],
  ["ic12", 64],
  ["ic07", 128],
  ["ic13", 256],
  ["ic08", 256],
  ["ic14", 512],
  ["ic09", 512],
  ["ic10", 1024],
] as const;
/** The types that hold ARGB pixels instead of a PNG file. */
const ICNS_ARGB_TYPES = new Set<string>(["ic04", "ic05"]);

function mix(hex: string, target: number, amount: number): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  return `#${channels
    .map((channel) =>
      Math.round(channel + (target - channel) * amount)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function buildPalette(name: keyof typeof APP_LOGO_PALETTES): Palette {
  const palette = APP_LOGO_PALETTES[name];
  return { skyTop: palette.skyTop, skyBottom: palette.skyBottom, orb: bobFaceColors(palette.faceHue) };
}

/** A logo color tints the orb; the tile stays the black of the release. */
function colorPalette(hex: string): Palette {
  return {
    skyTop: APP_LOGO_PALETTES.production.skyTop,
    skyBottom: APP_LOGO_PALETTES.production.skyBottom,
    orb: { light: mix(hex, 255, 0.55), mid: hex, deep: mix(hex, 0, 0.88), ink: BOB_FACE_COLORS.ink },
  };
}

/** Iridescent hues for the glass rim, the same thin-film spread as the landing logo. */
const IRIDESCENCE = ["#8fe3ff", "#b9a4ff", "#ff9fd6", "#ffd99a", "#9dffd8", "#8fe3ff"];

/**
 * The landing site's Eye of Ra mark as glass, in `VIEW_W` x `VIEW_H` units: a soft halo, a body
 * that reflects two softbox strips, a lit bevel and a thin iridescent rim.
 */
function markGlass(orb: BobFaceColors, id: string): string {
  const shape = `<path d="${BODY}"/><path d="${SPIRAL}"/><path d="${PUPIL}" mask="url(#${id}-bite)"/>`;
  const stops = IRIDESCENCE.map(
    (color, index) => `<stop offset="${index / (IRIDESCENCE.length - 1)}" stop-color="${color}"/>`,
  ).join("");
  return [
    `<defs>`,
    `<mask id="${id}-bite" maskUnits="userSpaceOnUse" x="0" y="0" width="${VIEW_W}" height="${VIEW_H}"><rect width="${VIEW_W}" height="${VIEW_H}" fill="#fff"/><circle cx="${BITE.cx}" cy="${BITE.cy}" r="${BITE.r}" fill="#000"/></mask>`,
    `<clipPath id="${id}-inside">${shape}</clipPath>`,
    `<linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1">`,
    `<stop stop-color="#ffffff"/><stop offset=".3" stop-color="${orb.light}"/><stop offset=".52" stop-color="${orb.mid}"/>`,
    `<stop offset=".74" stop-color="${orb.deep}"/><stop offset=".9" stop-color="${orb.mid}"/><stop offset="1" stop-color="${orb.light}"/>`,
    `</linearGradient>`,
    `<linearGradient id="${id}-iris" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient>`,
    `<filter id="${id}-halo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="22"/></filter>`,
    // A blurred alpha is the height of the bevel; a light at the top left makes its highlight.
    `<filter id="${id}-bevel" x="-5%" y="-5%" width="110%" height="110%">`,
    `<feGaussianBlur in="SourceAlpha" stdDeviation="7" result="height"/>`,
    `<feSpecularLighting in="height" surfaceScale="9" specularConstant="1.1" specularExponent="22" lighting-color="#ffffff" result="spec"><feDistantLight azimuth="235" elevation="38"/></feSpecularLighting>`,
    `<feComposite in="spec" in2="SourceAlpha" operator="in"/>`,
    `</filter>`,
    `</defs>`,
    `<g fill="${orb.light}" opacity=".22" filter="url(#${id}-halo)">${shape}</g>`,
    `<g fill="url(#${id}-fill)">${shape}</g>`,
    `<g fill="#000" filter="url(#${id}-bevel)" opacity=".85">${shape}</g>`,
    // The rim: a stroke clipped to the inside of the shape, so only its inner half shows.
    `<g clip-path="url(#${id}-inside)" fill="none">`,
    `<g stroke="url(#${id}-iris)" stroke-width="9" opacity=".6">${shape}</g>`,
    `<g stroke="#ffffff" stroke-width="3" opacity=".7">${shape}</g>`,
    `</g>`,
  ].join("");
}

/** The mark in a square of `side` pixels at (`x`, `y`): tile, glow, edge and orb. */
function markGroup(palette: Palette, x: number, y: number, side: number, corner: number, id: string): string {
  const scale = side / APP_LOGO_SIZE;
  const markScale = (APP_LOGO_SIZE * MARK_WIDTH) / VIEW_W;
  const edgeInset = APP_LOGO_EDGE.width / 2;
  const unitCorner = corner / scale;
  return [
    `<defs>`,
    `<linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="${palette.skyTop}"/><stop offset="1" stop-color="${palette.skyBottom}"/></linearGradient>`,
    `<linearGradient id="${id}-edge" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffffff" stop-opacity="${APP_LOGO_EDGE.top}"/><stop offset="1" stop-color="#ffffff" stop-opacity="${APP_LOGO_EDGE.bottom}"/></linearGradient>`,
    `<radialGradient id="${id}-glow" cx="${APP_LOGO_FACE.x}" cy="${APP_LOGO_FACE.y}" r="${APP_LOGO_GLOW.radius}" gradientUnits="userSpaceOnUse"><stop stop-color="${palette.orb.light}" stop-opacity="${APP_LOGO_GLOW.opacity}"/><stop offset="1" stop-color="${palette.orb.light}" stop-opacity="0"/></radialGradient>`,
    `<clipPath id="${id}-clip"><rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${corner}"/></clipPath>`,
    `</defs>`,
    `<g clip-path="url(#${id}-clip)"><g transform="translate(${x} ${y}) scale(${scale})">`,
    `<rect width="${APP_LOGO_SIZE}" height="${APP_LOGO_SIZE}" fill="url(#${id}-sky)"/>`,
    `<rect width="${APP_LOGO_SIZE}" height="${APP_LOGO_SIZE}" fill="url(#${id}-glow)"/>`,
    `<rect x="${edgeInset}" y="${edgeInset}" width="${APP_LOGO_SIZE - APP_LOGO_EDGE.width}" height="${APP_LOGO_SIZE - APP_LOGO_EDGE.width}" rx="${unitCorner - edgeInset}" fill="none" stroke="url(#${id}-edge)" stroke-width="${APP_LOGO_EDGE.width}"/>`,
    `<g transform="translate(${APP_LOGO_FACE.x - (VIEW_W / 2) * markScale} ${APP_LOGO_FACE.y - (VIEW_H / 2) * markScale}) scale(${markScale})">`,
    markGlass(palette.orb, id),
    `</g></g></g>`,
  ].join("");
}

function iconSvg(palette: Palette, canvas: number, inset: number, corner: number, title?: string): string {
  const side = canvas - inset * 2;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">`,
    title ? `<title>${title}</title>` : "",
    markGroup(palette, inset, inset, side, corner, "bob"),
    `</svg>`,
  ].join("");
}

async function png(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg), { density: 72 }).png({ compressionLevel: 9 }).toBuffer();
}

/** The macOS app icon: the rounded square with the Dock's padding around it. */
function squareIcon(palette: Palette, canvas: number, safeArea: boolean): string {
  const inset = safeArea ? Math.round((SAFE_AREA_INSET / CANVAS) * canvas) : 0;
  const side = canvas - inset * 2;
  return iconSvg(palette, canvas, inset, (APP_LOGO_CORNER / APP_LOGO_SIZE) * side);
}

function ico(images: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, index) => {
    const entry = 6 + index * 16;
    header[entry] = size === 256 ? 0 : size;
    header[entry + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.data)]);
}

/** The run-length code of ICNS pixel data: a run of 3 to 130 equal bytes, or 1 to 128 bytes as they are. */
function icnsRunLength(channel: Uint8Array): Buffer {
  const out: number[] = [];
  let index = 0;
  while (index < channel.length) {
    let run = 1;
    while (index + run < channel.length && run < 130 && channel[index + run] === channel[index]) run += 1;
    if (run >= 3) {
      out.push(0x80 + run - 3, channel[index] ?? 0);
      index += run;
      continue;
    }
    const start = index;
    while (index < channel.length && index - start < 128) {
      const value = channel[index];
      if (index > start && value === channel[index + 1] && value === channel[index + 2]) break;
      index += 1;
    }
    out.push(index - start - 1, ...channel.subarray(start, index));
  }
  return Buffer.from(out);
}

/** An `ic04` or `ic05` image: "ARGB", then the alpha, red, green and blue planes, each run-length coded. */
async function argb(svg: string): Promise<Buffer> {
  const { data, info } = await sharp(Buffer.from(svg), { density: 72 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixels = info.width * info.height;
  const planes = [3, 0, 1, 2].map((channel) => {
    const plane = new Uint8Array(pixels);
    for (let pixel = 0; pixel < pixels; pixel += 1) plane[pixel] = data[pixel * 4 + channel] ?? 0;
    return icnsRunLength(plane);
  });
  return Buffer.concat([Buffer.from("ARGB", "latin1"), ...planes]);
}

function icns(images: Map<string, Buffer>): Buffer {
  const entries = ICNS_TYPES.map(([type]) => {
    const data = images.get(type);
    if (!data) throw new Error(`Missing ${type} ICNS image`);
    const header = Buffer.alloc(8);
    header.write(type, 0, "latin1");
    header.writeUInt32BE(data.length + 8, 4);
    return Buffer.concat([header, data]);
  });
  const header = Buffer.alloc(8);
  header.write("icns", 0, "latin1");
  header.writeUInt32BE(8 + entries.reduce((sum, entry) => sum + entry.length, 0), 4);
  return Buffer.concat([header, ...entries]);
}

async function write(path: string, data: Buffer | string): Promise<void> {
  await writeFile(join(BUILD, path), data);
}

await mkdir(join(BUILD, "logo-colors"), { recursive: true });

const PRODUCTION = buildPalette("production");
await write("icon.svg", iconSvg(PRODUCTION, 1024, 52, 214, "Bob"));

for (const name of ["production", "dev", "preview"] as const) {
  const palette = buildPalette(name);
  await write(`icon-${name}.png`, await png(squareIcon(palette, CANVAS, false)));
  await write(`icon-${name}-macos-safe-area.png`, await png(squareIcon(palette, CANVAS, true)));
  const sizes = await Promise.all(
    ICO_SIZES.map(async (size) => ({ size, data: await png(squareIcon(palette, size, false)) })),
  );
  await write(`icon-${name}.ico`, ico(sizes));
  if (name !== "production") continue;
  await write("icon.ico", ico(sizes.filter(({ size }) => size === 256)));
  const icnsImages = new Map<string, Buffer>();
  for (const [type, size] of ICNS_TYPES) {
    const svg = squareIcon(palette, size, true);
    icnsImages.set(type, ICNS_ARGB_TYPES.has(type) ? await argb(svg) : await png(svg));
  }
  await write("icon-production.icns", icns(icnsImages));
}

for (const color of APP_LOGO_COLORS) {
  if (color === DEFAULT_APP_LOGO_COLOR) continue;
  const palette = colorPalette(APP_LOGO_COLOR_HEX[color]);
  await write(`logo-colors/icon-${color}.png`, await png(squareIcon(palette, CANVAS, false)));
  await write(`logo-colors/icon-${color}-macos-safe-area.png`, await png(squareIcon(palette, CANVAS, true)));
}

// The layer of the macOS 26 Icon Composer file: only the glass mark, on a clear square background.
// `icon.json` scales it onto the black fill of the file.
const layerSide = VIEW_W + LAYER_PAD * 2;
const layerSvg = [
  `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="${-LAYER_PAD} ${(VIEW_H - layerSide) / 2} ${layerSide} ${layerSide}">`,
  markGlass(PRODUCTION.orb, "layer"),
  `</svg>`,
].join("");
await write("icon-production.icon/Assets/eyes.png", await png(layerSvg));

// The DMG background: a black page, lit at the top, with a hairline arrow from the app to the
// Applications folder.
for (const [name, scale] of [
  ["dmg-background.png", 1],
  ["dmg-background@2x.png", 2],
] as const) {
  const width = 680 * scale;
  const height = 410 * scale;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 680 410">`,
    `<defs><radialGradient id="page" cx=".5" cy="-.12" r="1"><stop stop-color="#141414"/><stop offset=".62" stop-color="#000000"/></radialGradient></defs>`,
    `<rect width="680" height="410" fill="url(#page)"/>`,
    `<path d="M255 173Q340 135 415 170" fill="none" stroke="#f2f2f2" stroke-opacity=".56" stroke-width="1.5" stroke-linecap="round"/>`,
    `<path d="M404 160L418 171L402 177" fill="none" stroke="#f2f2f2" stroke-opacity=".56" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
    `<circle cx="255" cy="173" r="2.5" fill="#f2f2f2" fill-opacity=".56"/>`,
    `</svg>`,
  ].join("");
  await write(
    name,
    await sharp(Buffer.from(svg), { density: 72 })
      .flatten({ background: "#000000" })
      .png({ compressionLevel: 9 })
      .toBuffer(),
  );
}
