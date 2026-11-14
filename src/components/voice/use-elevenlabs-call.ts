"use client";

import { useConversation, useConversationClientTool } from "@elevenlabs/react";
import { useEffect, useRef, useState } from "react";
import { BOB_ANSWER, joinSpelled, SEND_TO_BOB, speakable, utteranceFor } from "@/lib/voice/speech";
import type { AgentId } from "@/lib/types";
import { voiceSession, voiceTurn } from "./api";
import { checkMic } from "./mic";
import { quiet, SAMPLE_MS } from "./use-mic-levels";
import type { VoiceCallState, VoicePanelPhase } from "./VoicePanel";

/**
 * A call through an ElevenLabs agent. The agent hears and speaks; when the person asks for something it says
 * it is on it and calls send_to_bob without waiting. The words go into the thread, and once the captain's
 * turn ends its reply goes back into the call for the agent to say. Must render inside a ConversationProvider.
 */
export function useElevenLabsCall(agentId: AgentId): VoiceCallState {
  const [phase, setPhase] = useState<VoicePanelPhase>("starting");
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [levels, setLevels] = useState(quiet);
  const heardSinceSend = useRef<string[]>([]);
  const pending = useRef(0);

  const conversation = useConversation({
    micMuted: muted,
    onMessage: ({ message, role }) => {
      if (role === "user" && message.startsWith(BOB_ANSWER)) return;
      if (role === "user") {
        heardSinceSend.current.push(message);
        setHeard(message);
      } else setSaid(joinSpelled(message.replace(/\[[a-z -]+\]\s*/gi, "")));
    },
    onModeChange: ({ mode }) => setPhase(mode === "speaking" ? "speaking" : pending.current > 0 ? "thinking" : "listening"),
    onError: (message) => setError(message),
    onDisconnect: () => setPhase("offline"),
  });

  const { sendUserMessage } = conversation;
  useConversationClientTool(SEND_TO_BOB, async (parameters: Record<string, unknown>) => {
    const text = utteranceFor(heardSinceSend.current, typeof parameters.text === "string" ? parameters.text : "");
    heardSinceSend.current = [];
    pending.current += 1;
    void voiceTurn(agentId, text).then((result) => {
      pending.current -= 1;
      sendUserMessage(`${BOB_ANSWER} ${result.ok ? speakable(result.reply) : `I couldn't take that: ${result.error}`}`);
    });
    return "Sent to Bob.";
  });

  const { startSession, endSession, getInputVolume, getOutputVolume } = conversation;
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      const blocked = await checkMic();
      const session = blocked ? null : await voiceSession();
      if (cancelled) return;
      if (!session?.ok) {
        setError(blocked ?? (session && !session.ok ? session.error : null));
        return setPhase("offline");
      }
      startSession({ conversationToken: session.conversationToken, connectionType: "webrtc" });
    };
    void start();
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
