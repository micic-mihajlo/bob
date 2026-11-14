import { RollingNumber } from "@/components/common/RollingNumber";
import { formatDeadline } from "@/lib/client/format";
import type { Roadmap } from "@/lib/types";

/** The goal and how far along it is, counted as finished work orders over all planned ones. */
export function GoalCard({ roadmap }: { roadmap: Roadmap }) {
  const orders = [...roadmap.today, ...(roadmap.backlog ?? [])];
  const done = orders.filter((order) => order.status === "done").length;
  const total = orders.length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <section className="card" aria-labelledby="goal-heading">
      <h2 id="goal-heading" className="card-label">
        Goal
      </h2>
      {roadmap.goal ? (
        <>
          <p className="goal-title">{roadmap.goal.title}</p>
          {roadmap.goal.why ? <p className="goal-why">{roadmap.goal.why}</p> : null}
        </>
      ) : (
        <p className="empty-line">No goal set yet.</p>
      )}
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Work orders done">
        <span className="progress-fill" style={{ width: `${percent}%` }} />
      </div>
      <p className="goal-meta">
        <span className="goal-count">
          <RollingNumber value={done} text={String(done)} /> of {total} work orders done
        </span>
        {roadmap.goal?.deadline ? <span>Due {formatDeadline(roadmap.goal.deadline)}</span> : null}
      </p>
    </section>
  );
}
