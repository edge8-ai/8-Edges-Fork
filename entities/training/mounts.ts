// What `app/` needs to mount this entity's routes and cannot derive: the
// route-segment config and the pages' stylesheet. Every page reads live rows
// per request, so none is rendered statically.
import type { RouteMounts } from "@/kernel/config/route-mount";

/** @generator */
export const mounts: RouteMounts = {
  "crons/certifications-sync": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 60 },
  },
  "crons/training-prep-draft": {
    // Up to ten Claude calls a run (English Program PR 3).
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/training-session-reminder": {
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 60 },
  },
  "crons/training-lark-pickup": {
    // Several Minutes reads per connected organiser (English Program PR 7).
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/training-session-recap": {
    // One deep-tier call over a long transcript.
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/training-programme-narration": {
    // At most twelve standard-tier calls a tick (TR.9); later ticks finish the rest.
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "crons/training-weekly-recap": {
    // At most one model call a tick, plus the sends (English Program PR 9).
    segment: { runtime: "nodejs", dynamic: "force-dynamic", maxDuration: 300 },
  },
  "routes/team/(dashboard)/my-training/page": {
    // One standard-tier call while the member waits, when they open their read (TR.10).
    segment: { dynamic: "force-dynamic", maxDuration: 60 },
    // My Training's own sheet (TR.1, the Training Block canvas).
    styles: ["@/app/styles/training.css"],
    // LD.7b: a badge a session hosted or a review written found drops here, from ladders, which training does not require.
    // TR.10: the work signals the personal read sets beside the training, from boards and htt, which training does not require either.
    slots: { badgeDrops: "badgeDrops", finishedCardDates: "finishedCardDates", mergedPullRequestDates: "mergedPullRequestDates" },
  },
  "routes/team/(dashboard)/my-training/sessions/[id]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/plans/[planId]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/plans/[planId]/philosophy/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/exercises/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/sessions/[id]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/plans/[planId]/weekly/[week]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/team/(dashboard)/training/plans/[planId]/learners/[personId]/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  "routes/admin/(dashboard)/settings/training-types/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  // The programme read on this page (TR.7) draws its stars, bands and lock
  // icons with the tr-pr-* rules, which live in training.css; without the
  // sheet every lock icon renders at the page's full width.
  "routes/admin/(dashboard)/talent/training/page": {
    segment: { dynamic: "force-dynamic" },
    styles: ["@/app/styles/training.css"],
  },
  // One class's page (ADR 0016, amended 2026-10-26): the admin kit only, so no sheet of its own.
  "routes/admin/(dashboard)/talent/training/classes/[id]/page": {
    segment: { dynamic: "force-dynamic" },
  },
};
