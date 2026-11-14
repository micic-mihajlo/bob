"use client";

import { ConversationProvider } from "@elevenlabs/react";
import { Phone, PhoneOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Agent } from "@/lib/types";
import { voiceStatus } from "./api";
import { browserRecognizer, useBrowserCall } from "./use-browser-call";
import { useElevenLabsCall } from "./use-elevenlabs-call";
import { VoicePanel, type VoiceCallState } from "./VoicePanel";
import "./voice.css";

type VoiceMode = "elevenlabs" | "browser" | "off";

const OFF_HINT = "Voice is off. Set BOB_VOICE=elevenlabs and ELEVENLABS_API_KEY on the server, or use a browser that can hear you (Chrome, Edge, Safari).";

interface CallProps {
  agent: Agent;
  onEnd: () => void;
}

/** The open call, full screen or docked, around whichever controller fills it in. */
function CallPanel({ agent, onEnd, state }: CallProps & { state: VoiceCallState }) {
  const [expanded, setExpanded] = useState(true);
  return <VoicePanel agent={agent} {...state} expanded={expanded} onEnd={onEnd} onMinimize={() => setExpanded(false)} onExpand={() => setExpanded(true)} />;
}

function ElevenLabsCall(props: CallProps) {
  return <CallPanel {...props} state={useElevenLabsCall(props.agent.id)} />;
}

function BrowserCall(props: CallProps) {
  return <CallPanel {...props} state={useBrowserCall(props.agent.id)} />;
}

/**
 * Call the agent: talk, and it talks back. What you say lands in its thread as your message, marked voice,
 * so its intake rules push back the same way they do on typing. ElevenLabs when the server turns it on,
 * else the browser's own speech, else a disabled button that says why.
 */
export function CallBob({ agent }: { agent: Agent }) {
  const [mode, setMode] = useState<VoiceMode | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    void voiceStatus().then((status) => setMode(status.ok && status.elevenlabs ? "elevenlabs" : browserRecognizer() ? "browser" : "off"));
  }, []);
  if (mode === null) return null;
  const label = `Call ${agent.name}`;
  const end = () => setOpen(false);
  return (
    <>
      {mode === "off" ? (
        <Button variant="ghost" className="dictation-button" aria-label="Voice is off" aria-disabled="true" title={OFF_HINT} data-voice-mode="off">
          <PhoneOff aria-hidden="true" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          className="dictation-button"
          aria-label={label}
          title={mode === "elevenlabs" ? label : `${label} with the browser's own voice`}
          data-voice-mode={mode}
          disabled={open}
          onClick={() => setOpen(true)}
        >
          <Phone aria-hidden="true" />
        </Button>
      )}
      {open && mode === "elevenlabs" ? (
        <ConversationProvider>
          <ElevenLabsCall agent={agent} onEnd={end} />
        </ConversationProvider>
      ) : null}
      {open && mode === "browser" ? <BrowserCall agent={agent} onEnd={end} /> : null}
    </>
  );
}
