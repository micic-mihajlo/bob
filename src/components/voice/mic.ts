"use client";

/** What a call says when the browser won't hand over the microphone: denied, or an embedding frame that doesn't allow it. */
export const MIC_BLOCKED = "Bob can't use your microphone here. Open Bob in its own browser tab, or allow the microphone in the address bar.";

/** Asks for the microphone once and lets it go. Null when a call can use it, else why not. */
export async function checkMic(): Promise<string | null> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return "No microphone was found. Plug one in and call again.";
    return MIC_BLOCKED;
  }
}

/** True when the page runs inside another page's frame, where the microphone is often not allowed. */
export function inFrame(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}
