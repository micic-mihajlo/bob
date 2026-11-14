"use client";

import { useState } from "react";

interface Shown {
  value: number;
  text: string;
  direction: "up" | "down";
  /** Places, counted from the right, whose character changed in the last update. */
  changed: ReadonlySet<number>;
}

function changedPlaces(before: string, after: string): Set<number> {
  const old = [...before].reverse();
  const next = [...after].reverse();
  return new Set(next.flatMap((char, place) => (old[place] === char ? [] : [place])));
}

/**
 * Text whose digits roll when they change: up when the number grows, down when it shrinks. Each
 * character is keyed by its place from the right and its value, so a changed character mounts a
 * new element that plays the roll once, and the unit at the end never moves.
 */
export function RollingNumber({ value, text }: { value: number; text: string }) {
  const [shown, setShown] = useState<Shown>({ value, text, direction: "up", changed: new Set() });

  if (text !== shown.text) {
    setShown({
      value,
      text,
      direction: value >= shown.value ? "up" : "down",
      changed: changedPlaces(shown.text, text),
    });
  }

  const chars = [...text];
  return (
    <span className="rolling" data-direction={shown.direction}>
      <span className="sr-only">{text}</span>
      {chars.map((char, index) => {
        const place = chars.length - 1 - index;
        return (
          <span
            key={`${place}-${char}`}
            className="rolling-char"
            data-roll={shown.changed.has(place) && /\d/.test(char) ? "" : undefined}
            aria-hidden="true"
          >
            {char}
          </span>
        );
      })}
    </span>
  );
}
