"use client";

import { useEffect, useRef, useState } from "react";
import { FIRST_MESSAGE, speakable } from "@/lib/voice/speech";
import type { AgentId } from "@/lib/types";
import { voiceTurn } from "./api";
import { useMicLevels } from "./use-mic-levels";
import type { VoiceCallState, VoicePanelPhase } from "./VoicePanel";

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}

interface Recognizer {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  abort: () => void;
}

type RecognizerClass = new () => Recognizer;

/** Errors after which listening again cannot work, so the call stops instead of retrying. */
const FATAL = new Set(["not-allowed", "service-not-allowed", "audio-capture", "network", "language-not-supported"]);

/** The browser's speech recognition, when it has both that and speech synthesis. */
export function browserRecognizer(): RecognizerClass | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const w = window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * A call without a voice provider: the browser listens until you pause, sends what it heard into the
 * thread, and reads the agent's answer aloud with its own voice; then it listens again.
 */
export function useBrowserCall(agentId: AgentId): VoiceCallState {
  const [phase, setPhase] = useState<VoicePanelPhase>("starting");
  const [muted, setMuted] = useState(false);
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const levels = useMicLevels(phase === "listening" && !muted);
  const controls = useRef<{ mute: (on: boolean) => void; interrupt: () => void }>({ mute: () => {}, interrupt: () => {} });

  useEffect(() => {
    const Recognition = browserRecognizer();
    if (!Recognition) return;
    let ended = false;
    let quiet = false;
    let turn = 0;
    let recognizer: Recognizer | null = null;

    const listen = () => {
      if (ended || recognizer) return;
      setPhase("listening");
      if (quiet) return;
      let heardText = "";
      let fatal = false;
      const r = new Recognition();
      r.lang = navigator.language || "en-US";
      r.interimResults = true;
      r.continuous = false;
      r.onresult = (event) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) heardText += result[0].transcript;
          else interim += result[0].transcript;
        }
        setHeard(`${heardText}${interim}`.trim());
      };
      r.onerror = (event) => {
        if (!FATAL.has(event.error)) return;
        fatal = true;
        setError(event.error === "not-allowed" ? "Allow the microphone to talk to Bob." : `The browser stopped listening: ${event.error}.`);
      };
      r.onend = () => {
        recognizer = null;
        if (ended) return;
        if (fatal) return setPhase("offline");
        const text = heardText.trim();
        if (text) void send(text);
        else listen();
      };
      recognizer = r;
      r.start();
    };

    const speak = (text: string) => {
      setPhase("speaking");
      setSaid(text);
      const utterance = new SpeechSynthesisUtterance(text);
      // A browser without voices never ends the utterance; listen anyway once it would have been said.
      const fallback = setTimeout(listen, (text.split(/\s+/).length / 2.6) * 1000 + 3000);
      utterance.onend = utterance.onerror = () => {
        clearTimeout(fallback);
        listen();
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    };

    const send = async (text: string) => {
      const mine = ++turn;
      setPhase("thinking");
      setError(null);
      const result = await voiceTurn(agentId, text);
      if (ended || mine !== turn) return;
      if (!result.ok) {
        setError(result.error);
        return listen();
      }
      setHeard("");
      speak(speakable(result.reply));
    };

    controls.current = {
      mute: (on) => {
        quiet = on;
        if (on) recognizer?.abort();
        else listen();
      },
      interrupt: () => {
        turn++;
        window.speechSynthesis.cancel();
        listen();
      },
    };
    speak(FIRST_MESSAGE);
    return () => {
      ended = true;
      recognizer?.abort();
      window.speechSynthesis.cancel();
    };
  }, [agentId]);

  return {
    phase,
    muted,
    heard,
    said,
    levels,
    error,
    onToggleMute: () => {
      controls.current.mute(!muted);
      setMuted(!muted);
    },
    onInterrupt: () => controls.current.interrupt(),
  };
}
