import { hashText, slugify } from "./ids";
import { LIGHT_MODEL } from "./models";
import type { State } from "./state";
import type { CrewRole } from "./types";

export type Toolset = "captain" | CrewRole | "standing" | "subagent";

export interface RoleTemplate {
  role: CrewRole;
  name: string;
  title: string;
  /** Standing instructions every thread of this role starts with. */
  instructions: string;
  model: string;
  hue: number;
  /** Build threads get a branch of their own at start. */
  ownBranch: boolean;
}

export const ROLE_TEMPLATES: Readonly<Record<CrewRole, RoleTemplate>> = {
  build: {
    role: "build",
    name: "Build",
    title: "Builds one change on its own branch",
    instructions:
      "You make one change in your workspace on your own branch, commit it, read the diff, and open a pull request. You never merge.",
    model: LIGHT_MODEL,
    hue: 210,
    ownBranch: true,
  },
  review: {
    role: "review",
    name: "Review",
    title: "Reviews one pull request",
    instructions:
      "You read one pull request's real diff in your workspace and record a verdict with concrete findings. You never change code.",
    model: LIGHT_MODEL,
    hue: 150,
    ownBranch: false,
  },
  research: {
    role: "research",
    name: "Research",
    title: "Answers one question from the code",
    instructions: "You answer one question by reading the code in your workspace, and record what you found as a note.",
    model: LIGHT_MODEL,
    hue: 285,
    ownBranch: false,
  },
};

export const CREW_ROLES = Object.keys(ROLE_TEMPLATES) as CrewRole[];
export const MAX_BUSY_THREADS = 3;
export const DRIVE_FILES = ["DIGEST.md", "CREW.md", "NOTES.md"] as const;
export type DriveName = (typeof DRIVE_FILES)[number];

/** "invoices-app" gives "INV": the first three letters of the project name's first word. */
export function projectKey(projectName: string): string {
  const word = projectName.split(/[^A-Za-z0-9]+/).find(Boolean) ?? "BOB";
  return word.slice(0, 3).toUpperCase();
}

/** Codes never repeat within a state, because threads are closed, never removed. */
export function nextThreadCode(s: State): string {
  const used = s.agents.filter((a) => a.kind === "crew").length;
  return `${projectKey(s.project.name)}-${used + 1}`;
}

const BRANCH_SLUG_MAX = 40;

/** `inv-3-csv-export`: the thread code, then what the work is. */
export function branchName(code: string, subject: string): string {
  const slug = slugify(subject).slice(0, BRANCH_SLUG_MAX).replace(/-+$/, "");
  return slug ? `${code.toLowerCase()}-${slug}` : code.toLowerCase();
}

export const threadHue = (role: CrewRole, code: string) => (ROLE_TEMPLATES[role].hue + (hashText(code) % 30)) % 360;
