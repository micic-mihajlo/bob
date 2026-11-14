/**
 * Which face an agent wears, picked from its seed: a silhouette and an expression. The ids are the
 * face catalogue of the reference UI's avatar library, and the hash is its stable pick, so the same
 * seed draws the same face there and here.
 */

const EXPRESSIONS = [
  "neutre",
  "attentif",
  "surpris",
  "excite",
  "heureux",
  "hilare",
  "colere",
  "triste",
  "effraye",
  "mefiant",
  "confus",
  "curieux",
  "fier",
  "timide",
  "blase",
  "somnolent",
] as const;

const SHAPES = ["cercle", "galet", "squircle", "capsule", "triangle", "hexagone", "nuage", "goutte"] as const;

type ShapeId = (typeof SHAPES)[number];
export type ExpressionId = (typeof EXPRESSIONS)[number];
export type SupportedAvatarSilhouetteId = Exclude<ShapeId, "goutte">;

const SUPPORTED_SILHOUETTES = SHAPES.filter((shape): shape is SupportedAvatarSilhouetteId => shape !== "goutte");

export interface AvatarProfile {
  shape: SupportedAvatarSilhouetteId;
  expression: ExpressionId;
  /** The expression's place in the catalogue, which picks the glyph ramp. */
  expressionIndex: number;
}

export function avatarProfile(seed: string): AvatarProfile {
  const stored = SHAPES[stableIndex(`${seed}:shape`, SHAPES.length)];
  const shape =
    stored === "goutte"
      ? SUPPORTED_SILHOUETTES[stableIndex(`${seed}:shape:replacement`, SUPPORTED_SILHOUETTES.length)]
      : stored;
  const expressionIndex = stableIndex(`${seed}:expression`, EXPRESSIONS.length);
  return { shape, expression: EXPRESSIONS[expressionIndex], expressionIndex };
}

function stableIndex(value: string, length: number): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % length;
}
