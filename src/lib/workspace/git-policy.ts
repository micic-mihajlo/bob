/** What the `git` tool lets an agent run. Pure, so every rule is testable without git. */

interface SubcommandRule {
  /** The first positional argument names a remote, which must be origin. */
  takesRemote: boolean;
  /** Short flags refused for this subcommand, on top of the global ones. */
  deniedShortFlags: string;
}

const SUBCOMMANDS: Readonly<Record<string, SubcommandRule>> = {
  status: { takesRemote: false, deniedShortFlags: "" },
  diff: { takesRemote: false, deniedShortFlags: "" },
  log: { takesRemote: false, deniedShortFlags: "" },
  show: { takesRemote: false, deniedShortFlags: "" },
  add: { takesRemote: false, deniedShortFlags: "" },
  commit: { takesRemote: false, deniedShortFlags: "Ft" },
  switch: { takesRemote: false, deniedShortFlags: "" },
  checkout: { takesRemote: false, deniedShortFlags: "" },
  branch: { takesRemote: false, deniedShortFlags: "" },
  fetch: { takesRemote: true, deniedShortFlags: "" },
  pull: { takesRemote: true, deniedShortFlags: "" },
  push: { takesRemote: true, deniedShortFlags: "" },
  merge: { takesRemote: false, deniedShortFlags: "F" },
  restore: { takesRemote: false, deniedShortFlags: "" },
  stash: { takesRemote: false, deniedShortFlags: "" },
};

export const ALLOWED_SUBCOMMANDS: readonly string[] = Object.keys(SUBCOMMANDS);

const GLOBAL_DENIED_SHORT_FLAGS = "cC";

/**
 * Long options that run programs, read or write files outside the workspace, or reach
 * other repositories. Git accepts any unambiguous prefix of a long option, so an
 * argument is refused when it is a prefix of one of these or extends one.
 */
const DENIED_LONG_OPTIONS: readonly string[] = [
  "--exec",
  "--exec-path",
  "--upload-pack",
  "--receive-pack",
  "--git-dir",
  "--work-tree",
  "--output",
  "--no-index",
  "--repo",
  "--file",
  "--template",
  "--pathspec-from-file",
  "--recurse-submodules",
  "--multiple",
  "--config",
  "--config-env",
];

export const REMOTE = "origin";

export type GitArgsCheck = { ok: true } | { ok: false; error: string };

const refuse = (error: string): GitArgsCheck => ({ ok: false, error });

/** `allowed` narrows the subcommands further, such as to read-only ones for a reviewer. */
export function checkGitArgs(args: readonly string[], allowed: readonly string[] = ALLOWED_SUBCOMMANDS): GitArgsCheck {
  const [subcommand, ...rest] = args;
  if (subcommand === undefined) return refuse("give a git subcommand, such as status");
  const rule = allowed.includes(subcommand) ? SUBCOMMANDS[subcommand] : undefined;
  if (!rule) {
    return refuse(`git ${subcommand} is not allowed. Allowed: ${allowed.join(", ")}`);
  }
  for (const arg of rest) {
    const problem = checkArg(arg, rule);
    if (problem) return refuse(problem);
  }
  return rule.takesRemote ? checkRemote(subcommand, rest) : { ok: true };
}

function checkArg(arg: string, rule: SubcommandRule): string | null {
  if (arg.startsWith("--") && arg.length > 2) return checkLongOption(arg);
  if (/^-[A-Za-z]/.test(arg)) return checkShortFlags(arg, rule);
  return checkPathLike(arg);
}

function checkLongOption(arg: string): string | null {
  const [name, value] = splitOnce(arg, "=");
  const denied = DENIED_LONG_OPTIONS.find((d) => d.startsWith(name) || name.startsWith(d));
  if (denied) return `the option ${name} is not allowed`;
  return value === undefined ? null : checkPathLike(value);
}

function checkShortFlags(arg: string, rule: SubcommandRule): string | null {
  const denied = GLOBAL_DENIED_SHORT_FLAGS + rule.deniedShortFlags;
  const hit = [...arg.slice(1)].find((ch) => denied.includes(ch));
  if (!hit) return null;
  const hint = hit === "c" ? " To create a branch use `switch --create <name>` or `checkout -b <name>`." : "";
  return `the flag -${hit} is not allowed.${hint}`;
}

/** Paths stay inside the workspace. A revision range such as main..feature is not a ".." segment. */
function checkPathLike(value: string): string | null {
  if (value.startsWith("/") || value.startsWith("~") || value.startsWith("\\")) {
    return `"${value}" points outside the workspace; use a path relative to the workspace root`;
  }
  const segments = value.split(/[/\\]/);
  const afterColon = value.includes(":") ? value.slice(value.indexOf(":") + 1).split(/[/\\]/) : [];
  if ([...segments, ...afterColon].includes("..")) {
    return `"${value}" climbs out with ".."; use a path relative to the workspace root`;
  }
  return null;
}

/**
 * Requires origin as the very first argument whenever any positional is given. Finding
 * "the first positional" instead would misread an option's separate value (`-o origin <url>`)
 * and let git take the next argument as the repository.
 */
function checkRemote(subcommand: string, rest: readonly string[]): GitArgsCheck {
  const hasPositional = rest.some((a) => !a.startsWith("-"));
  if (!hasPositional || rest[0] === REMOTE) return { ok: true };
  return refuse(
    `git ${subcommand} only talks to the remote "${REMOTE}"; put it first, as in ${subcommand} ${REMOTE} --prune or push ${REMOTE} -u <branch>`,
  );
}

function splitOnce(text: string, separator: string): [string, string | undefined] {
  const at = text.indexOf(separator);
  return at === -1 ? [text, undefined] : [text.slice(0, at), text.slice(at + 1)];
}
