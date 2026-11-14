namespace Csv

/-- Doubles every quote, as csvCell does with value.replace(/"/g, '""'). -/
def escape : List Char → List Char
  | [] => []
  | c :: cs => if c = '"' then '"' :: '"' :: escape cs else c :: escape cs

/-- Reads a doubled quote back as one. -/
def unescape : List Char → List Char
  | [] => []
  | [c] => [c]
  | c :: d :: cs => if c = '"' ∧ d = '"' then '"' :: unescape cs else c :: unescape (d :: cs)

theorem unescape_cons (c : Char) (l : List Char) (h : c ≠ '"') : unescape (c :: l) = c :: unescape l := by
  cases l with
  | nil => rfl
  | cons d ds => simp [unescape, h]

/-- Escaping loses nothing: reading the escaped text back gives the original characters. -/
theorem unescape_escape (s : List Char) : unescape (escape s) = s := by
  induction s with
  | nil => rfl
  | cons c cs ih =>
    by_cases h : c = '"'
    · subst h; simp [escape, unescape, ih]
    · simp [escape, h, unescape_cons _ _ h, ih]

def needsQuotes (s : String) : Bool := s.any (fun c => c == ',' || c == '"' || c == '\n')

/-- The model of csvCell. -/
def cell (s : String) : String :=
  if needsQuotes s then "\"" ++ String.ofList (escape s.toList) ++ "\"" else s

end Csv
