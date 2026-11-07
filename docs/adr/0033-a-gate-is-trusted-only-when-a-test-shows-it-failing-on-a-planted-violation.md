# ADR 0033 — A gate is trusted only when a test shows it failing on a planted violation

Date: 2026-10-29. Status: proposed.

Both architects of the 29 October review found the dead half of `check:portability`
independently, and both named the missing rule.

## Context

The architecture is enforced by gates that read source text. ADRs 0004, 0005, 0018, 0029 and
0031 each rest on one: a rule in an ADR is a constraint only while its gate fires. `scripts/`
holds 26 `check-*.mjs` gates.

- 23 of them have a test file beside them.
- Three have none: `check-access`, `check-crons` and `check-entity-layers-walk`.

A gate can be wrong while its tests pass, and one is:

- `check-portability.mjs:1-3` says it fails a portable file that reads a table that does not
  ship, and it defines `internalTables()` at line 193. No entry point calls that helper, and no
  test names it.
- `scripts/portability-baseline.json` is empty, while two portable files read `htt`
  (`team/lib/hub-program-prs.ts:69`, `portal/lib/program-hub.ts:255`).

Everyone reading the header, including the first draft of ADR 0031, took the claim as fact.

A gate's header is a promise. A test of a helper proves the helper. Only a run of the gate's
entry point over a tree with a known violation proves the promise.

## Decision

1. **Every gate has a "fires" test.**
   - The test builds a small fixture tree that holds one planted violation for each rule the
     gate's header claims.
   - It runs the gate's entry point over that tree, not an exported helper. It asserts that
     the gate exits non-zero and names the violation.
   - It runs the same entry point over a clean twin of the tree and asserts that it passes.
2. **A rule in a gate's header without a "fires" test is not a rule.** Either the test is
   written, or the sentence leaves the header. Blind spots stay in the header as blind spots.
3. **An ADR that relies on a gate names the gate and its "fires" test.** An ADR that relies on
   a gate with no such test says so, and lists the test as a prerequisite.
4. **The three untested gates get tests first. `check-portability`'s table half is then built,
   or its claim removed.**

## Alternatives rejected

- **Unit tests of each gate's helpers, as now.** They pass while the entry point never calls the
  helper. That is the failure this ADR exists for.
- **Replace the text gates with types or a module system.** ADR 0004 chose generated text gates
  because the boundaries are between folders that TypeScript treats as one program. That
  reason holds.
- **Review instead of tests.** Two readers in a row took `check-portability`'s header on trust.

## Consequences

- Writing a gate costs one fixture tree more than before.
- `npm run check` grows by the fixture runs, which are small trees, not the repository.
- ADRs 0029 and 0031 list their gates' "fires" tests as prerequisites.

## What would reopen it

A gate that cannot be run on a fixture tree, because it reads production or the network. Such a
gate (`types-fresh`, `fork-schema-fresh`) is proven by a planted difference in its input instead.
The rule is the same; only the fixture changes.
