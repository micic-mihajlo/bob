import { z } from "zod";
import { factsForFiles } from "../codebase/graph";
import { searchKnowledge } from "../graph/knowledge";
import { getState } from "../store";
import { done } from "./context";
import { define } from "./define";

export const searchCodebaseSchema = z.object({ query: z.string().min(1).describe("What to look for in the project's code, docs and merged pull requests.") });

export const SEARCH_CODEBASE = define({
  name: "search_codebase",
  description:
    "Search HydraDB's index of this project's code, docs and merged pull requests, the same search the Codebase page runs. Returns the top hits with path, summary, score and the tests, theorems and pull requests linked to each file. Use it for any question about the project's own code or architecture, and cite what it returns.",
  schema: searchCodebaseSchema,
  sets: ["captain", "build", "review", "research"],
  label: () => "Searching the codebase",
  doneLabel: (_i, r) => (Array.isArray(r.hits) ? `Searched the codebase: ${r.hits.length} hit${r.hits.length === 1 ? "" : "s"} · ${r.ms} ms` : undefined),
  execute: async ({ query }) => {
    const s = getState();
    const found = await searchKnowledge(s, query);
    if (found.source === "off") return done({ source: "off", hits: [], ms: 0, note: "HydraDB is off or did not answer in time, so there is nothing to cite." });
    const paths = [...new Set(found.hits.flatMap((h) => (h.path && h.kind !== "pr" ? [h.path] : [])))].slice(0, 5);
    const facts = paths.length > 0 ? await factsForFiles(s.project.id, paths, 1_500) : null;
    const hits = found.hits.map(({ id, kind, title, path, score, snippet }) => {
      const f = path ? facts?.find((x) => x.path === path) : undefined;
      return {
        id,
        kind,
        title,
        path,
        score,
        summary: snippet,
        ...(f ? { tests: f.tests.map((t) => t.path), theorems: f.theorems.map((t) => `${t.name}: ${t.statement}`), prs: f.prs.map((p) => `#${p.number} ${p.title}`) } : {}),
      };
    });
    return done({ source: found.source, ms: found.ms, hits });
  },
});
