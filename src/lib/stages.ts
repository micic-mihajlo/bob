import type { Roadmap } from "./types";

export interface Criterion {
  label: string;
  met: (roadmap: Roadmap) => boolean;
}

export interface StageDef {
  title: string;
  gateTitle: string;
  /** What must hold before the roadmap may leave this stage. */
  criteria: Criterion[];
}

const allToday = (r: Roadmap, test: (status: string, artifactId: string | null) => boolean) =>
  r.today.length > 0 && r.today.every((w) => test(w.status, w.artifactId));

export const STAGES: readonly StageDef[] = [
  {
    title: "Intent",
    gateTitle: "The goal is clear",
    criteria: [{ label: "A goal is set", met: (r) => r.goal !== null }],
  },
  {
    title: "Spec",
    gateTitle: "The work is broken down",
    criteria: [{ label: "At least one work order is in today", met: (r) => r.today.length > 0 }],
  },
  {
    title: "Build",
    gateTitle: "Today's work is built",
    criteria: [
      { label: "Every work order in today is done", met: (r) => allToday(r, (s) => s === "done") },
    ],
  },
  {
    title: "Ship",
    gateTitle: "The change is out",
    criteria: [
      {
        label: "Every work order in today has an artifact attached",
        met: (r) => allToday(r, (_s, artifactId) => artifactId !== null),
      },
    ],
  },
  { title: "Learn", gateTitle: "The outcome is reviewed", criteria: [] },
];

export const MAX_TODAY = 3;
