import { z } from "zod";
import { patchArtifact } from "../../state-ops";
import { getState, update } from "../../store";
import { done, fail, type ToolContext } from "../../tools/context";
import { define } from "../../tools/define";
import { findPullRequest } from "../../threads";
import type { ReviewFinding } from "../../types";
import { checkPreview, previewsOn } from "./preview";

export const checkPreviewSchema = z.object({
  pullRequestId: z.string().min(1).describe("The pull request's id, or its number as \"#3\"."),
});

/** Waits for the head's preview deployment, loads it, stores the result on the pull request, and hands back a finding. */
export async function checkPreviewTool(input: z.infer<typeof checkPreviewSchema>, _ctx?: ToolContext) {
  const pr = findPullRequest(getState(), input.pullRequestId);
  if (!pr) return fail(`No pull request ${input.pullRequestId}. Use the id or number from your brief.`);
  const preview = await checkPreview(pr.pullRequest);
  update((s) => {
    const fresh = findPullRequest(s, pr.id);
    return fresh ? patchArtifact(s, pr.id, { pullRequest: { ...fresh.pullRequest, preview } }) : s;
  });
  const ok = preview.check?.ok === true;
  const finding: ReviewFinding = {
    path: preview.url ?? "preview",
    line: null,
    category: ok ? "tests" : "bug",
    severity: ok ? "low" : "high",
    confidence: 1,
    comment: ok ? `Preview loads: ${preview.check?.detail}.` : `Preview check failed: ${preview.check?.detail}.`,
  };
  const next = ok
    ? "The preview passed. Add this finding to record_review's findings."
    : "The preview failed. Add this finding to record_review's findings and request changes.";
  return done({ url: preview.url, state: preview.state, passed: ok, detail: preview.check?.detail, finding, next });
}

/** Registered only with BOB_PREVIEWS=vercel, so without it the review thread's tools are unchanged. */
export const PREVIEW_TOOLS = previewsOn()
  ? [
      define({
        name: "check_preview",
        description:
          "Load the pull request's preview deployment (Vercel builds one per head) and get a pass or fail finding. Call it once before record_review; it waits for the build to finish, up to a few minutes.",
        schema: checkPreviewSchema,
        sets: ["review"],
        label: (i) => `Checking the preview of ${i.pullRequestId}`,
        detail: (_i, r) => (typeof r.detail === "string" ? `${r.passed ? "Passed" : "Failed"}: ${r.detail}` : undefined),
        execute: checkPreviewTool,
      }),
    ]
  : [];
