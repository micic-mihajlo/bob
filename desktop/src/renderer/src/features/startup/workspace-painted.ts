import { createSignal } from "solid-js";

/** Past this, the workspace counts as painted even when Bob's view has not loaded. */
const WAIT_LIMIT_MS = 10_000;

/** Bob's view is on screen, so the startup splash can fade into the workspace. */
const [workspacePainted, setWorkspacePainted] = createSignal(false);

export { workspacePainted };

/**
 * Called once the workspace mounts. The app opens on Bob, so it checks each frame until Bob's view has
 * loaded its page, then waits one more frame so that it is on screen. With another agent open, the
 * splash's own time limit ends the wait.
 */
export function markWorkspacePainted(): void {
  const deadline = performance.now() + WAIT_LIMIT_MS;
  const check = () => {
    if (workspacePainted()) return;
    const shown = document.querySelector("iframe.bob-factory-view[data-loaded]") !== null;
    if (shown || performance.now() > deadline) requestAnimationFrame(() => setWorkspacePainted(true));
    else requestAnimationFrame(check);
  };
  requestAnimationFrame(check);
}
