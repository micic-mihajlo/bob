"use client";

import { useCallback, useState } from "react";
import type { AgentId } from "@/lib/types";
import { interruptAgent, sendMessage } from "./api";

export interface AgentActions {
  /** Resolves true when the server took the message. */
  send: (text: string) => Promise<boolean>;
  stop: () => Promise<void>;
  sending: boolean;
  stopping: boolean;
  error: string | null;
  clearError: () => void;
}

export function useAgentActions(agentId: AgentId): AgentActions {
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed === "") return false;
      setSending(true);
      setError(null);
      const result = await sendMessage(agentId, trimmed);
      setSending(false);
      if (!result.ok) setError(result.error);
      return result.ok;
    },
    [agentId],
  );

  const stop = useCallback(async () => {
    setStopping(true);
    setError(null);
    const result = await interruptAgent(agentId);
    setStopping(false);
    if (!result.ok) setError(result.error);
  }, [agentId]);

  const clearError = useCallback(() => setError(null), []);

  return { send, stop, sending, stopping, error, clearError };
}
