# ADR 0015 — Multi-step routines are tick-driven state machines; Workflow is the escape hatch

Date: 2026-10-08. Status: accepted.

Records decision Y.81, taken by Khoa on 7 October 2026 with the other five decisions of the
Automation Plan's Part G (G9: "yes to all six"), and built as card Y.12. The plan card that
preceded it (Y.12 as first written) was a spike of Vercel Workflow, so a future reader who
finds Workflow GA and well supported will otherwise re-propose it without the reasons it lost.

## Context

Two routines take more than one step: the writer agent (ten steps, from draft to channels) and
the weekly letter agent (gather to validate). Five planned chains (hiring, call to proposal,
inquiry to lead, weekly client status, meeting to actions) will wait on people for days. The
other 41 scheduled routines are single-step sweeps.

Until Y.12 the two agents chained themselves: after a passing step, the run POSTed the next step
to the app's own URL with the cron secret (entities/campaigns/lib/run-loop.ts, `kick`). In the
writer's first real run one hand-off of six never arrived, with nothing logged on either side,
and writer-schedule grew an hourly re-arm loop to find runs that had stopped. The letter's
assemble step called the app's own pages the same way and hit a 508 (Y.75). G0 of the plan
lists eleven failures between 28 September and 7 October; none was a lost durable state, and
two were self-HTTP.

Four ways to wake the next step were weighed (plan G2):

- **A. Vercel Workflow** (GA, v5): replay, per-step retries, hooks that wait for free. Against
  it here: it generates routes into `app/.well-known/workflow/` and discovers workflows by
  scanning `app/` route files, while our `app/` is itself generated from the entities
  (`gen:app-mounts`), so the two generators would have to learn about each other; its compiler
  pass has a recorded memory incident (about 16 times) on a large Next app, and our build
  already runs near Vercel's 8 GB (B.17); an in-flight run is pinned to the deployment that
  started it, and we merge dozens of times a day.
- **B. pgmq in our Postgres**: a queue we do not need at this volume, triggered by pg_cron and
  pg_net calling back into Vercel, which is the self-HTTP shape again, on an alpha product.
- **C. Vercel Queues**: cannot hold a wait longer than seven days, so approvals need a table
  anyway.
- **D. A tick-driven state machine**: the run's step already lives in the agent's own table
  (`writer_step`, `agent_step`), the run log already claims ticks and has a reaper and a waiting
  status, and Z.2 decides approvals in a table.

## Decision

Multi-step routines are state machines driven by ticks (D).

- The step a run is at lives in the owner's table. One scheduled route per entity (the
  campaigns `agent-driver`, every five minutes) advances every run that is at a step by exactly
  one step per tick, through `driveAgents` in `kernel/audit/step-driver.ts`.
- Each step is a routine run of its own, recorded under the agent's routine id with the tick
  `<run id>:<run started at>:<step>`. `claim_tick` refuses a tick that is running, waiting, ok
  or skipped, so a step is never run twice and a passed step never repeats; the run's start time
  in the key lets a stopped and restarted run reach its first step anew.
- A person's button runs the step the run is at inline (`runNow`), under the same tick, so the
  person sees movement at once and the driver cannot run it again.
- A step that errors or dies is retried on later ticks, backed off 5, 10 then 20 minutes, and
  after three failed attempts the driver stops the run with the last failure in the agent's own
  error column, where its Retry button clears it.
- A run that waits on a person is a row in `waiting`, or a parked state in the owner's table;
  the next tick reads the decision. Nothing accepts a hook token.
- Vercel Cron stays the clock for everything.

## Consequences

- No step hands itself on over HTTP; the writer's re-arm loop is gone.
- A ten-step writer run takes about fifty minutes at a five-minute tick after its first step.
- The driver writes one run row every five minutes, most of them `skipped`, as the reaper does.
- We own a small step engine: deadlines, attempt counts and back-off are ours to keep right.

## What would reopen it

Workflow (A) is the named escape hatch, reopened by any one of: more than about ten multi-step
routines; a routine whose step graph branches; tick latency a person complains about. Before
reopening, measure `withWorkflow` against `scripts/next-build.mjs` on a branch: if the build
does not fit in memory, A is not available whatever its merits.
