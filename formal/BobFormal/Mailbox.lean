/-!
# Mailbox: the delivery budget and loop termination

Models one request of the mailbox in `src/lib/mailbox.ts`. Requests are independent because
`budgetUsed` filters by `requestId`, so one request is the whole story.

What each definition mirrors:
- `Send` / `Msg`: `SendInput` / `Message` in `src/lib/types.ts` and `src/lib/mailbox.ts`.
- `budgetUsed`: `budgetUsed` in `src/lib/mailbox.ts`: it leaves out automatic hand-offs.
- `autoSends`: `handoffsUsed` in `src/lib/mailbox.ts`: deliveries of automatic hand-offs, the ones
  `sendForCaptain` in `src/lib/tools/handoff.ts` sends with `automatic: true`.
- `accepts`: `validate` plus `overBudget` in `src/lib/mailbox.ts` (the refusals that matter here:
  no recipients, self-send, a reply that expects a reply, an unknown reply target, over budget;
  an automatic send is measured against `HANDOFFS` instead of `BUDGET`).
  The other refusals (empty text, unknown or closed recipient, crew rule) only refuse more, so they
  can only make these bounds tighter.
- `Box.owed`: the deliveries with `answered = false` of reply-expecting agent messages
  (`Delivery.answered`, set by `markAnswered` in `src/lib/mailbox.ts`).
- `answersOwed`: `answersOwedAsk` in `src/lib/mailbox.ts`: a reply must answer an ask sent to the
  replier that nobody has answered yet, and goes to one recipient (the code also requires that
  recipient to be the asker, which only refuses more).
-/
namespace BobFormal.Mailbox

/-- Mirrors `REQUEST_DELIVERY_BUDGET`. -/
def BUDGET : Nat := 12

/-- Mirrors `REQUEST_HANDOFF_BUDGET`. -/
def HANDOFFS : Nat := 24

inductive Sender where
  | person
  | agent (id : Nat)
  deriving DecidableEq, Repr

def Sender.isAgent : Sender → Bool
  | .agent _ => true
  | .person => false

/-- One call to `applySend`. `to` is already de-duplicated, as `applySend` does. -/
structure Send where
  sender : Sender
  to : List Nat
  expectsReply : Bool
  replyTo : Option Nat
  auto : Bool
  deriving Repr

structure Msg where
  id : Nat
  sender : Sender
  to : List Nat
  expectsReply : Bool
  replyTo : Option Nat
  auto : Bool
  deriving Repr

/-- Deliveries of agent-sent messages in the request, hand-offs left out: one per recipient. Mirrors `budgetUsed`. -/
def budgetUsed : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent && !m.auto then m.to.length else 0) + budgetUsed ms

/-- Deliveries of automatic hand-offs. Mirrors `handoffsUsed`. -/
def autoSends : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent && m.auto then m.to.length else 0) + autoSends ms

/-- Every delivery of an agent-sent message, hand-offs included. -/
def allSends (ms : List Msg) : Nat := budgetUsed ms + autoSends ms

/-- Deliveries of agent messages that are not replies or hand-offs: the work agents choose to start. -/
def firstSends : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent && !m.auto && m.replyTo.isNone then m.to.length else 0) + firstSends ms

/-- Deliveries of agent replies that are not hand-offs. -/
def replySends : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent && !m.auto && m.replyTo.isSome then m.to.length else 0) + replySends ms

/-- How many messages agents sent. -/
def agentMessages : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent then 1 else 0) + agentMessages ms

def selfSend (i : Send) : Bool :=
  match i.sender with
  | .agent a => i.to.contains a
  | .person => false

/-- Mirrors `overBudget`: a hand-off spends the hand-off budget; other replies are exempt. -/
def overBudget (ms : List Msg) (i : Send) : Bool :=
  i.sender.isAgent &&
  (if i.auto then decide (autoSends ms + i.to.length > HANDOFFS)
   else i.replyTo.isNone && decide (budgetUsed ms + i.to.length > BUDGET))

/-- Mirrors `validate` and `overBudget` in `applySend`. -/
def accepts (ms : List Msg) (i : Send) : Bool :=
  !i.to.isEmpty && !selfSend i && !(i.replyTo.isSome && i.expectsReply) &&
  (match i.replyTo with
   | none => true
   | some r => ms.any (·.id == r)) &&
  !overBudget ms i

/-- The message `applySend` builds. Ids are fresh: the next position. -/
def mkMsg (ms : List Msg) (i : Send) : Msg := ⟨ms.length, i.sender, i.to, i.expectsReply, i.replyTo, i.auto⟩

theorem budget_split (ms : List Msg) : budgetUsed ms = firstSends ms + replySends ms := by
  induction ms with
  | nil => rfl
  | cons m ms ih =>
    obtain ⟨_, s, to, _, rt, au⟩ := m
    cases s <;> cases rt <;> cases au <;> simp [budgetUsed, firstSends, replySends, Sender.isAgent, ih] <;> omega

/-! ## The mailbox with its reply rule -/

structure Box where
  msgs : List Msg
  /-- (ask message id, recipient) for every delivery of an agent ask with `answered = false`. -/
  owed : List (Nat × Nat)

def answersOwed (b : Box) (i : Send) : Bool :=
  match i.replyTo, i.sender with
  | none, _ => true
  | some r, .agent a => b.owed.contains (r, a) && i.to.length == 1
  | some _, .person => false

/-- The deliveries a new agent ask opens. -/
def asks (n : Nat) (i : Send) : List (Nat × Nat) :=
  if i.sender.isAgent && i.expectsReply then i.to.map (fun a => (n, a)) else []

/-- Mirrors `markAnswered`. -/
def markAnswered (owed : List (Nat × Nat)) (i : Send) : List (Nat × Nat) :=
  match i.replyTo, i.sender with
  | some r, .agent a => owed.erase (r, a)
  | _, _ => owed

/-- One send. A refused send leaves the mailbox as it was, as `applySend` does. -/
def step (b : Box) (i : Send) : Box :=
  if accepts b.msgs i && answersOwed b i then
    { msgs := mkMsg b.msgs i :: b.msgs, owed := asks b.msgs.length i ++ markAnswered b.owed i }
  else b

def run (b : Box) : List Send → Box
  | [] => b
  | i :: is => run (step b i) is

def empty : Box := ⟨[], []⟩

/-- The invariant: new work and hand-offs stay within their budgets, and every reply used up one owed answer. -/
def Inv (b : Box) : Prop :=
  firstSends b.msgs ≤ BUDGET ∧
  autoSends b.msgs ≤ HANDOFFS ∧
  replySends b.msgs + b.owed.length ≤ firstSends b.msgs + autoSends b.msgs ∧
  agentMessages b.msgs ≤ allSends b.msgs

theorem inv_step (b : Box) (i : Send) (h : Inv b) : Inv (step b i) := by
  obtain ⟨h1, h2, h3, h4⟩ := h
  unfold allSends at h4
  have hs := budget_split b.msgs
  obtain ⟨s, to, er, rt, au⟩ := i
  unfold step
  split
  · rename_i hacc
    cases s with
    | person =>
      cases rt with
      | none =>
        simp [Inv, mkMsg, asks, markAnswered, firstSends, replySends, autoSends, allSends, agentMessages,
          budgetUsed, Sender.isAgent]
        omega
      | some r => simp [answersOwed] at hacc
    | agent a =>
      cases rt with
      | none =>
        simp [accepts, overBudget, Sender.isAgent] at hacc
        obtain ⟨⟨⟨hne, _⟩, _⟩, hb⟩ := hacc
        have hlen : 0 < to.length := by
          cases to with
          | nil => simp at hne
          | cons _ _ => simp
        cases au <;> cases er <;>
        simp_all [Inv, mkMsg, asks, markAnswered, firstSends, replySends, autoSends, allSends, agentMessages,
          budgetUsed, Sender.isAgent] <;> omega
      | some r =>
        simp [accepts, answersOwed] at hacc
        obtain ⟨⟨⟨⟨⟨_, _⟩, her⟩, _⟩, hb⟩, hm, hone⟩ := hacc
        have hel := List.length_erase_of_mem hm
        have hpos : 0 < b.owed.length := List.length_pos_of_mem hm
        subst her
        cases au <;>
        simp_all [Inv, mkMsg, asks, markAnswered, firstSends, replySends, autoSends, allSends, agentMessages,
          budgetUsed, Sender.isAgent, overBudget] <;> omega
  · exact ⟨h1, h2, h3, by unfold allSends; exact h4⟩

theorem inv_run (b : Box) (t : List Send) (h : Inv b) : Inv (run b t) := by
  induction t generalizing b with
  | nil => exact h
  | cons i is ih => exact ih (step b i) (inv_step b i h)

theorem inv_empty : Inv empty := by
  simp [Inv, empty, firstSends, replySends, autoSends, allSends, agentMessages, budgetUsed, BUDGET, HANDOFFS]

/-- **Budget.** Agents start at most `BUDGET` deliveries of new work in one request. -/
theorem first_sends_within_budget (t : List Send) : firstSends (run empty t).msgs ≤ BUDGET :=
  (inv_run empty t inv_empty).1

/-- **Hand-off budget.** The runtime sends at most `HANDOFFS` deliveries of automatic hand-offs
(review findings, re-reviews, branch updates) in one request, however the review loop goes. -/
theorem handoffs_within_budget (t : List Send) : autoSends (run empty t).msgs ≤ HANDOFFS :=
  (inv_run empty t inv_empty).2.1

/-- **Loop termination.** However agents behave, one request sees at most `2 * (BUDGET + HANDOFFS)`
agent deliveries, hand-offs included: every reply uses up an owed answer, and every owed answer
came from budgeted work or a budgeted hand-off. -/
theorem deliveries_bounded (t : List Send) : allSends (run empty t).msgs ≤ 2 * (BUDGET + HANDOFFS) := by
  have ⟨h1, h2, h3, _⟩ := inv_run empty t inv_empty
  have := budget_split (run empty t).msgs
  simp only [allSends]
  omega

/-- **Loop termination, counted in messages.** At most `2 * (BUDGET + HANDOFFS)` agent messages are
accepted in one request, so after that every agent send is refused and the cascade has stopped. -/
theorem agent_messages_bounded (t : List Send) : agentMessages (run empty t).msgs ≤ 2 * (BUDGET + HANDOFFS) := by
  have ⟨_, _, _, h4⟩ := inv_run empty t inv_empty
  have := deliveries_bounded t
  omega

/-! ## The reply ping-pong that used to run forever -/

/-- The k-th reply answers message k - 1, which the other teammate sent. -/
def pingPongReply (k : Nat) : Send :=
  if k % 2 = 1 then ⟨.agent 2, [1], false, some (k - 1), false⟩ else ⟨.agent 1, [2], false, some (k - 1), false⟩

/-- Teammate 1 asks teammate 2 once, then the two try to answer each other's last reply. -/
def pingPong (n : Nat) : List Send :=
  ⟨.agent 1, [2], true, none, false⟩ :: (List.range n).map (fun k => pingPongReply (k + 1))

set_option maxRecDepth 100000 in
/-- **Replies cannot ping-pong.** Of the ask and 30 replies to replies, only the ask and its one
answer are accepted: a reply to a reply answers nothing that is owed, so it is refused. -/
theorem ping_pong_stops : (run empty (pingPong 30)).msgs.length = 2 := by decide

end BobFormal.Mailbox
