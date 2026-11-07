// The contract of a program's delivery record: the pull requests, the weekly
// hours and the cached story that the Human Token Tracker keeps for the repos
// an AI Program owns (X.1), as the program pages outside htt may read them.
//
// It is part of htt's humanTokens slot (`programs`, kernel/shell/human-tokens.ts)
// and of its ProgramRepoHours slot, both declared in entities/htt/slots.ts. htt
// is internal, so these types stay in the kernel (ADR 0026): a portable page
// that takes the slot must still compile in the public fork, which has no htt.
// In a deployment without htt the slot is null, and a program shows its
// roadmap, boards and documents with no pull requests, hours or story. Before
// ADR 0032 the team hub and the portal read htt's tables for these directly.
import type { ReactNode } from "react";
import type { Result } from "@/kernel/data/result";

export type ProgramPullRequest = {
  id: string;
  number: number | null;
  title: string;
  state: "open" | "merged" | "closed";
  author: string | null;
  url: string | null;
  mergedAt: string | null;
  openedAt: string;
};

export type ProgramPrOptions = {
  page?: number; // 1-based; clamped to the filtered result's page range
  search?: string; // matches title/author (ilike) and exact PR number
};

export const PR_PAGE_SIZE = 15;

export type PrPage = {
  rows: ProgramPullRequest[];
  page: number;
  total: number; // matching the search filter
  totalAll: number; // unfiltered
};

/** No pull requests: a program with no repo, or a deployment without htt. */
export const EMPTY_PR_PAGE: PrPage = { rows: [], page: 1, total: 0, totalAll: 0 };

/** One block of a repo's cached AI story, written nightly from its status page or its PRs. */
export type RepoStoryBlock = {
  content: string;
  asOf: string | null;
  stale: boolean;
};

export type RepoStory = {
  executive: RepoStoryBlock | null;
  latestPrs: RepoStoryBlock | null;
};

/** No story: a repo nothing has been written for yet, or a deployment without htt. */
export const EMPTY_STORY: RepoStory = { executive: null, latestPrs: null };

/**
 * What the humanTokens slot reads of a program's delivery record, every read
 * scoped to the repo ids (or program id) the caller has already authorised.
 */
export type ProgramRecord = {
  /** Merged pull requests since a moment, counted per repo. */
  mergedPrsByRepo: (repoIds: string[], sinceIso: string) => Promise<Map<string, number>>;
  /** Merged pull requests across the repos, since a moment or ever. */
  mergedPrCount: (repoIds: string[], sinceIso: string | null) => Promise<number>;
  /** One page of the repos' pull requests, searched over the full set. */
  prPage: (repoIds: string[], opts: ProgramPrOptions) => Promise<PrPage>;
  /** The repos' delivered hours by day since a day, excluded rows left out. */
  hourRowsSince: (repoIds: string[], sinceDay: string) => Promise<Array<{ occurred_on: string; hours: number }>>;
  /** Merged pull request titles since a moment, newest first. */
  mergedPrTitlesSince: (repoIds: string[], sinceIso: string) => Promise<Array<{ title: string; merged_at: string }>>;
  /** Every repo a program owns. */
  repoIdsOfProgram: (programId: string) => Promise<string[]>;
  /** The selected repo's cached story. */
  repoStory: (repoId: string) => Promise<RepoStory>;
};

/**
 * The hours ledger's edits, as the page's own guarded server actions: htt
 * owns the rows and the rule, the page owns who may change them.
 */
export type HoursLedgerActions = {
  override: (repoId: string, personId: string, day: string, hours: number, reason: string) => Promise<Result>;
  clear: (repoId: string, personId: string, day: string) => Promise<Result>;
  budget: (personId: string, hours: number) => Promise<Result>;
  rescan: (personId: string | null) => Promise<Result>;
};

/**
 * htt's ProgramRepoHours slot: one repo's hours ledger and the sessions behind
 * it, on a program page. Null in a deployment without htt, where the page
 * shows no ledger.
 */
export type ProgramRepoHoursSlot =
  | ((props: { repoId: string; viewerPersonId: string | null; canEditAll: boolean; actions: HoursLedgerActions }) => Promise<ReactNode>)
  | null;
