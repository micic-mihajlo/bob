import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Hash of every Lean source and the theorem catalog, so a recorded check can be told apart from a stale one.
 * @param {string} formalDir the formal/ folder
 * @returns {string}
 */
export function sourceHash(formalDir) {
  const lean = readdirSync(path.join(formalDir, "BobFormal")).sort().map((f) => path.join("BobFormal", f));
  const files = ["BobFormal.lean", "lakefile.toml", "lean-toolchain", "theorems.json", ...lean];
  const hash = createHash("sha256");
  for (const f of files) hash.update(f).update(readFileSync(path.join(formalDir, f)));
  return hash.digest("hex");
}
