"use client";

import { useEffect, useState } from "react";
import { AgentFace } from "@/components/faces/AgentFace";
import { measureDrawCalls, type DrawCost } from "@/components/faces/measure";
import { RENDERERS, type FaceStyle } from "@/components/faces/registry";
import { MOODS, type FaceSize, type Mood } from "@/components/faces/types";
import { hueFor, MOOD_LABEL, TEAM } from "./lab-data";

type Props = {
  style: FaceStyle;
  hue: number;
  seeds: readonly string[];
  step: number;
  replay: number;
  reducedMotion: true | undefined;
};

const rotate = (mood: Mood, step: number): Mood => MOODS[(MOODS.indexOf(mood) + step) % MOODS.length];

export function StyleSection({ style, hue, seeds, step, replay, reducedMotion }: Props) {
  const renderer = RENDERERS[style];
  const [costs, setCosts] = useState<readonly DrawCost[] | null>(null);
  const columns = MOODS.map((mood) => rotate(mood, step));

  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setCosts([measureDrawCalls(renderer, 24, seeds), measureDrawCalls(renderer, 44, seeds), measureDrawCalls(renderer, 96, seeds)]),
    );
    return () => cancelAnimationFrame(id);
  }, [renderer, seeds]);

  const face = (seed: string, index: number, mood: Mood, size: FaceSize) => (
    <AgentFace
      seed={seed}
      hue={hueFor(hue, index)}
      mood={mood}
      size={size}
      style={style}
      reducedMotion={reducedMotion}
      moodKey={mood === "responded" ? replay : undefined}
    />
  );

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2 className="text-[22px] font-semibold tracking-tight text-zinc-50">{renderer.label}</h2>
        <p className="text-[13px] text-zinc-400">{renderer.technique}</p>
        <p className="text-[12px] tabular-nums text-zinc-500">
          1 canvas per face · {renderer.fps} fps ·{" "}
          {costs ? costs.map((c) => `${c.mean} draw calls at ${c.size}px (max ${c.max})`).join(" · ") : "counting draw calls…"}
        </p>
      </div>
      <div className="flex flex-wrap items-start gap-10">
        <div className="rounded-xl border border-white/5 bg-[#0b0b0e] p-5">
          <div className="grid grid-cols-[64px_repeat(6,104px)] items-center gap-y-3">
            <span />
            {columns.map((mood) => (
              <span key={mood} className="text-center text-[11px] uppercase tracking-wider text-zinc-500">
                {MOOD_LABEL[mood]}
              </span>
            ))}
            {seeds.map((seed, row) => (
              <Row key={seed} label={seed.replace("agent-", "")}>
                {columns.map((mood, col) => (
                  <Cell key={col}>{face(seed, row, mood, 44)}</Cell>
                ))}
              </Row>
            ))}
            <Row label="96px">
              {columns.map((mood, col) => (
                <Cell key={col}>{face(seeds[0], 0, mood, 96)}</Cell>
              ))}
            </Row>
            <Row label="24px">
              {columns.map((mood, col) => (
                <Cell key={col}>{face(seeds[0], 0, mood, 24)}</Cell>
              ))}
            </Row>
          </div>
        </div>
        <SidebarStrip style={style} hue={hue} seeds={seeds} step={step} replay={replay} reducedMotion={reducedMotion} />
      </div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="truncate pr-2 text-[12px] text-zinc-500">{label}</span>
      {children}
    </>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-center">{children}</div>;
}

function SidebarStrip({ style, hue, seeds, step, replay, reducedMotion }: Omit<Props, "style"> & { style: FaceStyle }) {
  return (
    <div className="w-[300px] rounded-xl border border-white/5 bg-black p-2">
      <p className="px-2 pt-1 pb-2 text-[11px] uppercase tracking-wider text-zinc-500">In the sidebar</p>
      {TEAM.map((member, index) => {
        const mood = rotate(member.mood, step);
        return (
          <div key={member.name} className="team-row" data-indicator={mood}>
            <span className="team-row-face">
              <AgentFace
                seed={seeds[index] ?? member.name}
                hue={hueFor(hue, index)}
                mood={mood}
                size={36}
                style={style}
                reducedMotion={reducedMotion}
                moodKey={mood === "responded" ? replay : undefined}
              />
            </span>
            <span className="team-row-text">
              <span className="team-row-top">
                <strong className="team-row-name">{member.name}</strong>
              </span>
              <span className="team-row-line">{step === 0 ? member.line : MOOD_LABEL[mood]}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
