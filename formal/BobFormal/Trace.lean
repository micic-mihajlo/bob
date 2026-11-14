/-!
# Traceability

Models the `causedBy` links that `traceWhy` in `src/lib/why.ts` follows.

What each definition mirrors:
- `Msg`: `Message` in `src/lib/types.ts` (its id, whether a person sent it, `causedBy`).
- `Send.person`: `postUserMessage` and `decideApproval` in `src/lib/actions.ts`, which send with
  `causedBy: null`.
- `Send.agent c`: every agent send. Its cause is the turn's first message (`executeMove` in
  `src/lib/turns.ts` uses `t.messageIds[0]`, and `planTurn` never starts a turn without
  messages), the message being answered (`applyDecision` in `src/lib/relay.ts`), or the owed ask
  (`report` in `src/lib/tools/report.ts`). All three are messages that already exist; the model
  refuses any other cause, and the conformance tests check the real loop keeps to this.
-/
namespace BobFormal.Trace

structure Msg where
  id : Nat
  fromPerson : Bool
  causedBy : Option Nat
  deriving Repr

inductive Send where
  | person
  | agent (cause : Nat)

def step (ms : List Msg) : Send → List Msg
  | .person => ⟨ms.length, true, none⟩ :: ms
  | .agent c => if ms.any (·.id == c) then ⟨ms.length, false, some c⟩ :: ms else ms

def run (ms : List Msg) : List Send → List Msg
  | [] => ms
  | s :: ss => run (step ms s) ss

def Inv (ms : List Msg) : Prop :=
  (∀ m ∈ ms, m.id < ms.length) ∧
  ∀ m ∈ ms, (m.causedBy = none → m.fromPerson = true) ∧
    ∀ c, m.causedBy = some c → c < m.id ∧ ∃ p ∈ ms, p.id = c

theorem inv_step (ms : List Msg) (s : Send) (h : Inv ms) : Inv (step ms s) := by
  obtain ⟨hid, hc⟩ := h
  cases s with
  | person =>
    simp only [step]
    refine ⟨?_, ?_⟩
    · intro m hm
      rcases List.mem_cons.mp hm with rfl | hm
      · simp
      · have := hid m hm; simp; omega
    · intro m hm
      rcases List.mem_cons.mp hm with rfl | hm
      · simp
      · obtain ⟨h1, h2⟩ := hc m hm
        refine ⟨h1, fun c hcm => ?_⟩
        obtain ⟨hlt, p, hp, hpc⟩ := h2 c hcm
        exact ⟨hlt, p, List.mem_cons_of_mem _ hp, hpc⟩
  | agent c =>
    simp only [step]
    split
    · rename_i hex
      simp only [List.any_eq_true, beq_iff_eq] at hex
      obtain ⟨p, hp, hpc⟩ := hex
      refine ⟨?_, ?_⟩
      · intro m hm
        rcases List.mem_cons.mp hm with rfl | hm
        · simp
        · have := hid m hm; simp; omega
      · intro m hm
        rcases List.mem_cons.mp hm with rfl | hm
        · refine ⟨by simp, fun c' hc' => ?_⟩
          simp only [Option.some.injEq] at hc'
          subst hc'
          exact ⟨hpc ▸ hid p hp, p, List.mem_cons_of_mem _ hp, hpc⟩
        · obtain ⟨h1, h2⟩ := hc m hm
          refine ⟨h1, fun c' hcm => ?_⟩
          obtain ⟨hlt, q, hq, hqc⟩ := h2 c' hcm
          exact ⟨hlt, q, List.mem_cons_of_mem _ hq, hqc⟩
    · exact ⟨hid, hc⟩

theorem inv_run (ms : List Msg) (ss : List Send) (h : Inv ms) : Inv (run ms ss) := by
  induction ss generalizing ms with
  | nil => exact h
  | cons s ss ih => exact ih (step ms s) (inv_step ms s h)

/-- The message's `causedBy` chain reaches a message a person sent. -/
inductive Traces (ms : List Msg) : Msg → Prop where
  | person (m : Msg) : m.fromPerson = true → m.causedBy = none → Traces ms m
  | caused (m p : Msg) : m.causedBy = some p.id → p ∈ ms → Traces ms p → Traces ms m

theorem traces_of_inv (ms : List Msg) (h : Inv ms) : ∀ n, ∀ m ∈ ms, m.id = n → Traces ms m := by
  intro n
  induction n using Nat.strongRecOn with
  | ind n ih =>
    intro m hm hid
    cases hc : m.causedBy with
    | none => exact Traces.person m ((h.2 m hm).1 hc) hc
    | some c =>
      obtain ⟨hlt, p, hp, hpc⟩ := (h.2 m hm).2 c hc
      exact Traces.caused m p (by rw [hc, hpc]) hp (ih c (by omega) p hp hpc)

/-- **Traceability.** In any history, every message's `causedBy` chain ends at a message a person
sent. No message is an orphan. -/
theorem every_message_traces_to_person (ss : List Send) :
    ∀ m ∈ run [] ss, Traces (run [] ss) m := by
  have h := inv_run [] ss (by simp [Inv])
  intro m hm
  exact traces_of_inv _ h m.id m hm rfl

/-- `a` is a cause of `m`, directly or through other messages. -/
inductive Ancestor (ms : List Msg) : Msg → Msg → Prop where
  | parent (a m : Msg) : m ∈ ms → m.causedBy = some a.id → Ancestor ms a m
  | trans (a b m : Msg) : Ancestor ms a b → Ancestor ms b m → Ancestor ms a m

theorem ancestor_older (ms : List Msg) (h : Inv ms) (a m : Msg) (hm : Ancestor ms a m) : a.id < m.id := by
  induction hm with
  | parent a m hm hc => exact ((h.2 m hm).2 a.id hc).1
  | trans _ _ _ _ _ ih1 ih2 => omega

/-- **No cycles.** No message is its own cause, however far back you follow `causedBy`, so
`traceWhy` never revisits a message. -/
theorem no_causal_cycles (ss : List Send) (m : Msg) : ¬ Ancestor (run [] ss) m m := by
  intro hm
  have := ancestor_older _ (inv_run [] ss (by simp [Inv])) m m hm
  omega

end BobFormal.Trace
