/-!
# Roadmap stages, one track per request

Models the roadmap in `src/lib/roadmap.ts` with the stages of `src/lib/stages.ts`. Every request has its own
track through the stages, with its own gates and work orders.

What each definition mirrors:
- `STAGE_COUNT`: `STAGES.length`; `MAX_TODAY`: `MAX_TODAY`, per request.
- `Track`: `Track` with its own work orders in today (`ordersOf`). `Roadmap`: `Roadmap.tracks`, by request.
  A request with no track yet is at Intent, as `withTrack` starts it.
- `gateHolds`: `unmetCriteria r requestId` being empty, stage by stage, from the `criteria` in `STAGES`, read
  on `trackView`, so a track's gate sees only its own goal and work orders.
- `Track.goal`: the intent is testable (user, behaviour and acceptance all set).
- Every `Op` names the request it works on. `Op.setGoal`: `setGoal` (refused without a title).
  `Op.setRoadmap`: `setRoadmap`, which only replaces that request's backlog. `Op.setToday`: `setToday` (at most
  `MAX_TODAY`). `Op.updateWorkOrder`: `updateWorkOrder` and `completeWorkOrder` on a work order of that
  request, which the pull request tools also call. `Op.advance`: `advanceStage r requestId`.
- `Track.left` is a ghost field: the stages the track has left, in order.
-/
namespace BobFormal.Roadmap

def STAGE_COUNT : Nat := 5
def MAX_TODAY : Nat := 3

structure WorkOrder where
  done : Bool
  artifact : Bool
  deriving DecidableEq, Repr

structure Track where
  goal : Bool
  stage : Nat
  today : List WorkOrder
  left : List Nat
  deriving Repr

/-- A track per request, by request. -/
def Roadmap := Nat → Track

/-- Mirrors `unmetCriteria r requestId` being empty for the track's current stage. -/
def gateHolds (t : Track) : Bool :=
  match t.stage with
  | 1 => t.goal
  | 2 => t.today.any (!·.done)
  | 3 => !t.today.isEmpty && t.today.all (fun w => w.done || w.artifact)
  | 4 => !t.today.isEmpty && t.today.all (·.done)
  | _ => true

inductive Op where
  | setGoal (req : Nat) (hasTitle : Bool)
  | setRoadmap (req : Nat)
  | setToday (req : Nat) (orders : List WorkOrder)
  | updateWorkOrder (req : Nat) (index : Nat) (done artifact : Bool)
  | advance (req : Nat)
  deriving Repr

/-- The request a call works on. -/
def Op.req : Op → Nat
  | .setGoal k _ => k
  | .setRoadmap k => k
  | .setToday k _ => k
  | .updateWorkOrder k _ _ _ => k
  | .advance k => k

/-- What a call does to its own request's track. -/
def step (t : Track) : Op → Track
  | .setGoal _ ok => if ok then { t with goal := true } else t
  | .setRoadmap _ => t
  | .setToday _ os => if os.length ≤ MAX_TODAY then { t with today := os } else t
  | .updateWorkOrder _ i d a =>
    if i < t.today.length then { t with today := t.today.set i ⟨d, a⟩ } else t
  | .advance _ =>
    if t.stage < STAGE_COUNT && gateHolds t then { t with stage := t.stage + 1, left := t.left ++ [t.stage] }
    else t

/-- A call changes its own request's track and no other. -/
def apply (r : Roadmap) (o : Op) : Roadmap := fun k => if k = o.req then step (r k) o else r k

/-- Mirrors `withTrack`: a new request's track starts at Intent. -/
def Track.empty : Track := ⟨false, 1, [], []⟩

/-- Mirrors `emptyRoadmap`. -/
def empty : Roadmap := fun _ => Track.empty

def run (r : Roadmap) : List Op → Roadmap
  | [] => r
  | o :: os => run (apply r o) os

theorem apply_own (r : Roadmap) (o : Op) : apply r o o.req = step (r o.req) o := by simp [apply]

theorem apply_other (r : Roadmap) (o : Op) (k : Nat) (h : k ≠ o.req) : apply r o k = r k := by simp [apply, h]

theorem step_track (t : Track) (o : Op) :
    (step t o).stage = t.stage ∨
      (∃ k, o = .advance k) ∧ (step t o).stage = t.stage + 1 ∧ gateHolds t = true ∧ t.stage < STAGE_COUNT := by
  cases o with
  | setGoal _ ok => left; simp only [step]; split <;> rfl
  | setRoadmap _ => left; rfl
  | setToday _ os => left; simp only [step]; split <;> rfl
  | updateWorkOrder _ i d a => left; simp only [step]; split <;> rfl
  | advance k =>
    simp only [step]
    split
    · rename_i h
      simp only [Bool.and_eq_true, decide_eq_true_eq] at h
      right; exact ⟨⟨k, rfl⟩, rfl, h.2, h.1⟩
    · left; rfl

/-- **Gate before every advance, per request.** Any call either leaves a request's stage alone, or is
`advanceStage` for that same request, moving its track exactly one stage forward from a stage whose gate holds. -/
theorem step_shape (r : Roadmap) (o : Op) (k : Nat) :
    (apply r o k).stage = (r k).stage ∨
      o = .advance k ∧ (apply r o k).stage = (r k).stage + 1 ∧ gateHolds (r k) = true ∧ (r k).stage < STAGE_COUNT := by
  by_cases hk : k = o.req
  · subst hk
    rw [apply_own]
    rcases step_track (r o.req) o with h | ⟨⟨j, rfl⟩, h1, h2, h3⟩
    · exact Or.inl h
    · exact Or.inr ⟨rfl, h1, h2, h3⟩
  · left; rw [apply_other r o k hk]

/-- **Never goes back.** No call moves any request's track backwards. -/
theorem stage_monotone (r : Roadmap) (o : Op) (k : Nat) : (r k).stage ≤ (apply r o k).stage := by
  rcases step_shape r o k with h | ⟨_, h, _⟩ <;> omega

/-- **Tracks are independent.** A call for one request leaves every other request's track exactly as it was. -/
theorem tracks_independent (r : Roadmap) (o : Op) (k : Nat) (h : k ≠ o.req) : apply r o k = r k :=
  apply_other r o k h

/-- **Only its own gate.** A request whose gate holds moves forward, whatever stage any other request is at. -/
theorem advance_own_gate (r : Roadmap) (k : Nat) (hs : (r k).stage < STAGE_COUNT) (hg : gateHolds (r k) = true) :
    (apply r (.advance k) k).stage = (r k).stage + 1 := by
  rw [show apply r (.advance k) k = step (r k) (.advance k) from apply_own r (.advance k)]
  simp only [step, hs, hg, decide_true, Bool.and_self, ite_true]

/-- 1, 2, ..., n. -/
def upTo : Nat → List Nat
  | 0 => []
  | n + 1 => upTo n ++ [n + 1]

def Inv (t : Track) : Prop := 1 ≤ t.stage ∧ t.stage ≤ STAGE_COUNT ∧ t.left = upTo (t.stage - 1)

theorem inv_step (t : Track) (o : Op) (h : Inv t) : Inv (step t o) := by
  obtain ⟨h1, h2, h3⟩ := h
  cases o with
  | setGoal _ ok => simp only [step]; split <;> exact ⟨h1, h2, h3⟩
  | setRoadmap _ => exact ⟨h1, h2, h3⟩
  | setToday _ os => simp only [step]; split <;> exact ⟨h1, h2, h3⟩
  | updateWorkOrder _ i d a => simp only [step]; split <;> exact ⟨h1, h2, h3⟩
  | advance _ =>
    simp only [step]
    split
    · rename_i hc
      simp only [Bool.and_eq_true, decide_eq_true_eq] at hc
      obtain ⟨k, hk⟩ : ∃ k, t.stage = k + 1 := ⟨t.stage - 1, by omega⟩
      simp only [STAGE_COUNT] at hc h2
      refine ⟨show 1 ≤ t.stage + 1 by omega, show t.stage + 1 ≤ 5 by omega, ?_⟩
      show t.left ++ [t.stage] = upTo (t.stage + 1 - 1)
      simp only [h3, hk, Nat.add_sub_cancel, upTo]
    · exact ⟨h1, h2, h3⟩

theorem inv_apply (r : Roadmap) (o : Op) (h : ∀ k, Inv (r k)) : ∀ k, Inv (apply r o k) := by
  intro k
  by_cases hk : k = o.req
  · subst hk; rw [apply_own]; exact inv_step _ _ (h _)
  · rw [apply_other r o k hk]; exact h k

theorem inv_run (r : Roadmap) (os : List Op) (h : ∀ k, Inv (r k)) : ∀ k, Inv (run r os k) := by
  induction os generalizing r with
  | nil => exact h
  | cons o os ih => exact ih (apply r o) (inv_apply r o h)

/-- **Never skips a stage, per request.** After any sequence of roadmap calls for any requests, the stages each
request's track has left are exactly 1, 2, ..., stage - 1, in order, each once; and its stage stays between 1 and
the last. -/
theorem stages_in_order (os : List Op) (k : Nat) :
    (run empty os k).left = upTo ((run empty os k).stage - 1) ∧
      1 ≤ (run empty os k).stage ∧ (run empty os k).stage ≤ STAGE_COUNT := by
  have ⟨h1, h2, h3⟩ := inv_run empty os (fun _ => by simp [Inv, empty, Track.empty, upTo, STAGE_COUNT]) k
  exact ⟨h3, h1, h2⟩

end BobFormal.Roadmap
