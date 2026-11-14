const PATCH = `diff --git a/src/export/csv.ts b/src/export/csv.ts
index 4b1c2d0..9e7f3a1 100644
--- a/src/export/csv.ts
+++ b/src/export/csv.ts
@@ -1,12 +1,18 @@
 import type { Row } from "./types";

-export function toCsv(rows: Row[], columns: string[]): string {
-  const header = columns.join(",");
-  const body = rows.map((row) => columns.map((column) => row[column]).join(","));
-  return [header, ...body].join("\\n");
+const NEEDS_QUOTES = /[",\\r\\n]/;
+
+/** Quotes a field when RFC 4180 needs it, doubling any quote inside. */
+export function escapeCell(value: unknown): string {
+  const text = value === null || value === undefined ? "" : String(value);
+  return NEEDS_QUOTES.test(text) ? \`"\${text.replaceAll('"', '""')}"\` : text;
 }

-export async function exportRows(query: Query): Promise<string> {
-  const rows = await query.all();
-  return toCsv(rows, query.columns);
+export async function* toCsv(rows: AsyncIterable<Row>, columns: string[]): AsyncGenerator<string> {
+  yield columns.map(escapeCell).join(",") + "\\r\\n";
+  for await (const row of rows) {
+    yield columns.map((column) => escapeCell(row[column])).join(",") + "\\r\\n";
+  }
 }
+
+export const exportRows = (query: Query) => toCsv(query.stream(), query.columns);
diff --git a/src/export/legacy.ts b/src/export/csv-legacy.ts
similarity index 100%
rename from src/export/legacy.ts
rename to src/export/csv-legacy.ts
diff --git a/src/export/csv.test.ts b/src/export/csv.test.ts
new file mode 100644
--- /dev/null
+++ b/src/export/csv.test.ts
@@ -0,0 +1,9 @@
+import { describe, expect, it } from "vitest";
+import { escapeCell } from "./csv";
+
+describe("escapeCell", () => {
+  it("quotes commas, quotes and newlines", () => {
+    expect(escapeCell('say "hi", then\\nleave')).toBe('"say ""hi"", then\\nleave"');
+  });
+});
+// end of file
\\ No newline at end of file`;

export const SAMPLE_PATCH = PATCH;

const CHART = `<style>
  .chart { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 12px; background: var(--surface); }
  .head { display: flex; flex-wrap: wrap; gap: 4px 16px; align-items: baseline; }
  h3 { margin: 0 auto 0 0; font-size: 13px; font-weight: 500; }
  .key { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
  .key i { width: 8px; height: 8px; border-radius: 2px; }
  .plot { display: grid; grid-template-columns: repeat(6, 1fr); align-items: end; gap: 14px; height: 168px; border-bottom: 1px solid var(--line); }
  .group { display: flex; align-items: end; justify-content: center; gap: 3px; height: 100%; }
  .bar { position: relative; width: 40%; max-width: 22px; border-radius: 4px 4px 0 0; height: 0; transition: height 600ms cubic-bezier(0.23, 1, 0.32, 1); }
  .bar[data-series="before"] { background: var(--chart-3); }
  .bar[data-series="after"] { background: var(--chart-2); }
  .bar:hover { filter: brightness(1.2); }
  .labels { display: grid; grid-template-columns: repeat(6, 1fr); gap: 14px; color: var(--muted); font: 11px var(--font-mono); text-align: center; }
  .readout { min-height: 16px; color: var(--fg-secondary); font: 12px var(--font-mono); }
</style>
<div class="chart">
  <div class="head">
    <h3>CSV export p95 by row count, seconds</h3>
    <span class="key"><i style="background: var(--chart-3)"></i>Before</span>
    <span class="key"><i style="background: var(--chart-2)"></i>This PR</span>
  </div>
  <div class="plot" id="plot"></div>
  <div class="labels" id="labels"></div>
  <div class="readout" id="readout">Hover a bar for its value.</div>
</div>
<script>
  const series = { before: [0.6, 2.4, 7.9, 21.0, 44.8, 60.0], after: [0.4, 0.9, 1.6, 3.1, 6.2, 12.5] };
  const rows = ["1k", "10k", "50k", "100k", "200k", "400k"];
  const plot = document.getElementById("plot");
  const readout = document.getElementById("readout");
  const bars = rows.flatMap((label, index) => {
    const group = document.createElement("div");
    group.className = "group";
    plot.appendChild(group);
    const name = document.createElement("div");
    name.textContent = label;
    document.getElementById("labels").appendChild(name);
    return Object.keys(series).map((key) => {
      const bar = document.createElement("div");
      bar.className = "bar";
      bar.dataset.series = key;
      bar.addEventListener("mouseenter", () => {
        readout.textContent = label + " rows, " + (key === "after" ? "this PR" : "before") + ": " + series[key][index].toFixed(1) + "s";
      });
      group.appendChild(bar);
      return { bar, value: series[key][index] };
    });
  });
  requestAnimationFrame(() => bars.forEach(({ bar, value }) => (bar.style.height = Math.max(2, (value / 60) * 100) + "%")));
</script>`;

export const SAMPLE_REPLY = `## PR #482 · Stream CSV exports

This moves **CSV export** off the request thread and streams rows as they are read, so a 200k-row export no longer times out. Review notes are in the _findings_ table below.

- Fields are escaped per RFC 4180: quotes doubled, fields with commas or newlines quoted
- \`toCsv\` now returns an async generator instead of a string
- [x] Unit tests for escaping
- [ ] Load test on staging

> Breaking: callers that awaited a string now need \`await collect(toCsv(rows))\`.

To try it locally:

1. Install and seed a large table:
   \`\`\`bash
   pnpm install --frozen-lockfile
   pnpm db:seed --rows 200000 # takes about a minute
   \`\`\`
2. Export it and time the request with \`curl -w "%{time_total}"\`.

---

| Severity | File | Finding |
| :-- | :-- | :-- |
| High | \`csv.ts:14\` | \`replaceAll\` needs ES2021; the worker targets ES2019 |
| Medium | \`csv.ts:19\` | No back-pressure when the client reads slowly |
| Low | \`csv.test.ts\` | Missing a case for \`\\r\` alone inside a field |

| Check | main | this branch |
| --- | :-: | :-: |
| Streams rows | ✗ | ✓ |
| RFC 4180 quoting | ✗ | ✓ |
| Handles \`null\` cells | ✓ | ✓ |
| Back-pressure | ✗ | ✗ |

\`\`\`diff
${PATCH}
\`\`\`

The helper the findings point at, for reference:

\`\`\`ts
const NEEDS_QUOTES = /[",\\r\\n]/;

/** Quotes a field when RFC 4180 needs it, doubling any quote inside. */
export function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (!NEEDS_QUOTES.test(text)) return text;
  // split/join instead of replaceAll keeps this working on ES2019 workers
  return \`"\${text.split('"').join('""')}"\`;
}

export const HEADER_ROW = 1; // the header always counts as a row
\`\`\`

\`\`\`json
{ "exportBatchSize": 500, "streaming": true, "timeoutMs": null }
\`\`\`

\`\`\`visual Export p95 by row count
${CHART}
\`\`\`

Related: https://github.com/example/app/pull/479 and [the RFC](https://www.rfc-editor.org/rfc/rfc4180).`;

export const STREAM_TEXT =
  "I read the export path end to end. The old version built the whole file in memory before sending a byte, which is why 200k rows hit the 60 second gateway limit. The new generator yields one line per row, so the first bytes leave in under 300ms and memory stays flat at about 40MB. Two things still worry me: replaceAll is newer than our worker target, and nothing slows the database cursor when a client reads slowly. I would fix the first before merging and track the second as a follow-up.";
