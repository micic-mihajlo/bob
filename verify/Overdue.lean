namespace Overdue

inductive Status where
  | draft | sent | paid
  deriving DecidableEq

/-- An invoice as overdueInvoices reads it: its status, and its due date as a day number. -/
structure Invoice where
  status : Status
  due : Nat

/-- The model of overdueInvoices before sorting: sent, and due strictly before today. -/
def overdue (l : List Invoice) (today : Nat) : List Invoice :=
  l.filter (fun i => i.status = .sent ∧ i.due < today)

/-- Everything it returns is sent and past due. -/
theorem overdue_sound (l : List Invoice) (today : Nat) :
    ∀ i ∈ overdue l today, i.status = .sent ∧ i.due < today := by
  intro i h
  simp [overdue, List.mem_filter] at h
  exact h.2

/-- Every sent invoice past due comes back. -/
theorem overdue_complete (l : List Invoice) (today : Nat) :
    ∀ i ∈ l, i.status = .sent → i.due < today → i ∈ overdue l today := by
  intro i h hs hd
  simp [overdue, List.mem_filter, h, hs, hd]

/-- An invoice due today is not overdue yet. -/
theorem due_today_not_overdue (l : List Invoice) (today : Nat) :
    ∀ i ∈ overdue l today, i.due ≠ today := by
  intro i h
  have := (overdue_sound l today i h).2
  omega

end Overdue
