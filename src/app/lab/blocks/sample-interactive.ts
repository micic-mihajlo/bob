import { interactiveBlockSchema, type InteractiveBlock } from "@/lib/blocks/types";

const MERGE_MESSAGE = `Stream CSV exports (#482)

Exports used to build the whole file in memory before sending a byte, so
anything past ~150k rows hit the 60s gateway timeout.

* toCsv is now an async generator that yields one line per row
* escapeCell quotes fields per RFC 4180 (quotes doubled; commas, CR and LF quoted)
* exportRows streams from the database cursor instead of loading all rows
* legacy.ts is renamed to csv-legacy.ts and kept for the admin bulk export

Measured on staging with 200k rows:
  before: 44.8s p95, 610MB peak memory
  after:   6.2s p95,  41MB peak memory

Follow-ups:
  - back-pressure when the client reads slowly (#486)
  - replace replaceAll for the ES2019 worker target (#487)

Reviewed-by: Review agent
Tested-by: QA agent
Co-authored-by: Build agent`;

/** Raw tool-call payloads, parsed through the same schemas a real tool call would use. */
const RAW: unknown[] = [
  {
    kind: "confirm",
    id: "merge-482",
    title: "Merge #482 into main?",
    preview: MERGE_MESSAGE,
    actions: [
      { id: "merge", label: "Squash and merge", style: "danger" },
      { id: "rebase", label: "Rebase first", style: "primary" },
      { id: "wait", label: "Not yet" },
    ],
  },
  {
    kind: "choice",
    id: "ship-branch",
    title: "Which branch should ship in tonight's release?",
    options: [
      { id: "release-2.4", label: "release/2.4", meta: "12 commits · all green" },
      { id: "main", label: "main", meta: "31 commits · 1 flaky test" },
      { id: "hotfix", label: "hotfix/csv-quotes", meta: "2 commits · all green" },
    ],
    submitLabel: "Ship this branch",
  },
  {
    kind: "choice",
    id: "blocking-checks",
    title: "Which checks should block a merge to main?",
    multiple: true,
    options: [
      { id: "types", label: "Type check", meta: "38s" },
      { id: "unit", label: "Unit tests", meta: "1m 12s" },
      { id: "e2e", label: "End-to-end tests", meta: "9m 40s" },
      { id: "load", label: "Export load test", meta: "14m" },
    ],
  },
  {
    kind: "form",
    id: "env-var",
    title: "Add an environment variable",
    fields: [
      {
        type: "text",
        id: "name",
        label: "Name",
        placeholder: "EXPORT_BATCH_SIZE",
        required: true,
        pattern: "[A-Z][A-Z0-9_]*",
        patternMessage: "Use capital letters, digits and underscores, starting with a letter.",
      },
      { type: "text", id: "value", label: "Value", placeholder: "500", required: true },
      { type: "segmented", id: "scope", label: "Environment", options: ["Development", "Preview", "Production"], required: true },
      { type: "select", id: "owner", label: "Owner", options: ["Platform", "Data", "Growth"] },
      { type: "date", id: "review", label: "Review on", hint: "Optional. We will ask again on this date." },
      { type: "textarea", id: "note", label: "Why it is needed" },
    ],
    submitLabel: "Add variable",
  },
  {
    kind: "quick_replies",
    id: "next-step",
    replies: ["Ship it", "Run the load test first", "Show me the slow queries", "Hold until Monday"],
  },
];

export const SAMPLE_INTERACTIVE: readonly InteractiveBlock[] = RAW.map((raw) => interactiveBlockSchema.parse(raw));
