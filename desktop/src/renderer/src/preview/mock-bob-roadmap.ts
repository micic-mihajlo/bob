import type { BobRoadmap, BobRoadmapDesktopApi } from "@bob/contracts/ipc";

/** The roadmap of the preview: stage 2 of 6, $120 of $1,000, and 1 of 3 tasks done. */
export function createMockBobRoadmap(): BobRoadmapDesktopApi {
  let roadmap: BobRoadmap = {
    goal: {
      title: "$1k MRR from solo bookkeepers",
      why: "Prove the invoicing app can pay for itself before I raise",
      targetUsd: 1000,
      deadline: "2026-12-31",
    },
    stage: {
      index: 2,
      total: 6,
      title: "Talk to 10 of them",
      lesson: "The fastest way to learn distribution is to talk to the people you want as customers.",
    },
    milestones: [
      { id: "stage-1", title: "Solo bookkeepers on QuickBooks, 3 groups found", done: true, stage: 1 },
      {
        id: "stage-2",
        title: "10 bookkeeper conversations",
        done: false,
        stage: 2,
        tasks: [
          { title: "Find 10 bookkeepers who posted about chasing invoices", minutes: 20, done: true },
          { title: "Send 5 short DMs asking how they chase invoices today", minutes: 20, done: false },
          { title: "Write the 3 phrases you heard most, word for word", minutes: 10, done: false },
        ],
      },
      {
        id: "stage-3",
        title: "$29/mo plan with a Stripe checkout",
        done: false,
        stage: 3,
        tasks: [
          { title: "Rewrite the headline with a bookkeeper's own words", minutes: 20, done: false },
          { title: "Set up Stripe Checkout and buy it yourself once", minutes: 30, done: false },
        ],
      },
      {
        id: "stage-4",
        title: "10 bookkeepers paying",
        done: false,
        stage: 4,
        tasks: [
          { title: "Offer a founding price to everyone you interviewed", minutes: 20, done: false },
          { title: "Ask your happiest user for 2 intros", minutes: 10, done: false },
        ],
      },
      {
        id: "stage-5",
        title: "r/Bookkeeping or cold email, whichever wins",
        done: false,
        stage: 5,
        tasks: [{ title: "Test both for 2 weeks with a weekly number", minutes: 15, done: false }],
      },
      { id: "stage-6", title: "$1,000 MRR", done: false, stage: 6 },
    ],
    today: [
      { id: "t1", title: "Find 10 bookkeepers who posted about chasing invoices", minutes: 20, done: true },
      { id: "t2", title: "Send 5 short DMs asking how they chase invoices today", minutes: 20, done: false },
      { id: "t3", title: "Write the 3 phrases you heard most, word for word", minutes: 10, done: false },
    ],
    rhythm: [
      { title: "Bookkeeper DMs", when: "Mon and Wed 08:00", minutes: 30 },
      { title: "Weekly review with Bob", when: "Fri 17:00", minutes: 15 },
    ],
    earnedUsd: 120,
    updatedAt: new Date().toISOString(),
  };
  return {
    get: async () => structuredClone(roadmap),
    completeTask: async (taskId) => {
      roadmap = {
        ...roadmap,
        today: roadmap.today.map((task) => (task.id === taskId ? { ...task, done: true } : task)),
        updatedAt: new Date().toISOString(),
      };
      return structuredClone(roadmap);
    },
  };
}
