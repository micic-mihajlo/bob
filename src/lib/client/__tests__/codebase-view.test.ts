import { describe, expect, it } from "vitest";
import { edgeWidth, groupOf, layoutCodebase, moduleOfPath, NODE_HEIGHT, statsLine, type CodebaseGraph } from "../codebase-view";

const modules = [
  { path: "src/lib", files: 12 },
  { path: "src/lib/graph", files: 6 },
  { path: "src/app/api/codebase/search", files: 1 },
  { path: "scripts", files: 3 },
  { path: ".", files: 4 },
];
const edges = [
  { from: "src/app/api/codebase/search", to: "src/lib/graph", weight: 4 },
  { from: "src/lib/graph", to: "src/lib", weight: 1 },
  { from: "scripts", to: "missing", weight: 2 },
];

describe("codebase view", () => {
  it("groups modules by top folder, splitting src one level deeper", () => {
    expect(groupOf("src/lib/graph")).toBe("src/lib");
    expect(groupOf("src")).toBe("src");
    expect(groupOf("scripts/dev")).toBe("scripts");
    expect(groupOf("")).toBe("(root)");
    expect(groupOf(".")).toBe("(root)");
  });

  it("finds the deepest module that holds a file", () => {
    expect(moduleOfPath(modules, "src/lib/graph/knowledge.ts")?.path).toBe("src/lib/graph");
    expect(moduleOfPath(modules, "src/lib/store.ts")?.path).toBe("src/lib");
    expect(moduleOfPath(modules, "src/library.ts")?.path).toBe(".");
    expect(moduleOfPath(modules, "README.md")?.path).toBe(".");
    expect(moduleOfPath(modules.slice(0, 4), "docs/x.md")).toBeNull();
  });

  it("lays modules out in non-overlapping columns and routes only edges between known modules", () => {
    const layout = layoutCodebase(modules, edges, 900);
    expect(layout.modules).toHaveLength(modules.length);
    expect(layout.edges.map((edge) => `${edge.from}>${edge.to}`)).toEqual(["src/app/api/codebase/search>src/lib/graph", "src/lib/graph>src/lib"]);
    expect(new Set(layout.modules.map((entry) => entry.x)).size).toBeGreaterThan(1);
    for (const a of layout.modules)
      for (const b of layout.modules)
        if (a !== b && a.x === b.x) expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(NODE_HEIGHT);
    for (const entry of layout.modules) expect(entry.y + NODE_HEIGHT).toBeLessThanOrEqual(layout.height);
    expect(layout.modules.find((entry) => entry.path === "src/lib/graph")?.label).toBe("graph");
    expect(layout.edges.every((edge) => edge.d.startsWith("M "))).toBe(true);
  });

  it("falls back to one column on a narrow panel and shortens long labels", () => {
    const layout = layoutCodebase(modules, edges, 150);
    expect(new Set(layout.modules.map((entry) => entry.x))).toEqual(new Set([12]));
    const long = layout.modules.find((entry) => entry.path === "src/app/api/codebase/search");
    expect(long?.label.startsWith("…")).toBe(true);
    expect(long?.label.endsWith("search")).toBe(true);
  });

  it("writes the stats line and scales edges by import count", () => {
    const graph: CodebaseGraph = {
      source: "hydra",
      stats: { nodes: { File: 1000, Module: 234 }, edges: { IMPORTS: 5678 }, files: 292, prs: 240, lastMs: 31, at: "2026-11-14T20:00:00.000Z", sent: null },
      overview: null,
    };
    expect(statsLine(graph)).toBe("HydraDB graph: 1,234 nodes · 5,678 edges · 292 files · 240 PRs");
    expect(statsLine({ ...graph, stats: null })).toBeNull();
    expect(statsLine({ ...graph, source: "memory" })).toBe("Graph (memory): 1,234 nodes · 5,678 edges · 292 files · 240 PRs");
    expect(edgeWidth(1)).toBeLessThan(edgeWidth(8));
    expect(edgeWidth(10_000)).toBe(4);
  });
});
