import type { CSSProperties } from "react";
import { cx } from "./classes";

export interface ProgressProps {
  value: number;
  minValue?: number;
  maxValue?: number;
  className?: string;
  "aria-label"?: string;
}

/** The reference UI's progress bar, with the same markup and fill variable as its Kobalte root. */
export function Progress({ value, minValue = 0, maxValue = 100, className, ...rest }: ProgressProps) {
  const span = Math.max(maxValue - minValue, 1);
  const percent = Math.round((Math.min(Math.max(value, minValue), maxValue) - minValue) / span * 100);
  const state = percent >= 100 ? "complete" : "loading";
  const fill = { "--kb-meter-fill-width": `${percent}%`, "--kb-progress-fill-width": `${percent}%` } as CSSProperties;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={minValue}
      aria-valuemax={maxValue}
      aria-valuetext={`${percent}%`}
      data-progress={state}
      data-slot="progress"
      className={cx("ui-progress", className)}
      {...rest}
    >
      <div data-progress={state} data-slot="progress-track" className="ui-progress-track">
        <div data-progress={state} data-slot="progress-fill" className="ui-progress-fill" style={fill} />
      </div>
    </div>
  );
}
