"use client";

import { ExternalLink, Maximize2, Mic, MicOff, Minimize2, PhoneOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AgentAvatar } from "@/components/features/agents/AgentAvatar";
import { Button } from "@/components/ui/Button";
import type { Agent } from "@/lib/types";
import { inFrame, MIC_BLOCKED } from "./mic";
import { VoiceWaveform } from "./VoiceWaveform";

/** What a voice conversation does now. */
export type VoicePanelPhase = "starting" | "listening" | "thinking" | "speaking" | "offline";

const PHASE_LABELS: Record<VoicePanelPhase, string> = {
  starting: "Starting",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
  offline: "Not connected",
};

const PHASE_MOODS = {
  starting: "connecting",
  listening: "waiting",
  thinking: "working",
  speaking: "responded",
  offline: "waiting",
} as const;

/** About how fast the speech model reads, so the caption can light up the words as they are said. */
const WORDS_PER_SECOND = 2.6;

/** What a call shows: the controllers for ElevenLabs and for the browser's own speech both fill this in. */
export interface VoiceCallState {
  phase: VoicePanelPhase;
  /** The microphone is off until the user unmutes it. */
  muted: boolean;
  /** What the user said in this turn, so far. */
  heard: string;
  /** The part of the reply that plays now. */
  said: string;
  /** The latest loudness readings of the voice that is heard now, from 0 to 1, oldest first. */
  levels: readonly number[];
  /** Why the conversation stopped listening. */
  error: string | null;
  onToggleMute: () => void;
  /** Stops the reply, or the wait for it, and listens again. */
  onInterrupt: () => void;
}

export interface VoicePanelProps extends VoiceCallState {
  agent: Agent;
  /** Full screen over the window, or minimized to a dock at the bottom of the chat. */
  expanded: boolean;
  onEnd: () => void;
  onMinimize: () => void;
  onExpand: () => void;
}

function formatClock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A call with the agent: full screen with only the agent's face, a hang-up button and a minimize button
 * (Space interrupts, Escape minimizes); or minimized to a glass dock with a waveform and the caption, so
 * the roadmap and the chat stay in view. The agent listens until you stop speaking, sends what you said
 * to the chat, and reads its reply aloud; then it listens again.
 */
export function VoicePanel(props: VoicePanelProps) {
  const { agent, phase, muted, heard, said, levels, error, expanded, onToggleMute, onInterrupt, onEnd, onMinimize, onExpand } = props;
  const hearing = phase === "listening" && !muted;
  const level = levels.at(-1) ?? 0;
  const live = hearing || phase === "speaking";
  const [framed] = useState(inFrame);

  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const clock = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(clock);
  }, []);
  const elapsed = formatClock(Math.floor((now - startedAt) / 1000));

  // The last thing the agent said stays on screen until the next turn replaces it.
  const [lastSaid, setLastSaid] = useState({ text: "", at: 0 });
  const [seenSaid, setSeenSaid] = useState(said);
  if (said !== seenSaid) {
    setSeenSaid(said);
    if (said) setLastSaid({ text: said, at: now });
  }
  const [seenPhase, setSeenPhase] = useState(phase);
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (phase === "thinking") setLastSaid({ text: "", at: 0 });
  }
  const saidWords = useMemo(() => lastSaid.text.split(/\s+/).filter(Boolean), [lastSaid.text]);
  const spokenCount =
    phase === "speaking" ? Math.min(saidWords.length, Math.ceil(((now - lastSaid.at) / 1000) * WORDS_PER_SECOND)) : saidWords.length;
  const status = muted && phase === "listening" ? "Muted" : PHASE_LABELS[phase];

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onMinimize();
      if (event.code === "Space" && (phase === "speaking" || phase === "thinking")) {
        event.preventDefault();
        onInterrupt();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, phase, onMinimize, onInterrupt]);

  const transcript = error ? (
    <p className="bob-voice-said bob-voice-error" role="alert">
      {error}
    </p>
  ) : saidWords.length === 0 ? (
    <p className="bob-voice-said" data-empty="">
      {hearing && !heard ? "Speak now" : heard || status}
    </p>
  ) : (
    <p className="bob-voice-said" aria-live="polite">
      {saidWords.map((word, index) => (
        <span key={index} data-unspoken={index >= spokenCount ? "" : undefined}>
          {word}{" "}
        </span>
      ))}
    </p>
  );

  const openTab =
    error === MIC_BLOCKED && framed ? (
      <Button
        variant="outline"
        size="sm"
        className="bob-voice-open-tab"
        onClick={() => {
          window.open(window.location.href, "_blank", "noopener");
          onEnd();
        }}
      >
        <ExternalLink aria-hidden="true" />
        Open in new tab
      </Button>
    ) : null;

  const hangUp = (
    <Button variant="destructive" size="icon-lg" className="bob-voice-hangup" aria-label="End voice conversation" title="End voice conversation" onClick={onEnd}>
      <PhoneOff aria-hidden="true" />
    </Button>
  );

  const muteButton = (
    <Button
      variant="ghost"
      size="icon-lg"
      className="bob-voice-round"
      aria-label="Mute the microphone"
      title="Mute the microphone"
      aria-pressed={muted ? "true" : "false"}
      onClick={onToggleMute}
    >
      {muted ? <MicOff aria-hidden="true" /> : <Mic aria-hidden="true" />}
    </Button>
  );

  const label = `Voice conversation with ${agent.name}`;
  const panel = expanded ? (
    <section className="bob-voice-full" role="dialog" aria-modal="true" aria-label={label} data-phase={phase}>
      <Button variant="ghost" size="icon-lg" className="bob-voice-round bob-voice-minimize" aria-label="Minimize" title="Minimize" onClick={onMinimize}>
        <Minimize2 aria-hidden="true" />
      </Button>
      <div className="bob-voice-orb" style={{ ["--bob-voice-level" as string]: String(level) }}>
        <AgentAvatar agent={agent} mood={PHASE_MOODS[phase]} motion="always" className="bob-voice-face" />
      </div>
      <div className="bob-voice-full-caption">
        {transcript}
        {openTab}
      </div>
      {hangUp}
    </section>
  ) : (
    <aside className="bob-voice-dock" aria-label={label}>
      <div className="bob-voice-dock-orb" style={{ ["--bob-voice-level" as string]: String(level) }}>
        <AgentAvatar agent={agent} mood={PHASE_MOODS[phase]} motion="always" />
      </div>
      <div className="bob-voice-dock-wave" data-live={live ? "" : undefined}>
        <VoiceWaveform levels={levels} />
      </div>
      <div className="bob-voice-dock-text">
        <span className="bob-voice-meta">
          {agent.name} · {status} · {elapsed}
        </span>
        {transcript}
        {openTab}
      </div>
      {muteButton}
      <Button variant="ghost" size="icon-lg" className="bob-voice-round" aria-label="Full screen" title="Full screen" onClick={onExpand}>
        <Maximize2 aria-hidden="true" />
      </Button>
      {hangUp}
    </aside>
  );
  return createPortal(panel, document.body);
}
