import type { Roadmap } from "./types";
import type { PlaybookId } from "./roadmap/playbooks";

export interface Criterion {
  label: string;
  met: (roadmap: Roadmap) => boolean;
}

export interface StageDef {
  title: string;
  gateTitle: string;
  /** What finishing this stage looks like, in one line. */
  milestone: string;
  /** What the captain keeps in mind while the roadmap is in this stage. Short, plain, no jargon. */
  lesson: string;
  /** What must hold before the roadmap may leave this stage. Enforced by advanceStage. */
  criteria: Criterion[];
  /** Examples of the captain's moves in this stage. It adapts them to the request. */
  moves: string[];
  /** Pulled into the captain's prompt while the roadmap is in this stage. */
  playbook: PlaybookId;
}

const allToday = (r: Roadmap, test: (status: string, artifactId: string | null) => boolean) =>
  r.today.length > 0 && r.today.every((w) => test(w.status, w.artifactId));

const filled = (value: string | null | undefined) => !!value && value.trim().length > 0;

export const STAGES: readonly StageDef[] = [
  {
    title: "Intent",
    gateTitle: "The request is testable",
    milestone: "A request with a named user, a behaviour and an acceptance check",
    lesson: `Nothing starts until the request can be tested. A testable request names who needs it, what they can do afterwards, and one check that proves it works.
"Customers want to export invoices as CSV" is a wish. "An accountant on the invoices page clicks Export and gets a file with one row per invoice: id, customer, amount, status, due date" is a request.
Ask one or two sharp questions about what is missing, in one message. At most two rounds, then go on with the gaps filled by assumptions you state.`,
    criteria: [
      { label: "A named user", met: (r) => filled(r.goal?.user) },
      { label: "The behaviour they need", met: (r) => filled(r.goal?.behaviour) },
      { label: "An acceptance check", met: (r) => filled(r.goal?.acceptance) },
    ],
    moves: [
      "Ask which records and fields are in scope, and where in the app it lives",
      "Ask for the acceptance check as one sentence a test could assert",
      "Record the intent with set_goal: user, behaviour, acceptance and any assumptions",
    ],
    playbook: "inspect-intent",
  },
  {
    title: "Spec",
    gateTitle: "The work is cut into work orders",
    milestone: "Work orders with IDs, at most three in today",
    lesson: `Spec turns the intent into work orders a thread can finish alone: one change, one branch, one pull request each.
A title is a verb and a thing ("Add invoicesToCsv with a test"), small enough to review in a few minutes.
Every work order gets an ID, and the ID follows the change to its pull request and its merge, so anyone can ask why a change exists.
At most three go in today. The rest wait in the backlog.`,
    criteria: [{ label: "At least one open work order is in today", met: (r) => r.today.some((w) => w.status !== "done") }],
    moves: [
      "Plan the work orders with set_roadmap, one per pull request",
      "Pick up to three for today with set_today",
      "Leave anything bigger in the backlog",
    ],
    playbook: "cut-work-orders",
  },
  {
    title: "Build",
    gateTitle: "Every work order has a pull request",
    milestone: "A pull request for each work order in today",
    lesson: `Build is crew threads making pull requests. One build thread per work order, each on its own branch in its own workspace.
The brief is all the thread knows: the goal, the person's words, the area, what it can rely on, what is out of scope, and what done means.
You never touch the code. When a thread reports, check that the report answers the brief before you move on.`,
    criteria: [
      {
        label: "Every work order in today has a pull request",
        met: (r) => allToday(r, (status, artifactId) => status === "done" || artifactId !== null),
      },
    ],
    moves: [
      "Start a build thread per work order with start_thread and a complete brief",
      "Start a review thread when a build thread reports its pull request",
      "Send review findings back to the build thread",
    ],
    playbook: "write-the-brief",
  },
  {
    title: "Ship",
    gateTitle: "The change is merged",
    milestone: "Every pull request reviewed, approved by the person and merged",
    lesson: `Ship is review plus an approved merge. A review thread reads the diff and records findings with a category, a severity and a confidence.
Changes requested go back to the build thread, and the review checks again after the fix.
When the review approves, the person approves the merge. Nothing merges without that approval.`,
    criteria: [{ label: "Every work order in today is merged", met: (r) => allToday(r, (status) => status === "done") }],
    moves: [
      "Put the approval in DIGEST.md and ask with request_approval",
      "Merge with merge_pull_request after the person approves",
      "Close the work order's threads",
    ],
    playbook: "review-and-merge",
  },
  {
    title: "Learn",
    gateTitle: "The results are back in the plan",
    milestone: "What shipped and what it taught us is in the plan",
    lesson: `Learn feeds the result back into the plan. Write in NOTES.md what shipped, whether the acceptance check held, and what the review found.
Turn follow-ups into backlog work orders, so the next request starts from what this one taught.
A new request is inspected the same way as the first before you plan it.`,
    criteria: [],
    moves: [
      "Write what shipped and what the review found in NOTES.md",
      "Add follow-ups to the backlog with set_roadmap",
      "Inspect the next request, then record it with set_goal",
    ],
    playbook: "feed-back",
  },
];

export const MAX_TODAY = 3;

export function frameworkOverview(): string {
  return STAGES.map((s, i) => `${i + 1}. ${s.title} (done when: ${s.milestone})`).join("\n");
}
