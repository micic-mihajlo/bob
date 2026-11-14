/-!
# Roadmap stages

Models the roadmap in `src/lib/roadmap.ts` with the stages of `src/lib/stages.ts`.

What each definition mirrors:
- `STAGE_COUNT`: `STAGES.length`; `MAX_TODAY`: `MAX_TODAY`.
- `gateHolds`: `unmetCriteria r` being empty, stage by stage, from the `criteria` in `STAGES`.
- `Op.setGoal`: `setGoal` (refused without a title). `Op.setRoadmap`: `setRoadmap`, which only
  replaces the backlog. `Op.setToday`: `setToday` (at most `MAX_TODAY`). `Op.updateWorkOrder`:
  `updateWorkOrder` and `completeWorkOrder`, which the pull request tools also call.
  `Op.advance`: `advanceStage`.
- `Roadmap.left` is a ghost field: the stages the roadmap has left, in order.
-/
namespace BobFormal.Roadmap

def STAGE_COUNT : Nat := 5
def MAX_TODAY : Nat := 3

structure WorkOrder where
  done : Bool
  artifact : Bool
  deriving DecidableEq, Repr

structure Roadmap where
  goal : Bool
  stage : Nat
  today : List WorkOrder
  left : List Nat
  deriving Repr

/-- Mirrors `unmetCriteria r` being empty for the current stage. -/
def gateHolds (r : Roadmap) : Bool :=
  match r.stage with
  | 1 => r.goal
  | 2 => !r.today.isEmpty
  | 3 => !r.today.isEmpty && r.today.all (·.done)
  | 4 => !r.today.isEmpty && r.today.all (·.artifact)
  | _ => true

inductive Op where
  | setGoal (hasTitle : Bool)
  | setRoadmap
  | setToday (orders : List WorkOrder)
  | updateWorkOrder (index : Nat) (done artifact : Bool)
  | advance
  deriving Repr

def apply (r : Roadmap) : Op → Roadmap
  | .setGoal ok => if ok then { r with goal := true } else r
  | .setRoadmap => r
  | .setToday os => if os.length ≤ MAX_TODAY then { r with today := os } else r
  | .updateWorkOrder i d a =>
    if i < r.today.length then { r with today := r.today.set i ⟨d, a⟩ } else r
  | .advance =>
    if r.stage < STAGE_COUNT && gateHolds r then { r with stage := r.stage + 1, left := r.left ++ [r.stage] }
    else r

/-- Mirrors `emptyRoadmap`. -/
def empty : Roadmap := ⟨false, 1, [], []⟩

def run (r : Roadmap) : List Op → Roadmap
  | [] => r
  | o :: os => run (apply r o) os

/-- **Gate before every advance.** Any call either leaves the stage alone, or is `advanceStage`
moving exactly one stage forward from a stage whose gate holds. -/
theorem step_shape (r : Roadmap) (o : Op) :
    (apply r o).stage = r.stage ∨
      o = .advance ∧ (apply r o).stage = r.stage + 1 ∧ gateHolds r = true ∧ r.stage < STAGE_COUNT := by
  cases o with
  | setGoal ok => left; simp only [apply]; split <;> rfl
  | setRoadmap => left; rfl
  | setToday os => left; simp only [apply]; split <;> rfl
  | updateWorkOrder i d a => left; simp only [apply]; split <;> rfl
  | advance =>
    simp only [apply]
    split
    · rename_i h
      simp only [Bool.and_eq_true, decide_eq_true_eq] at h
      right; exact ⟨trivial, rfl, h.2, h.1⟩
    · left; rfl

/-- **Never goes back.** -/
theorem stage_monotone (r : Roadmap) (o : Op) : r.stage ≤ (apply r o).stage := by
  rcases step_shape r o with h | ⟨_, h, _⟩ <;> omega

/-- 1, 2, ..., n. -/
def upTo : Nat → List Nat
  | 0 => []
  | n + 1 => upTo n ++ [n + 1]

def Inv (r : Roadmap) : Prop := 1 ≤ r.stage ∧ r.stage ≤ STAGE_COUNT ∧ r.left = upTo (r.stage - 1)

theorem inv_step (r : Roadmap) (o : Op) (h : Inv r) : Inv (apply r o) := by
  obtain ⟨h1, h2, h3⟩ := h
  cases o with
  | setGoal ok => simp only [apply]; split <;> exact ⟨h1, h2, h3⟩
  | setRoadmap => exact ⟨h1, h2, h3⟩
  | setToday os => simp only [apply]; split <;> exact ⟨h1, h2, h3⟩
  | updateWorkOrder i d a => simp only [apply]; split <;> exact ⟨h1, h2, h3⟩
  | advance =>
    simp only [apply]
    split
    · rename_i hc
      simp only [Bool.and_eq_true, decide_eq_true_eq] at hc
      obtain ⟨k, hk⟩ : ∃ k, r.stage = k + 1 := ⟨r.stage - 1, by omega⟩
      simp only [STAGE_COUNT] at hc h2
      refine ⟨show 1 ≤ r.stage + 1 by omega, show r.stage + 1 ≤ 5 by omega, ?_⟩
      show r.left ++ [r.stage] = upTo (r.stage + 1 - 1)
      simp only [h3, hk, Nat.add_sub_cancel, upTo]
    · exact ⟨h1, h2, h3⟩

theorem inv_run (r : Roadmap) (os : List Op) (h : Inv r) : Inv (run r os) := by
  induction os generalizing r with
  | nil => exact h
  | cons o os ih => exact ih (apply r o) (inv_step r o h)

/-- **Never skips a stage.** After any sequence of roadmap calls, the stages left so far are exactly
1, 2, ..., stage - 1, in order, each once; and the stage stays between 1 and the last. -/
theorem stages_in_order (os : List Op) :
    (run empty os).left = upTo ((run empty os).stage - 1) ∧
      1 ≤ (run empty os).stage ∧ (run empty os).stage ≤ STAGE_COUNT := by
  have ⟨h1, h2, h3⟩ := inv_run empty os (by simp [Inv, empty, upTo, STAGE_COUNT])
  exact ⟨h3, h1, h2⟩

end BobFormal.Roadmap
