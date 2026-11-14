"use client";

import { useEffect, useMemo, useRef } from "react";
import { subscribe } from "./clock";
import { easeLook, gazeTarget, liveFrame, paint, pointerGaze, stillFrame, type FaceInput, type MoodMark } from "./frame";
import { RENDERERS, type FaceStyle } from "./registry";
import { traitsFor } from "./traits";
import type { FaceSize, Mood, Vec } from "./types";
import { usePrefersReducedMotion } from "./useReducedMotion";

export type AgentFaceProps = {
  seed: string;
  hue: number;
  mood: Mood;
  size: FaceSize;
  style?: FaceStyle;
  /** Overrides the system preference; true draws a still expression per mood. */
  reducedMotion?: boolean;
  /** Changing this replays the current mood's entrance, e.g. a second reply. */
  moodKey?: string | number;
  className?: string;
};

export function AgentFace({ seed, hue, mood, size, style = "print", reducedMotion, moodKey, className }: AgentFaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const markRef = useRef<MoodMark | null>(null);
  const lookRef = useRef<{ look: Vec; at: number }>({ look: { x: 0, y: 0 }, at: 0 });
  const prefersReduced = usePrefersReducedMotion();
  const still = reducedMotion ?? prefersReduced;
  const traits = useMemo(() => traitsFor(seed), [seed]);

  useEffect(() => {
    const current = markRef.current;
    if (current && current.mood === mood && current.key === moodKey) return;
    const prev: Mood = current === null ? mood : current.mood === mood ? "idle" : current.mood;
    markRef.current = { mood, prev, since: performance.now(), key: moodKey };
  }, [mood, moodKey]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const mark = markRef.current;
    if (!canvas || !ctx || !mark) return;
    const renderer = RENDERERS[style];
    const pixels = Math.round(size * Math.min(window.devicePixelRatio || 1, 3));
    if (canvas.width !== pixels) canvas.width = pixels;
    if (canvas.height !== pixels) canvas.height = pixels;
    const input = (): FaceInput => ({ size, hue, traits, mark: markRef.current ?? mark });

    if (still) {
      paint(ctx, renderer, stillFrame(input()), pixels);
      return;
    }

    const tick = (now: number, pointer: Vec | null) => {
      const base = liveFrame(input(), now, lookRef.current.look);
      const target = gazeTarget(base, pointerGaze(canvas, pointer, size));
      const look = easeLook(lookRef.current.look, target, (now - lookRef.current.at) / 1000);
      lookRef.current = { look, at: now };
      paint(ctx, renderer, { ...base, look }, pixels);
    };
    tick(performance.now(), null);
    return subscribe(canvas, renderer.fps, tick);
  }, [style, size, hue, traits, still, mood, moodKey]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      width={size}
      height={size}
      style={{ width: size, height: size, display: "block", flex: "0 0 auto" }}
      aria-hidden="true"
    />
  );
}
