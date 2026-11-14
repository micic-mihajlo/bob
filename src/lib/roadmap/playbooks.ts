/** The captain's script for each stage: specifics the lesson leaves out. The first line is the title. */
const INSPECT_INTENT = `# Inspect the request before any work starts

Use this in Intent. Most requests arrive as a wish: "users want X". A thread can't build a wish, and nobody can say when it's done. The factory's input inspection makes it testable first.

## Step 1: Find the three parts
- User: who does it, by role. "Users" is a start; "a signed-in user on the settings page" is better.
- Behaviour: what they can do afterwards that they can't today, and where in the app.
- Acceptance check: one sentence a test could assert. "After five failed logins from one address in a minute, the sixth gets a 429."

## Step 2: Ask for what's missing
One message, one or two sharp questions, each with a suggested answer so a yes is enough.
"Which screens get dark mode (all of them), and where does the switch live (the settings page)? What check tells us it works, like a test that the dark theme applies once the switch is on?"
Don't ask what you can decide. Pick a default and say it.

## Step 3: Stop asking
At most two rounds. After the second answer, or when they say go ahead, fill each gap with an assumption and say it in one line. The person can correct it while the thread works.

## Done when
set_goal holds the user, the behaviour and the acceptance check, with any assumptions listed.`;

const CUT_WORK_ORDERS = `# Cut the intent into work orders

Use this in Spec. A work order is one change a thread can finish alone and a reviewer can read in a few minutes.

## Step 1: One pull request each
- A small request, one behaviour in one module, is exactly one work order: the code and its test in one pull request.
- Split only when the parts touch different files and each can be tested on its own. Parts that would edit the same file stay one work order.
- Name only files and modules in the project's file list. A button or page the project doesn't have is not a work order; say it's missing instead.
- Title: a verb and a thing. "Rate-limit the login route with a test", not "auth work".

## Step 2: Today and the backlog
- At most three work orders in today. Pick the ones the acceptance check needs first.
- Everything else goes in the backlog and waits.

## Done when
Every work order in today has an ID and a title a thread could start from.`;

const WRITE_THE_BRIEF = `# Write a brief a thread can run with alone

Use this in Build. A crew thread sees only its brief and its workspace. It can't see your chat, the person's other messages or the other threads.

## The brief, line by line
- Goal: the work order's title.
- Context: the person's words, quoted, and the acceptance check.
- Area: the files or folders to touch, as far as you know them.
- You can rely on: what already exists and works, so it doesn't rebuild it.
- Out of scope: what it must not change.
- Done means: committed on its branch, the diff read, tests run when it can, a pull request open, and a report with Status, Result and Evidence.

## Example
From another project; a real brief names this project's own files and words.
Goal: Rate-limit the login route with a test.
Context: the person wrote "people keep guessing passwords on the login page". Acceptance: after five failed logins from one address in a minute, the sixth gets a 429.
Area: src/, next to src/routes/login.ts.
You can rely on: the login handler in src/routes/login.ts and the test setup in the project.
Out of scope: the UI and any change to how passwords are checked.
Done means: committed, diff read, pull request open, report with Status / Result / Evidence.

## When the report comes back
Check it answers the brief. When a key part is missing, ask one focused question instead of filling the gap. When it's blocked, give it what the Unblock line asks for, or ask the person.`;

const REVIEW_AND_MERGE = `# Review, approve, merge

Use this in Ship. A gate stands before every merge, and only the person opens it.

## Step 1: Review
Start a review thread with the pull request number, its id, its branch, the acceptance check and what to look at. It records a verdict and findings with a category, a severity and a confidence.

## Step 2: Fix loop
It runs on its own: requested changes go to the build thread with every finding, and the new head goes back to the review thread, for up to two rounds. Don't relay findings or ask for a re-review. Wait for an approving review or a blocked report. Low findings don't block a merge; they become follow-ups.

## Step 3: The person approves
Call request_approval with exactly what will merge: the number, the branch, the files and the verdict. DIGEST.md shows it to them.

## Step 4: Merge
Only after approval, merge_pull_request. Then close the work order's threads.

## Done when
Every work order in today is merged.`;

const FEED_BACK = `# Feed the result back into the plan

Use this in Learn. The factory gets better only when what happened goes back into the plan.

## Step 1: Write it down
NOTES.md already lists what shipped and what the review found. Add, in a few lines, whether the acceptance check held and what to do differently.

## Step 2: Follow-ups
Turn each finding worth doing into a backlog work order. Keep the backlog short; drop what nobody needs.

## Step 3: The next request
Inspect the next request like the first: user, behaviour, acceptance check. Then record it with set_goal and plan from the backlog.

## Done when
NOTES.md has the result and the backlog has the follow-ups.`;

export const PLAYBOOKS = {
  "inspect-intent": INSPECT_INTENT,
  "cut-work-orders": CUT_WORK_ORDERS,
  "write-the-brief": WRITE_THE_BRIEF,
  "review-and-merge": REVIEW_AND_MERGE,
  "feed-back": FEED_BACK,
} satisfies Record<string, string>;

export type PlaybookId = keyof typeof PLAYBOOKS;

export const PLAYBOOK_IDS = Object.keys(PLAYBOOKS) as PlaybookId[];

export function playbookTitle(id: PlaybookId): string {
  return PLAYBOOKS[id].split("\n", 1)[0].replace(/^#\s*/, "");
}
