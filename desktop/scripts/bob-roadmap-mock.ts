// A stand-in for the BobAgent Worker (`apps/cloud`) while its roadmap endpoints are not on main.
// It serves the roadmap contract, and enough of the agent (its state, `/prompt`,
// `/notifications/dismiss`) that the Bob bridge can run a turn against it.
//
//   bun scripts/bob-roadmap-mock.ts [--filled] [--port=1337]
//
// The roadmap starts empty. The first prompt sets the goal, as Bob does when the user says what they
// want; `--filled` starts with it. `POST /__mock/reset` empties it again, `POST /__mock/fill` fills it.

import { createBobLogger } from "@bob/logging";

const logger = createBobLogger("bob-roadmap-mock");

interface BobRoadmap {
  goal: { title: string; why?: string; targetUsd: number; deadline?: string } | null;
  stage: { index: number; total: number; title: string; lesson?: string };
  milestones: { id: string; title: string; done: boolean }[];
  today: { id: string; title: string; minutes?: number; due?: string; done: boolean }[];
  earnedUsd: number;
  updatedAt: string;
}

const port = Number(process.argv.find((arg) => arg.startsWith("--port="))?.slice("--port=".length) ?? 1337);

function emptyRoadmap(): BobRoadmap {
  return {
    goal: null,
    stage: { index: 1, total: 6, title: "Set your goal" },
    milestones: [],
    today: [],
    earnedUsd: 0,
    updatedAt: new Date().toISOString(),
  };
}

function filledRoadmap(): BobRoadmap {
  const due = new Date();
  due.setHours(21, 0, 0, 0);
  return {
    goal: {
      title: "Make my first $1,000 selling Notion templates",
      why: "Pay off my credit card and prove I can earn outside my job",
      targetUsd: 1000,
      deadline: "2026-12-31",
    },
    stage: {
      index: 2,
      total: 6,
      title: "Pick your first product",
      lesson: "Sell one small thing people already search for. Do not build a course yet.",
    },
    milestones: [
      { id: "m1", title: "Goal and deadline set", done: true },
      { id: "m2", title: "First product picked", done: false },
      { id: "m3", title: "First listing live", done: false },
      { id: "m4", title: "First sale", done: false },
    ],
    today: [
      { id: "t1", title: "List 5 templates you already use at work", minutes: 15, due: due.toISOString(), done: true },
      { id: "t2", title: "Search Etsy and Gumroad for 3 of them and note the prices", minutes: 20, done: false },
      { id: "t3", title: "Pick the one with the most reviews under $15", minutes: 10, done: false },
    ],
    earnedUsd: 120,
    updatedAt: new Date().toISOString(),
  };
}

let roadmap = process.argv.includes("--filled") ? filledRoadmap() : emptyRoadmap();

const json = (body: unknown, status = 200) => Response.json(body, { status });

function promptReply(text: string): Response {
  const firstGoal = roadmap.goal === null;
  if (firstGoal) roadmap = filledRoadmap();
  const reply = firstGoal
    ? `Love it. I set your goal and planned 3 small tasks for today. You said: "${text.slice(0, 80)}".`
    : "Noted. Your roadmap is up to date.";
  const chunks = [
    { type: "start" },
    ...reply.split(/(?<= )/u).map((delta) => ({ type: "text-delta", delta })),
    { type: "finish" },
  ];
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
        await Bun.sleep(20);
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson" } });
}

const server = Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    logger.info("Request", { method: request.method, path: url.pathname });
    if (url.pathname === "/__mock/reset" && request.method === "POST") {
      roadmap = emptyRoadmap();
      return json(roadmap);
    }
    if (url.pathname === "/__mock/fill" && request.method === "POST") {
      roadmap = filledRoadmap();
      return json(roadmap);
    }
    const match = /^\/agents\/bob-agent\/([^/]+)(\/.*)?$/u.exec(url.pathname);
    if (!match) return json({ error: "Not found" }, 404);
    const path = match[2] ?? "";
    if (path === "" && request.method === "GET") {
      return json({ goal: roadmap.goal?.title ?? null, tasks: roadmap.today, timezone: "UTC", notifications: [] });
    }
    if (path === "/roadmap" && request.method === "GET") return json(roadmap);
    const done = /^\/tasks\/([^/]+)\/done$/u.exec(path);
    if (done && request.method === "POST") {
      const id = decodeURIComponent(done[1] ?? "");
      if (!roadmap.today.some((task) => task.id === id)) return json({ error: `No task ${id}` }, 404);
      roadmap = {
        ...roadmap,
        today: roadmap.today.map((task) => (task.id === id ? { ...task, done: true } : task)),
        updatedAt: new Date().toISOString(),
      };
      return json(roadmap);
    }
    if (path === "/notifications/dismiss" && request.method === "POST") return json({ ok: true });
    if (path === "/prompt" && request.method === "POST") {
      const body: { text?: string } = await request.json();
      return promptReply(body.text ?? "");
    }
    return json({ error: "Not found" }, 404);
  },
});

logger.info("The Bob roadmap mock listens.", { url: `http://localhost:${server.port}`, filled: roadmap.goal !== null });
