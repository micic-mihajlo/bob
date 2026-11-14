/-!
# Mailbox: the delivery budget and loop termination

Models one request of the mailbox in `src/lib/mailbox.ts`. Requests are independent because
`budgetUsed` filters by `requestId`, so one request is the whole story.

What each definition mirrors:
- `Send` / `Msg`: `SendInput` / `Message` in `src/lib/types.ts` and `src/lib/mailbox.ts`.
- `budgetUsed`: `budgetUsed` in `src/lib/mailbox.ts`.
- `accepts`: `validate` plus `overBudget` in `src/lib/mailbox.ts` (the refusals that matter here:
  no recipients, self-send, a reply that expects a reply, an unknown reply target, over budget).
  The other refusals (empty text, unknown or closed recipient, crew rule) only refuse more, so they
  can only make these bounds tighter.
- `routeOk`: `route` in `src/lib/tools/messaging.ts` (a reply must answer a message sent to you
  by an agent, and goes back to that agent).
- `Box.owed`: the deliveries with `answered = false` of reply-expecting agent messages
  (`Delivery.answered`, set by `markAnswered` in `src/lib/mailbox.ts`).
- `answersOwed`: the rule the factory's reply paths follow: `planRelays`/`owedDeliveries` in
  `src/lib/relay.ts` and `owedToCaptain` in `src/lib/tools/report.ts` only reply to an ask that
  is addressed to the replier and not answered yet, and send that reply to the asker alone.
-/
namespace BobFormal.Mailbox

/-- Mirrors `REQUEST_DELIVERY_BUDGET`. -/
def BUDGET : Nat := 12

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
  deriving Repr

structure Msg where
  id : Nat
  sender : Sender
  to : List Nat
  expectsReply : Bool
  replyTo : Option Nat
  deriving Repr

/-- Deliveries of agent-sent messages in the request: one per recipient. Mirrors `budgetUsed`. -/
def budgetUsed : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent then m.to.length else 0) + budgetUsed ms

/-- Deliveries of agent messages that are not replies: the ones that can start new work. -/
def firstSends : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent && m.replyTo.isNone then m.to.length else 0) + firstSends ms

/-- Deliveries of agent replies. -/
def replySends : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent && m.replyTo.isSome then m.to.length else 0) + replySends ms

/-- How many messages agents sent. -/
def agentMessages : List Msg → Nat
  | [] => 0
  | m :: ms => (if m.sender.isAgent then 1 else 0) + agentMessages ms

def selfSend (i : Send) : Bool :=
  match i.sender with
  | .agent a => i.to.contains a
  | .person => false

/-- Mirrors `overBudget`: replies are exempt. -/
def overBudget (ms : List Msg) (i : Send) : Bool :=
  i.sender.isAgent && i.replyTo.isNone && decide (budgetUsed ms + i.to.length > BUDGET)

/-- Mirrors `validate` and `overBudget` in `applySend`. -/
def accepts (ms : List Msg) (i : Send) : Bool :=
  !i.to.isEmpty && !selfSend i && !(i.replyTo.isSome && i.expectsReply) &&
  (match i.replyTo with
   | none => true
   | some r => ms.any (·.id == r)) &&
  !overBudget ms i

/-- The message `applySend` builds. Ids are fresh: the next position. -/
def mkMsg (ms : List Msg) (i : Send) : Msg := ⟨ms.length, i.sender, i.to, i.expectsReply, i.replyTo⟩

theorem budget_split (ms : List Msg) : budgetUsed ms = firstSends ms + replySends ms := by
  induction ms with
  | nil => rfl
  | cons m ms ih =>
    obtain ⟨_, s, to, _, rt⟩ := m
    cases s <;> cases rt <;> simp [budgetUsed, firstSends, replySends, Sender.isAgent, ih] <;> omega

/-! ## The factory's reply discipline -/

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

/-- The invariant: new work stays within budget, and every reply used up one owed answer. -/
def Inv (b : Box) : Prop :=
  firstSends b.msgs ≤ BUDGET ∧
  replySends b.msgs + b.owed.length ≤ firstSends b.msgs ∧
  agentMessages b.msgs ≤ budgetUsed b.msgs

theorem inv_step (b : Box) (i : Send) (h : Inv b) : Inv (step b i) := by
  obtain ⟨h1, h2, h3⟩ := h
  have hs := budget_split b.msgs
  obtain ⟨s, to, er, rt⟩ := i
  unfold step
  split
  · rename_i hacc
    cases s with
    | person =>
      cases rt with
      | none =>
        simp [Inv, mkMsg, asks, markAnswered, firstSends, replySends, agentMessages, budgetUsed,
          Sender.isAgent]
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
        cases er <;>
        simp [Inv, mkMsg, asks, markAnswered, firstSends, replySends, agentMessages, budgetUsed,
          Sender.isAgent] <;> omega
      | some r =>
        simp [accepts, answersOwed] at hacc
        obtain ⟨⟨⟨⟨⟨_, _⟩, her⟩, _⟩, _⟩, hm, hone⟩ := hacc
        have hel := List.length_erase_of_mem hm
        have hpos : 0 < b.owed.length := List.length_pos_of_mem hm
        subst her
        simp [Inv, mkMsg, asks, markAnswered, firstSends, replySends, agentMessages, budgetUsed,
          Sender.isAgent, hel, hone]
        omega
  · exact ⟨h1, h2, h3⟩

theorem inv_run (b : Box) (t : List Send) (h : Inv b) : Inv (run b t) := by
  induction t generalizing b with
  | nil => exact h
  | cons i is ih => exact ih (step b i) (inv_step b i h)

theorem inv_empty : Inv empty := by simp [Inv, empty, firstSends, replySends, agentMessages, budgetUsed, BUDGET]

/-- **Budget.** Agents start at most `BUDGET` deliveries of new work in one request. -/
theorem first_sends_within_budget (t : List Send) : firstSends (run empty t).msgs ≤ BUDGET :=
  (inv_run empty t inv_empty).1

/-- **Loop termination.** However agents behave, one request sees at most `2 * BUDGET` agent
deliveries: every reply used up an owed answer, and every owed answer came from budgeted work. -/
theorem deliveries_bounded (t : List Send) : budgetUsed (run empty t).msgs ≤ 2 * BUDGET := by
  have ⟨h1, h2, _⟩ := inv_run empty t inv_empty
  rw [budget_split]
  omega

/-- **Loop termination, counted in messages.** At most `2 * BUDGET` agent messages are accepted
in one request, so after that every agent send is refused and the cascade has stopped. -/
theorem agent_messages_bounded (t : List Send) : agentMessages (run empty t).msgs ≤ 2 * BUDGET := by
  have ⟨_, _, h3⟩ := inv_run empty t inv_empty
  have := deliveries_bounded t
  omega

/-! ## Counterexample: `send_message` replies are not tied to an owed ask -/

/-- Mirrors `route` in `src/lib/tools/messaging.ts`. -/
def routeOk (ms : List Msg) (i : Send) : Bool :=
  match i.replyTo with
  | none => true
  | some r =>
    match ms.find? (·.id == r), i.sender with
    | some m, .agent a =>
      m.to.contains a &&
        (match m.sender with
         | .agent asker => i.to == [asker]
         | .person => false)
    | _, _ => false

/-- What the `send_message` tool accepts: `route` and then `applySend`, with no owed check. -/
def sendMessageStep (ms : List Msg) (i : Send) : List Msg :=
  if accepts ms i && routeOk ms i then mkMsg ms i :: ms else ms

def runSendMessage (ms : List Msg) : List Send → List Msg
  | [] => ms
  | i :: is => runSendMessage (sendMessageStep ms i) is

/-- The k-th reply answers message k - 1, which the other teammate sent. -/
def pingPongReply (k : Nat) : Send :=
  if k % 2 = 1 then ⟨.agent 2, [1], false, some (k - 1)⟩ else ⟨.agent 1, [2], false, some (k - 1)⟩

/-- Teammate 1 asks teammate 2 once, then the two answer each other's last reply. -/
def pingPong (n : Nat) : List Send :=
  ⟨.agent 1, [2], true, none⟩ :: (List.range n).map (fun k => pingPongReply (k + 1))

set_option maxRecDepth 100000 in
/-- **Known gap.** Through `send_message`, two standing teammates can keep replying to each
other's replies: 31 deliveries are accepted in one request, past the `2 * BUDGET` bound that holds
when every reply answers an owed ask. Each reply is exempt from the budget, and `route` only checks
that the replied-to message was sent to you. -/
theorem send_message_replies_unbounded :
    2 * BUDGET < budgetUsed (runSendMessage [] (pingPong 30)) := by decide

end BobFormal.Mailbox
