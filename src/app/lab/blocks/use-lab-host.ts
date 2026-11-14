"use client";

import { useMemo, useState } from "react";
import type { AnsweredBlock, BlockHost, BlockStatus } from "@/lib/blocks/types";

export interface LogEntry {
  seq: number;
  at: string;
  answer: AnsweredBlock;
}

interface LabState {
  statuses: Readonly<Record<string, BlockStatus>>;
  answers: Readonly<Record<string, AnsweredBlock>>;
  log: readonly LogEntry[];
  /** Bumped on reset, so cards remount and drop their drafts. */
  generation: number;
}

const START: LabState = { statuses: {}, answers: {}, log: [], generation: 0 };

const clock = (): string => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

/** A stand-in for a thread: it stores answers and statuses the way a real host would. */
export function useLabHost(ids: readonly string[]) {
  const [state, setState] = useState<LabState>(START);

  const host = useMemo<BlockHost>(
    () => ({
      statusOf: (id) => state.statuses[id] ?? "pending",
      answerOf: (id) => state.answers[id],
      onAnswer: (answer) => {
        const at = clock();
        setState((previous) => ({
          ...previous,
          statuses: { ...previous.statuses, [answer.blockId]: "answered" },
          answers: { ...previous.answers, [answer.blockId]: answer },
          log: [{ seq: previous.log.length + 1, at, answer }, ...previous.log],
        }));
      },
    }),
    [state.statuses, state.answers],
  );

  const reset = () => setState((previous) => ({ ...START, generation: previous.generation + 1 }));

  const expirePending = () =>
    setState((previous) => ({
      ...previous,
      statuses: Object.fromEntries(ids.map((id) => [id, previous.statuses[id] === "answered" ? "answered" : "expired"])),
    }));

  return { host, log: state.log, generation: state.generation, reset, expirePending };
}
