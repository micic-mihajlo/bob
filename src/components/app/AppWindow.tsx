"use client";

import { useSnapshot } from "@/lib/client/use-snapshot";
import { BobProvider } from "./BobContext";
import { WindowShell } from "./WindowShell";

export function AppWindow() {
  const { snapshot, error, connected } = useSnapshot();

  if (snapshot === null) {
    return error === null ? (
      <div className="state-screen" role="status">
        <span className="state-screen-breathe">Loading the team</span>
      </div>
    ) : (
      <div className="state-screen" data-tone="error" role="alert">
        Could not load the team. {error}
      </div>
    );
  }

  return (
    <BobProvider snapshot={snapshot} connected={connected}>
      <WindowShell />
    </BobProvider>
  );
}
