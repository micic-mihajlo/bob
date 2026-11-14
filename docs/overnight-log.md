# Overnight log

## Read this first

- **What works end to end.** A one-sentence ask gets a pushback question. Then come a per-request roadmap track, a build thread on the Claude Agent SDK that writes a locked acceptance test (red, then green), a verification gate (properties, mutants, Lean), a PR, a review, your approval, the merge, and Why? back to your sentence. HydraDB, ElevenLabs voice, Composio GitHub and Linear have each run live. Bob's state can also live in a Cloudflare Durable Object per project (#224).
- **Live model.** Live runs now use deepseek/deepseek-v4.1-flash for the captain and the crew. The measured times below had the captain on kimi-k3.1-pro.
- **Measured speed.** On the move loop, 10/10 back-to-back live runs reached the approval card with a p90 of 81 s. The DEMO.md order took 111-147 s with both PRs merged. On the coding agent with the verification gate, the CSV request took 100-118 s to approval (BOB-5, eight live runs).
- **Tonight's walkthrough on main f17240b.** The scripted run holds 10/10. The live run is blocked: the AI Gateway key is over its $40 budget (see Needs).
- **Demo video**, final cut (2:48): https://api.capy.ai/pr-assets/v_AUjZ2l2OGi8snfhM5tC8z7DD2xkOGDwUBikwjErwpro.mp4. Earlier 2:35 cut: https://api.capy.ai/pr-assets/v_H9A1bttisENyHKFhgBSYqgc7oR08Ft6ip0O_BnO4feU.mp4
- **To run it**, use `pnpm demo`. docs/DEMO.md has the 3-minute script, the presenter notes (including the acceptance-change card) and the fallbacks: `BOB_ENGINE=loop`, `BOB_VERIFY=off` and `pnpm demo --scripted`.
- **Yours to decide:** raise the gateway budget first, then the sponsor keys, the demo repository, a Mac dry run, rotating keys and the DevPost draft. See Needs Mihajlo's decision at the bottom.

## Merged

The `[demo]` PRs against `demo/invoices-main` are left out: #46, #49, #51, #174, #181, #182, #187, #188, #190, #191, #198, #199 and #210.

| PR | sha | What |
| --- | --- | --- |
| #1 | 207bf51 | Reference UI stylesheet and a lab route for the new window |
| #2 | ab95157 | Agent avatar placeholder for the new window |
| #3 | 8b075c3 | Reference button, badge and typing-dots primitives in React |
| #4 | 0fdd3f6 | The reference UI's animated ASCII agent faces |
| #5 | a458542 | Lean proofs of the factory rules, tied to the code by conformance tests |
| #6 | 26c08bc | Five-stage delivery roadmap (intent, spec, build, ship, learn), intake pushback, ported agent instructions |
| #7 | 4d52bd6 | `GET /api/verification` reports each theorem and the last check |
| #8 | 203954f | Reference window frame, page rail and sidebar |
| #9 | 1c5d1d9 | Merge approvals pin the pull request head |
| #10 | b307554 | Why? follows an answer to the captain's question back to the original ask |
| #11 | 3bb15ca | Mailbox accepts a reply only when it answers an unanswered ask |
| #12 | d019d11 | Thread state: one of four statuses plus needs-you and closed flags |
| #13 | 2db2fde | DIGEST, CREW and NOTES regenerated from state on every change |
| #14 | 649e543 | Captain asks again for approval when the PR moved after it was approved |
| #15 | 50695cb | Steer or queue a message into a working thread |
| #16 | aac77ae | Reference side panel: roadmap, files and review panes |
| #17 | 3e0e01b | `pnpm walkthrough` and this log |
| #18 | 72e852b | Restart recovery: safe turns rerun, unsafe ones fail with a notice, cut-off threads get a fresh brief |
| #19 | 2f6d35d | Reference conversation pane, composer and Why? trace |
| #20 | 87bd5e7 | A shell per thread, project setup once, and a build loop under 2 minutes |
| #21 | 0b18f1b | Model per crew thread: `POST /api/agents/:id/model` and an optional model on start_thread |
| #22 | 96792c7 | The ported UI is the only UI |
| #23 | dd96e14 | Walkthrough waits for the last turns to settle before judging what's stranded |
| #24 | 5d38e76 | Review-fix loop: findings go to the builder, new heads go back to review, approval needs a review of the current head |
| #25 | 9fe5cea | Captain plans one work order for a small request, against the project's real files, in fewer replies |
| #26 | 1a49589 | Restart: a cut-off turn that already acted runs again and picks up from the state |
| #27 | 291f054 | Tool steps show a pass or fail mark, their time and command output |
| #28 | 9d955e9 | Thread commands are confined to their workspace by a user and mount namespace |
| #29 | ff5d485 | Automatic hand-offs don't count against the request's message budget |
| #30 | f97d74d | Projects: open a repository or start a new project from the sidebar |
| #31 | 55422f6 | Scripted brain: every open PR is handled, tests run in the build thread, and testable requests go straight through |
| #32 | 1219c32 | Captain rules: the review-fix loop and conflict updates run on their own |
| #33 | 9c8ecca | HydraDB graph store behind `BOB_STORE=hydra`: Why? as one path query, `GET /api/graph` |
| #34 | 0e91b79 | The PR card shows "Awaiting merge" while a PR waits at the merge gate |
| #35 | 44a39e3 | Hand-offs get their own budget, and the loop-termination proof covers them |
| #36 | 837fb76 | Voice intake: call Bob, and what you say lands in the captain's thread |
| #37 | ba5cb4c | Per-thread model picker in the conversation header |
| #38 | 5efe3db | A merge refused for a moved head tells the captain it goes back through review |
| #39 | e528b50 | Trace stamped everywhere: commit trailers and a trace block in every PR body |
| #40 | 791d0e2 | perf: model sweep, six runs after one-work-order planning, and a two-request live harness |
| #42 | a44852c | Why? draws the PR's path back to the person's sentence as a graph |
| #43 | 5e8e6c3 | Release notes: every merge writes what changed for users to CHANGELOG.md and the Learn card |
| #44 | 213fe36 | Factory controls: per-request time, model calls, tokens and cost, DIGEST alerts, and `bob.policy.json` in the gates |
| #45 | 7dde362 | Sidebar compacts to its faces when the window is too narrow for the chat |
| #47 | be41cb2 | Model calls: a timeout per attempt, two tries on the own model, then a fallback model |
| #48 | 5e6a5d1 | Captain's sidebar row asks for a request before the first message |
| #50 | 3f0dcba | Step times line up whether or not the step opens |
| #52 | 53574de | Walkthrough reads threadState only and catches cross-request leaks; log update |
| #53 | d9ce0cc | Approval cards keep the policy line on its own line |
| #54 | 9ec9961 | Publish pull requests to GitHub and check Vercel previews, behind BOB_GITHUB and BOB_PREVIEWS |
| #55 | 402d1de | Moves stream live: text and started tool calls show in state.live while the model writes them |
| #56 | a4173f7 | A crew thread belongs to one request: message_thread refuses work for another request |
| #57 | 2c165b7 | Compact sidebar resets its expanded state during render, not in an effect |
| #58 | 153faba | A crew turn shows the files it was given as a finished read step |
| #59 | a75bd8f | Roadmap shows what shipped and each request against its limits |
| #60 | e1622f0 | PR card shows the GitHub pull request and the preview check |
| #61 | 5cfb69c | Captain steps the rules already fix run without a model call |
| #62 | 8f43d48 | Moves stream into the chat: the text so far and the tool calls being written |
| #63 | e2dedde | A ticked checkbox shows its tick |
| #64 | ef2f72c | Request time counts only while its turns run, not while it waits on the person |
| #65 | 541848e | perf: ten back-to-back live runs through merge, before and after the tail fixes |
| #66 | edf578c | Activity and Crew show a pull request's real state: awaiting merge or merged |
| #67 | fda5685 | Subagents inside a crew thread |
| #68 | 217ab28 | Drop the old threadStatus snapshot field |
| #69 | 84b2cc2 | Long runtime notices wrap to two lines instead of running off the chat |
| #70 | 04df134 | Subagents hang off their thread's face on a guide line in the sidebar |
| #71 | d107842 | Why? graph names each review and merge gate by its verdict, status and head |
| #72 | aa95905 | Inbox: triage meetings, feedback and errors into sourced backlog work |
| #73 | 4da7ed4 | A merge completes its work order even after set_today moved it to the backlog |
| #74 | 64ed05f | Loading screen: hopping crew and rotating lines instead of a bare "Loading" |
| #75 | 486e159 | run names its sandbox mode, and workspace deps clone on macOS |
| #76 | 5652130 | Inbox pane: quoted asks, verdicts and a Build this button |
| #77 | 58f30be | Acceptance test first: the build turns the work order's check red, then green |
| #78 | e2f2399 | Panel test lists the Inbox pane in the captain's tab order |
| #79 | 68cbbd9 | pnpm demo: check the machine, reset to a warm seed, start Bob and say what's on |
| #80 | 19dd349 | Chat keeps single line breaks inside a paragraph |
| #81 | effb71f | Promoting an inbox order no longer leaves a copy of it without its source |
| #82 | 2a04afb | Chat stays on the newest item when the side panel opens |
| #83 | c3a8d85 | run puts only the workspace's own node_modules/.bin on PATH |
| #84 | 56bb61d | docs/DEMO.md: run the demo on a fresh Mac, the 3-minute script, and recovery |
| #85 | 900f672 | Roadmap first run says what happens next instead of three empty lines |
| #86 | 86e358a | pnpm demo reads the voice switch the way the server does |
| #87 | b5fa28f | README for what Bob is now, docs/ARCHITECTURE.md, and the old plan moved to history |
| #88 | 415abc6 | Roadmap goal reads "For an accountant", not "For An accountant" |
| #89 | 7cce013 | Request line keeps its numbers together and moves Running to the ask |
| #90 | 932881c | The sandbox hides Bob's own node_modules, so thread tests can write their vitest cache |
| #91 | 1092e9e | Sidebar's folded Closed group shows how many threads it holds |
| #92 | c390674 | Why? counts every agent on the path, including the one that built it |
| #93 | 0ab130d | Activity shows a review's verdict, so changes requested is not "Open" |
| #94 | 18c7068 | A long step list fades at its cut edge and keeps a gap above the reply |
| #95 | 963341a | A closed thread's composer says why it takes no messages |
| #96 | 4cd589f | Needs you shows the captain's question, not "Bob asks you something" |
| #97 | 7457262 | A turn that already did its terminal action ends done at the step cap, not failed |
| #98 | 9b40c06 | An open PR reads "In review" next to its spinner |
| #99 | a2ea423 | The merge approval lists its files as rows |
| #100 | fa95daa | The captain handles every report in a turn, not only the merge or the approval |
| #101 | df4ecda | A test that ran red and then green doesn't badge the turn as failed |
| #102 | c9190a9 | Activity and Changes rows keep their time and counts visible |
| #103 | c73d3be | Stages are tracked per request; a crew thread's work carries its work order's request |
| #104 | 30a147f | An agent's Status / Result / Evidence report reads as a status, a result and its evidence |
| #105 | b4e1866 | The roadmap shows one card per request, from the snapshot's tracks |
| #106 | 503ca6f | A message between agents opens as formatted text, not raw markdown |
| #107 | 60db360 | Titles open the app's tooltip, above the element, instead of the browser's |
| #108 | 0b3416a | The way back to the newest message sits in its own band, off the chat text |
| #109 | 1d53a03 | Inbox triage shows as a short notice, not as the instructions it carries |
| #110 | ba1c490 | Release notes, merge cards and old roadmaps follow their own request |
| #111 | 770b6df | open_pull_request publishes a thread's rebased branch |
| #112 | 03b6a25 | A new project's roadmap shows its five stages again |
| #113 | c8cb8de | A closed thread shows its model as a label, not a picker |
| #114 | b37b075 | Preview a report by its result in the sidebar |
| #115 | 4c75339 | A merged request's progress bar counts follow-ups apart |
| #116 | 270c598 | Keep the chat readable when the side panel opens in a narrow window |
| #117 | 27afea7 | DEMO.md: CSV first, overdue typed during its build, verified live three times |
| #118 | c11a34a | Raise the default per-request model-call budget to 90 |
| #119 | 0c1fbc0 | Show a file list's count once |
| #120 | f8cb236 | DEMO.md: answer Bob's question before typing the second request |
| #121 | 84f9d18 | When every request is done, the roadmap shows the one that finished last |
| #122 | 17c3564 | Waiting for replies shows each teammate once |
| #123 | 99b6710 | A message can start a new request while Bob's question is open, and an unplanned request is named |
| #124 | 19bc326 | The composer says when a message answers Bob's question, with a switch to a new request |
| #125 | 23a80b1 | A review thread's Changes tab shows the pull request it reviewed |
| #126 | 8a374c2 | A review finding in the chat reads as text under its mono path |
| #127 | e558ede | A review card says how many findings it leaves out |
| #128 | a87a9ac | Overnight log refresh; the walkthrough approves re-asks |
| #129 | da2cd8c | The sidebar footer says Synced, not Live, for the update stream |
| #130 | 4dcbe18 | A thread closed while its turn runs closes when that turn ends |
| #131 | 3d7df9b | Scripted intake: take natural yes-answers as permission to go ahead |
| #132 | f225819 | The Requests card names an inbox triage by its source, not its prompt |
| #133 | 4fad262 | Keep Tab inside the Why and confirm dialogs |
| #134 | 83b8cba | Inbox: an Answer button under Bob's question |
| #135 | 34e85e1 | A reply while an inbox question is open answers that item, and the composer shows it |
| #136 | ffb9b32 | Files: the search box uses the panel's 13px text |
| #137 | 18aff6f | Crew pane: readable faces and the PR state before the branch |
| #138 | 4862f27 | Restart notice names how many steps ran, and lists only the ones that must not repeat |
| #139 | a5616c1 | Crew pane: a working row's step stays on one line |
| #140 | 05beac3 | Merge card: the buttons say Merge #N and Don't merge |
| #141 | 4262440 | Merge card: file paths wrap at a slash |
| #142 | 8f15287 | Roadmap: the quoted ask clamps to two lines |
| #143 | 767afc3 | Sidebar: a search opens the folded sections it matches |
| #144 | cefe27e | Search boxes: a muted clear button instead of the browser's blue one |
| #145 | c06e019 | An error follows up the shipped pull request whose diff has the function its stack names |
| #146 | 6b45061 | Inbox: card headers wrap between phrases |
| #147 | d4f39c7 | An error's follow-up link falls back to the pull request whose title and ask share its words |
| #148 | 9276478 | Roadmap: a Build this request is named by its work order |
| #149 | 4b76f29 | Why?: a path that starts in the inbox says so |
| #150 | 03bab9d | Chat: warning notices take the warning color |
| #151 | ef96a5d | Why?: the path fits a narrow dialog instead of cutting off what you typed |
| #152 | d22e010 | Crew: a closed thread's glyph is a circled minus, not a dash |
| #153 | 1f52b59 | Inbox triage knows what already shipped, and an ask a merged pull request already does gets no new work order |
| #154 | 1773ac4 | Chat header: the name button says whose name it is |
| #155 | 1e7ee55 | Activity: a review row names the head it read |
| #156 | 587addb | An error follows up the pull request it is about, even one that changed other files than the stack names |
| #157 | 85e5017 | Inbox: an ask a merged PR already does says so |
| #158 | 694f6ad | First run: the greeting breaks between its two sentences |
| #159 | 90ee90e | Why?: a re-reviewed PR shows the review and gate that let it merge |
| #160 | 566c603 | Merge card: an approval whose head moved reads Replaced |
| #161 | 63660d5 | Sidebar: a closed thread says what it did, not when it closed |
| #162 | d3b9332 | Project menu: arrow keys move through the projects |
| #163 | a31097c | Open a project: closing the dialog returns focus to the project menu |
| #164 | 3b7acf7 | NOTES.md: one bullet per plan field, clean assumption list, user in lower case |
| #165 | 9d126d7 | Composer: "Answering Bob" quotes Bob's question, not the person's request |
| #166 | 97089f2 | Markdown: indented list items nest under the item above |
| #167 | 0792e14 | NOTES.md: a heading per track, and assumptions after the first in lower case |
| #168 | 52765c7 | Composer: Bob's open question shows on up to two lines |
| #169 | 0d1cf54 | Reduced motion: the queue panel, composer notices and the handwritten word stay still |
| #170 | 34f3c9f | An automatic hand-off's notice leaves out the artifact id and the colon that opens the findings |
| #171 | a0cd6af | Sidebar: the sync pill says Offline when the server can't be reached |
| #172 | 68adc98 | Sidebar: a new agent's row reads Ready instead of repeating its title |
| #173 | f02e2a1 | Chat: code blocks get the Copy button |
| #175 | dc7f68c | Project menu: long project names end in an ellipsis |
| #176 | b24bc12 | Composio Connect keys: run the GitHub tools through Connect's MCP server |
| #177 | e26c4d5 | HydraDB live: mirror tracks and inbox items, and a slow or down graph can't stall a request |
| #178 | 1432e89 | Voice: first-person agent on a current model, spelled-out words joined, caption fits |
| #179 | 766521d | Header and composer: a long agent name ends in an ellipsis instead of overlapping |
| #180 | e56300e | Sidebar search: say so when no thread matches |
| #183 | 7939f05 | Reduced motion: the merge card appears without sliding in |
| #184 | 106e9c4 | The answer to what should change after a declined merge joins that pull request's request |
| #185 | d7c3ec5 | Tell the caller when Bob can't use the microphone |
| #186 | 98cadd9 | Bob in print: ink and newsprint themes, display type, theme toggle |
| #189 | a3ae990 | Bob in print: halftone, paper grain, ink outlines, misregistration |
| #192 | 460261d | Bob in print: narration box, speech bubble, MERGED! stamp, PASS tag, speed lines |
| #193 | 811ec85 | Bob in print: motion on twos for the faces, the stamp and the PASS tag |
| #194 | 8e151a2 | Linear as an inbox source: open issues labelled bob come in as feedback, once each |
| #195 | 85b6cdf | Bob in print: muted text stays AA over the halftone |
| #196 | ade9971 | Linear: a merge comments the pull request and release note on its issue and moves it to Done, and a triage question goes on the issue |
| #197 | 92cfc2b | Bob in print: the call panel gets a halftone glow and a narration caption |
| #200 | f89389a | Why? from HydraDB also ends at the Linear issue an inbox item came from |
| #201 | 0413d03 | Linear in the Inbox and Why?: pull button, issue links, Linear at the path's root |
| #202 | 134d5ba | Templates: a project records its template, and a blank TypeScript template beside the invoices sample |
| #203 | 4205a78 | Project-agnostic captain prompts and tool examples, grounded in the project's README |
| #204 | 4db52a4 | Chaos run: a seeded random driver with invariants, and the fixes it found |
| #205 | 8193747 | Answer a send at once: the face starts working and a pending line shows until the agent moves |
| #206 | 21dd450 | First run: a fresh Bob opens on the Open a project choice; demo, walkthrough and tests choose the invoices sample |
| #207 | ac9baa1 | Requests card: no budget line in scripted mode, limits only once a budget is half spent |
| #208 | 00b0e12 | Engine auth: one place that picks the SDK turn's credential and model |
| #209 | 849f2d3 | Scripted brain: the captain and crew follow the script only on the invoices sample, and say so in the first reply |
| #211 | 9753e67 | Connect your Claude: run agents on your own Claude subscription, API key or Claude Code login |
| #212 | 51b70c9 | pnpm demo's reset keeps every other project |
| #213 | 73fcc69 | Crew build and review turns on the Claude Agent SDK behind BOB_ENGINE=sdk |
| #214 | 936cfdd | pnpm demo runs build and review crew threads on the Claude Agent SDK |
| #215 | 87c0025 | Lock the acceptance test once it has run red, and block a review on any change to it |
| #216 | b640a71 | Verification gate: contract, fast-check properties, mutants and a Lean proof per pull request |
| #217 | 720829e | Scripted demo exercises the verification gate: a surviving mutant is caught and killed |
| #218 | 777165c | Steer a person's message into a running SDK turn |
| #219 | 759fff7 | Reviewer can mark a surviving mutant equivalent; the card counts it |
| #220 | 74bea25 | Only the person can change a locked acceptance test: one approval card with the reason and the diff |
| #221 | 5a4859d | Live gate: verify_change writes the contract, and the gate is advisory with a live model |
| #222 | 8c903ab | Sidebar foot: connection only when it isn't live, a real theme control; one Scripted chip in the header |
| #223 | f17240b | Walkthrough approves acceptance-change cards and counts them |
| #224 | dfea678 | Add Cloudflare Worker with a Durable Object per project for Bob state |
| #225 | 7cff383 | Overnight log and DEMO.md: engine, lock, gate, sponsors; live walkthrough on the demo's engine |

## Tried and didn't work

Nothing has been reverted. These approaches were tried overnight and replaced:

- **Splitting a small request.** In 2 of 4 live runs, the captain split "export invoices as CSV" into two work orders: a serializer, and an export button for a module that has no UI. The two builds overlapped, the review asked for changes, and the run went past 2 minutes. #25 replaced this with one work order per small request, planned against main's file list.
- **Failing cut-off turns on restart.** The first restart rule (#18) failed any turn that had already acted, which left its thread idle for good. #26 runs it once more from the state instead.
- **The scripted captain following only the newest PR.** With two requests in flight, it never asked approval for the older PR. #31 fixed it.
- **A request budget that counted hand-offs.** The first two-request run used up the 12-delivery request budget on conflict updates and re-reviews, so the automatic re-review was refused and PR #2 stayed in review. #29 stopped counting hand-offs, and #35 gave them their own budget of 24, proved bounded in Lean.
- **One roadmap for the whole project.** With two requests at once, they shared one set of stages, so one request's merge advanced the other's stage, and budgets and release notes mixed. #103 gives each request its own five-stage track, and #105 and #110 show it.
- **The prewarm demo order.** Starting a request before the talk and leaving merge #1 pending stalled the next request for about 3 minutes, and Why? on PR #2 ended at "Approved: Merge #1" instead of the sentence typed. The default order is now the CSV request first, with the overdue request typed during its build (#117, #120), and prewarm is optional.
- **Thread tests failing with EROFS.** The sandbox from #75 made every crew test run fail with EROFS, because vitest writes its cache under Bob's own read-only node_modules. #90 hides Bob's node_modules from the sandbox, and #83 keeps Bob's `.bin` off the thread's PATH.
- **A review thread left open after a merge.** A thread still finishing its turn when the captain closed it stayed open (BOB-6, round 4). #130 marks it as closing, and it closes when its turn ends.
- **The move loop as the crew engine.** Build and review threads ran a 24-move loop with coarse tools on a flash model. #213 and #214 put them on the Claude Agent SDK by default, and `BOB_ENGINE=loop` is the fallback.
- **An acceptance-test lock on the file tools only.** A live build rewrote its locked test with python through `run` after the captain model "approved" a fix. #215 makes `run` put the file back, and #220 makes the person the only one who can change it.
- **A pre-red self-check of the acceptance test.** It didn't keep the CSV request under 2 minutes in all three runs, and it didn't stop the one wrong test. It was dropped in favour of the person-only change card (#220).
- **A blocking verification gate with a live model.** Live build threads can hit a mutant no test can kill. #219 lets the reviewer mark a mutant equivalent, and #221 makes the gate advisory with a live model (`BOB_VERIFY=block` makes it block). It still blocks in scripted runs.
- **Composio's REST API with a Connect key.** The `ck_` key answers 401 on the project REST API. #176 runs the GitHub tools through Connect's MCP server instead.
- **`gh pr merge` on fresh machines.** It fails with "Resource not accessible by integration". The crew merges through the REST merge endpoint, pinned to the head sha.
- **A merge one commit behind main.** #25 merged one commit behind main. Main stayed green, and the merge chain now refuses when the branch is behind.

## Walkthrough status

`pnpm walkthrough` runs the ten steps against its own server and prints this table. Add `--live` to use the model, which needs `.env.local`. JSON for each run goes to `.data/walkthrough/`. The run resets the server, sends "customers want to export invoices as CSV", answers the pushback with a testable version, and sends the overdue request once the first thread takes its first step (the DEMO.md order). Then it resets and runs one more request, restarting the server mid-turn. Times are seconds from the request.

Live runs use the crew engine `pnpm demo` uses: the coding agent, unless `BOB_ENGINE` says otherwise. When a build asks to change its acceptance test, the driver approves the card and prints `acceptance changes approved: n`.

Latest scripted run, main f17240b: 10/10 in 78 s, with 0 acceptance changes approved. The CSV request goes through the verification gate (a contract, properties and mutants) and reaches approval at 33 s. The overdue request merged at 19.8 s from its own post, in its own thread.

**Live: blocked at f17240b.** The captain's first call failed with "API key budget exceeded. Current spend: $40.06, limit: $40.00", and the fallback model failed the same way. Live numbers since my last live run, as the crew reports them:
- BOB-5: three live walkthroughs on the coding-agent engine held 10/10, with the CSV request at 72-77 s to approval. After the verification gate landed, eight live walkthroughs took 100-118 s to approval, and up to 153 s to closed when a merge-with-main round was needed. About 1 build in 6 raised an acceptance-change card.
- BOB-7: the verification gate adds 6.9 s at p90 to time-to-card in scripted runs (8.8-9.2 s with it, 2.0-2.3 s without, BOB_PACE=0).
- My last live run (19bc326, move loop) held 7. The review thread left open after a merge has since been fixed by #130.

## Needs Mihajlo's decision

- **Raise the AI Gateway budget now.** The key hit its $40.00 limit at 19:44 UTC, so every live captain and crew call fails, and the live demo can't run. Raise it under AI Gateway → Budgets & Spend in the Vercel team, or put a key with budget in `.env.local`. `pnpm demo --scripted` still works. Once it's raised, live runs use deepseek/deepseek-v4.1-flash for the captain and the crew, as `secrets/bob.env.local` now sets.
- **Sponsor keys.** All four integrations have run live tonight on keys added during the night. Where Bob runs, set:
  - HydraDB: `BOB_STORE=hydra` and `HYDRADB_API_KEY`. The key in the drive expires in about 3 days.
  - ElevenLabs: `BOB_VOICE=elevenlabs` and `ELEVENLABS_API_KEY`. Set `ELEVENLABS_AGENT_ID=agent_8901m7dfr1pzet1vjhk3n0cnedgp`, or the first call makes a new agent.
  - Composio: `BOB_GITHUB=composio`, `COMPOSIO_API_KEY` (the Connect `ck_` key), and `COMPOSIO_CONNECTED_ACCOUNT_ID=github_garner-zerma`.
  - Vercel previews: `BOB_PREVIEWS=vercel` needs a Vercel project and token, and there are none yet.
  - Linear: `BOB_LINEAR=on` and `LINEAR_API_KEY`.
- **The demo repository.** Create micic-mihajlo/bob-invoices-demo; gh on the crew machines can't create repositories. Until then, the real-GitHub demo PRs run against micic-mihajlo/bob on the orphan branch `demo/invoices-main`.
- **A Mac dry run.** Run `pnpm demo` once on your Mac before the demo, ideally on the venue wifi. No macOS run has happened. On a Mac, `run` has no namespace sandbox and says "plain shell".
- **Connect your Claude (optional).** In the project menu, choose Connect your Claude and pick a Claude subscription token, an API key, or Claude Code on this computer. Build and review threads then run on your Claude. Without it, they use Token Pass.
- **Rotate keys after the event.** Rotate `AI_GATEWAY_API_KEY`, because it was pasted in chat, and `LINEAR_API_KEY`.
- **DevPost.** Review the draft at handoffs/devpost.md in the Captain drive.
