import { describe, expect, it } from "vitest";
import type { GraphView, InboxItem } from "@/lib/types";
import { buildPathGraph } from "../why-graph";

const VIEW: GraphView = {
  prId: "art_pr",
  rootMessageId: "msg_ask",
  source: "hydra",
  nodes: [
    { id: "art_pr", kind: "PullRequest", label: "#1 Add CSV export" },
    { id: "msg_brief", kind: "Message", label: "Goal: Add CSV export" },
    { id: "bob", kind: "Agent", label: "Bob" },
    { id: "msg_answer", kind: "Message", label: "Yes, an accountant" },
    { id: "user", kind: "User", label: "You" },
    { id: "msg_ask", kind: "Message", label: "customers want to export invoices as CSV" },
    { id: "turn_1", kind: "Turn", label: "INV-1 turn" },
    { id: "inv-1", kind: "Agent", label: "INV-1 INV-1" },
    { id: "commit", kind: "Commit", label: "8e21418" },
    { id: "art_review", kind: "Review", label: "Review: approve" },
    { id: "apr_1", kind: "Approval", label: "Merge #1 (pending)" },
  ],
  edges: [
    { from: "bob", to: "msg_brief", type: "SENT" },
    { from: "msg_brief", to: "msg_answer", type: "CAUSED_BY" },
    { from: "user", to: "msg_answer", type: "SENT" },
    { from: "msg_answer", to: "msg_ask", type: "CONTINUES" },
    { from: "user", to: "msg_ask", type: "SENT" },
    { from: "art_pr", to: "msg_brief", type: "BECAUSE_OF" },
    { from: "turn_1", to: "art_pr", type: "MADE" },
    { from: "inv-1", to: "turn_1", type: "RUNS" },
    { from: "commit", to: "art_pr", type: "PART_OF" },
    { from: "art_review", to: "art_pr", type: "REVIEWS" },
    { from: "art_pr", to: "apr_1", type: "GATED_BY" },
  ],
};

describe("buildPathGraph", () => {
  it("lays the path out from the pull request back to the person's sentence", () => {
    const graph = buildPathGraph(VIEW);
    expect(graph.source).toBe("hydra");
    expect(graph.columns.map((c) => [c.link, c.nodes.map((n) => `${n.kind}:${n.title}:${n.label}`)])).toEqual([
      [null, ["pull_request:Pull request:#1 Add CSV export"]],
      ["gated by", ["review:Review:approve", "approval:Merge gate:Merge #1 (pending)"]],
      ["made by", ["turn:Turn:INV-1 built it"]],
      ["because of", ["message:Bob wrote:Goal: Add CSV export"]],
      ["because of", ["message:You wrote:Yes, an accountant"]],
      ["answers", ["origin:You wrote:customers want to export invoices as CSV"]],
    ]);
  });

  it("names an inbox item as the origin, not the triage prompt that handed it over", () => {
    const view: GraphView = {
      ...VIEW,
      nodes: VIEW.nodes.map((n) => (n.id === "msg_ask" ? { ...n, label: 'Inbox item inb_1: an error from "production error, Nov 14". Triage it.' } : n)),
    };
    const inbox = [
      { id: "inb_1", kind: "error", source: "production error, Nov 14", text: "", at: "", messageId: "m", status: "triaged", candidates: [] } as InboxItem,
    ];
    expect(buildPathGraph(view, { approvals: [], artifacts: [], inbox }).columns.at(-1)?.nodes[0]).toMatchObject({
      kind: "origin",
      title: "From the inbox",
      label: "production error, Nov 14",
    });
  });

  it("starts a path that came from Linear at the issue, as a link", () => {
    const label = 'Build work order wo_1 now: "Quote names with commas". It came from Linear STA-551: Quote names with commas: "names break the CSV". It is already in the backlog.';
    const view: GraphView = { ...VIEW, nodes: VIEW.nodes.map((n) => (n.id === "msg_ask" ? { ...n, label } : n)) };
    const linear = { issueId: "iss_1", identifier: "STA-551", title: "Quote names with commas", url: "https://linear.app/stan/issue/STA-551", teamId: "team_1" };
    const inbox = [
      { id: "inb_2", kind: "feedback", source: "Linear STA-551: Quote names with commas", text: "", at: "", messageId: "m", status: "triaged", candidates: [], linear } as InboxItem,
    ];
    expect(buildPathGraph(view, { approvals: [], artifacts: [], inbox }).columns.at(-1)?.nodes[0]).toMatchObject({
      kind: "origin",
      title: "From Linear",
      label: "STA-551: Quote names with commas",
      href: "https://linear.app/stan/issue/STA-551",
    });
  });

  it("keeps what it can when the gate and the turn are missing", () => {
    const graph = buildPathGraph({ ...VIEW, edges: VIEW.edges.filter((e) => !["REVIEWS", "GATED_BY", "MADE"].includes(e.type)) });
    expect(graph.columns.map((c) => c.nodes[0].kind)).toEqual(["pull_request", "message", "message", "origin"]);
  });

  it("tells repeated reviews and gates apart by their verdict, status and head", () => {
    const graph = buildPathGraph(VIEW, {
      approvals: [{ id: "apr_1", agentId: "bob", turnId: "t", requestId: "r", title: "Merge #1", detail: "", status: "pending", at: "", pullRequestId: "art_pr", headSha: "ec9055967be7" }],
      artifacts: [
        {
          id: "art_review",
          kind: "review",
          title: "Review of #1",
          detail: "",
          status: "approved",
          agentId: "inv-2",
          turnId: "t",
          requestId: "r",
          messageId: null,
          at: "",
          review: { pullRequestId: "art_pr", verdict: "approve", findings: [], headSha: "78fda36aa" },
        },
      ],
    });
    expect(graph.columns[1].nodes.map((n) => n.label)).toEqual(["Approved at 78fda36", "Waiting for you at ec90559"]);
  });

  it("shows the newest review and gate when a new head was reviewed again, and counts the reviews", () => {
    const review = (id: string, at: string, headSha: string) => ({
      id,
      kind: "review" as const,
      title: "Review of #1",
      detail: "",
      status: "approved" as const,
      agentId: "inv-2",
      turnId: "t",
      requestId: "r",
      messageId: null,
      at,
      review: { pullRequestId: "art_pr", verdict: "approve" as const, findings: [], headSha },
    });
    const approval = (id: string, at: string, headSha: string) => ({
      id,
      agentId: "bob",
      turnId: "t",
      requestId: "r",
      title: "Merge #1",
      detail: "",
      status: "approved" as const,
      at,
      pullRequestId: "art_pr",
      headSha,
    });
    const view = {
      ...VIEW,
      edges: [...VIEW.edges, { from: "art_review_2", to: "art_pr", type: "REVIEWS" }, { from: "art_pr", to: "apr_2", type: "GATED_BY" }],
    };
    const graph = buildPathGraph(view, {
      approvals: [approval("apr_2", "2026-11-14T15:46:00Z", "bd57690aa"), approval("apr_1", "2026-11-14T15:45:00Z", "4906e54aa")],
      artifacts: [review("art_review", "2026-11-14T15:44:00Z", "4906e54aa"), review("art_review_2", "2026-11-14T15:45:30Z", "bd57690aa")],
    });
    expect(graph.columns[1].nodes.map((n) => `${n.title}: ${n.label}`)).toEqual([
      "Review ×2: Approved at bd57690",
      "Merge gate: Approved at bd57690",
    ]);
  });

  it("stops on a cycle", () => {
    const graph = buildPathGraph({ ...VIEW, rootMessageId: null, edges: [...VIEW.edges.filter((e) => e.type !== "CONTINUES"), { from: "msg_answer", to: "msg_brief", type: "CONTINUES" }] });
    expect(graph.columns.filter((c) => c.nodes[0].kind === "message")).toHaveLength(2);
  });
});
