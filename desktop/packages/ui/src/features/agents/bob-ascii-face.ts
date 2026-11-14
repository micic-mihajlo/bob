import { bloubAvatarProfile, type SupportedAvatarSilhouetteId } from "@bob/brand/bloub-avatar";
import type { AvatarMood } from "@bob/brand/bloub-avatar-motion";
import type { BobFaceExpression } from "@bob/brand/bob-face";
import type { AvatarHue } from "@bob/contracts/ipc";
import { EXPRESSIONS } from "@norbert_bodziony/bloub";

// Bob's head as ASCII: a small 3D shape ray-marched into a grid of glyph cells, shaded through an
// ordered dither, with its eyes cut into the front. The seed's silhouette picks the shape and its
// expression picks the glyphs, so the existing face picker offers every shape. Units: the orb has
// radius 1, and the canvas is 1.5x the avatar box, so the light it gives off has room around it.

export type AsciiFaceShape = "orb" | "pebble" | "cube" | "capsule" | "cone" | "hex" | "cloud";

export const ASCII_FACE_SHAPES: readonly AsciiFaceShape[] = [
  "orb",
  "pebble",
  "cube",
  "capsule",
  "cone",
  "hex",
  "cloud",
];

const SILHOUETTE_SHAPES: Readonly<Record<SupportedAvatarSilhouetteId, AsciiFaceShape>> = {
  cercle: "orb",
  galet: "pebble",
  squircle: "cube",
  capsule: "capsule",
  triangle: "cone",
  hexagone: "hex",
  nuage: "cloud",
};

/** Glyph ramps, dark to bright. The first glyph is never drawn on the head; color carries the brightness. */
export const ASCII_FACE_RAMPS: readonly string[] = [
  " .:-=+*#%@",
  " .·:oO0@",
  " ░▒▓█",
  " .-=≡#",
  " .^*AM",
  " .:01ABCDEF",
  " .~:;*&@",
];

/** What a working head scrambles its glyphs into. */
const CODE_GLYPHS = "01<>/\\{}[]=+*#$%&?!;";
const SPARK_GLYPHS = "·+*✦";

// Per shape: how high the eyes sit and how far apart, in object units.
const EYE_Y: Readonly<Record<AsciiFaceShape, number>> = {
  orb: 0.04,
  pebble: 0.02,
  cube: 0.06,
  capsule: 0.12,
  cone: -0.14,
  hex: 0.04,
  cloud: 0,
};
const EYE_X = 0.27;

const CANVAS_SCALE = 1.5;
/** Scene units from the canvas center to its edge: the orb fills 87.5% of the avatar box. */
const SCENE_HALF = CANVAS_SCALE / 0.875;
const CAMERA_Z = 7;
const BOUND = 1.6;
const MAX_STEPS = 56;
const MORPH_PERIOD = 7;
const FONT = '"Geist Mono Variable", ui-monospace, "SF Mono", Menlo, monospace';
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const LIGHT = normalize(-0.5, 0.62, 0.62);

export interface AsciiFaceIdentity {
  shape: number;
  ramp: number;
  /** `null` is Bob's own: an aurora instead of one hue. */
  hue: AvatarHue | null;
  /** Seconds added to the clock, so avatars side by side do not move in step. */
  phase: number;
}

export function asciiFaceIdentity(seed: string, hue: AvatarHue | null): AsciiFaceIdentity {
  const profile = bloubAvatarProfile(seed, hue);
  const expression = Math.max(
    0,
    EXPRESSIONS.findIndex((option) => option.id === profile.expression),
  );
  return {
    shape: ASCII_FACE_SHAPES.indexOf(SILHOUETTE_SHAPES[profile.shape]),
    ramp: expression % ASCII_FACE_RAMPS.length,
    hue,
    phase: (hash(seed) % 1000) / 37,
  };
}

/** One frame of the head. Every number but `time` and `blink` eases between moods. */
export interface AsciiFaceFrame {
  time: number;
  eyes: BobFaceExpression;
  /** 1 open, 0 shut. */
  blink: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Sideways shift of the eyes, in object units. */
  glance: number;
  /** 0..1: how hard the head works. It morphs, scrambles its glyphs, scans and throws sparks. */
  work: number;
  /** 0..1: the halo of light around the head. */
  glow: number;
  brightness: number;
  /** 0..1: voice loudness. It opens the mouth and feeds the light. */
  level: number;
}

const MOODS: Readonly<
  Record<AvatarMood, Pick<AsciiFaceFrame, "eyes" | "yaw" | "pitch" | "roll" | "work" | "glow" | "brightness">>
> = {
  idle: { eyes: "open", yaw: 0.38, pitch: 0.08, roll: 0, work: 0, glow: 0.12, brightness: 1 },
  working: { eyes: "open", yaw: 0.2, pitch: 0.1, roll: 0, work: 1, glow: 0.4, brightness: 1.05 },
  waiting: { eyes: "open", yaw: 0.3, pitch: 0.26, roll: -0.16, work: 0, glow: 0.18, brightness: 1 },
  failed: { eyes: "sad", yaw: 0.2, pitch: -0.24, roll: 0.06, work: 0, glow: 0.05, brightness: 0.72 },
  responded: { eyes: "happy", yaw: 0.12, pitch: 0.14, roll: 0.05, work: 0, glow: 0.24, brightness: 1.1 },
  connecting: { eyes: "open", yaw: 0.2, pitch: 0.1, roll: 0, work: 1, glow: 0.36, brightness: 1 },
  asleep: { eyes: "sleepy", yaw: 0.3, pitch: -0.2, roll: 0.12, work: 0, glow: 0.04, brightness: 0.6 },
};

/**
 * Where a mood wants the head at `time`. A still head (`animated` false) holds the mood's pose; a
 * moving one sways, blinks, and while working sweeps from side to side and glances. `look` turns the
 * head toward the pointer, each axis in -1..1.
 */
export function asciiFaceFrame(
  mood: AvatarMood,
  time: number,
  animated: boolean,
  level: number,
  look: { x: number; y: number } | null,
): AsciiFaceFrame {
  const pose = MOODS[mood];
  const frame: AsciiFaceFrame = { ...pose, time, blink: 1, glance: 0, level };
  frame.glow += level * 0.5;
  frame.pitch += level * 0.08;
  if (look) {
    frame.yaw = look.x * 0.6;
    frame.pitch = -look.y * 0.45;
  }
  if (!animated) return frame;
  const sway = 1 - pose.work;
  frame.yaw += 0.22 * sway * Math.sin(time * 0.7) + 0.55 * pose.work * Math.sin(time * 1.3);
  frame.pitch += 0.05 * Math.sin(time * 1.1) + 0.06 * pose.work * Math.sin(time * 2.2);
  frame.glance = 0.07 * pose.work * Math.sin(time * 2.4);
  frame.glow += 0.12 * pose.work * Math.sin(time * 3.1);
  if (mood === "connecting") frame.yaw += time * 2.2;
  const blinkAt = time % 4.8;
  if (blinkAt < 0.14) frame.blink = Math.abs(blinkAt / 0.07 - 1);
  return frame;
}

/** Eases `current` toward `target` over `dt` seconds. Yaw takes the short way round. */
export function easeAsciiFaceFrame(current: AsciiFaceFrame, target: AsciiFaceFrame, dt: number): AsciiFaceFrame {
  const k = 1 - Math.exp(-dt * 7);
  const ease = (from: number, to: number) => from + (to - from) * k;
  const turn = Math.atan2(Math.sin(target.yaw - current.yaw), Math.cos(target.yaw - current.yaw));
  return {
    ...target,
    yaw: current.yaw + turn * k,
    pitch: ease(current.pitch, target.pitch),
    roll: ease(current.roll, target.roll),
    glance: ease(current.glance, target.glance),
    work: ease(current.work, target.work),
    glow: ease(current.glow, target.glow),
    brightness: ease(current.brightness, target.brightness),
    level: ease(current.level, target.level),
  };
}

/** Whether easing has nothing left to move, so a head that is not animating can stop its clock. */
export function asciiFaceSettled(current: AsciiFaceFrame, target: AsciiFaceFrame): boolean {
  const turn = Math.atan2(Math.sin(target.yaw - current.yaw), Math.cos(target.yaw - current.yaw));
  return (
    Math.abs(turn) +
      Math.abs(target.pitch - current.pitch) +
      Math.abs(target.roll - current.roll) +
      Math.abs(target.work - current.work) +
      Math.abs(target.glow - current.glow) +
      Math.abs(target.level - current.level) <
    0.004
  );
}

/** The grid an avatar of `canvasSize` css pixels gets: finer glyphs on a big head, a dither on a small one. */
export function asciiFaceColumns(canvasSize: number): number {
  const cell = Math.min(6.5, Math.max(3, canvasSize / CANVAS_SCALE / 14));
  return Math.max(9, Math.round(canvasSize / cell));
}

/** Which cells of the grid the head covers, for tests and anything that needs the silhouette. */
export function asciiFaceCoverage(identity: AsciiFaceIdentity, frame: AsciiFaceFrame, columns: number): string[] {
  const rows: string[] = [];
  const scene = createScene(identity, frame, 2 / columns);
  for (let row = 0; row < columns; row += 1) {
    let line = "";
    for (let column = 0; column < columns; column += 1) {
      const sample = scene.sample(column, row, columns);
      line += sample.hit ? (sample.feature ? "o" : "#") : ".";
    }
    rows.push(line);
  }
  return rows;
}

/** Draws one frame into `context`, whose transform maps css pixels, over a square of `size` css pixels. */
export function drawAsciiFace(
  context: CanvasRenderingContext2D,
  size: number,
  identity: AsciiFaceIdentity,
  frame: AsciiFaceFrame,
): void {
  const columns = asciiFaceColumns(size);
  const cell = size / columns;
  const center = size / 2;
  const unit = center / SCENE_HALF;
  const scene = createScene(identity, frame, 2 / columns);
  // A working or speaking head shifts its hue back and forth.
  const drift = Math.round((frame.work * 24 * Math.sin(frame.time * 0.7) + frame.level * 18) / 4) * 4;
  const paints = paintsFor(identity.hue, drift);
  const hot = paints.hot;
  context.clearRect(0, 0, size, size);

  // The light the head gives off: a halo in its own hue, behind the glyphs.
  const glow = Math.max(0, Math.min(1, frame.glow));
  if (glow > 0.01) {
    const halo = context.createRadialGradient(center, center, unit * 0.2, center, center, unit * SCENE_HALF);
    halo.addColorStop(0, paints.light(glow));
    halo.addColorStop(0.45, paints.shadow(glow * 0.55));
    halo.addColorStop(1, paints.shadow(0));
    context.fillStyle = halo;
    context.fillRect(0, 0, size, size);
  }

  context.font = `${(cell * 1.18).toFixed(2)}px ${FONT}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const hotCells: number[] = [];
  // A dim tile under each glyph, so a small head reads as a solid shape and not as loose dots.
  const tile = Math.min(0.4, Math.max(0.12, 0.5 - columns / 120));
  let paint = "";
  for (let row = 0; row < columns; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const sample = scene.sample(column, row, columns);
      if (!sample.hit) continue;
      const x = column * cell;
      const y = row * cell;
      if (sample.feature) {
        if (scene.emissive) hotCells.push(x, y, 0);
        else {
          if (paint !== INK) context.fillStyle = paint = INK;
          context.fillRect(x, y, cell, cell);
        }
        continue;
      }
      if (sample.hot) {
        hotCells.push(x, y, 1);
        continue;
      }
      const ramp = ASCII_FACE_RAMPS[sample.ramp] ?? " ";
      const color = paints.ramps[sample.ramp]?.[sample.level] ?? hot;
      if (paint !== color) context.fillStyle = paint = color;
      context.globalAlpha = tile;
      context.fillRect(x, y, cell, cell);
      context.globalAlpha = 1;
      context.fillText(sample.scrambled ?? ramp.charAt(sample.level), x + cell / 2, y + cell / 2);
    }
  }

  // Lit cells: the eyes of a working head and the scan line. Each gets a bloom, then a bright glyph.
  if (hotCells.length > 0) {
    const bloom = paints.bloom();
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < hotCells.length; index += 3) {
      const x = hotCells[index] ?? 0;
      const y = hotCells[index + 1] ?? 0;
      if (bloom) context.drawImage(bloom, x - cell, y - cell, cell * 3, cell * 3);
    }
    context.globalCompositeOperation = "source-over";
    context.fillStyle = paint = hot;
    for (let index = 0; index < hotCells.length; index += 3) {
      const x = hotCells[index] ?? 0;
      const y = hotCells[index + 1] ?? 0;
      const glyph = hotCells[index + 2] === 0 ? "█" : scene.scanGlyph(x, y);
      context.fillText(glyph, x + cell / 2, y + cell / 2);
    }
  }

  // Sparks: glyphs that orbit a working or speaking head, bright in front of it and dim behind.
  const sparks = Math.max(frame.work, frame.level);
  if (sparks > 0.05) {
    const bloom = paints.bloom();
    const count = 7;
    for (let index = 0; index < count; index += 1) {
      const angle = frame.time * 0.9 + (index * Math.PI * 2) / count;
      const radius = 1.32 + 0.12 * Math.sin(frame.time * 2 + index);
      const depth = Math.sin(angle) * radius;
      const lift = Math.sin(frame.time * 1.3 + index * 1.7) * 0.5;
      const perspective = CAMERA_Z / (CAMERA_Z - depth);
      const x = center + Math.cos(angle) * radius * perspective * unit;
      const y = center - (lift + Math.sin(angle) * 0.28) * perspective * unit;
      const front = depth > 0;
      context.globalAlpha = sparks * (front ? 1 : 0.35);
      if (bloom && front) {
        context.globalCompositeOperation = "lighter";
        context.drawImage(bloom, x - cell * 1.5, y - cell * 1.5, cell * 3, cell * 3);
        context.globalCompositeOperation = "source-over";
      }
      context.fillStyle = paint = hot;
      context.fillText(SPARK_GLYPHS.charAt((index + Math.floor(frame.time * 4)) % SPARK_GLYPHS.length), x, y);
    }
    context.globalAlpha = 1;
  }
}

interface CellSample {
  hit: boolean;
  feature: boolean;
  hot: boolean;
  ramp: number;
  level: number;
  scrambled: string | null;
}

const MISS: CellSample = { hit: false, feature: false, hot: false, ramp: 0, level: 0, scrambled: null };

function createScene(identity: AsciiFaceIdentity, frame: AsciiFaceFrame, cellScene: number) {
  const { time } = frame;
  const work = Math.max(0, Math.min(1, frame.work));
  const level = Math.max(0, Math.min(1, frame.level));
  const cycle = Math.floor(time / MORPH_PERIOD);
  const cycleAt = time - cycle * MORPH_PERIOD;
  const shapeCount = ASCII_FACE_SHAPES.length;
  // While it works the head turns into another shape and back, spinning once on the way out.
  const morphOut = smooth(cycleAt, 3.4, 4.3);
  const morph = work * (morphOut - smooth(cycleAt, 5.5, 6.4));
  const target = (identity.shape + 1 + (cycle % (shapeCount - 1))) % shapeCount;
  const targetRamp = (identity.ramp + 1 + (cycle % (ASCII_FACE_RAMPS.length - 1))) % ASCII_FACE_RAMPS.length;
  const shapeA = ASCII_FACE_SHAPES[identity.shape] ?? "orb";
  const shapeB = ASCII_FACE_SHAPES[target] ?? "orb";
  const spin = work * morphOut * Math.PI * 2;
  const scale = 1 + level * 0.06;
  const eyeY = EYE_Y[shapeA] + (EYE_Y[shapeB] - EYE_Y[shapeA]) * morph;
  const churn = work * (0.04 + 0.45 * Math.sin(Math.PI * morph)) + level * 0.06;
  const churnStep = Math.floor(time * 12);
  const scanY = Math.sin(time * 1.6) * 1.15;
  const emissive = work > 0.5 || level > 0.04;
  const rotation = rotationMatrix(frame.yaw + spin, -frame.pitch, frame.roll);
  const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = rotation;

  const distance = (px: number, py: number, pz: number): number => {
    // World to object space is the transpose of the rotation.
    const x = (m00 * px + m10 * py + m20 * pz) / scale;
    const y = (m01 * px + m11 * py + m21 * pz) / scale;
    const z = (m02 * px + m12 * py + m22 * pz) / scale;
    let value = shapeDistance(shapeA, x, y, z, time);
    if (morph > 0.001) value += (shapeDistance(shapeB, x, y, z, time) - value) * morph;
    return value * scale;
  };

  const sample = (column: number, row: number, columns: number): CellSample => {
    const sx = (((column + 0.5) / columns) * 2 - 1) * SCENE_HALF;
    const sy = -(((row + 0.5) / columns) * 2 - 1) * SCENE_HALF;
    const length = Math.hypot(sx, sy, CAMERA_Z);
    const dx = sx / length;
    const dy = sy / length;
    const dz = -CAMERA_Z / length;
    // Only march inside the sphere that bounds every shape.
    const b = CAMERA_Z * dz;
    const h = b * b - (CAMERA_Z * CAMERA_Z - BOUND * BOUND);
    if (h < 0) return MISS;
    let t = -b - Math.sqrt(h);
    const exit = -b + Math.sqrt(h);
    let hit = false;
    for (let step = 0; step < MAX_STEPS && t < exit; step += 1) {
      const d = distance(dx * t, dy * t, CAMERA_Z + dz * t);
      if (d < 0.004) {
        hit = true;
        break;
      }
      t += d * 0.92;
    }
    if (!hit) return MISS;
    const px = dx * t;
    const py = dy * t;
    const pz = CAMERA_Z + dz * t;

    // Object-space point, for the eyes and mouth painted on the front.
    const qx = (m00 * px + m10 * py + m20 * pz) / scale;
    const qy = (m01 * px + m11 * py + m21 * pz) / scale;
    const qz = (m02 * px + m12 * py + m22 * pz) / scale;
    if (qz > 0.1 && faceFeature(qx, qy, frame, eyeY, cellScene)) {
      return { hit: true, feature: true, hot: false, ramp: 0, level: 0, scrambled: null };
    }

    const e = 0.01;
    const n1 = distance(px + e, py - e, pz - e);
    const n2 = distance(px - e, py - e, pz + e);
    const n3 = distance(px - e, py + e, pz - e);
    const n4 = distance(px + e, py + e, pz + e);
    const normal = normalize(n1 - n2 - n3 + n4, -n1 - n2 + n3 + n4, -n1 + n2 - n3 + n4);
    const facing = -(normal[0] * dx + normal[1] * dy + normal[2] * dz);
    const diffuse = Math.max(0, normal[0] * LIGHT[0] + normal[1] * LIGHT[1] + normal[2] * LIGHT[2]);
    const half = normalize(LIGHT[0] - dx, LIGHT[1] - dy, LIGHT[2] - dz);
    const specular = Math.max(0, normal[0] * half[0] + normal[1] * half[1] + normal[2] * half[2]) ** 28;
    const rim = (1 - Math.max(0, facing)) ** 2;
    const scan = work * Math.exp(-(((py - scanY) / 0.11) ** 2));
    const lum = (0.08 + 0.8 * diffuse + 0.3 * rim + 0.5 * specular) * frame.brightness + level * 0.12 + scan * 0.5;

    const threshold = ((BAYER[(row % 4) * 4 + (column % 4)] ?? 0) + 0.5) / 16;
    const ramp = threshold < morph ? targetRamp : identity.ramp;
    const steps = (ASCII_FACE_RAMPS[ramp] ?? " ").length;
    const index = Math.max(1, Math.min(steps - 1, Math.floor(Math.min(1, lum) * (steps - 1) + threshold)));
    const noise = cellHash(column, row, churnStep);
    const scrambled = noise < churn ? CODE_GLYPHS.charAt(Math.floor(noise * 997) % CODE_GLYPHS.length) : null;
    return { hit: true, feature: false, hot: scan > 0.55, ramp, level: index, scrambled };
  };

  return {
    sample,
    emissive,
    scanGlyph: (x: number, y: number) =>
      CODE_GLYPHS.charAt(Math.floor(x * 7 + y * 13 + churnStep) % CODE_GLYPHS.length),
  };
}

/** Whether an object-space point on the front of the head is an eye or the mouth. */
function faceFeature(x: number, y: number, frame: AsciiFaceFrame, eyeY: number, cellScene: number): boolean {
  const dx = Math.abs(x - frame.glance) - EYE_X;
  const dy = y - eyeY;
  // A feature never gets thinner than a cell, so a sidebar-sized head still shows its eyes.
  const minimum = cellScene * 0.55;
  if (frame.eyes === "happy" || frame.eyes === "sleepy") {
    const span = 0.15;
    if (Math.abs(dx) > span + minimum * 0.5) return mouthAt(x, y, frame, eyeY);
    const bend = 1 - Math.min(1, (dx / span) ** 2);
    const curve = frame.eyes === "happy" ? -0.03 + 0.1 * bend : 0.02 - 0.07 * bend;
    if (Math.abs(dy - curve) < Math.max(0.05, minimum)) return true;
    return mouthAt(x, y, frame, eyeY);
  }
  const sad = frame.eyes === "sad";
  const width = Math.max(0.2, minimum * 2);
  const height = Math.max((sad ? 0.26 : 0.4) * frame.blink, minimum * 1.4);
  if (pill(dx, dy + (sad ? 0.07 : 0), width, height)) return true;
  return mouthAt(x, y, frame, eyeY);
}

function mouthAt(x: number, y: number, frame: AsciiFaceFrame, eyeY: number): boolean {
  if (frame.level < 0.03) return false;
  return pill(x - frame.glance * 0.5, y - (eyeY - 0.42), 0.26 + frame.level * 0.1, 0.05 + frame.level * 0.34);
}

/** Whether (`x`, `y`) falls in an upright pill of `width` x `height` centered on the origin. */
function pill(x: number, y: number, width: number, height: number): boolean {
  const radius = width / 2;
  const reach = Math.max(0, height / 2 - radius);
  return Math.hypot(x, Math.max(0, Math.abs(y) - reach)) < radius;
}

function shapeDistance(shape: AsciiFaceShape, x: number, y: number, z: number, time: number): number {
  switch (shape) {
    case "orb":
      return Math.hypot(x, y, z) - 1;
    case "pebble": {
      const k0 = Math.hypot(x / 1.12, y / 0.84, z / 0.96);
      const k1 = Math.hypot(x / 1.2544, y / 0.7056, z / 0.9216);
      return k1 === 0 ? -0.84 : (k0 * (k0 - 1)) / k1;
    }
    case "cube": {
      const qx = Math.abs(x) - 0.7;
      const qy = Math.abs(y) - 0.7;
      const qz = Math.abs(z) - 0.7;
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0));
      return outside + Math.min(Math.max(qx, qy, qz), 0) - 0.24;
    }
    case "capsule":
      // Upright, so it still reads as a pill when the head turns.
      return Math.hypot(x, y - Math.max(-0.4, Math.min(0.4, y)), z) - 0.66;
    case "cone": {
      // A round cone: a wide ball below, a small one on top, and the hull between them.
      const r1 = 0.86;
      const r2 = 0.3;
      const height = 1.05;
      const qx = Math.hypot(x, z);
      const qy = y + 0.25;
      const b = (r1 - r2) / height;
      const a = Math.sqrt(1 - b * b);
      const k = -b * qx + a * qy;
      if (k < 0) return Math.hypot(qx, qy) - r1;
      if (k > a * height) return Math.hypot(qx, qy - height) - r2;
      return a * qx + b * qy - r1;
    }
    case "hex": {
      // A hexagonal prism facing the camera, rounded.
      let px = Math.abs(x);
      let py = Math.abs(y);
      const pz = Math.abs(z);
      const fold = 2 * Math.min(-0.8660254 * px + 0.5 * py, 0);
      px -= fold * -0.8660254;
      py -= fold * 0.5;
      const apothem = 0.8;
      const edge = 0.57735 * apothem;
      const ex = Math.hypot(px - Math.max(-edge, Math.min(edge, px)), py - apothem) * Math.sign(py - apothem);
      const ez = pz - 0.4;
      return Math.min(Math.max(ex, ez), 0) + Math.hypot(Math.max(ex, 0), Math.max(ez, 0)) - 0.16;
    }
    case "cloud": {
      let value = Math.hypot(x, y - 0.05, z) - 0.72 * (1 + 0.03 * Math.sin(time * 2));
      for (let index = 0; index < CLOUD_LOBES.length; index += 4) {
        const lx = CLOUD_LOBES[index] ?? 0;
        const ly = CLOUD_LOBES[index + 1] ?? 0;
        const lr = (CLOUD_LOBES[index + 2] ?? 0) * (1 + 0.05 * Math.sin(time * 2.3 + index));
        const lz = CLOUD_LOBES[index + 3] ?? 0;
        value = smoothMin(value, Math.hypot(x - lx, y - ly, z - lz) - lr, 0.28);
      }
      return value;
    }
  }
}

// x, y, radius, z of each puff around the cloud's core.
const CLOUD_LOBES = [-0.6, -0.2, 0.5, 0, 0.6, -0.2, 0.5, 0, -0.3, 0.42, 0.5, -0.05, 0.32, 0.38, 0.55, -0.05];

function smoothMin(a: number, b: number, k: number): number {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - (h * h * k) / 4;
}

function smooth(value: number, from: number, to: number): number {
  const t = Math.max(0, Math.min(1, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

type Matrix = readonly [number, number, number, number, number, number, number, number, number];

/** Ry(yaw) . Rx(pitch) . Rz(roll), row-major. */
function rotationMatrix(yaw: number, pitch: number, roll: number): Matrix {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  return [
    cy * cr + sy * sp * sr,
    -cy * sr + sy * sp * cr,
    sy * cp,
    cp * sr,
    cp * cr,
    -sp,
    -sy * cr + cy * sp * sr,
    sy * sr + cy * sp * cr,
    cy * cp,
  ];
}

function normalize(x: number, y: number, z: number): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

function cellHash(column: number, row: number, step: number): number {
  let value = Math.imul(column, 374761393) ^ Math.imul(row, 668265263) ^ Math.imul(step, 2147483647);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result = Math.imul(result ^ value.charCodeAt(index), 0x01000193);
  }
  return result >>> 0;
}

const INK = "#000000";

interface Paints {
  /** Per ramp, the color of each of its glyphs. */
  ramps: string[][];
  hot: string;
  /** The halo's colors, at an opacity. */
  light: (alpha: number) => string;
  shadow: (alpha: number) => string;
  bloom: () => HTMLCanvasElement | null;
}

type Tone = readonly [hue: number, saturation: number, lightness: number];

/**
 * The gradient map from shadow to highlight. A hue stays saturated in every glyph and turns a little
 * across the ramp, so the shading reads as color and not as grey. Bob's own is an aurora.
 */
function gradientStops(hue: number | null): readonly Tone[] {
  if (hue === null) {
    return [
      [275, 90, 42],
      [228, 100, 58],
      [192, 100, 58],
      [160, 100, 70],
      [140, 100, 88],
    ];
  }
  return [
    [hue + 40, 90, 40],
    [hue + 18, 100, 55],
    [hue, 100, 60],
    [hue - 14, 100, 74],
    [hue - 24, 100, 90],
  ];
}

function toneAt(stops: readonly Tone[], amount: number): Tone {
  const position = Math.max(0, Math.min(1, amount)) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(position));
  const from = stops[index] ?? [0, 0, 0];
  const to = stops[index + 1] ?? from;
  const t = position - index;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t];
}

function hsla([hue, saturation, lightness]: Tone, alpha = 1): string {
  return `hsla(${(((hue % 360) + 360) % 360).toFixed(0)}, ${saturation.toFixed(0)}%, ${lightness.toFixed(0)}%, ${alpha.toFixed(3)})`;
}

const paintCache = new Map<string, Paints>();

function paintsFor(hue: number | null, drift: number): Paints {
  const key = `${hue}:${drift}`;
  const cached = paintCache.get(key);
  if (cached) return cached;
  const stops = gradientStops(hue).map(([h, saturation, lightness]): Tone => [h + drift, saturation, lightness]);
  const highlight = toneAt(stops, 1);
  const ramps = ASCII_FACE_RAMPS.map((ramp) =>
    Array.from(ramp, (_, index) => hsla(toneAt(stops, index / Math.max(1, ramp.length - 1)))),
  );
  let sprite: HTMLCanvasElement | null | undefined;
  const paints: Paints = {
    ramps,
    hot: hsla([highlight[0], highlight[1], 94]),
    light: (alpha) => hsla(toneAt(stops, 0.55), alpha),
    shadow: (alpha) => hsla(toneAt(stops, 0.15), alpha),
    bloom: () => {
      if (sprite !== undefined) return sprite;
      const element = typeof document === "undefined" ? null : document.createElement("canvas");
      const context = element?.getContext("2d");
      sprite = null;
      if (!element || !context) return sprite;
      element.width = 32;
      element.height = 32;
      sprite = element;
      const gradient = context.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, hsla(toneAt(stops, 0.75), 0.7));
      gradient.addColorStop(1, hsla(toneAt(stops, 0.75), 0));
      context.fillStyle = gradient;
      context.fillRect(0, 0, 32, 32);
      return sprite;
    },
  };
  paintCache.set(key, paints);
  return paints;
}
