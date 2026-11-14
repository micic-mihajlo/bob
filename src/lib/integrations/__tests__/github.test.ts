import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decideApproval, postUserMessage } from "../../actions";
import { getConfig, getState } from "../../store";
import { settle } from "../../turns";
import { freshTeam } from "../../__tests__/helpers";
import { projectLayout } from "../../workspace";
import { composioConnectTransport, composioTransport, ops, setGitHubTransport, type Operation } from "../github/api";
import { gitHubSetting } from "../github/config";
import { commentableLines, reviewBody } from "../github";
import type { ReviewFinding } from "../../types";

const GIT_TIMEOUT = 60_000;
const repo = { owner: "acme", name: "tasks" };

describe("BOB_GITHUB setting", () => {
  it("is off unless it says gh or composio", () => {
    expect(gitHubSetting({})).toEqual({ on: false });
    expect(gitHubSetting({ BOB_GITHUB: "yes" })).toEqual({ on: false });
  });

  it("defaults to the demo base branch of Bob's repository and falls back to gh without a Composio key", () => {
    const setting = gitHubSetting({ BOB_GITHUB: "composio" });
    expect(setting).toMatchObject({ on: true, config: { via: "gh", owner: "micic-mihajlo", name: "bob", base: "demo/self", remote: "https://github.com/micic-mihajlo/bob.git", composio: null } });
  });

  it("refuses main of Bob's own repository as the base", () => {
    expect(gitHubSetting({ BOB_GITHUB: "gh", BOB_GITHUB_BASE: "main" })).toEqual({ on: true, error: expect.stringMatching(/never opens or merges demo pull requests against main/) });
    expect(gitHubSetting({ BOB_GITHUB: "gh", BOB_GITHUB_REPO: "acme/tasks", BOB_GITHUB_BASE: "main" })).toMatchObject({ on: true, config: { base: "main" } });
  });

  it("uses Composio Connect's MCP server for a consumer key", () => {
    expect(gitHubSetting({ BOB_GITHUB: "composio", COMPOSIO_API_KEY: "ck_test" })).toMatchObject({ on: true, config: { via: "composio", composio: { kind: "connect", baseUrl: "https://connect.composio.dev/mcp" } } });
  });

  it("uses Composio when the key is set", () => {
    const setting = gitHubSetting({ BOB_GITHUB: "composio", COMPOSIO_API_KEY: "ak_test", COMPOSIO_CONNECTED_ACCOUNT_ID: "ca_1", BOB_GITHUB_REPO: "acme/tasks" });
    expect(setting).toMatchObject({ on: true, config: { via: "composio", composio: { kind: "project", apiKey: "ak_test", userId: "default", connectedAccountId: "ca_1", baseUrl: "https://backend.composio.dev" } } });
  });
});

describe("GitHub operations", () => {
  it("name the Composio GitHub toolkit tool and its documented arguments next to the REST route", () => {
    expect(ops.createPull(repo, { title: "t", body: "b", head: "demo/x", base: "demo/self" })).toEqual({
      slug: "GITHUB_CREATE_A_PULL_REQUEST",
      args: { owner: "acme", repo: "tasks", title: "t", body: "b", head: "demo/x", base: "demo/self" },
      method: "POST",
      path: "repos/acme/tasks/pulls",
      body: { title: "t", body: "b", head: "demo/x", base: "demo/self" },
    });
    expect(ops.merge(repo, 7, { sha: "abc", merge_method: "merge", commit_title: "m" })).toMatchObject({
      slug: "GITHUB_MERGE_A_PULL_REQUEST",
      args: { owner: "acme", repo: "tasks", pull_number: 7, sha: "abc", merge_method: "merge" },
      method: "PUT",
      path: "repos/acme/tasks/pulls/7/merge",
    });
    expect(ops.createReview(repo, 7, { commit_id: "abc", event: "COMMENT", body: "b", comments: [] })).toMatchObject({
      slug: "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST",
      args: { pull_number: 7, commit_id: "abc", event: "COMMENT" },
      path: "repos/acme/tasks/pulls/7/reviews",
    });
    expect(ops.addLabels(repo, 7, ["demo"])).toMatchObject({ slug: "GITHUB_ADD_LABELS_TO_AN_ISSUE", args: { issue_number: 7, labels: ["demo"] } });
    expect(ops.listOpenPulls(repo, "demo/x")).toMatchObject({ args: { head: "acme:demo/x", state: "open" }, path: "repos/acme/tasks/pulls?state=open&head=acme%3Ademo%2Fx" });
  });

  it("send a Composio execute request and unwrap its data", async () => {
    const fetcher = vi.fn(async () => Response.json({ data: { number: 7, html_url: "https://github.com/acme/tasks/pull/7" }, error: null, successful: true }));
    const call = composioTransport({ kind: "project", apiKey: "ak_test", userId: "bob", connectedAccountId: "ca_1", baseUrl: "https://backend.composio.dev" }, fetcher as typeof fetch);
    const op = ops.createPull(repo, { title: "t", body: "b", head: "demo/x", base: "main" });
    await expect(call(op)).resolves.toEqual({ number: 7, html_url: "https://github.com/acme/tasks/pull/7" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://backend.composio.dev/api/v3.1/tools/execute/GITHUB_CREATE_A_PULL_REQUEST");
    expect(init.headers).toMatchObject({ "x-api-key": "ak_test" });
    expect(JSON.parse(String(init.body))).toEqual({ arguments: op.args, user_id: "bob", connected_account_id: "ca_1" });
  });

  it("run a toolkit tool through Composio Connect's MCP server with a consumer key", async () => {
    const sse = (result: unknown) => new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result })}\n\n`, { headers: { "content-type": "text/event-stream" } });
    const text = (body: unknown) => ({ content: [{ type: "text", text: JSON.stringify(body) }], isError: false });
    const sent: { headers: Record<string, string>; body: { method: string; params?: { name?: string; arguments?: Record<string, unknown> } } }[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      sent.push({ headers: init.headers as Record<string, string>, body });
      if (body.method === "initialize") return new Response("{}", { headers: { "mcp-session-id": "sess_1" } });
      if (body.method === "notifications/initialized") return new Response(null, { status: 202 });
      return sse(text({ successful: true, data: { results: [{ tool_slug: "GITHUB_CREATE_A_PULL_REQUEST", index: 0, response: { successful: true, data: { number: 9, html_url: "https://github.com/acme/tasks/pull/9" } } }] } }));
    });
    const call = composioConnectTransport({ kind: "connect", apiKey: "ck_test", userId: "default", connectedAccountId: "bob-demo", baseUrl: "https://connect.composio.dev/mcp" }, fetcher as unknown as typeof fetch);
    const op = ops.createPull(repo, { title: "t", body: "b", head: "demo/x", base: "demo/self" });
    await expect(call(op)).resolves.toEqual({ number: 9, html_url: "https://github.com/acme/tasks/pull/9" });
    await call(op);
    expect(sent.map((s) => s.body.method)).toEqual(["initialize", "notifications/initialized", "tools/call", "tools/call"]);
    const execute = sent[2];
    expect(execute.headers).toMatchObject({ "x-consumer-api-key": "ck_test", "mcp-session-id": "sess_1" });
    expect(execute.body.params?.name).toBe("COMPOSIO_MULTI_EXECUTE_TOOL");
    expect(execute.body.params?.arguments?.tools).toEqual([{ tool_slug: "GITHUB_CREATE_A_PULL_REQUEST", arguments: op.args, account: "bob-demo" }]);
  });

  it("turn a failed Composio Connect tool into an error", async () => {
    const fetcher = async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      if (body.method !== "tools/call") return new Response("{}");
      const failed = { successful: false, data: { results: [{ error: "No active connection found for toolkit(s) 'github'", tool_slug: "GITHUB_MERGE_A_PULL_REQUEST", index: 0 }] }, error: "1 out of 1 tools failed" };
      return new Response(`data: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result: { content: [{ type: "text", text: JSON.stringify(failed) }], isError: true } })}\n\n`);
    };
    const call = composioConnectTransport({ kind: "connect", apiKey: "ck_test", userId: "default", connectedAccountId: null, baseUrl: "https://connect.composio.dev/mcp" }, fetcher as unknown as typeof fetch);
    await expect(call(ops.merge(repo, 7, { sha: "a", merge_method: "merge", commit_title: "m" }))).rejects.toThrow("composio connect GITHUB_MERGE_A_PULL_REQUEST: No active connection found for toolkit(s) 'github'");
  });

  it("turn an unsuccessful Composio result into an error", async () => {
    const fetcher = async () => Response.json({ data: {}, error: "Pull Request is not mergeable", successful: false });
    const call = composioTransport({ kind: "project", apiKey: "k", userId: "bob", connectedAccountId: null, baseUrl: "https://backend.composio.dev" }, fetcher as typeof fetch);
    await expect(call(ops.merge(repo, 7, { sha: "a", merge_method: "merge", commit_title: "m" }))).rejects.toThrow("composio GITHUB_MERGE_A_PULL_REQUEST: Pull Request is not mergeable");
  });
});

const PATCH = `diff --git a/src/csv.ts b/src/csv.ts
new file mode 100644
--- /dev/null
+++ b/src/csv.ts
@@ -0,0 +1,3 @@
+export function toCsv() {
+  return "";
+}
diff --git a/src/format.ts b/src/format.ts
--- a/src/format.ts
+++ b/src/format.ts
@@ -10,2 +10,3 @@ export function formatAmount
 const a = 1;
+const b = 2;
 const c = 3;
`;

describe("review comments", () => {
  const finding = (f: Partial<ReviewFinding>): ReviewFinding => ({ path: "src/csv.ts", line: 2, category: "bug", severity: "high", confidence: 0.9, comment: "Quote commas.", ...f });

  it("knows which new-side lines a diff shows", () => {
    const lines = commentableLines(PATCH);
    expect([...(lines.get("src/csv.ts") ?? [])]).toEqual([1, 2, 3]);
    expect([...(lines.get("src/format.ts") ?? [])]).toEqual([10, 11, 12]);
  });

  it("comments inline where the diff has the line and puts the rest in the body", () => {
    const body = reviewBody(
      { headSha: "abc", patch: PATCH },
      { verdict: "request_changes", summary: "Checked the tests.", findings: [finding({}), finding({ path: "src/tasks.ts", line: 40, severity: "low", comment: "Rename." })] },
    );
    expect(body.commit_id).toBe("abc");
    expect(body.event).toBe("COMMENT");
    expect(body.comments).toEqual([{ path: "src/csv.ts", line: 2, side: "RIGHT", body: "**high · bug** (confidence 0.9)\n\nQuote commas." }]);
    expect(body.body).toContain("**Bob review: Changes requested** Checked the tests.");
    expect(body.body).toContain("`src/tasks.ts:40` **low · bug** (confidence 0.9) Rename.");
  });

  it("includes the preview check of the same head", () => {
    const preview = { url: "https://p.vercel.app", state: "ready" as const, source: "vercel" as const, headSha: "abc", check: { ok: true, status: 200, detail: "HTTP 200", at: "" } };
    expect(reviewBody({ headSha: "abc", patch: PATCH, preview }, { verdict: "approve", findings: [] }).body).toContain("Preview https://p.vercel.app: passed (HTTP 200)");
    expect(reviewBody({ headSha: "def", patch: PATCH, preview }, { verdict: "approve", findings: [] }).body).not.toContain("Preview");
  });
});

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** A GitHub stand-in: a bare repository git pushes to, and a transport that answers like GitHub's REST API. */
function fakeGitHub(remote: string) {
  const calls: Operation[] = [];
  const pulls = new Map<number, { head: string; base: string; merged: boolean }>();
  setGitHubTransport(async (op) => {
    calls.push(op);
    if (op.slug === "GITHUB_LIST_PULL_REQUESTS") return [];
    if (op.slug === "GITHUB_CREATE_A_PULL_REQUEST") {
      const number = pulls.size + 7;
      pulls.set(number, { head: String(op.args.head), base: String(op.args.base), merged: false });
      return { number, html_url: `https://github.com/acme/tasks/pull/${number}` };
    }
    if (op.slug === "GITHUB_MERGE_A_PULL_REQUEST") {
      const pull = pulls.get(Number(op.args.pull_number));
      if (!pull) throw new Error("gh: Not Found (HTTP 404)");
      const head = git(remote, "rev-parse", `refs/heads/${pull.head}`);
      if (head !== op.args.sha) throw new Error("gh: Head branch was modified (HTTP 409)");
      const base = git(remote, "rev-parse", `refs/heads/${pull.base}`);
      const tree = git(remote, "merge-tree", "--write-tree", base, head);
      const sha = execFileSync("git", ["commit-tree", tree, "-p", base, "-p", head, "-m", String(op.args.commit_title)], {
        cwd: remote,
        encoding: "utf8",
        env: { ...process.env, GIT_AUTHOR_NAME: "GitHub", GIT_AUTHOR_EMAIL: "noreply@github.com", GIT_COMMITTER_NAME: "GitHub", GIT_COMMITTER_EMAIL: "noreply@github.com" },
      }).trim();
      git(remote, "update-ref", `refs/heads/${pull.base}`, sha, base);
      pull.merged = true;
      return { sha, merged: true, message: "Pull Request successfully merged" };
    }
    return {};
  });
  return { calls, slugs: () => calls.map((c) => c.slug) };
}

describe("publishing to GitHub", { timeout: GIT_TIMEOUT }, () => {
  let dir: string;
  let remote: string;

  beforeEach(() => {
    freshTeam();
    dir = mkdtempSync(path.join(os.tmpdir(), "bob-github-"));
    remote = path.join(dir, "tasks.git");
    git(dir, "init", "--quiet", "--bare", remote);
    vi.stubEnv("BOB_GITHUB", "gh");
    vi.stubEnv("BOB_GITHUB_REPO", "acme/tasks");
    vi.stubEnv("BOB_GITHUB_REMOTE", remote);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setGitHubTransport(null);
    rmSync(dir, { recursive: true, force: true });
    freshTeam();
  });

  it("opens the real pull request, posts the review, merges it on approval, and keeps both mains the same commit", async () => {
    const github = fakeGitHub(remote);
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();

    const pr = getState().artifacts.find((a) => a.kind === "pull_request");
    const branch = pr?.pullRequest?.branch ?? "";
    expect(pr?.pullRequest?.github).toEqual({ repo: "acme/tasks", number: 7, url: "https://github.com/acme/tasks/pull/7", via: "gh", head: `demo/${branch}`, base: "demo/self", merged: false });
    expect(git(remote, "rev-parse", `refs/heads/demo/${branch}`)).toBe(pr?.pullRequest?.headSha);
    const created = github.calls.find((c) => c.slug === "GITHUB_CREATE_A_PULL_REQUEST");
    expect(created?.args).toMatchObject({ head: `demo/${branch}`, base: "demo/self", title: `[demo] ${pr?.title}` });
    expect(String(created?.args.body)).toMatch(/<!-- bob-trace -->[\s\S]*Asked: "Customers want to export all tasks as CSV/);
    expect(String(created?.args.body)).toMatch(/Opened by Bob for its pull request #1/);
    expect(github.calls.find((c) => c.slug === "GITHUB_ADD_LABELS_TO_AN_ISSUE")?.args).toMatchObject({ issue_number: 7, labels: ["demo"] });
    const review = github.calls.find((c) => c.slug === "GITHUB_CREATE_A_REVIEW_FOR_A_PULL_REQUEST");
    expect(review?.args).toMatchObject({ pull_number: 7, commit_id: pr?.pullRequest?.headSha, event: "COMMENT" });
    expect(String(review?.args.body)).toMatch(/Bob review: Approve/);

    const approval = getState().approvals.find((a) => a.status === "pending");
    expect(decideApproval(approval?.id ?? "", "approved").ok).toBe(true);
    await settle();

    const merged = getState().artifacts.find((a) => a.id === pr?.id)?.pullRequest;
    expect(merged?.merged).toBe(true);
    expect(merged?.github?.merged).toBe(true);
    expect(github.calls.find((c) => c.slug === "GITHUB_MERGE_A_PULL_REQUEST")?.args).toMatchObject({ pull_number: 7, sha: pr?.pullRequest?.headSha, merge_method: "merge" });
    const lastBody = github.calls.filter((c) => c.slug === "GITHUB_UPDATE_A_PULL_REQUEST").at(-1)?.args.body;
    expect(String(lastBody)).toMatch(/- Review: approve[\s\S]*- Approval: approved by the person/);
    const githubMain = git(remote, "rev-parse", "refs/heads/demo/self");
    expect(git(remote, "log", "-1", "--format=%an", githubMain)).toBe("GitHub");
    expect(localMain()).toBe(githubMain);
    expect(getState().roadmap.today[0].status).toBe("done");
  });

  it("still merges locally when GitHub refuses, then brings GitHub's base along", async () => {
    fakeGitHub(remote);
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    setGitHubTransport(async (op) => {
      if (op.slug === "GITHUB_MERGE_A_PULL_REQUEST") throw new Error("gh: Pull Request is not mergeable (HTTP 405)");
      return {};
    });
    const approval = getState().approvals.find((a) => a.status === "pending");
    decideApproval(approval?.id ?? "", "approved");
    await settle();
    const pr = getState().artifacts.find((a) => a.kind === "pull_request")?.pullRequest;
    expect(pr?.merged).toBe(true);
    expect(pr?.github?.merged).toBe(true);
    expect(git(remote, "rev-parse", "refs/heads/demo/self")).toBe(localMain());
    expect(git(remote, "merge-base", "--is-ancestor", pr?.headSha ?? "", "refs/heads/demo/self")).toBe("");
  });

  it("records why publishing failed and leaves Bob's own pull request working", async () => {
    vi.stubEnv("BOB_GITHUB_REMOTE", path.join(dir, "missing.git"));
    fakeGitHub(remote);
    postUserMessage("bob", "Customers want to export all tasks as CSV. Done when a test shows one row per task.");
    await settle();
    const pr = getState().artifacts.find((a) => a.kind === "pull_request")?.pullRequest;
    expect(pr?.github).toBeUndefined();
    expect(pr?.githubError).toMatch(/could not push to acme\/tasks/);
    expect(getState().approvals.some((a) => a.status === "pending")).toBe(true);
  });
});

const localMain = () => git(projectLayout(getConfig().workspaceRoot ?? "", getState().project.id).origin, "rev-parse", "refs/heads/main");
