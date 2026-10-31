import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { SHELL_SLOTS } from "@/scripts/gen-deployment.mjs";
import { mountsOf } from "@/scripts/gen-app-mounts.mjs";
import { expectedHere, isForkTree } from "@/scripts/fork-tree.mjs";
import { dynamicSpecifierPrefixes, importSpecifiers, resolveSpecifier, stripComments } from "@/scripts/check-entity-imports.mjs";
import { withoutTypeImports } from "@/scripts/check-entity-layers-walk.mjs";
import { assistantToolFiles } from "@/scripts/assistant-tool-files.mjs";

// The fence (LD.9; spec "Gates" and "Who never reads it"; ADR 0021 "Who reads
// what"). A ladder is read by its person and, of what they chose to wear, by
// their teammates on the team surface. Nothing else reads one: no admin page,
// no report or export, no routine but the ladders' own replay, not the
// assistant, not the inbox, not the client portal. The door enforces the
// audience of each read (lib/door-audience.test.tsx); this file enforces who
// may hold the door at all, the kernel's faces seam included, and which pages
// take a ladders page slot. The surfaces a slot may stand on are declared in
// slots.ts and enforced by the generator (ADR 0026), in any form of import of
// app/shell.ts (scripts/slot-declarations.test.mjs). A reader
// nobody listed fails here, because PR #2120 showed that the comment saying
// "never reaches" is not the fence.
//
// Imports are read by the repo's own parser (scripts/check-entity-imports.mjs),
// the one check:entity-imports uses; the table at the end of this file proves
// each form of import it must catch. It keeps every assertion of the LD.7b
// badge fence it replaced.

const ROOT = path.resolve(__dirname, "..", "..");
const SOURCE = /\.(ts|tsx|mjs|cjs|js)$/;
const TEST = /\.test\.(ts|tsx|mjs)$|(^|\/)__fixtures__\//;
// The fork overlay replaces files of app/ and entities/ in the public fork, so
// its files are judged as the paths they become there.
const OVERLAY = ".github/fork-overlay/";
const WALKED = ["app", "entities", "kernel", "scripts", OVERLAY];

const read = (f: string) => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = (f: string) => fs.existsSync(path.join(ROOT, f));

function sourcesUnder(dir: string): string[] {
  if (!exists(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !SOURCE.test(entry.name)) continue;
    const rel = path.relative(ROOT, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
    if (!TEST.test(rel) && !rel.includes("/node_modules/")) out.push(rel);
  }
  return out;
}

const rootFiles = fs.readdirSync(ROOT, { withFileTypes: true }).filter((e) => e.isFile() && SOURCE.test(e.name) && !TEST.test(e.name)).map((e) => e.name);
const FILES = [...new Set([...WALKED.flatMap(sourcesUnder), ...rootFiles])].sort();
const logical = (f: string) => (f.startsWith(OVERLAY) ? f.slice(OVERLAY.length) : f);
const code = (f: string) => stripComments(read(f));

// ---------------------------------------------------------------------------
// What a file imports, in every form the parser reads.

/** The repo path a specifier names, a stylesheet included (resolveSpecifier leaves assets out). */
function targetOf(spec: string, file: string): string | null {
  const resolved = resolveSpecifier(spec, logical(file));
  if (resolved) return resolved;
  if (spec.startsWith("@/")) return spec.slice(2);
  if (spec.startsWith(".")) return path.posix.normalize(path.posix.join(path.posix.dirname(logical(file)), spec));
  return null;
}

/** Where a dynamic import's fixed prefix points, or null when it is a variable or a package. */
function prefixTarget(prefix: string, file: string): string | null {
  if (prefix.startsWith("@/")) return prefix.slice(2);
  if (prefix.startsWith(".")) return path.posix.join(path.posix.dirname(logical(file)), prefix) + (prefix.endsWith("/") ? "/" : "");
  return null;
}

const LADDERS = ["entities/ladders", "kernel/shell/faces"];
const isLadders = (target: string) => /^entities\/ladders(\/|$)/.test(target) || /^kernel\/shell\/faces(\.ts)?$/.test(target);
const own = (f: string) => /^entities\/ladders\//.test(logical(f)) || logical(f) === "kernel/shell/faces.ts";

type Read = { file: string; target: string };

/**
 * Every way a file can load the ladders: a static, dynamic, re-export, bare or
 * required import of a ladders path or the faces seam, and a dynamic import
 * whose fixed prefix could reach one. In a fenced surface a dynamic import of a
 * variable cannot be judged at all, so it counts too.
 */
function laddersReads(file: string, source: string, fenced: boolean): Read[] {
  const out: Read[] = [];
  // Off the fenced surfaces a type-only import is not a read: it is erased
  // before the code runs, and it is how a slot's type reaches the pages that
  // take the slot (ADR 0026). On a fenced surface even a type counts.
  for (const spec of importSpecifiers(fenced ? source : withoutTypeImports(source))) {
    const target = targetOf(spec, file);
    if (target && isLadders(target)) out.push({ file, target });
  }
  for (const prefix of dynamicSpecifierPrefixes(source)) {
    const target = prefixTarget(prefix, file);
    if (target === null ? fenced : LADDERS.some((t) => t.startsWith(target) || target.startsWith(t))) out.push({ file, target: `a dynamic import of ${prefix ? `\`${prefix}…\`` : "a variable"}` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The surfaces that may never read a ladder.

const ASSISTANT_FILES = new Set(assistantToolFiles(ROOT));

/**
 * A file answering a download or building one: it sets Content-Disposition,
 * answers a CSV or spreadsheet content type, or hands the browser a file
 * (an object URL, a download attribute). Naming a MIME type in a table or
 * importing a row type is not a download.
 */
const DOWNLOAD = /Content-Disposition|["']?content-type["']?\s*:\s*[`"'](text\/csv|application\/vnd\.(openxmlformats|ms-excel))|URL\.createObjectURL|\.download\s*=|\bdownload(=|\s*>|\s+[a-z]+=)/i;

/**
 * What a report or an export is in this repository, by its path or by what it
 * does. By path: any segment naming a report or an export (reports.ts,
 * ReportPanel, broadcast-report, theme-report, marketing-reporting, export/,
 * export.ts, export-tickets.mjs), a `.csv` route, a spreadsheet route, and the
 * CSV and xlsx builders (csv.ts, xlsx.ts). By what it does: DOWNLOAD.
 */
function isReportOrExport(f: string): boolean {
  const p = logical(f);
  if (/(^|\/)[^/]*(report|export)[^/]*(\/|$)/i.test(p)) return true;
  if (/\.csv(\/|$)|(^|\/)spreadsheet(\/|$)|(^|\/)(csv|xlsx)\.(ts|mjs)$/i.test(p)) return true;
  return DOWNLOAD.test(code(f));
}

const ZONE = {
  portal: "the client portal",
  admin: "an admin route or layout",
  cron: "a routine other than the ladders replay",
  assistant: "the assistant (its chat routes, the tool bodies they run, and the performance reviews its review tool opens)",
  notifications: "the notifications entity",
  managerChain: "the manager chain (who reports to whom), fenced on purpose so that no manager view can ever read a ladder",
  report: "a report or an export",
} as const;

/** The surface a file belongs to that may never read a ladder, or null. */
function forbiddenZone(f: string): string | null {
  const p = logical(f);
  if (p.startsWith("app/portal/") || p.startsWith("app/api/portal/") || (p.startsWith("entities/portal/") && !p.startsWith("entities/portal/routes/team/"))) return ZONE.portal;
  if (p.startsWith("app/admin/") || p.startsWith("app/api/admin/") || /^entities\/[^/]+\/(routes|api)\/admin\//.test(p)) return ZONE.admin;
  if (/^entities\/[^/]+\/crons\//.test(p) && !p.startsWith("entities/ladders/crons/")) return ZONE.cron;
  if (p.startsWith("app/api/cron/") && p !== "app/api/cron/ladders-replay/route.ts") return ZONE.cron;
  if (p.startsWith("entities/assistant/") || ASSISTANT_FILES.has(p) || p.startsWith("entities/team/lib/reviews/") || p.startsWith("app/api/assistant/") || p.startsWith("app/api/team/chat/")) return ZONE.assistant;
  if (p.startsWith("entities/notifications/")) return ZONE.notifications;
  if (/(^|\/)reporting-lines\.[a-z]+$/.test(p)) return ZONE.managerChain;
  if (isReportOrExport(f)) return ZONE.report;
  return null;
}

/**
 * Everyone outside the ladders entity who may import it or the faces seam,
 * file by file. Only the composition root and team-surface pages belong here:
 * a ladder is the person's own, shown to their teammates as they chose, and a
 * team page is where teammates are. The team profile and directory routes take
 * the ladders through page slots, not imports; they are named in SLOT_READERS.
 */
const ALLOWED: Record<string, string> = {
  "app/shell.ts": "the composition root: registers the worn-faces provider and hands out the ladders page slots (generated from SHELL_SLOTS)",
  "app/events.ts": "the composition root: registers the ladders' bus subscribers, which recompute the person an act names (generated)",
  ".github/fork-overlay/app/events.ts": "the fork's copy of app/events.ts (generated)",
  "app/api/cron/ladders-replay/route.ts": "the generated mount of the ladders' own nightly replay",
  "app/team/(dashboard)/layout.tsx": "the team shell: the reader's own face in the sidebar with their own border",
  "entities/quests/routes/team/(dashboard)/quests/page.tsx": "team surface: the Quests page asks the faces seam once for every face it draws",
  "entities/team/routes/team/(dashboard)/boards/[slug]/page.tsx": "team surface: a board's assignee faces",
  "entities/team/routes/team/(dashboard)/clients/[companyId]/programs/[programId]/page.tsx": "team surface: a client program's board, its assignee faces",
  "entities/team/routes/team/(dashboard)/ideas/page.tsx": "team surface: a spark's author on Spark",
  "entities/team/routes/team/(dashboard)/sprint-planning/page.tsx": "team surface: sprint planning's assignee faces",
  "entities/team/routes/team/(dashboard)/workboard/page.tsx": "team surface: the Workboard's assignee faces",
};

/** A team-surface file: the team shell under app/, or a team route of any entity. */
const teamSurface = (p: string) => p.startsWith("app/team/") || /^entities\/[^/]+\/routes\/team\//.test(p);
const compositionRoot = (p: string) => ["app/shell.ts", "app/events.ts", "app/api/cron/ladders-replay/route.ts"].includes(p);

const readers = FILES.filter((f) => !own(f)).flatMap((f) => laddersReads(f, read(f), forbiddenZone(f) !== null));

const fencedMessage = ({ file, target }: Read) => {
  const zone = forbiddenZone(file);
  return zone ? `${file} imports ${target}, but it is ${zone}, which may never read a ladder (ADR 0021 "Who reads what"): remove the import` : null;
};
const unlistedMessage = ({ file, target }: Read) =>
  file in ALLOWED ? null : `${file} imports ${target} and is not on ALLOWED in entities/ladders/fence.test.ts. Add it there with a one-line reason only if it is a team-surface page or loader that draws faces (or the composition root): a ladder is shown to teammates on the team surface and nowhere else.`;

describe("who may hold the ladders door or the faces seam", () => {
  it("walks the whole tree", () => {
    // A walk that found nothing would pass everything below.
    expect(FILES).toContain("app/portal/(dashboard)/layout.tsx");
    expect(FILES).toContain("entities/notifications/lib/kinds.ts");
    expect(FILES.length).toBeGreaterThan(1_000);
    expect(readers.map((r) => r.file)).toContain("app/shell.ts");
  });

  it("is never imported from the portal, an admin route, a report, an export, another routine, the assistant or the inbox", () => {
    expect(readers.map(fencedMessage).filter(Boolean)).toEqual([]);
  });

  it("is imported only by the files on the allowlist", () => {
    expect(readers.map(unlistedMessage).filter(Boolean)).toEqual([]);
  });

  it("lists nobody who no longer reads, and nobody off the team surface", () => {
    const importers = new Set(readers.map((r) => r.file));
    for (const file of Object.keys(ALLOWED)) {
      if (!expectedHere(ROOT, file)) continue;
      expect([file, importers.has(file)]).toEqual([file, true]);
      expect([file, forbiddenZone(file)]).toEqual([file, null]);
      expect([file, teamSurface(logical(file)) || compositionRoot(logical(file))]).toEqual([file, true]);
    }
  });

  it("hands the board's faces helper to team pages only", () => {
    // boardFacesDrawn is a shared boards lib: every page that collects a
    // board's faces for the seam must be a team page that is on ALLOWED (LD.8
    // kept the admin boards plain).
    const callers = FILES.filter((f) => /\bboardFacesDrawn\b/.test(code(f)) && !["entities/boards/lib/board-faces.ts", "entities/boards/index.ts"].includes(f));
    // Four team pages draw a board's faces upstream; the fork receives only the
    // portable ones, so the floor holds here and the rule below holds everywhere.
    if (!isForkTree(ROOT)) expect(callers.length).toBeGreaterThanOrEqual(4);
    expect(callers.filter((f) => !/^entities\/[^/]+\/routes\/team\//.test(f) || !(f in ALLOWED))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The ladders page slots, declared in entities/ladders/slots.ts (ADR 0026) and
// handed out by app/shell.ts.

type Slot = { name: string; entity: string; surfaces: readonly string[]; styles: readonly string[] };
const LADDERS_SLOT_DECLARATIONS = (SHELL_SLOTS as unknown as readonly Slot[]).filter((s) => s.entity === "ladders");
const LADDERS_SLOTS = LADDERS_SLOT_DECLARATIONS.map((s) => s.name).sort();

/**
 * Every page that takes a ladders page slot, by entity and route key, with
 * why. All are team routes; the badge slots stand where the reader's act
 * landed, and the profile slots draw a person's own page or a teammate's.
 */
const SLOT_READERS: Record<string, string> = {
  "quests:routes/team/(dashboard)/quests/page": "the reader's game style, their Learn & Share standing and their badge drops on Quests",
  "team:routes/team/(dashboard)/boards/[slug]/page": "the reader's badge drop where their card landed",
  "team:routes/team/(dashboard)/directory/[id]/page": "the team directory: a teammate's dressed profile and postcard stickers, only what they chose to show",
  "team:routes/team/(dashboard)/ideas/page": "the reader's badge drop on Spark",
  "team:routes/team/(dashboard)/profile/page": "the team profile: the reader's own dressed profile and postcard stickers",
  "team:routes/team/(dashboard)/workboard/page": "the reader's badge drop on the Workboard",
  "training:routes/team/(dashboard)/my-training/page": "the reader's badge drop on My Training",
};

type Mount = { slots?: Record<string, string>; styles?: string[] };
const mountEntries = fs
  .readdirSync(path.join(ROOT, "entities"))
  .filter((e) => exists(`entities/${e}/mounts.ts`))
  .flatMap((e) => Object.entries(mountsOf(ROOT, `entities/${e}`) as Record<string, Mount>).map(([key, mount]) => ({ entity: e, key, mount })));

describe("who may take a ladders page slot", () => {
  it("reads the slots ladders provides from its slots.ts, as app/shell.ts imports them", () => {
    // A new ladders slot is a new reader: decide who it answers, then add it here.
    expect(LADDERS_SLOTS).toEqual(["RankUpGate", "badgeDrops", "dressedProfile", "gameStyle", "learnShareStanding", "postcardStickers", "questBadgeDrops", "wornFaces"]);
    const shellImport = /import \{([^}]*)\} from "@\/entities\/ladders";/.exec(read("app/shell.ts"));
    const imported = (shellImport?.[1] ?? "").split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean).sort();
    expect(imported).toEqual(LADDERS_SLOTS);
  });

  it("declares every ladders slot for the team surface alone, which the generator enforces", () => {
    // LD.9's "never on admin, never on the portal" is the slots' declared
    // surfaces (ADR 0026): scripts/gen-deployment.mjs refuses a slot taken
    // anywhere else, by a mount or a hand-written shell, and loaded by any
    // form but a named import (scripts/slot-declarations.test.mjs plants each).
    expect(LADDERS_SLOT_DECLARATIONS.map((s) => [s.name, s.surfaces])).toEqual(LADDERS_SLOT_DECLARATIONS.map((s) => [s.name, ["team"]]));
  });

  it("names every page that takes one", () => {
    expect(mountEntries.length).toBeGreaterThan(50);
    const taking = mountEntries.filter(({ mount }) => Object.values(mount.slots ?? {}).some((slot) => LADDERS_SLOTS.includes(slot)));
    const named = taking.map(({ entity, key }) => `${entity}:${key}`).sort();
    const unlisted = named.filter((n) => !(n in SLOT_READERS)).map((n) => `${n} takes a ladders slot and is not on SLOT_READERS in entities/ladders/fence.test.ts; add it with a one-line reason, and only for a team-surface page`);
    expect(unlisted).toEqual([]);
    expect(Object.keys(SLOT_READERS).filter((n) => expectedHere(ROOT, `entities/${n.split(":")[0]}/${n.split(":")[1]}.tsx`) && !named.includes(n))).toEqual([]);
  });

  it("mounts the badge slots where the reader's act lands (LD.7b)", () => {
    const badges = mountEntries.filter(({ mount }) => Object.values(mount.slots ?? {}).some((s) => ["badgeDrops", "questBadgeDrops", "postcardStickers"].includes(s)));
    expect(badges.length).toBeGreaterThanOrEqual(7);
    expect(badges.map(({ entity, key }) => `${entity}:${key}`)).toContain("quests:routes/team/(dashboard)/quests/page");
  });

  it("lists a ladders stylesheet on no consumer's mount: each comes with its slot or its door", () => {
    // ADR 0026: the generator loads a slot's sheets wherever it is mounted, and
    // only with ladders installed. The door's own sheets reach every page
    // already, through the root layout's import of app/shell.ts (see
    // entities/portal/portal-no-borders.test.ts). A page never names either.
    const sheets = LADDERS_SLOT_DECLARATIONS.flatMap((s) => s.styles);
    expect(sheets).toEqual(expect.arrayContaining(["@/app/styles/your-ladders.css", "@/app/styles/profile-dress.css", "@/app/styles/quest-log.css"]));
    const door = [...read("entities/ladders/index.ts").matchAll(/^import\s+["']\.\/([^"']+\.css)["'];/gm)].map((m) => `@/entities/ladders/${m[1]}`);
    expect(door.length).toBeGreaterThanOrEqual(3);
    const listing = mountEntries.filter(({ entity, mount }) => entity !== "ladders" && (mount.styles ?? []).some((s) => sheets.includes(s) || door.includes(s)));
    expect(listing).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Names: a fenced file naming a ladders read, slot or badge component is
// reaching round the import fence (a prop handed down, a re-export).

const LADDERS_NAMES = new RegExp(
  `\\b(${[...LADDERS_SLOTS, "myStanding", "wornTiers", "wornTiersSeenBy", "wornTiersFor", "registerWornTiers", "bordersOf", "FaceBordersContext", "boardFacesDrawn", "BadgeDrop", "BadgeDropsSlot", "QuestBadgeDropsSlot", "PostcardStickersSlot", "OwnAchievements", "AchievementsView", "Stickers", "EmblemSprite", "emblemSprite"].join("|")})\\b|entities\\/ladders`,
);

describe("the fenced surfaces name nothing of the ladders", () => {
  const fenced = FILES.filter((f) => forbiddenZone(f) !== null);

  it("finds every fenced surface", () => {
    for (const zone of Object.values(ZONE)) expect([zone, fenced.some((f) => forbiddenZone(f) === zone)]).toEqual([zone, true]);
    expect(fenced).toContain("app/portal/(dashboard)/layout.tsx");
    expect(fenced).toContain("entities/assistant/lib/team-chat/tools.ts");
    expect(fenced).toContain("entities/reimbursements/lib/export.ts");
    // The assistant's tools are found from what the chat routes run, wherever they live.
    expect(forbiddenZone("entities/team/lib/reviews/chat-tool.ts")).toBe(ZONE.assistant);
    expect(forbiddenZone("entities/team/lib/chat/run-tool.ts")).toBe(ZONE.assistant);
    expect(forbiddenZone("entities/org/lib/reporting-lines.ts")).toBe(ZONE.managerChain);
    // A file that answers or builds a download is an export; one that only names a type is not.
    expect(forbiddenZone("kernel/ui/dash/DownloadRows.tsx")).toBe(ZONE.report);
    expect(forbiddenZone("kernel/ui/dash/StatTile.tsx")).toBeNull();
    expect(forbiddenZone("entities/boards/lib/deliverable-rules.ts")).toBeNull();
  });

  it("names no ladders read, seam, slot or badge component, and hands no face a border", () => {
    const offenders = fenced.filter((f) => LADDERS_NAMES.test(code(f)) || /\bborders?=\{/.test(code(f))).map((f) => `${f} (${forbiddenZone(f)})`);
    expect(offenders).toEqual([]);
  });

  it("draws no division, star or point on a drop, a tile or a sticker (LD.7b)", () => {
    const badgeUi = sourcesUnder("entities/ladders/ui/badges");
    expect(badgeUi.length).toBeGreaterThan(5);
    for (const f of badgeUi) expect([f, /★|\bdivision\b|\bpoints?\b/i.test(code(f))]).toEqual([f, false]);
  });
});

// ---------------------------------------------------------------------------
// Every form of import the fence must catch, as source a file could hold.

describe("the fence catches every form of import", () => {
  const ADMIN = "app/admin/(dashboard)/layout.tsx";
  const caught: [string, string][] = [
    ["a named import", `import { myStanding } from "@/entities/ladders";`],
    ["a named import over lines", `import {\n  myStanding,\n} from "@/entities/ladders";`],
    ["a type import", `import type { Tier } from "@/entities/ladders";`],
    ["a namespace import", `import * as door from "@/entities/ladders";`],
    ["a default import of the index", `import door from "@/entities/ladders/index";`],
    ["a deep import", `import { wornTiers } from "@/entities/ladders/lib/worn";`],
    ["a relative import", `import { wornTiersFor } from "../../../kernel/shell/faces";`],
    ["a re-export of everything", `export * from "@/entities/ladders";`],
    ["a named re-export", `export { wornTiers } from "@/entities/ladders/lib/worn";`],
    ["a bare stylesheet import", `import "@/entities/ladders/ui/rank-up.css";`],
    ["a dynamic import", `const door = await import("@/entities/ladders");`],
    ["a dynamic import in a template", "const door = await import(`@/entities/ladders`);"],
    ["a dynamic import built from a name", "const door = await import(`@/entities/${name}`);"],
    ["a dynamic import of a variable", "const door = await import(where);"],
    ["a require", `const faces = require("@/kernel/shell/faces");`],
    ["a require in a template", "const faces = require(`@/kernel/shell/faces`);"],
    ["an import after a string holding a comment opener", `const glob = "src/*"; import { myStanding } from "@/entities/ladders"; // */`],
    ["an import after a regular expression holding a comment opener", `const re = /\\/\\*/; import { myStanding } from "@/entities/ladders"; // */`],
  ];
  it.each(caught)("catches %s", (_how, source) => {
    expect(laddersReads(ADMIN, source, true).length).toBeGreaterThan(0);
  });

  it("does not count a type import off the fenced surfaces, where it reads nothing", () => {
    const TEAM = "entities/quests/ui/x.ts";
    expect(laddersReads(TEAM, `import type { LearnShareStanding } from "@/entities/ladders";`, false)).toEqual([]);
    expect(laddersReads(TEAM, `import { type LearnShareStanding, myStanding } from "@/entities/ladders";`, false)).toHaveLength(1);
  });

  it("does not see a commented-out import", () => {
    expect(laddersReads(ADMIN, `// import { myStanding } from "@/entities/ladders";\n/* import x from "@/kernel/shell/faces"; */`, true)).toEqual([]);
  });

});
