namespace FormatTime

/-- Two digits for a part that follows a larger unit, so the number keeps its width. -/
def pad2 (n : Nat) : String :=
  if n < 10 then "0" ++ toString n else toString n

/-- "45s" under a minute, "3m 05s" under an hour, else "1h 02m", from whole seconds. -/
def formatElapsed (seconds : Nat) : String :=
  if seconds < 60 then
    toString seconds ++ "s"
  else if seconds < 3600 then
    toString (seconds / 60) ++ "m " ++ pad2 (seconds % 60) ++ "s"
  else
    toString (seconds / 3600) ++ "h " ++ pad2 ((seconds / 60) % 60) ++ "m"

/-- 45 seconds shows as "45s". -/
theorem formatElapsed_seconds : formatElapsed 45 = "45s" := by decide

/-- 3 minutes 5 seconds shows as "3m 05s". -/
theorem formatElapsed_minutes : formatElapsed 185 = "3m 05s" := by decide

/-- 1 hour 2 minutes shows as "1h 02m". -/
theorem formatElapsed_hours : formatElapsed 3720 = "1h 02m" := by decide

end FormatTime
