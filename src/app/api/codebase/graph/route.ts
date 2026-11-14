import { codebaseOverview, codebaseStats, warmCodebaseGraph } from "@/lib/codebase/graph";
import { json, ready } from "@/lib/http";
import { getState } from "@/lib/store";

/** The active project's codebase graph: what the last pass found, and its modules with the imports between them. */
export async function GET(): Promise<Response> {
  ready();
  const { project } = getState();
  warmCodebaseGraph(project);
  const overview = await codebaseOverview(project.id);
  return json({ source: overview?.source ?? "memory", stats: codebaseStats(project.id), overview });
}
