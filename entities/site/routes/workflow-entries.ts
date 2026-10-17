// The /workflows library as the sitemap and llms.txt want it.
//
// This file is an overlay stub for 8-Edges-Fork. It only neutralises upstream
// while it sits at the SAME repo-relative path as the real module — today
// entities/site/routes/workflow-entries.ts.
//
// Empty because entities/library is internal: its 24 pages are the upstream's
// own operating workflows, written in the first person, and they do not sync.
// Upstream's copy imports that entity; there is no such module here, so the
// import goes too.
import type { LinkEntry } from "@/entities/site/lib/public-routes";

export type WorkflowEntry = LinkEntry & { date: string };

export const WORKFLOW_ENTRIES: WorkflowEntry[] = [];
