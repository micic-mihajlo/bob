import { execFileSync } from "node:child_process";
import { globals } from "./globals";
import { defaultRoot, projectLayout } from "./workspace";

/** Dollars per million tokens, input then output. Estimates; a project's bob.policy.json can set its own. */
const DEFAULT_PRICES: Record<string, [number, number]> = {
  "moonshotai/kimi-k3.1-pro": [0.6, 2.5],
  "moonshotai/kimi-k3": [0.6, 2.5],
  "moonshotai/kimi-k3-fast": [1.2, 5],
  "zai/glm-5.3-fast": [0.6, 2.2],
  "zai/glm-5.3-flash": [0.1, 0.4],
  "deepseek/deepseek-v4.1-flash": [0.15, 0.6],
  "deepseek/deepseek-v4.1-flash-fast": [0.3, 1.2],
};

/**
 * The project's factory policy, from bob.policy.json at the root of its main branch. Every field is optional;
 * what a project leaves out keeps these defaults.
 */
export interface Policy {
  /** Globs (`*` within a segment, `**` across) for files whose change is called out on the merge approval. */
  approvalPaths: string[];
  /** Review-fix rounds before the build thread stops and reports blocked. */
  maxFixRounds: number;
  /** Per request; crossing one writes an alert to DIGEST.md. */
  budgets: { maxMinutes: number; maxModelCalls: number; maxCostUsd: number };
  prices: Record<string, [number, number]>;
}

export const DEFAULT_POLICY: Policy = {
  approvalPaths: ["package.json", "**/*.lock", "pnpm-lock.yaml", "package-lock.json", ".github/**", "bob.policy.json"],
  maxFixRounds: 2,
  budgets: { maxMinutes: 3, maxModelCalls: 90, maxCostUsd: 1 },
  prices: DEFAULT_PRICES,
};

export const POLICY_FILE = "bob.policy.json";
const REREAD_MS = 5_000;
const cache = new Map<string, { at: number; policy: Policy }>();

const num = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback);

/** A parsed policy file over the defaults. A field of the wrong type keeps its default. */
export function parsePolicy(raw: string): Policy {
  let file: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_POLICY;
    file = parsed as Record<string, unknown>;
  } catch {
    return DEFAULT_POLICY;
  }
  const budgets = (typeof file.budgets === "object" && file.budgets !== null ? file.budgets : {}) as Record<string, unknown>;
  const paths = Array.isArray(file.approvalPaths) ? file.approvalPaths.filter((p): p is string => typeof p === "string") : DEFAULT_POLICY.approvalPaths;
  const prices = typeof file.prices === "object" && file.prices !== null ? (file.prices as Record<string, [number, number]>) : {};
  return {
    approvalPaths: paths,
    maxFixRounds: Math.floor(num(file.maxFixRounds, DEFAULT_POLICY.maxFixRounds)),
    budgets: {
      maxMinutes: num(budgets.maxMinutes, DEFAULT_POLICY.budgets.maxMinutes),
      maxModelCalls: num(budgets.maxModelCalls, DEFAULT_POLICY.budgets.maxModelCalls),
      maxCostUsd: num(budgets.maxCostUsd, DEFAULT_POLICY.budgets.maxCostUsd),
    },
    prices: { ...DEFAULT_PRICES, ...prices },
  };
}

/** The policy of a project, re-read from its main branch at most every few seconds. Defaults until it has a repository. */
export function policyFor(projectId: string): Policy {
  const origin = projectLayout(globals().config.workspaceRoot ?? defaultRoot(), projectId).origin;
  const hit = cache.get(origin);
  if (hit && Date.now() - hit.at < REREAD_MS) return hit.policy;
  let policy = DEFAULT_POLICY;
  try {
    policy = parsePolicy(execFileSync("git", ["-C", origin, "show", `HEAD:${POLICY_FILE}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }));
  } catch {
    // No repository yet, or no policy file: the defaults hold.
  }
  cache.set(origin, { at: Date.now(), policy });
  return policy;
}

const GLOB_TOKEN: Record<string, string> = { "**/": "(?:.*/)?", "**": ".*", "*": "[^/]*" };
const globToRegExp = (glob: string) =>
  new RegExp(`^${glob.split(/(\*\*\/|\*\*|\*)/).map((t) => GLOB_TOKEN[t] ?? t.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("")}$`);

/** Drops the cached policies, so the next read sees a policy file that just changed. */
export function forgetPolicies(): void {
  cache.clear();
}

/** The changed files a policy says always need a person's eyes. */
export function protectedFiles(policy: Policy, paths: string[]): string[] {
  const rules = policy.approvalPaths.map(globToRegExp);
  return paths.filter((p) => rules.some((r) => r.test(p)));
}

/** Estimated dollars for one model call. Unknown models count as free and say so in the snapshot. */
export function costOf(policy: Policy, model: string, inputTokens: number, outputTokens: number): number {
  const [input, output] = policy.prices[model] ?? [0, 0];
  return (inputTokens * input + outputTokens * output) / 1_000_000;
}
