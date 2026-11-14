# Overnight log

## Read this first

- Bob runs the whole loop end to end on the live model. A one-sentence ask leads to a pushback question, then a roadmap, a sandboxed build with tests, a PR, a review, your approval, the merge, and Why? back to your sentence.
- Speed: in 10/10 back-to-back live runs, p90 to the approval card is 81 s (target 120 s). The default demo order in docs/DEMO.md (the CSV request first, the overdue request typed during its build) was measured live at 111-147 s with both PRs merged.
- Tonight's runs on main 19bc326: the scripted walkthrough holds 10/10. Live, 7 hold. The open problem is that a review thread still finishing its turn at merge time is never closed (details under Walkthrough status).
- Demo video (2:35): https://api.capy.ai/pr-assets/v_H9A1bttisENyHKFhgBSYqgc7oR08Ft6ip0O_BnO4feU.mp4
- To run it: `pnpm demo` checks the machine, resets to a warm seed and starts Bob. docs/DEMO.md has the 3-minute script and the fallbacks.
- Yours to decide: the sponsor keys, the demo repository, a macOS dry run, rotating the key and the DevPost draft. See Needs Mihajlo's decision at the bottom.

## Merged

The `[demo]` PRs against `demo/invoices-main` (#46, #49, #51) are left out.

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

## Tried and didn't work

Nothing has been reverted. These approaches were tried overnight and replaced:

- **Splitting a small request.** In 2 of 4 live runs, the captain split "export invoices as CSV" into two work orders: a serializer, and an export button for a module that has no UI. The two builds overlapped, the review asked for changes, and the run went past 2 minutes. #25 replaced this with one work order per small request, planned against main's file list.
- **Failing cut-off turns on restart.** The first restart rule (#18) failed any turn that had already acted, which left its thread idle for good. #26 runs it once more from the state instead.
- **The scripted captain following only the newest PR.** With two requests in flight, it never asked approval for the older PR. #31 fixed it.
- **A request budget that counted hand-offs.** The first two-request run used up the 12-delivery request budget on conflict updates and re-reviews, so the automatic re-review was refused and PR #2 stayed in review. #29 stopped counting hand-offs, and #35 gave them their own budget of 24, proved bounded in Lean.
- **One roadmap for the whole project.** With two requests at once, they shared one set of stages, so one request's merge advanced the other's stage, and budgets and release notes mixed. #103 gives each request its own five-stage track, and #105 and #110 show it.
- **The prewarm demo order.** Starting a request before the talk and leaving merge #1 pending stalled the next request for about 3 minutes, and Why? on PR #2 ended at "Approved: Merge #1" instead of the sentence typed. The default order is now the CSV request first, with the overdue request typed during its build (#117, #120), and prewarm is optional.
- **Thread tests failing with EROFS.** The sandbox from #75 made every crew test run fail with EROFS, because vitest writes its cache under Bob's own read-only node_modules. #90 hides Bob's node_modules from the sandbox, and #83 keeps Bob's `.bin` off the thread's PATH.
- **A merge one commit behind main.** #25 merged one commit behind main. Main stayed green, and the merge chain now refuses when the branch is behind.

## Walkthrough status

`pnpm walkthrough` runs the ten steps against its own server and prints this table. Add `--live` to use the model, which needs `.env.local`. JSON for each run goes to `.data/walkthrough/`. The run resets the server, sends "customers want to export invoices as CSV", answers the pushback with a testable version, and sends the overdue request once the first thread takes its first step (the DEMO.md order). Then it resets and runs one more request, restarting the server mid-turn. Times are seconds from the request.

Latest runs, main 19bc326: the scripted brain holds 10/10 in 55 s. The live model holds 7, is partial on 1 and fails 2, in 393 s.

| # | Result | Scripted | Live | Live time | Notes (live) |
| --- | --- | --- | --- | --- | --- |
| 1 | Repo or new project | holds | holds | 24.4 | Template project; the build workspace lists its files |
| 2 | Pushback, roadmap fills, thread starts | holds | holds | 22.4 | A real question shows in needs-you; the roadmap fills 18 s after the answer |
| 3 | Real steps in the thread | holds | holds | 22.4 | Reads 13 files, writes, runs the acceptance test red and then green |
| 4 | PR with a real diff | holds | holds | 35.6 | 3 files, including the acceptance test |
| 5 | Review posts findings, build fixes | holds | holds | 63.9 | Approved with three low findings. The fix loop didn't trigger |
| 6 | Approve, merge, roadmap moves, threads close | holds | **partly** | - | 67 s to approval, merged in under 1 s. But the review thread INV-3 was still finishing its turn when the merge came, and it was never closed. This happened in both live runs tonight |
| 7 | Under 2 minutes, no loops | holds | **no** | - | Fails only because 6 never reaches "threads closed". Approval came at 67 s |
| 8 | Second request doesn't collide | holds | no* | 53.7 | The overdue request ran clean: its own thread INV-2, PR #2, a review, then merged and closed in 54 s. *The harness counted A's open review thread against it. This PR fixes that check |
| 9 | Restart loses and strands nothing | holds | holds | 65.0 | The restart cut off the captain and INV-1 mid-turn. Both ran again from the state without doing anything twice |
| 10 | Why? returns the typed sentence | holds | holds | - | 3 hops to "customers want to export invoices as CSV" |

In the run before that, the overdue PR conflicted with main after the CSV merge. INV-2 resolved it, INV-4 re-reviewed the new head, and the captain asked for approval again. The harness only approved once, so it fell short there, and this PR now approves each new ask. That run also left A's review thread open.

## Needs Mihajlo's decision

- **Sponsor keys.** Each integration is built behind a switch and stays off until you add its key as a project env var:
  - HydraDB: its key
  - ElevenLabs: its key, plus `BOB_VOICE`
  - Composio: its key and a connected GitHub account
  - Vercel: a project and a token
- **The demo repository.** Create micic-mihajlo/bob-invoices-demo; gh on the crew machines can't create repositories. Until then, the real-GitHub demo PRs run against micic-mihajlo/bob on the orphan branch `demo/invoices-main`.
- **A Mac dry run.** Run `pnpm demo` once on your Mac before the demo, ideally on the venue wifi. No macOS run has happened.
- **The gateway key.** Rotate it after the event, because it was pasted in chat.
- **DevPost.** Review the draft at handoffs/devpost.md in the Captain drive.
