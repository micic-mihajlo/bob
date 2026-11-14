import type { PartialTranslation } from "../../../message";
import type { messages as source } from "../../en/status/host";

export const messages = {
  "status.host.registered": "Dieser Bob wurde für den WebRTC-Zugriff registriert.",
  "status.host.keyRotated": "Serverschlüssel geändert. Gekoppelte Geräte bleiben gekoppelt.",
  "status.host.identityUpdated": "Serveridentität aktualisiert.",
  "status.host.starting": "WebRTC-Host wird gestartet…",
  "status.host.ready": "Dieser Bob ist für WebRTC-Verbindungen bereit.",
  "status.host.stopping": "Dieser Bob wird auf privat gesetzt…",
  "status.host.private": "Dieser Bob ist privat.",
} as const satisfies PartialTranslation<typeof source>;
