"use client";

import { DiffView } from "@/components/blocks/DiffView";
import { ReplyBlocks } from "@/components/blocks/ReplyBlocks";
import { EventLog } from "./EventLog";
import { SAMPLE_INTERACTIVE } from "./sample-interactive";
import { SAMPLE_PATCH, SAMPLE_REPLY } from "./sample-reply";
import { StreamingDemo } from "./StreamingDemo";
import { useLabHost } from "./use-lab-host";
import "./lab.css";

const IDS = SAMPLE_INTERACTIVE.map((block) => block.id);

export function BlocksLab() {
  const { host, log, generation, reset, expirePending } = useLabHost(IDS);

  return (
    <div className="lab">
      <header className="lab-header">
        <h1 className="lab-title">Reply blocks</h1>
        <p className="lab-muted">Every block an agent reply can hold, with sample content from a code review.</p>
        <div className="lab-tools">
          <button type="button" className="blk-btn" data-style="neutral" onClick={expirePending}>
            Expire pending
          </button>
          <button type="button" className="blk-btn" data-style="neutral" onClick={reset}>
            Reset answers
          </button>
        </div>
      </header>
      <div className="lab-grid">
        <main className="lab-thread">
          <StreamingDemo />
          <section className="lab-turn" aria-labelledby="lab-reply-title">
            <header className="lab-turn-header">
              <h2 id="lab-reply-title" className="lab-turn-title">
                Agent reply
              </h2>
              <span className="lab-muted">parseReply on markdown, then interactive blocks from tool calls</span>
            </header>
            <ReplyBlocks key={generation} text={SAMPLE_REPLY} extra={SAMPLE_INTERACTIVE} host={host} />
          </section>
        </main>
        <aside className="lab-side">
          <EventLog entries={log} />
          <section className="lab-panel" aria-labelledby="lab-diff-title">
            <h2 id="lab-diff-title" className="lab-panel-title">
              Side panel diff
            </h2>
            <DiffView patch={SAMPLE_PATCH} />
          </section>
        </aside>
      </div>
    </div>
  );
}
