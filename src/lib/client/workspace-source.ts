"use client";

import { createContext, useContext } from "react";
import { API, type AgentId, type WorkspaceChanges, type WorkspaceListing } from "@/lib/types";

/** Where a crew thread's workspace is read from. A context so a preview can answer without a server. */
export interface WorkspaceSource {
  changes: (agentId: AgentId, signal: AbortSignal) => Promise<WorkspaceChanges>;
  listing: (agentId: AgentId, path: string, signal: AbortSignal) => Promise<WorkspaceListing>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getJson(url: string, signal: AbortSignal): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal, cache: "no-store" });
  const payload: unknown = await response.json().catch(() => null);
  if (isRecord(payload) && (payload.ok === true || typeof payload.error === "string")) return payload;
  throw new Error(response.ok ? "The answer was not in the expected shape." : `The server answered ${response.status}.`);
}

function failure(payload: Record<string, unknown>): { ok: false; error: string } | null {
  if (payload.ok === true) return null;
  return { ok: false, error: typeof payload.error === "string" ? payload.error : "Unknown error." };
}

export const httpWorkspaceSource: WorkspaceSource = {
  async changes(agentId, signal) {
    const payload = await getJson(API.agentChanges(agentId), signal);
    const failed = failure(payload);
    if (failed) return failed;
    if (!Array.isArray(payload.files) || typeof payload.patch !== "string") throw new Error("The changes were not in the expected shape.");
    return payload as WorkspaceChanges;
  },
  async listing(agentId, path, signal) {
    const payload = await getJson(API.agentFiles(agentId, path), signal);
    const failed = failure(payload);
    if (failed) return failed;
    if (payload.kind !== "dir" && payload.kind !== "file") throw new Error("The listing was not in the expected shape.");
    return payload as WorkspaceListing;
  },
};

export const WorkspaceSourceContext = createContext<WorkspaceSource>(httpWorkspaceSource);

export function useWorkspaceSource(): WorkspaceSource {
  return useContext(WorkspaceSourceContext);
}
