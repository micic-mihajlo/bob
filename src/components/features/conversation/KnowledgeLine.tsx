"use client";

import { Database } from "lucide-react";
import { knowledgeSummary } from "@/lib/knowledge-format";
import type { KnowledgeContext } from "@/lib/types";

/** Under a crew brief: what HydraDB recalled for it, one line that opens to the files and past pull requests. */
export function KnowledgeLine({ knowledge }: { knowledge: KnowledgeContext }) {
  return (
    <details className="knowledge-line">
      <summary>
        <Database aria-hidden="true" className="hydra-context-icon" />
        {knowledgeSummary(knowledge)}
      </summary>
      <ul className="hydra-context-list">
        {knowledge.files.map((f) => (
          <li key={f.path} className="hydra-context-item">
            <span className="hydra-context-score">file</span>
            <span className="hydra-context-text">
              <strong>{f.path}</strong>
              {f.snippet ? <span className="hydra-context-detail">{f.snippet}</span> : null}
            </span>
          </li>
        ))}
        {knowledge.prs.map((p) => (
          <li key={p.number} className="hydra-context-item">
            <span className="hydra-context-score">PR</span>
            <span className="hydra-context-text">
              <strong>
                #{p.number} {p.title}
              </strong>
              {p.files.length ? <span className="hydra-context-detail">{p.files.join(", ")}</span> : null}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}
