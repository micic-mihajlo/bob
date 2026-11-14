/** The codebase view: the module graph HydraDB holds for the project, and live recall over its files and pull requests. */

import type { CodebaseOverview, CodebaseStats } from "@/lib/codebase/graph";
import type { KnowledgeHit } from "@/lib/graph/knowledge";

export type { CodebaseStats } from "@/lib/codebase/graph";

export type CodebaseModule = CodebaseOverview["modules"][number];
export type CodebaseEdge = CodebaseOverview["imports"][number];

export interface CodebaseGraph {
  source: "hydra" | "memory";
  stats: CodebaseStats | null;
  overview: CodebaseOverview | null;
}

export type CodebaseHit = Omit<KnowledgeHit, "text">;
export type CodebaseHitKind = CodebaseHit["kind"];

export interface CodebaseSearch {
  ms: number;
  source: "hydra" | "off";
  hits: CodebaseHit[];
}

export const CODEBASE_API = {
  graph: "/api/codebase/graph",
  search: (q: string) => `/api/codebase/search?q=${encodeURIComponent(q)}`,
  files: (modulePath: string) => `/api/codebase/files?module=${encodeURIComponent(modulePath)}`,
} as const;

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return (await response.json()) as T;
}

/** The project's module graph, or its empty shape when the route has nothing yet. */
export function fetchCodebaseGraph(signal: AbortSignal): Promise<CodebaseGraph> {
  return getJson<CodebaseGraph>(CODEBASE_API.graph, signal);
}

/** HydraDB recall for one query, ranked, one hit per source, with the time it took. */
export async function searchCodebase(q: string, signal: AbortSignal): Promise<CodebaseSearch> {
  const result = await getJson<CodebaseSearch>(CODEBASE_API.search(q), signal);
  return { ...result, hits: result.hits.filter((hit, index) => result.hits.findIndex((other) => other.id === hit.id) === index) };
}

/** The files of one module, from the project's main branch. */
export async function fetchModuleFiles(modulePath: string, signal: AbortSignal): Promise<string[]> {
  const { files } = await getJson<{ files: string[] }>(CODEBASE_API.files(modulePath), signal);
  return files;
}

const total = (counts: Partial<Record<string, number>>) => Object.values(counts).reduce<number>((sum, n) => sum + (n ?? 0), 0);
const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/** "HydraDB graph: 1,234 nodes · 5,678 edges · 292 files · 240 PRs" */
export function statsLine(graph: CodebaseGraph): string | null {
  const { stats } = graph;
  if (!stats) return null;
  const name = graph.source === "hydra" ? "HydraDB graph" : "Graph (memory)";
  return `${name}: ${[plural(total(stats.nodes), "node", "nodes"), plural(total(stats.edges), "edge", "edges"), plural(stats.files, "file", "files"), plural(stats.prs, "PR", "PRs")].join(" · ")}`;
}

/** The group a module sits under: its top folder, or the first two folders under src. */
export function groupOf(modulePath: string): string {
  const parts = modulePath.split("/").filter((part) => part && part !== ".");
  if (parts.length === 0) return "(root)";
  return parts[0] === "src" && parts.length > 1 ? `src/${parts[1]}` : parts[0];
}

/** The module a file belongs to: the one whose path is the longest folder prefix of the file's path. */
export function moduleOfPath(modules: readonly CodebaseModule[], filePath: string): CodebaseModule | null {
  const directory = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/")) : "";
  let best: { module: CodebaseModule; length: number } | null = null;
  for (const entry of modules) {
    const own = entry.path.replace(/^\.?\/?|\/$/g, "");
    const inside = own === "" || directory === own || directory.startsWith(`${own}/`);
    if (inside && (!best || own.length > best.length)) best = { module: entry, length: own.length };
  }
  return best?.module ?? null;
}

export interface PlacedModule extends CodebaseModule {
  group: string;
  label: string;
  x: number;
  y: number;
  width: number;
}

export interface PlacedEdge extends CodebaseEdge {
  d: string;
}

export interface PlacedGroup {
  name: string;
  x: number;
  y: number;
}

export interface CodebaseLayout {
  width: number;
  height: number;
  modules: PlacedModule[];
  edges: PlacedEdge[];
  groups: PlacedGroup[];
}

export const NODE_HEIGHT = 24;
const ROW = 30;
const GROUP_HEAD = 26;
const GROUP_GAP = 14;
const PAD = 12;
const COLUMN_GAP = 64;
/** Room on the right for the loops of edges inside the last column. */
const LOOP = 40;
const MIN_COLUMN = 168;
const MAX_COLUMNS = 4;

/**
 * Places the modules without a force simulation: grouped by top folder, the groups packed into as many columns as
 * the width holds, each module a row in its group. Edges run between the sides of their modules, as curves.
 */
export function layoutCodebase(modules: readonly CodebaseModule[], edges: readonly CodebaseEdge[], width: number): CodebaseLayout {
  const byGroup = new Map<string, CodebaseModule[]>();
  for (const entry of modules) byGroup.set(groupOf(entry.path), [...(byGroup.get(groupOf(entry.path)) ?? []), entry]);
  const groups = [...byGroup.entries()]
    .map(([name, members]) => ({ name, members: [...members].sort((a, b) => a.path.localeCompare(b.path)) }))
    .sort((a, b) => b.members.length - a.members.length || a.name.localeCompare(b.name));
  const columns = Math.max(1, Math.min(MAX_COLUMNS, groups.length, Math.floor((width - PAD - LOOP + COLUMN_GAP) / (MIN_COLUMN + COLUMN_GAP))));
  const columnWidth = (width - PAD - LOOP - COLUMN_GAP * (columns - 1)) / columns;
  const heights = Array.from({ length: columns }, () => PAD);
  const placed: PlacedModule[] = [];
  const heads: PlacedGroup[] = [];
  const room = Math.max(4, Math.floor((columnWidth - 40) / 6.6));
  for (const group of groups) {
    const column = heights.indexOf(Math.min(...heights));
    const x = PAD + column * (columnWidth + COLUMN_GAP);
    heads.push({ name: group.name, x, y: heights[column] + 14 });
    group.members.forEach((member, index) => {
      const rest = (member.path.startsWith(`${group.name}/`) ? member.path.slice(group.name.length + 1) : member.path) || member.path || "/";
      const label = rest.length > room ? `…${rest.slice(-(room - 1))}` : rest;
      placed.push({ ...member, group: group.name, label, x, y: heights[column] + GROUP_HEAD + index * ROW, width: columnWidth });
    });
    heights[column] += GROUP_HEAD + group.members.length * ROW + GROUP_GAP;
  }
  const at = new Map(placed.map((entry) => [entry.path, entry]));
  const routed = edges.flatMap((edge) => {
    const from = at.get(edge.from);
    const to = at.get(edge.to);
    if (!from || !to || from === to) return [];
    const y1 = from.y + NODE_HEIGHT / 2;
    const y2 = to.y + NODE_HEIGHT / 2;
    if (from.x === to.x) {
      const side = from.x + from.width;
      const bend = Math.min(LOOP - 4, 12 + Math.abs(y2 - y1) / 8);
      return [{ ...edge, d: `M ${side} ${y1} C ${side + bend} ${y1}, ${side + bend} ${y2}, ${side} ${y2}` }];
    }
    const rightward = from.x < to.x;
    const x1 = rightward ? from.x + from.width : from.x;
    const x2 = rightward ? to.x : to.x + to.width;
    const mid = (x1 + x2) / 2;
    return [{ ...edge, d: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}` }];
  });
  return { width, height: Math.max(...heights, PAD * 2) + PAD - GROUP_GAP, modules: placed, edges: routed, groups: heads };
}

/** Stroke width for an edge: thin for one import, thicker for many, capped. */
export function edgeWidth(weight: number): number {
  return Math.min(4, 0.75 + Math.log2(Math.max(1, weight)) * 0.6);
}
