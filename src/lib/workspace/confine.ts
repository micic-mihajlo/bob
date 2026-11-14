import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

/** A path proven to sit inside the workspace root, outside `.git`. */
export type Confined = { ok: true; abs: string; rel: string } | { ok: false; error: string };

const refuse = (error: string): Confined => ({ ok: false, error });

/** For reading, listing and editing: the target must exist, and its real path must stay inside. */
export async function confineExisting(root: string, input: string): Promise<Confined> {
  const lexical = confineLexically(root, input);
  if (!lexical.ok) return lexical;
  const real = await realpath(lexical.abs).catch(() => null);
  if (real === null) return refuse(`${lexical.rel} does not exist`);
  return confineReal(root, real, input);
}

/**
 * For writing: the deepest part of the path that already exists must really be inside
 * the root. What is left gets created as plain directories under it.
 */
export async function confineForWrite(root: string, input: string): Promise<Confined> {
  const lexical = confineLexically(root, input);
  if (!lexical.ok) return lexical;
  if (lexical.rel === ".") return refuse("give a file path, not the workspace root");
  const existing = await deepestExisting(lexical.abs);
  const realExisting = await realpath(existing).catch(() => null);
  if (realExisting === null) return refuse(`"${input}" goes through a broken symbolic link`);
  const parent = confineReal(root, realExisting, input);
  if (!parent.ok) return parent;
  const abs = path.join(realExisting, path.relative(existing, lexical.abs));
  const target = await lstat(abs).catch(() => null);
  if (target?.isDirectory()) return refuse(`${lexical.rel} is a directory`);
  return confineReal(root, abs, input);
}

function confineLexically(root: string, input: string): Confined {
  if (input.includes("\0")) return refuse("the path contains a NUL character");
  if (path.isAbsolute(input)) return refuse(`"${input}" is absolute; use a path relative to the workspace root`);
  const rel = path.normalize(input === "" ? "." : input);
  if (rel === ".." || rel.startsWith(`..${path.sep}`)) return refuse(`"${input}" is outside the workspace`);
  if (touchesGitDir(rel)) return refuse(gitDirError(input));
  return { ok: true, abs: path.join(root, rel), rel };
}

function confineReal(root: string, real: string, input: string): Confined {
  const rel = path.relative(root, real);
  const outside = rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
  if (outside) return refuse(`"${input}" resolves outside the workspace`);
  if (touchesGitDir(rel)) return refuse(gitDirError(input));
  return { ok: true, abs: real, rel: rel === "" ? "." : rel };
}

// Compared case-insensitively because macOS and Windows file systems treat ".GIT" as ".git".
function touchesGitDir(rel: string): boolean {
  return rel.split(path.sep).some((segment) => segment.toLowerCase() === ".git");
}

function gitDirError(input: string): string {
  return `"${input}" is inside .git, which only the git tool may change`;
}

async function deepestExisting(abs: string): Promise<string> {
  const found = await lstat(abs).then(
    () => true,
    () => false,
  );
  if (found) return abs;
  const parent = path.dirname(abs);
  return parent === abs ? abs : deepestExisting(parent);
}
