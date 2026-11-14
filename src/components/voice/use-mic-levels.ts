"use client";

import { useEffect, useRef, useState } from "react";

export const LEVEL_COUNT = 32;
export const SAMPLE_MS = 80;
export const quiet = () => Array<number>(LEVEL_COUNT).fill(0);

/** The microphone's loudness, 0 to 1, oldest first, sampled while `active`; zeros otherwise. */
export function useMicLevels(active: boolean): number[] {
  const [levels, setLevels] = useState(quiet);
  const live = useRef(active);
  useEffect(() => {
    live.current = active;
  }, [active]);
  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((granted) => {
        stream = granted;
        if (stopped) return granted.getTracks().forEach((track) => track.stop());
        context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 512;
        context.createMediaStreamSource(granted).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        timer = setInterval(() => {
          analyser.getByteTimeDomainData(data);
          const power = data.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / data.length;
          const level = live.current ? Math.min(1, Math.sqrt(power) * 4) : 0;
          setLevels((previous) => [...previous.slice(1), level]);
        }, SAMPLE_MS);
      })
      .catch(() => {});
    return () => {
      stopped = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, []);
  return levels;
}
