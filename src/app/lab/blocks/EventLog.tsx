import type { LogEntry } from "./use-lab-host";

export function EventLog({ entries }: { entries: readonly LogEntry[] }) {
  return (
    <section className="lab-panel" aria-labelledby="lab-log-title">
      <h2 id="lab-log-title" className="lab-panel-title">
        onAnswer events
      </h2>
      {entries.length === 0 ? (
        <p className="lab-muted">Answer a block and what it emits shows here.</p>
      ) : (
        <ol className="lab-log" aria-live="polite">
          {entries.map((entry) => (
            <li key={entry.seq} className="lab-log-entry">
              <span className="lab-log-meta">
                #{entry.seq} · {entry.at} · {entry.answer.kind} · {entry.answer.blockId}
              </span>
              <code className="lab-log-value">{JSON.stringify(entry.answer.value)}</code>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
