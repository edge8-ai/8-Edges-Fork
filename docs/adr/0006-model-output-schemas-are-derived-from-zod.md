# ADR 0006 — Model output schemas are derived from Zod, and the reply is validated

Date: 2026-09-16. Status: accepted.
Implements the AR-02 rule CLAUDE.md has carried since the 2026-09-02 review —
*"Zod at boundaries (action inputs, webhooks, model output)"* — at the boundary
that was least often honouring it.

## Context

Sixteen modules declared a `json_schema` to the model and then read the reply
back with an unchecked cast:

```
entities/campaigns/lib/writer/model.ts:40
    return { ok: true, data: JSON.parse(out.text) as T };
```

Structured output is a request, not a guarantee. A shape the model got wrong
was written to the database as if it had been checked, and the cast is what
made it look checked.

Two files already did it right — `hiring/resume-screen.ts` and
`hiring/interview-panelist.ts` — and both did it by keeping a hand-written Zod
schema beside the hand-written JSON schema, each labelled *"the runtime mirror
of SCREEN_SCHEMA"*. Two adapters make the seam real rather than hypothetical.
The mirror is the part that had to go: two hand-synced artifacts are the drift,
not the fix.

## Decision

**One Zod schema per call site does both jobs.** It generates the `json_schema`
sent to the model and it validates the reply that comes back.

1. `jsonSchemaFor(schema)` in `kernel/ai/response.ts` derives the wire schema.
   It wraps `z.toJSONSchema` from **`zod/v4`** — a subpath of the installed zod
   3.25.76, not a dependency upgrade — and strips the emitted `$schema` key.
2. `readStructuredOutput(site, model, response, schema)` sits beside
   `readTextOutput` and delegates to it, so usage logging and `stop_reason`
   handling stay in one place and `readTextOutput`'s 38 remaining call sites —
   the streaming, tool-loop and free-text ones, which have no schema — are
   untouched.
3. **A validation failure returns the site's existing failure contract.**
   `{ok:false,error}`, `null`, or the `ai_error` stamp the site already writes.
   No new contract reaches any caller.
4. **A model-output schema is authored with `import { z } from "zod/v4"`.**
   Action inputs and webhooks stay on the classic import. The emitter only
   accepts v4 schema objects; mixing the two versions inside one schema is what
   breaks, and using each in its own file is what the subpath exists for.
5. **No Zod array carries `.min(2+)` or `.max()`.** The structured-output API
   refuses those bounds — `minItems` other than 0 or 1 is a 400 and `maxItems`
   is refused outright. `jsonSchemaFor` throws on the emitted schema rather than
   letting the API answer, because a derived schema is a module-level const and
   the import is a far better place to fail than a request. Counts belong in
   `.describe()`, where the model reads them, and in the server-side check after
   the call, where they are enforced.

## What was rejected

- **A universal `callModel` in the kernel.** Measured against the 19 non-test
  `messages.create` sites, only 12 are plain single-shot structured text. One
  interface covering the rest needs `site`, `tier`, `schema?`, `system?`,
  `user`, `max_tokens`, `effort?`, `thinking?`, `timeout?`, `refusalMessage?`
  and `provider` — eleven parameters, mostly optional, which is a pass-through
  wearing the shape of a deep module. The call assembly stays where it is; only
  the step after the response arrives moved.
- **Keeping the hand-written JSON schema and adding a Zod mirror plus a test
  that the two agree.** This is what `resume-screen.ts` and
  `interview-panelist.ts` did, and it will look reasonable to whoever reads them
  next — which is why it is written down here. It is more code for less safety
  than deriving one from the other.
- **Retrying once on a validation failure**, feeding the error back to the
  model. A real feature with a real cost. `readStructuredOutput` logs
  `ai-schema-violation` so the question "do validation failures actually occur"
  has an answer before that ticket is opened.
- **Normalising the two fail-soft outliers** — `coaching/lib/ai.ts`'s
  `textCompletion`, which throws on a missing key, and `htt/ai/summarize.ts`,
  which hand-rolls its key check. Both are free-text sites with no schema, so
  they are outside this decision. Left alone deliberately.

## Consequences

- **The wire format changes in one visible way, and it was measured.**
  `.nullable()` emits `anyOf: [{type:"X"},{type:"null"}]` where the hand-written
  schemas wrote `type: ["X","null"]`. The two are semantically identical and
  textually different, and no unit test can tell whether the model answers one
  as well as the other — so the pilot ran four live pairs on one interview
  transcript, same model (`claude-sonnet-5`), same input, one call per schema.
  The transcript deliberately leaves one of the four criteria untested, so the
  nullable field — the only field whose spelling differs — is exercised on every
  run. All eight calls returned all seven keys, stopped on `end_turn`, scored
  the three tested criteria identically, and emitted `null` for the untested
  one. Overall score ranged 3.6–4.0 across both schemas, which is sampling
  variance and not a difference between them. The `anyOf` form is what ships.
  If it ever regresses, the escape hatch is a rewrite inside `jsonSchemaFor`:
  one Zod artifact, the old wire format.
- **A transcription slip is the real risk, and a machine checks it.** Fourteen
  of the sixteen schemas were hand-transcribed from an existing JSON schema, and
  a slip yields a schema that is valid but wrong — which a golden snapshot
  cannot catch, because a snapshot pins what the Zod emits and not that the Zod
  says what was there before. Each converted site therefore keeps its deleted
  hand-written schema in its test file and asserts the derived one equals it
  through `canonicalSchema` in `kernel/ai/testing/schema-equivalence.ts`, which
  normalises the one known difference and nothing else.
- **`zodIssuesToMessage` became structural.** Its parameter is now
  `{ path, message }[]` rather than classic zod's `ZodIssue[]`, so both zod
  imports satisfy it. It reads nothing else from an issue.
- **`kernel/ai/testing/fake-message.ts` exists.** The repo's only shared model
  fake covered the streaming loop, so every test that faked a single-shot call
  rolled its own object literal. There is now one.
- **Absence of failure is not evidence of safety here.** Twelve of the sixteen
  sites have no test at all, so "the existing suites pass unchanged" was cheap
  to honour. The equivalence assertions, not the suites, are what make the
  sweep reviewable.
