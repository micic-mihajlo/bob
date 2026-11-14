"use client";

import { useEffect, useState } from "react";
import { clockStats, type ClockStats } from "@/components/faces/clock";
import { FACE_STYLES } from "@/components/faces/registry";
import { INITIAL_SEEDS, randomSeeds } from "./lab-data";
import { StyleSection } from "./StyleSection";

const CYCLE_MS = 2600;
const REPLAY_MS = 5000;

export function FacesLab() {
  const [hue, setHue] = useState(24);
  const [seeds, setSeeds] = useState<readonly string[]>(INITIAL_SEEDS);
  const [cycle, setCycle] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [step, setStep] = useState(0);
  const [replay, setReplay] = useState(0);
  const [stats, setStats] = useState<ClockStats | null>(null);

  useEffect(() => {
    const replayTimer = window.setInterval(() => setReplay((n) => n + 1), REPLAY_MS);
    const statsTimer = window.setInterval(() => setStats(clockStats()), 1000);
    return () => {
      window.clearInterval(replayTimer);
      window.clearInterval(statsTimer);
    };
  }, []);

  useEffect(() => {
    if (!cycle) return;
    const timer = window.setInterval(() => setStep((n) => n + 1), CYCLE_MS);
    return () => window.clearInterval(timer);
  }, [cycle]);

  return (
    <div className="fixed inset-0 overflow-y-auto bg-[#060608] text-zinc-200">
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#060608]/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1360px] flex-wrap items-center gap-x-6 gap-y-3 px-8 py-4">
          <h1 className="mr-auto text-[15px] font-semibold tracking-tight text-zinc-100">Agent faces</h1>
          <label className="flex items-center gap-3 text-[13px] text-zinc-400">
            Hue
            <input
              type="range"
              min={0}
              max={359}
              value={hue}
              onChange={(event) => setHue(Number(event.target.value))}
              className="w-40 accent-zinc-300"
            />
            <span className="w-8 tabular-nums text-zinc-300">{hue}</span>
          </label>
          <button
            type="button"
            onClick={() => setSeeds(randomSeeds(INITIAL_SEEDS.length))}
            className="rounded-md border border-white/10 px-3 py-1.5 text-[13px] text-zinc-200 hover:bg-white/5"
          >
            Shuffle seeds
          </button>
          <Toggle label="Cycle moods" checked={cycle} onChange={setCycle} />
          <Toggle label="Reduced motion" checked={reduced} onChange={setReduced} />
          <span className="w-full text-right text-[12px] tabular-nums text-zinc-500 sm:w-auto">
            {stats
              ? `${stats.visible} of ${stats.faces} faces on screen · ${stats.painted} paints/s · ${stats.msPerFrame.toFixed(2)} ms per frame${stats.running ? "" : " · paused"}`
              : "measuring…"}
          </span>
        </div>
      </header>
      <main className="mx-auto flex max-w-[1360px] flex-col gap-16 px-8 py-10">
        {FACE_STYLES.map((style) => (
          <StyleSection
            key={style}
            style={style}
            hue={hue}
            seeds={seeds}
            step={step}
            replay={replay}
            reducedMotion={reduced ? true : undefined}
          />
        ))}
      </main>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-zinc-400 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-3.5 accent-zinc-300"
      />
      {label}
    </label>
  );
}
