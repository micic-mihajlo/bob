import { nowIso } from "./ids";
import { STRONG_MODEL } from "./models";
import { emptyRoadmap } from "./roadmap";
import type { State } from "./state";
import type { Agent, DriveFile } from "./types";

export const CAPTAIN_ID = "bob";

const CAPTAIN: Omit<Agent, "createdAt" | "createdBy"> = {
  id: CAPTAIN_ID,
  name: "Bob",
  title: "Captain: inspects requests, keeps the roadmap and runs the crew",
  role: "orchestrator",
  kind: "captain",
  hue: 28,
  model: STRONG_MODEL,
  description:
    "You make each request testable before work starts, turn it into a five-stage roadmap with work orders, brief a crew thread for each work order, pass what one thread needs from another, and ask the person before anything is merged.",
};

const STARTING_DRIVE: Omit<DriveFile, "updatedAt">[] = [
  { name: "DIGEST.md", content: "Nothing needs you right now.\n" },
  { name: "CREW.md", content: "No crew threads yet.\n" },
  { name: "NOTES.md", content: "" },
];

export function seedState(): State {
  const at = nowIso();
  const captain: Agent = { ...CAPTAIN, createdAt: at, createdBy: { kind: "seed" } };
  return {
    project: { id: "invoices-app", name: "invoices-app", repo: null, template: "invoices" },
    agents: [captain],
    messages: [],
    deliveries: [],
    turns: [],
    threads: { [captain.id]: [] },
    approvals: [],
    artifacts: [],
    roadmap: emptyRoadmap(at),
    readMarks: { [captain.id]: 0 },
    relayKeys: [],
    actedTurnIds: [],
    requeuedDeliveryIds: [],
    drive: STARTING_DRIVE.map((f) => ({ ...f, updatedAt: at })),
    rev: 0,
  };
}
