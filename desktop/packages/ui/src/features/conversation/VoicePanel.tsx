import type { AppTextKey } from "@bob/i18n";
import { Button, Maximize2, Mic, MicOff, Minimize2, PhoneOff } from "@bob/ui";
import type { AgentProfile } from "@bob/ui/data";
import { AgentAvatar } from "@bob/ui/features/agents/AgentAvatar";
import { VoiceWaveform } from "@bob/ui/features/conversation/VoiceRecordingMorph";
import { useText } from "@bob/ui/text";
import { Portal } from "@solidjs/web";
import { createEffect, createMemo, createSignal, For, onCleanup, Show } from "solid-js";

/** What a voice conversation does now. */
export type VoicePanelPhase = "starting" | "listening" | "thinking" | "speaking" | "offline";

const PHASE_LABELS: Record<VoicePanelPhase, AppTextKey> = {
  starting: "conversation.voice.phase.starting",
  listening: "conversation.voice.phase.listening",
  thinking: "conversation.voice.phase.thinking",
  speaking: "conversation.voice.phase.speaking",
  offline: "conversation.voice.phase.offline",
};

const PHASE_MOODS = {
  starting: "waiting",
  listening: "waiting",
  thinking: "working",
  speaking: "responded",
  offline: "waiting",
} as const;

/** About how fast the speech model reads, so the caption can light up the words as they are said. */
const WORDS_PER_SECOND = 2.6;

export interface VoicePanelProps {
  agent: AgentProfile;
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
  /** Full screen over the window, or minimized to a dock at the bottom of the chat. */
  expanded: boolean;
  onToggleMute: () => void;
  /** Stops the reply, or the wait for it, and listens again. */
  onInterrupt: () => void;
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
 * the roadmap and the chat stay in view. The agent listens until you stop
 * speaking, sends what you said to the chat, and reads its reply aloud; then it listens again.
 */
export function VoicePanel(props: VoicePanelProps) {
  const { t } = useText();
  const hearing = () => props.phase === "listening" && !props.muted;
  const level = () => props.levels.at(-1) ?? 0;
  // The face moves its mouth to its own voice, not to the user's.
  const faceLevel = () => (props.phase === "speaking" ? level() : 0);
  const live = () => hearing() || props.phase === "speaking";

  const startedAt = Date.now();
  const [now, setNow] = createSignal(Date.now());
  const clock = setInterval(() => setNow(Date.now()), 250);
  onCleanup(() => clearInterval(clock));
  const elapsed = () => formatClock(Math.floor((now() - startedAt) / 1000));

  // The last thing the agent said stays on screen until the next turn replaces it.
  const [lastSaid, setLastSaid] = createSignal("");
  const [partStartedAt, setPartStartedAt] = createSignal(Date.now());
  createEffect(
    () => props.said,
    (said) => {
      if (!said) return;
      setLastSaid(said);
      setPartStartedAt(Date.now());
    },
  );
  createEffect(
    () => props.phase === "thinking",
    (thinking) => {
      if (thinking) setLastSaid("");
    },
  );
  const saidWords = createMemo(() => lastSaid().split(/\s+/).filter(Boolean));
  const spokenCount = () =>
    props.phase === "speaking"
      ? Math.min(saidWords().length, Math.ceil(((now() - partStartedAt()) / 1000) * WORDS_PER_SECOND))
      : saidWords().length;
  const status = () =>
    t(props.muted && props.phase === "listening" ? "conversation.voice.phase.muted" : PHASE_LABELS[props.phase]);

  const onKey = (event: KeyboardEvent) => {
    if (!props.expanded) return;
    if (event.key === "Escape") props.onMinimize();
    if (event.code === "Space" && (props.phase === "speaking" || props.phase === "thinking")) {
      event.preventDefault();
      props.onInterrupt();
    }
  };
  window.addEventListener("keydown", onKey);
  onCleanup(() => window.removeEventListener("keydown", onKey));

  const Transcript = () => (
    <Show
      when={!props.error}
      fallback={
        <p class="bob-voice-said bob-voice-error" role="alert">
          {props.error}
        </p>
      }
    >
      <Show
        when={saidWords().length > 0}
        fallback={
          <p class="bob-voice-said" data-empty="">
            {hearing() && !props.heard ? t("conversation.voice.speakNow") : status()}
          </p>
        }
      >
        <p class="bob-voice-said" aria-live="polite">
          <For each={saidWords()} keyed={false}>
            {(word, index) => <span data-unspoken={index >= spokenCount() ? "" : undefined}>{word()} </span>}
          </For>
        </p>
      </Show>
    </Show>
  );

  const HangUp = () => (
    <Button
      variant="destructive"
      size="icon-lg"
      type="button"
      class="bob-voice-hangup"
      aria-label={t("conversation.voice.end")}
      title={t("conversation.voice.end")}
      onClick={() => props.onEnd()}
    >
      <PhoneOff aria-hidden="true" />
    </Button>
  );

  const MuteButton = () => (
    <Button
      variant="ghost"
      size="icon-lg"
      type="button"
      class="bob-voice-round"
      aria-label={t("conversation.voice.mute")}
      title={t("conversation.voice.mute")}
      aria-pressed={props.muted ? "true" : "false"}
      onClick={() => props.onToggleMute()}
    >
      <Show when={props.muted} fallback={<Mic aria-hidden="true" />}>
        <MicOff aria-hidden="true" />
      </Show>
    </Button>
  );

  return (
    <Portal>
      <Show
        when={props.expanded}
        fallback={
          <aside class="bob-voice-dock" aria-label={t("conversation.voice.label", { name: props.agent.name })}>
            <div class="bob-voice-dock-orb" style={{ "--bob-voice-level": String(level()) }}>
              <AgentAvatar agent={props.agent} mood={PHASE_MOODS[props.phase]} level={faceLevel()} motion="always" />
            </div>
            <div class="bob-voice-dock-wave" data-live={live() ? "" : undefined}>
              <VoiceWaveform levels={props.levels} />
            </div>
            <div class="bob-voice-dock-text">
              <span class="bob-voice-meta">
                {props.agent.name} · {status()} · {elapsed()}
              </span>
              <Transcript />
            </div>
            <MuteButton />
            <Button
              variant="ghost"
              size="icon-lg"
              type="button"
              class="bob-voice-round"
              aria-label={t("conversation.voice.expand")}
              title={t("conversation.voice.expand")}
              onClick={() => props.onExpand()}
            >
              <Maximize2 aria-hidden="true" />
            </Button>
            <HangUp />
          </aside>
        }
      >
        <section
          class="bob-voice-full"
          role="dialog"
          aria-modal="true"
          aria-label={t("conversation.voice.label", { name: props.agent.name })}
          data-phase={props.phase}
        >
          <Button
            variant="ghost"
            size="icon-lg"
            type="button"
            class="bob-voice-round bob-voice-minimize"
            aria-label={t("conversation.voice.minimize")}
            title={t("conversation.voice.minimize")}
            onClick={() => props.onMinimize()}
          >
            <Minimize2 aria-hidden="true" />
          </Button>
          <div class="bob-voice-orb" style={{ "--bob-voice-level": String(level()) }}>
            <AgentAvatar
              agent={props.agent}
              mood={PHASE_MOODS[props.phase]}
              level={faceLevel()}
              motion="always"
              class="bob-voice-face"
            />
          </div>
          <Show
            when={props.error}
            fallback={
              <span class="sr-only" aria-live="polite">
                {status()}
              </span>
            }
          >
            <p class="bob-voice-error" role="alert">
              {props.error}
            </p>
          </Show>
          <HangUp />
        </section>
      </Show>
    </Portal>
  );
}
