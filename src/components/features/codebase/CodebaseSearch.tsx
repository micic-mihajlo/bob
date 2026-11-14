"use client";

import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import type { BadgeVariant } from "@/components/ui/classes";
import { searchCodebase, type CodebaseHit, type CodebaseHitKind, type CodebaseSearch as SearchResult } from "@/lib/client/codebase-view";

const DEBOUNCE_MS = 250;

const KIND: Record<CodebaseHitKind, { label: string; variant: BadgeVariant }> = {
  file: { label: "File", variant: "info-light" },
  doc: { label: "Doc", variant: "primary-light" },
  pr: { label: "PR", variant: "success-light" },
  summary: { label: "Summary", variant: "warning-light" },
};

type Lookup = { query: string; state: "searching" } | { query: string; state: "done"; result: SearchResult } | { query: string; state: "failed" };

/** The search box: HydraDB recall as the person types, each hit with its score, and the time the recall took. */
export function CodebaseSearch({ onPick }: { onPick: (hit: CodebaseHit) => void }) {
  const [query, setQuery] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const trimmed = query.trim();

  useEffect(() => {
    if (!trimmed) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLookup({ query: trimmed, state: "searching" });
      searchCodebase(trimmed, controller.signal)
        .then((result) => setLookup({ query: trimmed, state: "done", result }))
        .catch(() => {
          if (!controller.signal.aborted) setLookup({ query: trimmed, state: "failed" });
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  const current = trimmed && lookup?.query === trimmed ? lookup : null;
  return (
    <section className="codebase-search" aria-label="Search the codebase">
      <div className="file-list-search codebase-search-box">
        <Search className="file-list-search-icon" aria-hidden="true" />
        <input
          type="search"
          className="ui-input file-list-search-input"
          data-size="sm"
          placeholder="Ask HydraDB about this codebase"
          aria-label="Search the codebase"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {trimmed && (!current || current.state === "searching") ? (
        <p className="codebase-search-status" aria-live="polite">
          Searching HydraDB…
        </p>
      ) : null}
      {current?.state === "failed" ? (
        <p className="codebase-search-status" role="alert">
          The search did not answer. Try again.
        </p>
      ) : null}
      {current?.state === "done" ? (
        <>
          <p className="codebase-search-status" aria-live="polite">
            {current.result.source === "off"
              ? "HydraDB is off for this server."
              : `${current.result.hits.length === 1 ? "1 hit" : `${current.result.hits.length} hits`} from HydraDB · ${current.result.ms} ms`}
          </p>
          {current.result.hits.length > 0 ? (
            <ol className="codebase-search-hits">
              {current.result.hits.map((hit) => (
                <li key={hit.id}>
                  <button type="button" className="codebase-search-hit" disabled={!hit.path} onClick={() => onPick(hit)} title={hit.path ? `Show ${hit.path} in the graph` : hit.title}>
                    <span className="codebase-search-score">{hit.score.toFixed(2)}</span>
                    <span className="codebase-search-text">
                      <span className="codebase-search-title">
                        <Badge variant={KIND[hit.kind].variant}>{KIND[hit.kind].label}</Badge>
                        <strong>{hit.title}</strong>
                      </span>
                      {hit.snippet && hit.snippet !== hit.title ? <span className="codebase-search-snippet">{hit.snippet}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
