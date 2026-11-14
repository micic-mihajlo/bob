"use client";

import { useEffect, useState } from "react";

/**
 * Whether Bob runs inside the desktop app (`?embed=1`), whose own sidebar and titlebar hold Bob. The URL
 * decides it, so every component can ask on its first effect without waiting for another to mark the page.
 */
export function useEmbedded(): boolean {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    setEmbedded(new URLSearchParams(window.location.search).get("embed") === "1");
  }, []);
  return embedded;
}
