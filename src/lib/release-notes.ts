import type { State } from "./state";
import type { PullRequestArtifact } from "./threads";
import type { ReleaseNote } from "./types";

const CHANGE = /^(fix|fixes|fixed|update|updates|improve|improves|remove|removes|change|changes|rename|speed up)\b/i;
const VERB = /^(add|adds|added|implement|implements|build|builds|create|creates|introduce|introduces|support|supports)\s+/i;

/** The work order a pull request finished, or the one its thread was serving. */
export function workOrderOf(s: State, pr: PullRequestArtifact) {
  const owner = s.agents.find((a) => a.id === pr.agentId);
  const all = [...s.roadmap.today, ...(s.roadmap.backlog ?? [])];
  return all.find((w) => w.artifactId === pr.id) ?? all.find((w) => w.id === owner?.workOrderId) ?? null;
}

/** One plain sentence from the work order or the pull request title, with no model. */
export function factoryNote(s: State, pr: PullRequestArtifact): string {
  const title = (workOrderOf(s, pr)?.title ?? pr.title).trim().replace(/[.!]+$/, "");
  if (CHANGE.test(title)) return `${title}.`;
  const thing = title.replace(VERB, "");
  return `${thing.charAt(0).toUpperCase()}${thing.slice(1)} is now available.`;
}

export const releaseNotesOf = (s: State): ReleaseNote[] => Object.values(s.releaseNotes ?? {}).sort((a, b) => b.at.localeCompare(a.at));

/** CHANGELOG.md: the release notes by day, newest first. Empty until something ships. */
export function changelogFile(s: State): string {
  const notes = releaseNotesOf(s);
  if (notes.length === 0) return "";
  const days = [...new Set(notes.map((n) => n.at.slice(0, 10)))];
  return ["# Changelog", ...days.map((day) => [`## ${day}`, ...notes.filter((n) => n.at.startsWith(day)).map((n) => `- ${n.text} (#${n.number})`)].join("\n"))].join("\n\n") + "\n";
}
