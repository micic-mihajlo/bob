const RADIUS = 5.5;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProgressRing({ done, total }: { done: number; total: number }) {
  const complete = total > 0 && done >= total;
  const fraction = total === 0 ? 0 : Math.min(1, done / total);
  return (
    <svg className="progress-ring" data-complete={complete ? "" : undefined} width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      {complete ? (
        <>
          <circle cx="7" cy="7" r="6.5" className="progress-ring-fill" />
          <path d="m4.4 7.1 1.8 1.8 3.4-3.6" className="progress-ring-tick" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r={RADIUS} className="progress-ring-track" />
          <circle
            cx="7"
            cy="7"
            r={RADIUS}
            className="progress-ring-value"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - fraction)}
          />
        </>
      )}
    </svg>
  );
}
