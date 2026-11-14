/// <reference types="vite/client" />

import type { BobDesktopApi } from "@bob/contracts/ipc";

declare global {
  interface HighlightRegistry {
    set(name: string, highlight: Highlight): this;
    delete(name: string): boolean;
  }

  interface Window {
    bob: BobDesktopApi;
  }
}
