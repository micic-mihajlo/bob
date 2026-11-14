import type { ReviewFinding } from "@/lib/types";

const SEVERITY_LABEL: Record<ReviewFinding["severity"], string> = { high: "High", medium: "Medium", low: "Low" };
const CATEGORY_LABEL: Record<ReviewFinding["category"], string> = {
  bug: "Bug",
  security: "Security",
  performance: "Performance",
  tests: "Tests",
  style: "Style",
};

export function FindingRow({ finding }: { finding: ReviewFinding }) {
  const where = finding.line === null ? finding.path : `${finding.path}:${finding.line}`;
  return (
    <li className="finding" data-severity={finding.severity}>
      <div className="finding-head">
        <span className="severity-pill" data-severity={finding.severity}>
          {SEVERITY_LABEL[finding.severity]}
        </span>
        <span className="finding-category">{CATEGORY_LABEL[finding.category]}</span>
        <span className="finding-confidence" title="How sure the reviewer is">
          {Math.round(finding.confidence * 100)}%
        </span>
      </div>
      <p className="finding-where" title={where}>
        {where}
      </p>
      <p className="finding-comment">{finding.comment}</p>
    </li>
  );
}
