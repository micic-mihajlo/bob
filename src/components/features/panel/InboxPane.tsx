"use client";

import "./inbox-pane.css";
import { Bug, Hammer, Inbox, MessageSquareQuote, MessagesSquare, Reply, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { useBob } from "@/components/features/window/BobContext";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Surface";
import { postInboxSample, promoteInboxOrder } from "@/lib/client/api";
import { formatChatTimestamp } from "@/lib/client/chat-time";
import { displayName } from "@/lib/client/crew";
import { candidateOutcome, inboxStatus, quotedLines } from "@/lib/client/inbox";
import { WORK_ORDER_STATUS_LABEL } from "@/lib/client/roadmap-view";
import type { InboxItem, InboxKind } from "@/lib/types";
import { PaneFrame, PaneHeader } from "./PaneFrame";

const KIND: Record<InboxKind, { label: string; icon: LucideIcon }> = {
  meeting: { label: "Meeting", icon: MessagesSquare },
  feedback: { label: "Feedback", icon: MessageSquareQuote },
  error: { label: "Error", icon: Bug },
};

const TONE_BADGE = { new: "info-light", done: "success-light", alert: "destructive-light", quiet: "secondary" } as const;

/**
 * The captain's inbox: meetings, feedback and production errors, each with the lines the captain
 * pulled asks from. A testable ask is a backlog work order the person can build; a vague one shows
 * what the captain asked them.
 */
export function InboxPane({ onClose }: { onClose: () => void }) {
  const { snapshot } = useBob();
  const items = snapshot.inbox ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setBusy(key);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) setError(result.error);
  };

  return (
    <PaneFrame className="bob-inbox-panel" label="Inbox">
      <PaneHeader title="Inbox" onClose={onClose} />
      <div className="bob-inbox-body">
        {error ? (
          <p className="bob-inbox-error" role="alert">
            {error}
          </p>
        ) : null}
        {items.length === 0 ? (
          <div className="bob-inbox-empty">
            <Inbox aria-hidden="true" />
            <p>Meetings, feedback and production errors land here. Bob pulls the asks out of them and puts the testable ones in the backlog.</p>
            <Button variant="secondary" disabled={busy !== null} onClick={() => run("sample", postInboxSample)}>
              Add a sample call and error
            </Button>
          </div>
        ) : (
          items.map((item) => <InboxCard key={item.id} item={item} busy={busy} onBuild={(id) => run(id, () => promoteInboxOrder(id))} />)
        )}
      </div>
    </PaneFrame>
  );
}

function InboxCard({ item, busy, onBuild }: { item: InboxItem; busy: string | null; onBuild: (workOrderId: string) => void }) {
  const { snapshot, agentsById, captain, selectAgent } = useBob();
  const { label, icon: Icon } = KIND[item.kind];

  const answer = (agentId: string) => {
    selectAgent(agentId);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".composer-editor-surface")?.focus());
  };
  const status = inboxStatus(item);

  return (
    <Card className="bob-inbox-card" id={`inbox-${item.id}`} data-kind={item.kind}>
      <header className="bob-inbox-head">
        <span className="bob-inbox-kind" title={label}>
          <Icon aria-label={label} />
        </span>
        <div className="bob-inbox-title">
          <h3>{item.source}</h3>
          <p>
            <span>{label}</span> · <span>{formatChatTimestamp(item.at)}</span>
            {item.followUpOf ? (
              <>
                {" "}
                · <span>follows up PR #{item.followUpOf.number}</span>
              </>
            ) : null}
          </p>
        </div>
        <Badge variant={TONE_BADGE[status.tone]}>{status.label}</Badge>
      </header>

      <blockquote className="bob-inbox-text">
        {quotedLines(item).map((line, index) => (line.quoted ? <mark key={index}>{line.text}</mark> : <span key={index}>{line.text}</span>))}
      </blockquote>

      {item.candidates.length > 0 ? (
        <ul className="bob-inbox-asks" aria-label="Asks">
          {item.candidates.map((candidate) => {
            const outcome = candidateOutcome(candidate, snapshot.roadmap);
            const owner = outcome.kind === "planned" && outcome.order.ownerAgentId ? agentsById.get(outcome.order.ownerAgentId) : undefined;
            return (
              <li key={candidate.id} className="bob-inbox-ask" data-verdict={candidate.verdict}>
                <div className="bob-inbox-ask-line">
                  <span className="bob-inbox-ask-text">{candidate.ask}</span>
                  <Badge variant={candidate.verdict === "testable" ? "success-light" : "warning-light"}>
                    {candidate.verdict === "testable" ? "Testable" : "Unclear"}
                  </Badge>
                </div>
                {outcome.kind === "asked" ? <p className="bob-inbox-question">Bob asked you: {outcome.question}</p> : null}
                {outcome.kind === "asked" && captain ? (
                  <div className="bob-inbox-order">
                    <span>Waiting for your answer</span>
                    <Button size="sm" variant="secondary" onClick={() => answer(captain.id)}>
                      <Reply aria-hidden="true" />
                      Answer
                    </Button>
                  </div>
                ) : null}
                {outcome.kind === "backlog" ? (
                  <div className="bob-inbox-order">
                    <span>In the backlog</span>
                    <Button size="sm" disabled={busy !== null} onClick={() => onBuild(outcome.order.id)}>
                      <Hammer aria-hidden="true" />
                      {busy === outcome.order.id ? "Starting…" : "Build this"}
                    </Button>
                  </div>
                ) : null}
                {outcome.kind === "planned" ? (
                  <div className="bob-inbox-order">
                    {owner ? (
                      <button type="button" className="bob-inbox-owner" onClick={() => selectAgent(owner.id)}>
                        {displayName(owner)}
                      </button>
                    ) : null}
                    <span>{WORK_ORDER_STATUS_LABEL[outcome.order.status]}</span>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : item.status === "new" ? (
        <p className="bob-inbox-question">Bob is reading it…</p>
      ) : null}
    </Card>
  );
}
