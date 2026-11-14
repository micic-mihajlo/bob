"use client";

import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import { SEND_TO_BOB, speakable, utteranceFor } from "@/lib/voice/speech";
import type { AgentId } from "@/lib/types";
import { voiceSession, voiceTurn } from "./api";
import { quiet, SAMPLE_MS } from "./use-mic-levels";
import type { VoiceCallState, VoicePanelPhase } from "./VoicePanel";

/**
 * A call through an ElevenLabs agent. The agent hears and speaks; every time the person says something it
 * calls send_to_bob, which posts their words into the thread and answers with the captain's reply.
 * Must render inside a ConversationProvider.
 */
export function useElevenLabsCall(agentId: AgentId): VoiceCallState {
  const [phase, setPhase] = useState<VoicePanelPhase>("starting");
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState(quiet);
  const heardSinceSend = useRef<string[]>([]);
  const thinking = useRef(false);

  const conversation = useConversation({
    micMuted: muted,
    onMessage: ({ message, role }) => {
      if (role === "user") {
        heardSinceSend.current.push(message);
        setHeard(message);
      } else setSaid(message);
    },
    onModeChange: ({ mode }) => {
      if (!thinking.current) setPhase(mode === "speaking" ? "speaking" : "listening");
    },
    onError: (message) => setError(message),
    onDisconnect: () => setPhase("offline"),
  });

  useConversationClientTool(SEND_TO_BOB, async (parameters: Record<string, unknown>) => {
    thinking.current = true;
    setPhase("thinking");
    const text = utteranceFor(heardSinceSend.current, typeof parameters.text === "string" ? parameters.text : "");
    heardSinceSend.current = [];
    const result = await voiceTurn(agentId, text);
    thinking.current = false;
    return result.ok ? speakable(result.reply) : `Bob could not take that: ${result.error}`;
  });

  const { startSession, endSession, getInputVolume, getOutputVolume } = conversation;
  useEffect(() => {
    let cancelled = false;
    void voiceSession().then((session) => {
      if (cancelled) return;
      if (!session.ok) {
        setError(session.error);
        return setPhase("offline");
      }
      startSession({ conversationToken: session.conversationToken, connectionType: "webrtc" });
    });
    return () => {
      cancelled = true;
      try {
        endSession();
      } catch {
        // Never connected.
      }
    };
  }, [startSession, endSession]);

  const speaking = phase === "speaking";
  useEffect(() => {
    const timer = setInterval(() => {
      let level = 0;
      try {
        level = speaking ? getOutputVolume() : getInputVolume();
      } catch {
        // Not connected yet.
      }
      setLevels((previous) => [...previous.slice(1), Math.min(1, level)]);
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [speaking, getInputVolume, getOutputVolume]);

  return {
    phase,
    muted,
    heard,
    said,
    levels,
    error,
    onToggleMute: () => setMuted(!muted),
    onInterrupt: () => conversation.sendUserActivity(),
  };
}
