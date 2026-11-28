import * as XLSX from "xlsx";

// Reads the two social analytics exports a person downloads by hand: LinkedIn's
// company page Content export (.xls, a "Metrics" sheet of daily totals and an
// "All posts" sheet) and Meta Business Suite's post-level export (.csv). Neither
// platform gives us an API we hold credentials for, so the file is the source.
// Parsing is pure so the tests can run it on fixtures without a database.

export type SocialChannel = "linkedin" | "facebook";

export type SocialDailyRow = {
  day: string;
  impressions: number;
  uniqueImpressions: number;
  clicks: number;
  reactions: number;
  comments: number;
  reposts: number;
};

export type SocialPostRow = {
  externalId: string;
  url: string | null;
  // LinkedIn files its automatic "#hiring" job posts beside our own content;
  // they are kept, so the page totals still add up, but never matched to a
  // marketing_content row.
  kind: "post" | "job";
  text: string;
  postedOn: string | null;
  impressions: number;
  uniqueImpressions: number | null;
  clicks: number;
  reactions: number;
  comments: number;
  reposts: number;
};

export type SocialExport = {
  channel: SocialChannel;
  // What the file says about whose page it is (LinkedIn's file name starts
  // with the page's handle; Meta's rows carry the page name), used only to
  // preselect a brand. The person confirms the brand before anything saves.
  pageHint: string | null;
  // The last day the export covers. Post figures keep growing after an export,
  // so a re-import replaces a post's figures only with ones at least as recent.
  asOf: string;
  days: SocialDailyRow[];
  posts: SocialPostRow[];
};

export type ParseResult = { ok: true; data: SocialExport } | { ok: false; error: string };

type Cell = string | number | boolean | null | undefined;

export function parseSocialExport(fileName: string, bytes: Uint8Array): ParseResult {
  let book: XLSX.WorkBook;
  try {
    book = XLSX.read(bytes, { type: "array", raw: true });
  } catch {
    return { ok: false, error: "This file could not be read as a spreadsheet or CSV." };
  }
  if (book.SheetNames.includes("Metrics") && book.SheetNames.includes("All posts")) return parseLinkedIn(book, fileName);
  const first = book.Sheets[book.SheetNames[0]];
  const rows = first ? sheetRows(first) : [];
  if (rows[0]?.some((c) => clean(c) === "Post ID") && rows[0]?.some((c) => clean(c) === "Permalink")) {
    return parseFacebook(fileName, rows);
  }
  return {
    ok: false,
    error: "This is not a LinkedIn Content export or a Meta Business Suite post export.",
  };
}

function parseLinkedIn(book: XLSX.WorkBook, fileName: string): ParseResult {
  const pageHint = fileName.match(/^(.+?)_content_/)?.[1] ?? null;
  const metrics = withHeader(sheetRows(book.Sheets.Metrics), "Date");
  const posts = withHeader(sheetRows(book.Sheets["All posts"]), "Post title");
  if (!metrics || !posts) return { ok: false, error: "The LinkedIn file is missing its header rows." };

  const days: SocialDailyRow[] = [];
  for (const row of metrics.rows) {
    const day = usDate(row[metrics.col("Date")]);
    if (!day) continue;
    days.push({
      day,
      impressions: num(row[metrics.col("Impressions (total)")]),
      uniqueImpressions: num(row[metrics.col("Unique impressions (organic)")]),
      clicks: num(row[metrics.col("Clicks (total)")]),
      reactions: num(row[metrics.col("Reactions (total)")]),
      comments: num(row[metrics.col("Comments (total)")]),
      reposts: num(row[metrics.col("Reposts (total)")]),
    });
  }

  const postRows: SocialPostRow[] = [];
  for (const row of posts.rows) {
    const url = clean(row[posts.col("Post link")]);
    const externalId = url.match(/urn:li:(?:activity|share|ugcPost):(\d+)/)?.[1];
    if (!externalId) continue;
    const text = clean(row[posts.col("Post title")]);
    postRows.push({
      externalId,
      url,
      kind: /^we're #hiring/i.test(text) ? "job" : "post",
      text,
      postedOn: usDate(row[posts.col("Created date")]),
      impressions: num(row[posts.col("Impressions")]),
      uniqueImpressions: null,
      clicks: num(row[posts.col("Clicks")]),
      reactions: num(row[posts.col("Likes")]),
      comments: num(row[posts.col("Comments")]),
      reposts: num(row[posts.col("Reposts")]),
    });
  }

  if (days.length === 0 && postRows.length === 0) return { ok: false, error: "The LinkedIn file has no rows." };
  const asOf = [...days.map((d) => d.day), ...postRows.map((p) => p.postedOn ?? "")].sort().at(-1)!;
  return { ok: true, data: { channel: "linkedin", pageHint, asOf, days, posts: postRows } };
}

// Meta renames its metric columns from time to time, so each figure is read
// from the first of its known names that the file carries.
const FACEBOOK_METRICS = {
  impressions: ["Views", "Impressions"],
  uniqueImpressions: ["Reach"],
  clicks: ["Total clicks", "Link clicks"],
  reactions: ["Reactions"],
  comments: ["Comments"],
  reposts: ["Shares"],
} as const;

function parseFacebook(fileName: string, rows: Cell[][]): ParseResult {
  const table = withHeader(rows, "Post ID")!;
  const present = Object.fromEntries(
    Object.entries(FACEBOOK_METRICS).map(([key, names]) => [key, names.find((n) => table.has(n)) ?? null]),
  ) as Record<keyof typeof FACEBOOK_METRICS, string | null>;
  if (Object.values(present).every((n) => n === null)) {
    return {
      ok: false,
      error:
        "This Facebook export has no metric columns. Export it again from Meta Business Suite (Insights > Content > Export data) as a post-level CSV with Views, Reach, Reactions, Comments, Shares and clicks ticked.",
    };
  }
  const read = (row: Cell[], key: keyof typeof FACEBOOK_METRICS) => {
    const name = present[key];
    return name ? num(row[table.col(name)]) : 0;
  };

  const posts: SocialPostRow[] = [];
  for (const row of table.rows) {
    const externalId = clean(row[table.col("Post ID")]);
    if (!externalId) continue;
    posts.push({
      externalId,
      url: clean(row[table.col("Permalink")]) || null,
      kind: "post",
      text: clean(row[table.col("Description")]) || clean(row[table.col("Title")]),
      postedOn: metaDate(row[table.col("Publish time")]),
      impressions: read(row, "impressions"),
      uniqueImpressions: present.uniqueImpressions ? read(row, "uniqueImpressions") : null,
      clicks: read(row, "clicks"),
      reactions: read(row, "reactions"),
      comments: read(row, "comments"),
      reposts: read(row, "reposts"),
    });
  }
  if (posts.length === 0) return { ok: false, error: "This Facebook export has no posts in it." };

  const asOf = fileEndDate(fileName) ?? posts.map((p) => p.postedOn ?? "").sort().at(-1)!;
  const pageHint = clean(table.rows[0]?.[table.col("Page name")]) || null;
  return { ok: true, data: { channel: "facebook", pageHint, asOf, days: [], posts } };
}

function sheetRows(sheet: XLSX.WorkSheet): Cell[][] {
  return XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null, blankrows: false });
}

// Both exports can open with a description line above the header, so the
// header is found by its first column rather than assumed to be row one.
function withHeader(rows: Cell[][], firstColumn: string) {
  const at = rows.findIndex((r) => clean(r[0]) === firstColumn);
  if (at < 0) return null;
  const names = rows[at].map(clean);
  return {
    rows: rows.slice(at + 1),
    has: (name: string) => names.includes(name),
    col: (name: string) => names.indexOf(name),
  };
}

function clean(cell: Cell): string {
  return cell === null || cell === undefined ? "" : String(cell).replace(/^﻿/, "").trim();
}

function num(cell: Cell): number {
  const n = typeof cell === "number" ? cell : Number(clean(cell).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

// LinkedIn writes MM/DD/YYYY in UTC.
function usDate(cell: Cell): string | null {
  const m = clean(cell).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

// Meta writes "MM/DD/YYYY HH:MM" in the page's time zone; the day is enough.
function metaDate(cell: Cell): string | null {
  const text = clean(cell);
  return usDate(text.split(" ")[0]) ?? (/^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Meta names the file "Sep-14-2026_Oct-13-2026_<page id>.csv"; the second date
// is the last day it covers.
function fileEndDate(fileName: string): string | null {
  const m = fileName.match(/_([A-Z][a-z]{2})-(\d{2})-(\d{4})_/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]) + 1;
  return month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2]}` : null;
}
