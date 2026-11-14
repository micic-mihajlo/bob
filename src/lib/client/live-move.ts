import type { LiveMove } from "@/lib/types";
import type { StepItem } from "./thread-rows";

const LIVE_TOOL_LABEL: Record<string, string> = {
  write_files: "Writing files…",
  edit_files: "Editing files…",
  read_files: "Reading files…",
  list_files: "Looking through the files…",
  run: "Writing a command…",
  git: "Writing a git command…",
  open_pull_request: "Opening a pull request…",
  merge_pull_request: "Merging the pull request…",
  record_review: "Writing the review…",
  report: "Writing the report…",
  message_thread: "Writing a message…",
  start_thread: "Starting a thread…",
  close_thread: "Closing a thread…",
  list_threads: "Looking at the team…",
  set_goal: "Setting the goal…",
  set_roadmap: "Laying out the roadmap…",
  set_today: "Planning today…",
  advance_stage: "Moving to the next stage…",
  complete_work_order: "Closing the work order…",
  write_drive: "Writing notes…",
  record_artifact: "Recording the result…",
};

/** What a tool call reads as while the model is still writing it. */
export function liveToolLabel(tool: string): string {
  return LIVE_TOOL_LABEL[tool] ?? "Preparing a step…";
}

/**
 * The tool calls the model has started but not finished writing, as step rows without an outcome.
 * They go away with the live move, when the real steps land.
 */
export function pendingSteps(move: LiveMove | undefined): StepItem[] {
  if (!move) return [];
  return move.tools.map((call) => ({ kind: "step", id: `live-${call.id}`, turnId: move.turnId, tool: call.tool, label: liveToolLabel(call.tool), at: move.at }));
}

/** A sidebar row's line while its model writes: the call it is writing, else the last line of its text so far. */
export function liveLine(move: LiveMove | undefined): string | null {
  if (!move) return null;
  const call = move.tools.at(-1);
  if (call) return liveToolLabel(call.tool);
  const line = move.text.trim().split("\n").at(-1)?.trim();
  return line ? line : null;
}
