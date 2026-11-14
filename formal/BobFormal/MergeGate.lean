/-!
# Merge gate

Models the pull request and approval records and the four calls that touch them.

What each definition mirrors:
- `Ev.openPR`: `openPullRequestTool` / `upsertPullRequest` in `src/lib/tools/pull-requests.ts`.
  A second call on the same branch updates the open pull request's head in place; a merged one is
  never reopened (a new branch makes a new pull request, which the model gives a new id).
- `Ev.review`: `recordReview` in `src/lib/tools/pull-requests.ts`. It changes only the pull
  request artifact's display status, never an approval, so the model leaves the gate state alone.
- `Ev.requestApproval`: `requestApproval` in `src/lib/tools/work.ts`.
- `Ev.decide`: `decideApproval` in `src/lib/actions.ts`, reached only from the person's
  route `src/app/api/approvals/[id]/route.ts`. No agent tool calls it.
- `Ev.merge`: `mergePullRequestTool` with `approvalRefusal` and `markMerged`.
- `Approval.headShown` is a ghost field: the head the pull request had when the person was asked.
  Bob does not store it; the model keeps it only to state the head property.
-/
namespace BobFormal.MergeGate

inductive Status where
  | pending
  | approved
  | denied
  deriving DecidableEq, Repr

structure PR where
  id : Nat
  head : Nat
  merged : Bool
  deriving DecidableEq, Repr

structure Approval where
  id : Nat
  pr : Nat
  status : Status
  headShown : Nat
  deriving DecidableEq, Repr

structure St where
  prs : List PR
  approvals : List Approval
  /-- (pull request, head) for every merge that happened, in order. -/
  merges : List (Nat × Nat)
  deriving Repr

inductive Ev where
  | openPR (pr head : Nat)
  | review (pr : Nat) (approve : Bool)
  | requestApproval (approval pr : Nat)
  | decide (approval : Nat) (approve : Bool)
  | merge (pr : Nat)
  deriving DecidableEq, Repr

def init : St := ⟨[], [], []⟩

def findPR (s : St) (p : Nat) : Option PR := s.prs.find? (·.id == p)

/-- Mirrors `approvalRefusal` returning null: some approval for this exact pull request is approved. -/
def gateOpen (s : St) (p : Nat) : Bool :=
  s.approvals.any (fun a => a.pr == p && a.status == .approved)

def apply (s : St) : Ev → St
  | .openPR p h =>
    match findPR s p with
    | none => { s with prs := ⟨p, h, false⟩ :: s.prs }
    | some pr =>
      if pr.merged then s
      else { s with prs := s.prs.map (fun x => if x.id == p then { x with head := h } else x) }
  | .review _ _ => s
  | .requestApproval a p =>
    match findPR s p with
    | none => s
    | some pr =>
      if pr.merged || s.approvals.any (fun x => x.pr == p && x.status == .pending) then s
      else { s with approvals := ⟨a, p, .pending, pr.head⟩ :: s.approvals }
  | .decide a yes =>
    { s with approvals := s.approvals.map (fun x =>
        if x.id == a && x.status == .pending then { x with status := if yes then .approved else .denied }
        else x) }
  | .merge p =>
    match findPR s p with
    | none => s
    | some pr =>
      if !gateOpen s p then s
      else if pr.merged then s
      else { s with
        prs := s.prs.map (fun x => if x.id == p then { x with merged := true } else x),
        merges := s.merges ++ [(p, pr.head)] }

/-- States reachable from the seed by any sequence of calls, with the calls that led there. -/
inductive Reach : List Ev → St → Prop where
  | init : Reach [] init
  | step : Reach evs s → Reach (evs ++ [e]) (apply s e)

/-- Approved approvals stay approved: `decideApproval` only decides pending ones. -/
theorem approved_stays (s : St) (e : Ev) (a : Approval) (ha : a ∈ s.approvals) (hs : a.status = .approved) :
    ∃ b ∈ (apply s e).approvals, b.id = a.id ∧ b.pr = a.pr ∧ b.status = .approved := by
  cases e with
  | openPR p h =>
    simp only [apply]
    split
    · exact ⟨a, ha, rfl, rfl, hs⟩
    · split <;> exact ⟨a, ha, rfl, rfl, hs⟩
  | review => exact ⟨a, ha, rfl, rfl, hs⟩
  | requestApproval x p =>
    simp only [apply]
    split
    · exact ⟨a, ha, rfl, rfl, hs⟩
    · split
      · exact ⟨a, ha, rfl, rfl, hs⟩
      · exact ⟨a, List.mem_cons_of_mem _ ha, rfl, rfl, hs⟩
  | decide x yes =>
    refine ⟨a, ?_, rfl, rfl, hs⟩
    simp only [apply, List.mem_map]
    exact ⟨a, ha, by simp [hs]⟩
  | merge p =>
    simp only [apply]
    split
    · exact ⟨a, ha, rfl, rfl, hs⟩
    · split
      · exact ⟨a, ha, rfl, rfl, hs⟩
      · split
        · exact ⟨a, ha, rfl, rfl, hs⟩
        · exact ⟨a, ha, rfl, rfl, hs⟩

/-- The gate invariant: every merge so far has an approved approval for that exact pull request. -/
def GateInv (s : St) : Prop :=
  ∀ m ∈ s.merges, ∃ a ∈ s.approvals, a.pr = m.1 ∧ a.status = .approved

theorem merge_approvals (s : St) (p : Nat) : (apply s (.merge p)).approvals = s.approvals := by
  simp only [apply]
  split
  · rfl
  · split
    · rfl
    · split <;> rfl

theorem merges_other (s : St) (e : Ev) (he : ∀ p, e ≠ .merge p) : (apply s e).merges = s.merges := by
  cases e with
  | openPR p h =>
    simp only [apply]
    split
    · rfl
    · split <;> rfl
  | review => rfl
  | requestApproval x p =>
    simp only [apply]
    split
    · rfl
    · split <;> rfl
  | decide => rfl
  | merge p => exact absurd rfl (he p)

theorem gate_step (s : St) (e : Ev) (h : GateInv s) : GateInv (apply s e) := by
  intro m hm
  have keep : m ∈ s.merges → ∃ a ∈ (apply s e).approvals, a.pr = m.1 ∧ a.status = .approved := by
    intro hm'
    obtain ⟨a, ha, hp, hs⟩ := h m hm'
    obtain ⟨b, hb, _, hbp, hbs⟩ := approved_stays s e a ha hs
    exact ⟨b, hb, hbp.trans hp, hbs⟩
  cases e with
  | merge p =>
    rw [merge_approvals]
    cases hf : findPR s p with
    | none => simp only [apply, hf] at hm; exact h m hm
    | some pr =>
      by_cases hg : gateOpen s p = true
      · by_cases hmg : pr.merged = true
        · simp only [apply, hf, hg, hmg] at hm; exact h m hm
        · simp only [apply, hf, hg, hmg] at hm
          simp at hm
          rcases hm with hm | rfl
          · exact h m hm
          · simp only [gateOpen, List.any_eq_true, Bool.and_eq_true, beq_iff_eq] at hg
            obtain ⟨a, ha, hp, hs⟩ := hg
            exact ⟨a, ha, hp, hs⟩
      · simp only [apply, hf, hg] at hm; simp at hm; exact h m hm
  | openPR p h' => exact keep (by rwa [merges_other _ _ (by intro q; simp)] at hm)
  | review => exact keep hm
  | requestApproval x p => exact keep (by rwa [merges_other _ _ (by intro q; simp)] at hm)
  | decide x yes => exact keep hm

/-- **Merge gate safety.** In every reachable state, each pull request that was merged has an
approval for that exact pull request that is approved. -/
theorem merge_needs_approval (evs : List Ev) (s : St) (h : Reach evs s) : GateInv s := by
  induction h with
  | init => intro m hm; simp [init] at hm
  | step _ ih => exact gate_step _ _ ih

/-- Only the person's decision makes an approval approved. -/
def PersonInv (evs : List Ev) (s : St) : Prop :=
  ∀ a ∈ s.approvals, a.status = .approved → Ev.decide a.id true ∈ evs

theorem person_step (evs : List Ev) (s : St) (e : Ev) (h : PersonInv evs s) :
    PersonInv (evs ++ [e]) (apply s e) := by
  intro a ha hs
  have old : a ∈ s.approvals → Ev.decide a.id true ∈ evs ++ [e] := fun h' =>
    List.mem_append_left _ (h a h' hs)
  cases e with
  | openPR p h' =>
    apply old; simp only [apply] at ha; split at ha
    · exact ha
    · split at ha <;> exact ha
  | review => exact old ha
  | requestApproval x p =>
    simp only [apply] at ha
    split at ha
    · exact old ha
    · split at ha
      · exact old ha
      · rcases List.mem_cons.mp ha with rfl | ha
        · simp at hs
        · exact old ha
  | decide x yes =>
    simp only [apply, List.mem_map] at ha
    obtain ⟨b, hb, rfl⟩ := ha
    by_cases hc : (b.id == x && b.status == .pending) = true
    · simp only [hc, ↓reduceIte] at hs ⊢
      simp only [Bool.and_eq_true, beq_iff_eq] at hc
      cases yes
      · simp at hs
      · simp only [hc.1]; exact List.mem_append_right _ (List.mem_singleton.mpr rfl)
    · simp only [Bool.not_eq_true] at hc
      simp only [hc, Bool.false_eq_true, ↓reduceIte] at hs ⊢
      exact List.mem_append_left _ (h b hb hs)
  | merge p =>
    apply old; simp only [apply] at ha; split at ha
    · exact ha
    · split at ha
      · exact ha
      · split at ha <;> exact ha

/-- **The approval is the person's.** Every approved approval in a reachable state was approved by
a person's decision (`decideApproval`) somewhere in the history. -/
theorem approved_by_person (evs : List Ev) (s : St) (h : Reach evs s) : PersonInv evs s := by
  induction h with
  | init => intro a ha; simp [init] at ha
  | step _ ih => exact person_step _ _ _ ih

/-- **Merge gate, end to end.** A merged pull request has an approval for it that a person approved. -/
theorem merge_traces_to_person (evs : List Ev) (s : St) (h : Reach evs s) :
    ∀ m ∈ s.merges, ∃ a ∈ s.approvals, a.pr = m.1 ∧ Ev.decide a.id true ∈ evs := by
  intro m hm
  obtain ⟨a, ha, hp, hs⟩ := merge_needs_approval evs s h m hm
  exact ⟨a, ha, hp, approved_by_person evs s h a ha hs⟩

/-! ## Counterexample: the approval does not pin the head -/

/-- Open #1 at head 10, ask, the person approves, the build thread re-opens #1 at head 11, merge. -/
def headSwap : List Ev :=
  [.openPR 1 10, .requestApproval 7 1, .decide 7 true, .openPR 1 11, .merge 1]

def runEvs (evs : List Ev) : St := evs.foldl apply init

theorem reach_append (evs pre : List Ev) (s : St) (h : Reach pre s) :
    Reach (pre ++ evs) (evs.foldl apply s) := by
  induction evs generalizing pre s with
  | nil => simpa using h
  | cons e es ih =>
    have := ih (pre ++ [e]) (apply s e) (Reach.step h)
    simpa [List.append_assoc] using this

theorem reach_foldl (evs : List Ev) : Reach evs (runEvs evs) := by
  simpa [runEvs] using reach_append evs [] init Reach.init

/-- **Known gap.** A reachable history merges head 11 of #1 although the only approval for #1 was
shown head 10. `approvalRefusal` checks the pull request id, not its head, and
`upsertPullRequest` moves the head of an approved pull request without resetting its approval. -/
theorem approval_does_not_pin_head :
    ∃ evs s, Reach evs s ∧ (1, 11) ∈ s.merges ∧ ∀ a ∈ s.approvals, a.pr = 1 → a.headShown ≠ 11 :=
  ⟨headSwap, runEvs headSwap, reach_foldl headSwap, by decide, by decide⟩

end BobFormal.MergeGate
