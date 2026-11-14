import { resultLine } from "./brain/script-plan";
import { nowIso } from "./ids";
import { changelogFile } from "./release-notes";
import { ordersOf, tracksOf } from "./roadmap";
import { requestControls } from "./usage";
import { agentName, type State } from "./state";
import { needsYou, threadStateOf } from "./thread-status";
import { isPullRequest } from "./threads";
import type { Agent, DriveFile, NeedsYouItem, Track } from "./types";

const clip = (text: string, max: number) => {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
};
const cell = (text: string) => text.replace(/\|/g, "\\|");

function askOf(s: State, item: NeedsYouItem): string {
  if (item.kind === "approval") {
    const prId = s.approvals.find((a) => a.id === item.approvalId)?.pullRequestId;
    const number = s.artifacts.find((a) => a.id === prId)?.pullRequest?.number;
    return number ? `approve the merge of #${number}` : `approve "${clip(item.title, 80)}"`;
  }
  const who = s.agents.find((a) => a.id === item.agentId);
  const name = who?.code ?? who?.name ?? agentName(s, item.agentId);
  if (item.kind === "question") return `answer ${name}: ${clip(item.detail, 120)}`;
  return `look at ${name}, it failed: ${clip(item.detail, 100)}`;
}

/** What needs the person right now, newest first, one line each with the ask. */
export function digestFile(s: State): string {
  const asks = needsYou(s).map((n) => askOf(s, n));
  const alerts = requestControls(s)
    .filter((r, i) => r.running || i === 0)
    .flatMap((r) => r.alerts.map((a) => `Alert: ${a}.`));
  const head =
    asks.length === 0 ? "Nothing needs you right now.\n" : asks.length === 1 ? `1 thing needs you: ${asks[0]}\n` : [`${asks.length} things need you:`, ...asks.map((a) => `- ${a}`)].join("\n") + "\n";
  return alerts.length ? `${head}\n${alerts.join("\n")}\n` : head;
}

function crewRow(s: State, agent: Agent, needs: NeedsYouItem[]): string {
  const state = threadStateOf(s, agent, needs);
  const status = state.closed ? "closed" : state.needsYou ? `${state.status}, needs you` : state.status;
  const pr = [...s.artifacts].reverse().find((a) => isPullRequest(a) && a.agentId === agent.id)?.pullRequest;
  const report = [...s.messages].reverse().find((m) => m.from.kind === "agent" && m.from.agentId === agent.id);
  const cells = [
    agent.code ?? agent.name,
    agent.crewRole ?? "",
    status,
    agent.branch ?? "",
    pr ? `#${pr.number}${pr.merged ? " (merged)" : ""}` : "",
    report ? clip(resultLine(report.text), 100) : "",
  ];
  return `| ${cells.map(cell).join(" | ")} |`;
}

/** Each crew thread: code, role, status, branch, pull request and its last report line. */
export function crewFile(s: State): string {
  const crew = s.agents.filter((a) => a.kind === "crew");
  if (crew.length === 0) return "No crew threads yet.\n";
  const needs = needsYou(s);
  return ["| Thread | Role | Status | Branch | PR | Last report |", "| --- | --- | --- | --- | --- | --- |", ...crew.map((a) => crewRow(s, a, needs))].join("\n") + "\n";
}

const PLAN = "## Plan";
const NOTES = "\n## Notes\n";

/** The captain's own notes: everything it last wrote with write_drive, kept across regenerations. */
function captainNotes(current: string): string {
  if (!current.startsWith(PLAN)) return current.trim();
  const at = current.indexOf(NOTES);
  return at < 0 ? "" : current.slice(at + NOTES.length).trim();
}

/** The plan from the roadmap, what shipped with its review, then the captain's own notes. */
export function notesFile(s: State, current: string): string {
  const r = s.roadmap;
  const orders = (list: typeof r.today) => (list.length > 0 ? list.map((w) => `- ${w.id} ${w.title} (${w.status})`) : ["- none"]);
  const track = (t: Track) => {
    const g = t.goal;
    return [
      g ? `Intent: ${g.title}${g.user ? `, for ${g.user}` : ""}.` : `Intent: not recorded yet for ${t.requestId}.`,
      ...(g?.acceptance ? [`Acceptance: ${g.acceptance}`] : []),
      ...(g?.assumptions?.length ? [`Assumed: ${g.assumptions.join("; ")}`] : []),
      `Stage ${t.stage} of ${r.totalStages}: ${t.stageTitle}.`,
      "Today:",
      ...orders(ordersOf(r, t.requestId).today),
    ];
  };
  const tracks = tracksOf(r);
  const plan = [PLAN, ...(tracks.length > 0 ? tracks.flatMap(track) : ["Intent: none yet."]), "Backlog:", ...orders(r.backlog ?? [])];
  const shipped = s.artifacts.filter((a) => isPullRequest(a) && a.pullRequest.merged).map((a) => {
    const review = [...s.artifacts].reverse().find((x) => x.review?.pullRequestId === a.id)?.review;
    const findings = review?.findings.map((f) => `${f.severity} (${f.path}): ${f.comment}`).join("; ");
    return `- #${a.pullRequest?.number} ${a.title}. Review: ${review ? review.verdict : "none"}${findings ? `, ${findings}` : ""}.`;
  });
  const notes = captainNotes(current);
  return [plan.join("\n"), ...(shipped.length > 0 ? [["## Shipped", ...shipped].join("\n")] : []), ...(notes ? [`## Notes\n${notes}`] : [])].join("\n\n") + "\n";
}

/**
 * Regenerates DIGEST.md, CREW.md and NOTES.md from the state. The store runs it on every change, so
 * the files are current after each event without the captain writing prose every turn.
 */
export function withCaptainFiles(s: State): State {
  const drive = s.drive ?? [];
  const current = (name: string) => drive.find((f) => f.name === name)?.content ?? "";
  const wanted: Record<string, string> = {
    "DIGEST.md": digestFile(s),
    "CREW.md": crewFile(s),
    "NOTES.md": notesFile(s, current("NOTES.md")),
    ...(changelogFile(s) ? { "CHANGELOG.md": changelogFile(s) } : {}),
  };
  const changed = Object.entries(wanted).filter(([name, content]) => current(name) !== content);
  if (changed.length === 0) return s;
  const at = nowIso();
  const kept: DriveFile[] = drive.filter((f) => !(f.name in wanted));
  const files = Object.entries(wanted).map(([name, content]) => {
    const old = drive.find((f) => f.name === name);
    return old && old.content === content ? old : { name, content, updatedAt: at };
  });
  return { ...s, drive: [...files, ...kept] };
}
