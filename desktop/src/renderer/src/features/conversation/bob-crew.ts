import type { BobCrewThread } from "@bob/contracts/ipc";
import { createSignal } from "solid-js";
import { appPort } from "../../app-port";

const POLL_MS = 3000;

/** Bob and the Blobs on Bob's web server, read again every few seconds while the app runs. */
const [crew, setCrew] = createSignal<BobCrewThread[]>([]);
/** The Blob thread that the Bob view shows. Null shows Bob's own thread. */
const [selectedThread, setSelectedThread] = createSignal<string | null>(null);
let polling = false;

function refresh() {
  appPort()
    .getBobCrew()
    .then(setCrew)
    .catch(() => setCrew([]));
}

export function useBobCrew() {
  if (!polling) {
    polling = true;
    refresh();
    setInterval(refresh, POLL_MS);
  }
  return { crew, selectedThread, setSelectedThread };
}
