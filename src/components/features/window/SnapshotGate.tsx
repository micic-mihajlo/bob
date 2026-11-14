"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AppLoadingScreen } from "@/components/features/window/AppLoadingScreen";
import { BobProvider } from "@/components/features/window/BobContext";
import { useSnapshot } from "@/lib/client/use-snapshot";

/**
 * Loads the snapshot, keeps it live, and hands it to the window through BobProvider. The loading
 * screen stays over the window until its exit has played.
 */
export function SnapshotGate({ children }: { children: ReactNode }) {
  const { snapshot, error, connected } = useSnapshot();
  const [exited, setExited] = useState(false);

  useEffect(() => {
    if (snapshot === null) setExited(false);
  }, [snapshot]);

  return (
    <>
      {snapshot === null ? null : (
        <BobProvider snapshot={snapshot} sync={connected ? "live" : error === null ? "polling" : "offline"}>
          {children}
        </BobProvider>
      )}
      {exited ? null : <AppLoadingScreen ready={snapshot !== null} error={snapshot === null ? error : null} onExited={() => setExited(true)} />}
    </>
  );
}
