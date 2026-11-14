"use client";

import { Bot, GitPullRequest, MessageSquare, ScanSearch, ShieldCheck, User } from "lucide-react";
import { Fragment, useEffect, useState, type CSSProperties } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { fetchGraph } from "@/lib/client/api";
import { buildPathGraph, type PathNodeKind } from "@/lib/client/why-graph";
import type { GraphView } from "@/lib/types";

const GLYPH: Record<PathNodeKind, typeof Bot> = {
  pull_request: GitPullRequest,
  review: ScanSearch,
  approval: ShieldCheck,
  turn: Bot,
  message: MessageSquare,
  origin: User,
};

/**
 * The pull request's Why? path as a small graph, left to right, from the PR back to the sentence
 * the person typed. The columns come in one after another along the path.
 */
export function WhyGraph({ pullRequestId }: { pullRequestId: string }) {
  const { snapshot } = useBob();
  const [view, setView] = useState<GraphView | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchGraph(pullRequestId, controller.signal)
      .then(setView)
      .catch(() => undefined);
    return () => controller.abort();
  }, [pullRequestId]);

  // Built on each render, so a gate that moves while the dialog is open shows its new status.
  const current = view?.prId === pullRequestId ? buildPathGraph(view, snapshot) : null;
  if (!current || current.columns.length === 0) return null;
  return (
    <section className="why-graph" aria-label="Path from the pull request to what you typed">
      <header className="why-graph-header">
        <span className="why-graph-title">Path</span>
        <span className="why-graph-source" data-source={current.source}>
          {current.source === "hydra" ? "from HydraDB" : "from memory"}
        </span>
      </header>
      <ol className="why-graph-path">
        {current.columns.map((column, index) => (
          <Fragment key={column.nodes[0].id}>
            {column.link ? (
              <li className="why-graph-link" aria-hidden="true" style={{ "--why-step": index * 2 - 1 } as CSSProperties}>
                <span className="why-graph-link-label">{column.link}</span>
              </li>
            ) : null}
            <li className="why-graph-column" style={{ "--why-step": index * 2 } as CSSProperties}>
              {column.nodes.map((node) => {
                const Glyph = GLYPH[node.kind];
                return (
                  <div key={node.id} className="why-graph-node" data-kind={node.kind} title={node.label}>
                    <span className="why-graph-node-title">
                      <Glyph aria-hidden="true" />
                      {node.title}
                    </span>
                    <span className="why-graph-node-label">{node.label}</span>
                  </div>
                );
              })}
            </li>
          </Fragment>
        ))}
      </ol>
    </section>
  );
}
