import { afterEach, describe, expect, it, vi } from "vitest";
import { setGitHubTransport } from "../github/api";
import { checkPreview, findPreview, loadPreview } from "../vercel/preview";

const SHA = "0123456789abcdef0123456789abcdef01234567";
const VERCEL_ENV = { VERCEL_TOKEN: "vt_test", VERCEL_PROJECT_ID: "prj_1", VERCEL_TEAM_ID: "team_1" };
const page = (status = 200) => new Response("<html><head><title>Tasks</title></head><body></body></html>", { status });

afterEach(() => {
  setGitHubTransport(null);
  vi.unstubAllEnvs();
});

describe("finding the preview", () => {
  it("asks Vercel for the newest deployment of the head commit", async () => {
    const fetcher = vi.fn(async () => Response.json({ deployments: [{ url: "tasks-git-demo-x.vercel.app", readyState: "READY", inspectorUrl: "https://vercel.com/acme/tasks/dpl_1" }] }));
    const found = await findPreview(SHA, VERCEL_ENV, fetcher as typeof fetch);
    expect(found).toEqual({ url: "https://tasks-git-demo-x.vercel.app", state: "ready", source: "vercel", headSha: SHA, inspectorUrl: "https://vercel.com/acme/tasks/dpl_1" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const query = new URL(url);
    expect(query.origin + query.pathname).toBe("https://api.vercel.com/v7/deployments");
    expect(Object.fromEntries(query.searchParams)).toEqual({ projectId: "prj_1", sha: SHA, limit: "5", teamId: "team_1" });
    expect(init.headers).toEqual({ authorization: "Bearer vt_test" });
  });

  it("maps building and failed states and an empty list", async () => {
    const reply = (body: unknown) => (async () => Response.json(body)) as unknown as typeof fetch;
    expect((await findPreview(SHA, VERCEL_ENV, reply({ deployments: [{ url: "a.vercel.app", readyState: "BUILDING" }] }))).state).toBe("building");
    expect((await findPreview(SHA, VERCEL_ENV, reply({ deployments: [{ url: "a.vercel.app", readyState: "ERROR" }] }))).state).toBe("error");
    expect((await findPreview(SHA, VERCEL_ENV, reply({ deployments: [] }))).state).toBe("missing");
  });

  it("reads the URL from the GitHub deployment Vercel's GitHub app records, when there is no Vercel token", async () => {
    vi.stubEnv("BOB_GITHUB", "gh");
    vi.stubEnv("BOB_GITHUB_REPO", "acme/tasks");
    const asked: string[] = [];
    setGitHubTransport(async (op) => {
      asked.push(op.path);
      if (op.slug === "GITHUB_LIST_DEPLOYMENTS") return [{ id: 11, environment: "Preview" }];
      return [{ state: "success", environment_url: "https://tasks-abc.vercel.app", target_url: "https://vercel.com/acme/tasks/abc" }];
    });
    expect(await findPreview(SHA, {})).toEqual({ url: "https://tasks-abc.vercel.app", state: "ready", source: "github", headSha: SHA });
    expect(asked).toEqual([`repos/acme/tasks/deployments?sha=${SHA}`, "repos/acme/tasks/deployments/11/statuses"]);
  });
});

describe("checking the preview", () => {
  it("waits for the build, then loads the page with the protection bypass header", async () => {
    let polls = 0;
    const fetcher = vi.fn(async (url: string, _init?: RequestInit) => {
      if (url.startsWith("https://api.vercel.com")) return Response.json({ deployments: [{ url: "p.vercel.app", readyState: ++polls < 3 ? "BUILDING" : "READY" }] });
      return page();
    });
    const sleep = vi.fn(async () => {});
    const preview = await checkPreview({ headSha: SHA }, { env: { ...VERCEL_ENV, VERCEL_AUTOMATION_BYPASS_SECRET: "bypass" }, fetcher: fetcher as unknown as typeof fetch, sleep, intervalMs: 1 });
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(preview).toMatchObject({ url: "https://p.vercel.app", state: "ready", check: { ok: true, status: 200, detail: 'HTTP 200, title "Tasks", 59 bytes' } });
    const pageCall = fetcher.mock.calls.find(([url]) => url === "https://p.vercel.app");
    expect(pageCall?.[1]?.headers).toEqual({ "x-vercel-protection-bypass": "bypass" });
  });

  it("fails when the build failed or never appeared", async () => {
    const failed = (async () => Response.json({ deployments: [{ url: "p.vercel.app", readyState: "ERROR" }] })) as unknown as typeof fetch;
    expect((await checkPreview({ headSha: SHA }, { env: VERCEL_ENV, fetcher: failed })).check).toMatchObject({ ok: false, detail: "the preview build failed" });
    const none = (async () => Response.json({ deployments: [] })) as unknown as typeof fetch;
    expect((await checkPreview({ headSha: SHA }, { env: VERCEL_ENV, fetcher: none, timeoutMs: 0 })).check).toMatchObject({ ok: false, detail: "no preview deployment was found for this head" });
  });

  it("fails on an error page and says when the deployment is protected", async () => {
    expect(await loadPreview("https://p.vercel.app", {}, (async () => page(500)) as unknown as typeof fetch)).toMatchObject({ ok: false, status: 500 });
    expect((await loadPreview("https://p.vercel.app", {}, (async () => page(401)) as unknown as typeof fetch)).detail).toMatch(/protected, set VERCEL_AUTOMATION_BYPASS_SECRET/);
  });
});
