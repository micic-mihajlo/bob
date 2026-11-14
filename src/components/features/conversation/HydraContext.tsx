"use client";

import { BookOpen, Database, User } from "lucide-react";
import type { MemoryRecall, RecalledMemory } from "@/lib/types";

const SOURCE: Record<RecalledMemory["source"], { label: string; Glyph: typeof User }> = {
  lesson: { label: "What Bob learned before", Glyph: BookOpen },
  person: { label: "Remembered from you", Glyph: User },
};

/**
 * What HydraDB handed the captain for this request: lessons from finished requests and the person's own
 * decisions, each with its relevancy score, and how long the recall took. The request's first recall is the one
 * the captain planned with, so it is the one shown.
 */
export function HydraContext({ recalls, messageIds, requestId }: { recalls: readonly MemoryRecall[]; messageIds: readonly string[]; requestId: string | null }) {
  const ids = new Set(messageIds);
  const recall = recalls.find((r) => r.items.length > 0 && (ids.has(r.messageId) || r.requestId === requestId));
  if (!recall || recall.items.length === 0) return null;
  return (
    <section className="hydra-context" aria-label="Context from HydraDB">
      <header className="why-graph-header">
        <span className="why-graph-title">Context from HydraDB</span>
        <span className="why-graph-source" data-source="hydra">
          <Database aria-hidden="true" className="hydra-context-icon" />
          recalled in {recall.ms} ms
        </span>
      </header>
      {(["lesson", "person"] as const).map((source) => {
        const items = recall.items.filter((m) => m.source === source);
        if (items.length === 0) return null;
        const { label, Glyph } = SOURCE[source];
        return (
          <div key={source} className="hydra-context-group">
            <span className="hydra-context-label">
              <Glyph aria-hidden="true" className="hydra-context-icon" />
              {label}
            </span>
            <ul className="hydra-context-list">
              {items.map((m) => (
                <li key={m.id} className="hydra-context-item" title={m.text}>
                  <span className="hydra-context-score">{m.score.toFixed(2)}</span>
                  <span className="hydra-context-text">
                    <strong>{m.title}</strong>
                    <span className="hydra-context-detail">{m.text.split("\n").slice(1).join(" · ") || m.text}</span>
                  </span>
                  <span className="hydra-context-source">{source === "lesson" ? (m.project ? `lesson · ${m.project}` : "lesson") : "person"}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </section>
  );
}
