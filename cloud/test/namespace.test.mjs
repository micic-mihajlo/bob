import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { unstable_startWorker } from "wrangler";

const SECRET = "test-secret";
let worker;
before(async () => {
  worker = await unstable_startWorker({ config: "wrangler.jsonc", bindings: { BOB_DURABLE_SECRET: { type: "plain_text", value: SECRET } }, dev: { server: { port: 0 }, persist: false } });
});
after(() => worker?.dispose());

const call = (path, ns, init = {}) =>
  worker.fetch(`http://worker${path}`, { ...init, headers: { "x-bob-durable-secret": SECRET, ...(ns ? { "x-bob-namespace": ns } : {}), ...init.headers } });
const put = (ns, id, rev, state) => call(`/projects/${id}/state`, ns, { method: "PUT", headers: { "x-bob-rev": String(rev) }, body: JSON.stringify(state) });

test("two namespaces writing the same project never see each other", async () => {
  assert.equal((await put("stage", "tasks-app", 10, { rev: 10, who: "stage" })).status, 200);
  assert.equal((await put("crew-1", "tasks-app", 3, { rev: 3, who: "crew-1" })).status, 200);

  const stage = await (await call("/latest", "stage")).json();
  const crew = await (await call("/latest", "crew-1")).json();
  assert.deepEqual([stage.namespace, stage.rev, stage.state.who], ["stage", 10, "stage"]);
  assert.deepEqual([crew.namespace, crew.rev, crew.state.who], ["crew-1", 3, "crew-1"]);
  assert.equal((await call("/latest", "someone-else")).status, 404);
});

test("an older rev is refused within a namespace", async () => {
  await put("refuse", "p", 5, { rev: 5 });
  const stale = await put("refuse", "p", 4, { rev: 4 });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).rev, 5);
});

test("a missing namespace or secret is refused", async () => {
  assert.equal((await call("/latest", null)).status, 400);
  assert.equal((await worker.fetch("http://worker/latest", { headers: { "x-bob-namespace": "stage" } })).status, 401);
});
