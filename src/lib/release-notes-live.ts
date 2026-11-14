import { generateText } from "ai";
import { brainKind } from "./brain";
import { nowIso } from "./ids";
import { LIGHT_MODEL } from "./models";
import { factoryNote, workOrderOf } from "./release-notes";
import { getState, update } from "./store";
import { isPullRequest, type PullRequestArtifact } from "./threads";
import type { ReleaseNote } from "./types";

/** Records the release note for a merged pull request. Called once the merge lands; a second call keeps the first note. */
export function recordReleaseNote(pullRequestId: string): void {
  update((s) => {
    const pr = s.artifacts.find((a): a is PullRequestArtifact => a.id === pullRequestId && isPullRequest(a));
    if (!pr?.pullRequest.merged || s.releaseNotes?.[pr.id]) return s;
    const note: ReleaseNote = { pullRequestId: pr.id, number: pr.pullRequest.number, workOrderId: workOrderOf(s, pr)?.id ?? null, text: factoryNote(s, pr), source: "factory", at: nowIso() };
    return { ...s, releaseNotes: { ...s.releaseNotes, [pr.id]: note } };
  });
  if (brainKind() === "model") void rewriteReleaseNote(pullRequestId).catch(() => undefined);
}

/** With a live model, rewrites the factory note as one or two sentences a customer would read. */
async function rewriteReleaseNote(pullRequestId: string): Promise<void> {
  const s = getState();
  const note = s.releaseNotes?.[pullRequestId];
  const pr = s.artifacts.find((a) => a.id === pullRequestId);
  if (!note || !pr) return;
  const { text } = await generateText({
    model: LIGHT_MODEL,
    abortSignal: AbortSignal.timeout(30_000),
    prompt: [
      "Write a release note for the people who use this product: one or two plain sentences saying what they can do now.",
      "No jargon, no file or function names, no pull request numbers, no hype. Reply with the note only.",
      `Change: ${pr.title}`,
      `Work order: ${workOrderOf(s, pr as PullRequestArtifact)?.title ?? "none"}`,
      `Intent: ${s.roadmap.goal?.behaviour ?? s.roadmap.goal?.title ?? "none"}`,
      `Draft: ${note.text}`,
    ].join("\n"),
  });
  const clean = text.trim().replace(/^["']|["']$/g, "");
  if (!clean || clean.length > 400) return;
  update((x) => (x.releaseNotes?.[pullRequestId] ? { ...x, releaseNotes: { ...x.releaseNotes, [pullRequestId]: { ...x.releaseNotes[pullRequestId], text: clean, source: "model" } } } : x));
}
