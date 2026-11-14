"use client";

import { RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useCallback, useState } from "react";
import type { VerificationReport } from "@/app/api/verification/route";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BadgeVariant } from "@/components/ui/classes";
import { Card, Spinner } from "@/components/ui/Surface";
import { groupTheorems } from "@/lib/client/verification";
import { useKeyedLoad } from "@/lib/client/use-keyed-load";
import { API } from "@/lib/types";
import { PaneFrame, PaneHeader } from "./PaneFrame";
import { TaskList } from "./TaskList";

type CheckStatus = VerificationReport["status"];

const STATUS: Record<CheckStatus, { label: string; variant: BadgeVariant }> = {
  passed: { label: "Passed", variant: "success-light" },
  stale: { label: "Stale", variant: "warning-light" },
  unchecked: { label: "Unchecked", variant: "secondary" },
};

/** "4.35.0" from Lean's own version line. */
function leanVersion(line: string | null): string | null {
  return line ? (/version ([\d.]+)/.exec(line)?.[1] ?? line) : null;
}

async function loadReport(signal: AbortSignal): Promise<VerificationReport> {
  const response = await fetch(API.verification, { signal, cache: "no-store" });
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return (await response.json()) as VerificationReport;
}

/** The rules Bob proves about itself, grouped by rule, with the outcome of the last check. */
export function VerifiedPane({ onClose }: { onClose: () => void }) {
  const [version, setVersion] = useState(0);
  const load = useCallback((signal: AbortSignal) => loadReport(signal), []);
  const { data, error } = useKeyedLoad("verification", version, load);

  return (
    <PaneFrame className="bob-verified-panel" label="Verified">
      <PaneHeader title="Verified" onClose={onClose} />
      <div className="bob-pane-body">
        {data === null ? (
          error ? (
            <div className="bob-pane-empty" role="alert">
              <TriangleAlert aria-hidden="true" />
              <p>Could not read the verification report. {error}</p>
              <Button size="sm" variant="secondary" onClick={() => setVersion((value) => value + 1)}>
                Try again
              </Button>
            </div>
          ) : (
            <div className="bob-pane-empty" aria-busy="true">
              <Spinner />
              <p>Reading the last check</p>
            </div>
          )
        ) : (
          <>
            <Card className="bob-pane-card">
              <div className="bob-review-head">
                <ShieldCheck className="bob-verified-icon" aria-hidden="true" />
                <h3 className="bob-pane-title">Machine-checked rules</h3>
                <Badge variant={STATUS[data.status].variant}>{STATUS[data.status].label}</Badge>
              </div>
              <p className="bob-pane-muted">
                {data.theorems.length} theorems{leanVersion(data.lean) ? ` · Lean ${leanVersion(data.lean)}` : ""} · <code>{data.command}</code>
              </p>
              <Button size="xs" variant="ghost" className="bob-verified-refresh" onClick={() => setVersion((value) => value + 1)}>
                <RefreshCw aria-hidden="true" />
                Read again
              </Button>
            </Card>
            {groupTheorems(data.theorems).map((group) => (
              <TaskList
                key={group.rule}
                className="bob-verified-rule"
                title={group.rule}
                items={group.theorems.map((theorem) => ({
                  id: theorem.name,
                  state: theorem.kind === "gap" ? "failed" : theorem.status === "passed" ? "done" : "pending",
                  stateLabel: theorem.kind === "gap" ? "Known gap" : STATUS[theorem.status].label,
                  label: theorem.statement,
                  trailing: (
                    <span className="bob-verified-chips">
                      {theorem.kind === "gap" ? (
                        <Badge variant="warning-outline">Known gap</Badge>
                      ) : (
                        <Badge variant={STATUS[theorem.status].variant}>{STATUS[theorem.status].label}</Badge>
                      )}
                    </span>
                  ),
                }))}
              />
            ))}
          </>
        )}
      </div>
    </PaneFrame>
  );
}
