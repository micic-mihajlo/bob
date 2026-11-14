import { describe, expect, it } from "vitest";
import { decodeBobRoadmap } from "./bob-roadmap-decoding";

const base = {
  goal: { title: "$1k MRR from bookkeepers", targetUsd: 1000 },
  stage: { index: 2, total: 6, title: "Talk to 10 of them" },
  milestones: [{ id: "stage-1", title: "Bookkeepers picked", done: true }],
  today: [],
  earnedUsd: 0,
  updatedAt: "2026-10-30T12:00:00.000Z",
};

describe("decodeBobRoadmap", () => {
  it("reads a roadmap from a Worker without the plan, with an empty rhythm", () => {
    expect(decodeBobRoadmap(base)).toMatchObject({ milestones: base.milestones, rhythm: [] });
  });

  it("reads the stage plan and the weekly rhythm", () => {
    const roadmap = decodeBobRoadmap({
      ...base,
      milestones: [
        {
          id: "stage-2",
          title: "10 bookkeeper calls",
          done: false,
          stage: 2,
          tasks: [
            { title: "Send 5 DMs", minutes: 20, done: true },
            { title: "Write 3 phrases", done: false },
          ],
        },
      ],
      rhythm: [{ title: "Cold DMs", when: "Mon and Wed 08:00", minutes: 30 }],
    });
    expect(roadmap.milestones[0]).toEqual({
      id: "stage-2",
      title: "10 bookkeeper calls",
      done: false,
      stage: 2,
      tasks: [
        { title: "Send 5 DMs", minutes: 20, done: true },
        { title: "Write 3 phrases", done: false },
      ],
    });
    expect(roadmap.rhythm).toEqual([{ title: "Cold DMs", when: "Mon and Wed 08:00", minutes: 30 }]);
  });

  it("refuses a malformed plan task or rhythm block", () => {
    const badTask = { ...base, milestones: [{ id: "m", title: "t", done: false, tasks: [{ title: "x" }] }] };
    expect(() => decodeBobRoadmap(badTask)).toThrow();
    expect(() => decodeBobRoadmap({ ...base, rhythm: [{ title: "x" }] })).toThrow();
    expect(() => decodeBobRoadmap({ ...base, rhythm: "weekly" })).toThrow();
  });
});
