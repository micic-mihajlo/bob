"use client";

import type { ReactNode } from "react";
import { AppLoadingScreen } from "@/components/features/window/AppLoadingScreen";
import { BobProvider } from "@/components/features/window/BobContext";
import { useSnapshot } from "@/lib/client/use-snapshot";

/** Loads the snapshot, keeps it live, and hands it to the window through BobProvider. */
export function SnapshotGate({ children }: { children: ReactNode }) {
  const { snapshot, error, connected } = useSnapshot();

  if (snapshot === null) return <AppLoadingScreen error={error} />;

  return (
    <BobProvider snapshot={snapshot} connected={connected}>
      {children}
    </BobProvider>
  );
}
