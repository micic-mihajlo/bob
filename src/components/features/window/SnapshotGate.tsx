"use client";

import type { ReactNode } from "react";
import { BobProvider } from "@/components/app/BobContext";
import { useSnapshot } from "@/lib/client/use-snapshot";

/** Loads the snapshot, keeps it live, and hands it to the window through BobProvider. */
export function SnapshotGate({ children }: { children: ReactNode }) {
  const { snapshot, error, connected } = useSnapshot();

  if (snapshot === null) {
    return (
      <div className="app-loading-state" role={error === null ? "status" : "alert"}>
        {error === null ? "Loading" : `Could not load Bob. ${error}`}
      </div>
    );
  }

  return (
    <BobProvider snapshot={snapshot} connected={connected}>
      {children}
    </BobProvider>
  );
}
