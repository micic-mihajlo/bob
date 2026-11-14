"use client";

import { useBob } from "@/components/app/BobContext";

export function BrainFooter() {
  const { snapshot, connected } = useBob();
  return (
    <footer className="brain-footer">
      <span className="brain-dot" data-live={connected ? "" : undefined} aria-hidden="true" />
      <span>{snapshot.brain === "model" ? "Live model" : "Scripted agents"}</span>
      <span className="brain-sync">{connected ? "Live" : "Polling"}</span>
    </footer>
  );
}
