"use client";

import { useCallback } from "react";
import type { AgentId, WorkspaceListing } from "@/lib/types";
import { useKeyedLoad, type Loaded } from "./use-keyed-load";
import { useWorkspaceSource } from "./workspace-source";

export function useWorkspaceListing(agentId: AgentId, path: string, version: number): Loaded<WorkspaceListing> {
  const source = useWorkspaceSource();
  const load = useCallback((signal: AbortSignal) => source.listing(agentId, path, signal), [source, agentId, path]);
  return useKeyedLoad(`${agentId}:${path}`, version, load);
}

export function joinPath(dir: string, name: string): string {
  return dir === "" ? name : `${dir}/${name}`;
}
