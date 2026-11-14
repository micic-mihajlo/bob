/**
 * Bob's web app draws each Blob's face with `src/components/features/agents/ascii-face.ts` at the
 * repository root. The renderer runs that same file (aliased in electron.vite.config.ts), so a Blob
 * looks the same in both apps. Only the part the desktop calls is typed here: the web file is
 * checked by the web app's own compiler settings, not the desktop's.
 */
declare module "@bob/web-ascii-face" {
  export interface AsciiFaceIdentity {
    phase: number;
  }
  export interface AsciiFaceFrame {
    time: number;
  }
  export function asciiFaceIdentity(seed: string, hue: number | null): AsciiFaceIdentity;
  export function asciiFaceFrame(
    mood: "idle",
    time: number,
    animated: boolean,
    level: number,
    look: { x: number; y: number } | null,
  ): AsciiFaceFrame;
  export function drawAsciiFace(
    context: CanvasRenderingContext2D,
    size: number,
    identity: AsciiFaceIdentity,
    frame: AsciiFaceFrame,
    hat?: boolean,
  ): void;
}
