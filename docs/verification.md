# Verification gate

Every pull request that changes source code passes a verification gate before the person can approve its merge. A build thread runs `verify_change` once its tests pass; a reviewer can run it again on the same branch. The result is recorded against the git tree it checked, and a pull request is covered only when its head's tree is that tree, so any later change needs a new run.

## The four tiers

1. **Contract.** `verify/<work order id>.json` names the work order's acceptance check, the properties file, and one entry per property with the criterion it checks:

   ```json
   {
     "acceptance": "a test shows one row per invoice",
     "propertiesFile": "src/csv.properties.test.ts",
     "properties": [{ "name": "one row per invoice", "criterion": "one row per invoice" }],
     "lean": {
       "file": "verify/Csv.lean",
       "theorems": ["Csv.unescape_escape"],
       "conformance": { "lean": "Csv.cell", "module": "src/csv.ts", "export": "csvCell", "inputs": ["Smith, Jones"] }
     }
   }
   ```

2. **Properties.** Each property is one vitest `it()` named as in the contract, calling `fc.assert(fc.property(...))` from fast-check. Bob loads a setup file that fixes the seed (derived from the tree, so a rerun reproduces it) and 300 runs per property, and records each property's runs and counterexample. A counterexample fails the gate and comes back to the thread as a finding with the seed and replay path.

3. **Mutants.** Every changed line of every changed source file (tests, configs and `verify/` excluded) is mutated: flipped comparisons and logic, off-by-one comparisons and numbers, swapped arithmetic, negated `if` conditions, and dropped calls such as `.replace()`, `.sort()` or `.toFixed()`. Strings, template text, regular expressions and comments are never mutated. Each mutant runs the whole suite, properties included, in a throwaway copy of the workspace, four at a time, after a baseline run proves the unmutated suite passes. A mutant that survives fails the gate and becomes a finding.

4. **Lean proof, best effort.** When the contract names a Lean model, Bob builds it with `lake build` after the call returns, fails it on any `sorry`, audits every listed theorem with `#print axioms` (only `propext`, `Classical.choice` and `Quot.sound` are allowed), and runs the conformance inputs through both the Lean function and the TypeScript export, which must agree. The line says "proved in Lean" only when all of that holds, "not proved in Lean: <reason>" otherwise, and "Lean skipped: Lean not installed" when there is no `lake` (`BOB_LAKE`, the PATH, or `~/.elan/bin`). Tier 4 never blocks the merge.

## Where it shows

- The pull request's trace block has a `- Verification:` line, and the approval card a Verification row, such as `4 properties · 1,200 cases · 8/8 mutants killed · proved in Lean`. Both update when the proof finishes.
- `request_approval` and `merge_pull_request` refuse a pull request with source changes until tiers 1 to 3 pass on its head.
- The gate needs the project's dependencies (vitest and fast-check), so it is off when Bob does not install them (`installDeps`, off under Bob's own tests) or with `BOB_VERIFY=off`.

