import { MAX_BUSY_THREADS } from "../crew";
import { triageInbox, triageInboxSchema } from "../inbox";
import { clip, define, type ToolDef } from "./define";
import {
  advanceSchema,
  advanceStageTool,
  completeSchema,
  completeWorkOrderTool,
  setGoalSchema,
  setGoalTool,
  setRoadmapSchema,
  setRoadmapTool,
  setTodaySchema,
  setTodayTool,
} from "./planning";
import { mergePullRequestTool, mergeSchema } from "./pull-requests";
import { writeDrive, writeDriveSchema } from "./report";
import {
  closeThread,
  closeThreadSchema,
  listThreads,
  listThreadsSchema,
  messageThread,
  messageThreadSchema,
  startThread,
  startThreadSchema,
} from "./threads";

export const CAPTAIN_TOOLS: ToolDef[] = [
  define({
    name: "triage_inbox",
    description:
      "Record the asks in one inbox item (a meeting, feedback or a production error) in one call. A meeting can hold several asks. For each, quote its line exactly. An ask with a named user, a behaviour and an acceptance check passes the intent gate and goes to the backlog as a work order that quotes the line. One without them is vague: give the one question for the person instead. Never start threads from the inbox; the person promotes backlog work.",
    schema: triageInboxSchema,
    sets: ["captain"],
    label: (i) => `Triaged ${i.candidates.length} ask${i.candidates.length === 1 ? "" : "s"} from the inbox`,
    execute: triageInbox,
  }),
  define({
    name: "start_thread",
    description: `Start a crew thread for one piece of work: a build thread to change code on its own branch, a review thread to check one pull request, or a research thread to answer a question from the code. It gets the next code, its own workspace and, for build, its own branch, and receives your brief. One open thread per role per work order; at most ${MAX_BUSY_THREADS} working at once. After it, end your turn: the thread reports back as a new turn.`,
    schema: startThreadSchema,
    sets: ["captain"],
    label: (i) => `Starting a ${i.role} thread: ${clip(i.title)}`,
    execute: startThread,
  }),
  define({
    name: "list_threads",
    description: "List every crew thread with its code, role, title, status, branch, work order and open pull request. Use it before starting or messaging a thread.",
    schema: listThreadsSchema,
    sets: ["captain"],
    label: () => "Looking at the crew",
    execute: () => listThreads(),
  }),
  define({
    name: "message_thread",
    description:
      "Send one crew thread a message that stands alone, such as review findings to fix or a fact another thread found. Its answer comes back to you as a new turn unless expectsReply is false. End your turn after it.",
    schema: messageThreadSchema,
    sets: ["captain"],
    label: (i) => `Messaging ${i.threadId.toUpperCase()}`,
    execute: messageThread,
  }),
  define({
    name: "close_thread",
    description: "Close a crew thread whose work is finished or no longer needed. It stays readable. Refused while it is still working.",
    schema: closeThreadSchema,
    sets: ["captain"],
    label: (i) => `Closing ${i.threadId.toUpperCase()}`,
    execute: closeThread,
  }),
  define({
    name: "merge_pull_request",
    description:
      "Merge an approved pull request into main and complete its work order. Refused unless the person approved a request_approval made with this pullRequestId. Safe to call again.",
    schema: mergeSchema,
    sets: ["captain"],
    label: (i) => `Merging ${i.pullRequestId}`,
    execute: mergePullRequestTool,
  }),
  define({
    name: "write_drive",
    description:
      "Replace one of your own files, which the person can read: DIGEST.md (only what needs the person right now, a few lines), CREW.md (who is on what) or NOTES.md (anything worth remembering).",
    schema: writeDriveSchema,
    sets: ["captain"],
    label: (i) => `Updated ${i.name}`,
    execute: writeDrive,
  }),
  define({
    name: "set_goal",
    description:
      "Record the request's intent: a title, the user, the behaviour and the acceptance check, plus any assumptions you made. The Intent stage cannot be left until user, behaviour and acceptance are set. Setting it again keeps all progress.",
    schema: setGoalSchema,
    sets: ["captain"],
    label: (i) => `Set the goal: ${clip(i.title)}`,
    execute: setGoalTool,
  }),
  define({
    name: "set_roadmap",
    description: "Replace the planned work orders (not yet scheduled). Returns their ids.",
    schema: setRoadmapSchema,
    sets: ["captain"],
    label: (i) => `Planned ${i.workOrderTitles.length} work orders`,
    execute: setRoadmapTool,
  }),
  define({
    name: "set_today",
    description: "Choose which work orders are in today, by id. At most three.",
    schema: setTodaySchema,
    sets: ["captain"],
    label: (i) => `Scheduled ${i.workOrderIds.length} work orders for today`,
    execute: setTodayTool,
  }),
  define({
    name: "complete_work_order",
    description: "Mark a work order done that needed no merge. A merged pull request completes its work order already.",
    schema: completeSchema,
    sets: ["captain"],
    label: () => "Marked a work order done",
    execute: completeWorkOrderTool,
  }),
  define({
    name: "advance_stage",
    description: "Move the roadmap to the next stage. Refused until the current stage's exit criteria hold.",
    schema: advanceSchema,
    sets: ["captain"],
    label: () => "Advancing the stage",
    execute: advanceStageTool,
  }),
];
