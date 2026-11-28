// Compares two commits of this repo and asks whether the refactor between them
// changed what the application *does*, as opposed to where its code lives.
//
// Two questions, because those are the two the entity refactor could have got
// wrong without any gate noticing:
//
//   routes — did the generated `app/` keep serving exactly the URLs the
//            hand-written one served? A page whose folder moved silently
//            changes its URL, and nothing else in the build would say so.
//
//   reads  — when a read was rewritten to go through another entity's `select*`
//            door helper, does it still ask the database the same question? The
//            helper only names the table and hands back the PostgREST builder,
//            so the caller's columns, filters and ordering had to be carried
//            over by hand, and a dropped `.eq(...)` widens a query in a way that
//            typechecks perfectly.
//
// Renames are followed with git's own detection, so a file that moved between
// entities is still compared with its former self.
//
// Usage: node scripts/audit-parity.mjs [--base <ref>] [--head <ref>] [--json]
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(name);
  return i === -1 ? fallback : args[i + 1];
};
const BASE = flag("--base", "b97bbeda");
const HEAD = flag("--head", "HEAD");
const AS_JSON = args.includes("--json");

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// `--head worktree` reads the files on disk rather than a commit, so the audit
// can run against work in progress — and so a deliberate regression can be
// introduced to check that this script would catch it, without committing.
const cache = new Map();
const show = (ref, file) => {
  const key = `${ref}:${file}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    out = ref === "worktree" ? fs.readFileSync(file, "utf8") : git("show", key);
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
};
const refOf = (ref) => (ref === "worktree" ? "HEAD" : ref);
const lsTree = (ref, ...paths) => git("ls-tree", "-r", "--name-only", refOf(ref), ...paths).split("\n");

// ── routes ──────────────────────────────────────────────────────────────────
// A route group — `(dashboard)` — is a folder that does not appear in the URL,
// so it has to come out before the two sides can be compared.
const urlListOf = (ref) =>
  lsTree(ref, "app")
    .filter((f) => /\/(page|route)\.tsx?$/.test(f))
    .map((f) =>
      f
        .replace(/^app/, "")
        .replace(/\/(page|route)\.tsx?$/, "")
        .replace(/\/\([^)]+\)/g, ""),
    );

// Two files can erase to one URL — `app/(a)/x/page.tsx` and `app/(b)/x/page.tsx`
// both serve `/x` — and a set would quietly swallow the pair. Then a page that
// really did vanish could be masked by a collision on the other side, so the
// collisions are reported rather than deduplicated away.
const collisionsOf = (ref) => {
  const seen = new Map();
  for (const u of urlListOf(ref)) seen.set(u, (seen.get(u) ?? 0) + 1);
  return [...seen].filter(([, n]) => n > 1).map(([u, n]) => `${u} × ${n}`);
};

const urlsOf = (ref) => new Set(urlListOf(ref));

function auditRoutes() {
  const base = urlsOf(BASE);
  const head = urlsOf(HEAD);
  return {
    baseCount: base.size,
    headCount: head.size,
    baseFiles: urlListOf(BASE).length,
    headFiles: urlListOf(HEAD).length,
    collisions: collisionsOf(HEAD),
    lost: [...base].filter((u) => !head.has(u)).sort(),
    added: [...head].filter((u) => !base.has(u)).sort(),
  };
}

// ── the door helpers ────────────────────────────────────────────────────────
// Each `select*` in an entity's `lib/reads.ts` is `client.from("table")
// .select(columns, options)` and nothing more, so the helper's name can be
// resolved to the pair (client, table) and a call to it rewritten into the raw
// query it stands for. That rewriting is what makes the two sides comparable.
function doorHelpers(ref) {
  const map = new Map();
  const files = lsTree(ref).filter((f) => /^(entities|kernel)\/[^/]+\/(lib\/)?(reads|writes)\.ts$/.test(f));
  for (const file of files) {
    const src = show(ref, file);
    if (!src) continue;
    const re =
      /export const (\w+)\s*=[\s\S]{0,400}?(\w+)\.from\(\s*["'`]([^"'`]+)["'`]\s*\)\s*\.(select|insert|update|upsert|delete)/g;
    let m;
    while ((m = re.exec(src))) map.set(m[1], { client: m[2], table: m[3], verb: m[4], file });
  }
  return map;
}

// ── chain reading ───────────────────────────────────────────────────────────
// Walks forward from a call's opening paren, balancing brackets and skipping
// string and template literals, and keeps going while the next thing after the
// closing paren is another `.method(` — which is how a PostgREST chain reads.
function readChain(src, openParen) {
  let i = openParen;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      i += 1;
      while (i < src.length && src[i] !== quote) i += src[i] === "\\" ? 2 : 1;
      i += 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) {
        // Peek past the closing paren for a further `.method(` at depth zero.
        const rest = src.slice(i + 1);
        const next = /^\s*\.\s*(\w+)\s*\(/.exec(rest);
        if (next) {
          i += 1 + next[0].length - 1;
          depth = 0;
          continue;
        }
        return { text: src.slice(openParen, i + 1), end: i + 1 };
      }
    }
    i += 1;
  }
  return { text: src.slice(openParen), end: src.length };
}

// The comparison ignores whitespace and quote style, because the refactor
// reformatted freely, and neither changes the query.
const normalise = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1 ")
    .replace(/\s+/g, " ")
    .replace(/['`]/g, '"')
    .replace(/,\s*\)/g, ")")
    .replace(/([([{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .trim();

// Every PostgREST chain in a file, keyed by the table it reads. A chain that
// starts at a door helper is rewritten to the raw form so it can be compared
// with the baseline's raw one.
function chainsOf(src, helpers) {
  const out = [];
  if (!src) return out;
  // A file may hold its table name in a constant — `const TABLE =
  // "client_backlog_items"` — and write `from(TABLE)`. Without resolving those
  // the query is invisible, and a read that has always existed looks new.
  const consts = new Map();
  const cre = /\bconst\s+(\w+)\s*(?::[^=]+)?=\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*;/g;
  let cm;
  while ((cm = cre.exec(src))) consts.set(cm[1], cm[2]);

  const raw = /(\w+)\s*\.\s*from\(\s*(?:["'`]([^"'`]+)["'`]|(\w+))\s*(?:as\s+[\w<>"' ]+)?\)\s*\./g;
  let m;
  while ((m = raw.exec(src))) {
    const table = m[2] ?? consts.get(m[3]);
    if (!table) continue;
    const dot = m.index + m[0].length - 1;
    const call = src.indexOf("(", dot);
    if (call === -1) continue;
    const method = src.slice(dot + 1, call).trim();
    const { text } = readChain(src, call);
    out.push({ table, client: m[1], via: "raw", text: normalise(`.${method}${text}`) });
  }
  for (const [name, info] of helpers) {
    const re = new RegExp(`\\b${name}\\s*\\(`, "g");
    let h;
    while ((h = re.exec(src))) {
      const call = h.index + h[0].length - 1;
      const before = src.slice(Math.max(0, h.index - 30), h.index);
      if (/(?:export const|function|import)\s*$/.test(before)) continue;
      const { text } = readChain(src, call);
      out.push({
        table: info.table,
        client: info.client,
        via: name,
        text: normalise(`.${info.verb}${text}`),
      });
    }
  }
  return out;
}

// ── reads ───────────────────────────────────────────────────────────────────
function renameMap() {
  const map = new Map(); // head path → base path
  const status = git("diff", "-M40%", "-C40%", "--name-status", BASE, refOf(HEAD));
  for (const line of status.split("\n")) {
    const parts = line.split("\t");
    if (/^[RC]/.test(parts[0]) && parts.length >= 3) map.set(parts[2], parts[1]);
  }
  return map;
}

function auditReads() {
  const headHelpers = doorHelpers(HEAD);
  const baseHelpers = doorHelpers(BASE);
  const renames = renameMap();
  const headFiles = lsTree(HEAD).filter((f) => /^(entities|kernel|app)\/.*\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));

  // Some files at HEAD were assembled from more than one baseline file — the
  // rename map can only name one of them — so a chain missing from the paired
  // file is looked for across the whole baseline tree before it is called new.
  const baseIndex = new Map();
  for (const file of lsTree(BASE).filter(
    (f) => /^(entities|kernel|app|lib|components)\/.*\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f),
  )) {
    for (const c of chainsOf(show(BASE, file), baseHelpers)) {
      const key = `${c.table}\u0000${c.text}`;
      baseIndex.set(key, (baseIndex.get(key) ?? 0) + 1);
    }
  }

  const findings = [];
  const matchedElsewhere = [];
  let compared = 0;
  for (const file of headFiles) {
    const headChains = chainsOf(show(HEAD, file), headHelpers);
    const doorCalls = headChains.filter((c) => c.via !== "raw");
    if (!doorCalls.length) continue;
    compared += doorCalls.length;

    const basePath = renames.get(file) ?? file;
    const baseSrc = show(BASE, basePath);
    if (!baseSrc) {
      findings.push({ file, basePath, kind: "no-baseline", tables: [...new Set(doorCalls.map((c) => c.table))] });
      continue;
    }
    const baseChains = chainsOf(baseSrc, baseHelpers);

    // Only the tables this file now reaches through a door are in question; a
    // table it has always owned is not part of the refactor's risk.
    for (const table of new Set(doorCalls.map((c) => c.table))) {
      const head = headChains.filter((c) => c.table === table);
      const base = baseChains.filter((c) => c.table === table);
      // Multiset difference, so two identical queries on one table stay two.
      const drain = (from, against) => {
        const pool = against.map((c) => c.text);
        return from.filter((c) => {
          const i = pool.indexOf(c.text);
          if (i === -1) return true;
          pool.splice(i, 1);
          return false;
        });
      };
      // A chain absent from the paired file but present elsewhere in the
      // baseline is accepted as moved-in — and counted, because "it exists
      // somewhere" is weaker evidence than "it was here", and a caller that
      // swapped its query for another file's on the same table would pass this
      // way. `--verbose` lists them so a reader can judge each one.
      const unpaired = drain(head, base);
      const onlyHead = unpaired.filter((c) => !baseIndex.has(`${c.table}\u0000${c.text}`));
      for (const c of unpaired) if (!onlyHead.includes(c)) matchedElsewhere.push(`${file} :: ${table} :: ${c.text.slice(0, 90)}`);
      const onlyBase = drain(base, head);
      // The same chain through a different Supabase client is a different
      // database — `supabase` is the public schema, `companyOs` the company_os
      // one — so a client change on identical text is a finding, not a footnote.
      const clientsBefore = [...new Set(base.map((c) => c.client))].sort().join(",");
      const clientsAfter = [...new Set(head.map((c) => c.client))].sort().join(",");
      const clientChanged = base.length > 0 && clientsBefore !== clientsAfter;
      if (!onlyHead.length && !onlyBase.length && !clientChanged) continue;
      findings.push({
        file,
        basePath,
        table,
        kind: clientChanged && !onlyHead.length && !onlyBase.length
          ? "client-changed"
          : onlyBase.length && onlyHead.length ? "changed" : onlyBase.length ? "dropped" : "added",
        via: [...new Set(head.filter((c) => c.via !== "raw").map((c) => c.via))].join(", "),
        clients: clientChanged ? `${clientsBefore} \u2192 ${clientsAfter}` : null,
        base: onlyBase.map((c) => c.text),
        head: onlyHead.map((c) => c.text),
      });
    }
  }
  return { compared, findings, matchedElsewhere };
}

// Differences a human has already read and signed off; see the file's own _why.
const ALLOWLIST = JSON.parse(fs.readFileSync(new URL("./parity-allowlist.json", import.meta.url), "utf8"));
// An entry excuses one specific pair of chains, not everything that ever
// happens to that table in that file: a later dropped `.eq(...)` on the same
// table must still be reported. `head` is the normalised chain as the audit
// prints it (whitespace inside brackets collapsed).
const allowed = (f) =>
  ALLOWLIST.reads.some(
    (a) =>
      a.file === f.file &&
      a.table === f.table &&
      !f.clients &&
      (f.head ?? []).length === (a.head ?? []).length &&
      (f.head ?? []).every((h) => (a.head ?? []).includes(h)) &&
      (f.base ?? []).length === (a.base ?? []).length &&
      (f.base ?? []).every((b) => (a.base ?? []).includes(b)),
  );

const routes = auditRoutes();
const reads = auditReads();
reads.allowed = reads.findings.filter(allowed).length;
// A file with no baseline is new work since the baseline, not a rewrite of
// old work, so it cannot have lost anything — it is reported, like an added
// route, and does not fail the audit.
reads.newFiles = reads.findings.filter((f) => f.kind === "no-baseline");
reads.findings = reads.findings.filter((f) => !allowed(f) && f.kind !== "no-baseline");

if (AS_JSON) {
  console.log(JSON.stringify({ base: BASE, head: HEAD, routes, reads }, null, 2));
} else {
  console.log(`parity audit: ${BASE} → ${HEAD}\n`);
  console.log(
    `routes  ${routes.baseCount} → ${routes.headCount} (from ${routes.baseFiles} → ${routes.headFiles} route files)`,
  );
  for (const c of routes.collisions) console.log(`  COLLISION  ${c} — two route files erase to one URL`);
  for (const u of routes.lost) console.log(`  LOST   ${u}`);
  for (const u of routes.added) console.log(`  ADDED  ${u}`);
  if (!routes.lost.length && !routes.added.length) console.log("  identical URL sets");
  console.log(
    `\nreads   ${reads.compared} door reads compared, ${reads.findings.length} unexplained, ${reads.allowed} allowlisted`,
  );
  for (const f of reads.findings) {
    console.log(`\n  ${f.kind.toUpperCase()}  ${f.table ?? (f.tables ?? []).join(",")}  in ${f.file}`);
    if (f.basePath && f.basePath !== f.file) console.log(`    was ${f.basePath}`);
    if (f.via) console.log(`    via ${f.via}`);
    if (f.clients) console.log(`    client ${f.clients}`);
    for (const b of f.base ?? []) console.log(`    - base  ${b}`);
    for (const h of f.head ?? []) console.log(`    + head  ${h}`);
  }
  if (!reads.findings.length) console.log("  every door read matches its baseline query");
  for (const f of reads.newFiles)
    console.log(`  NEW     ${f.tables.join(", ")}  in ${f.file} — no baseline file, added since ${BASE}`);
  console.log(
    `  ${reads.matchedElsewhere.length} chains were not in their paired baseline file but matched one elsewhere in the baseline tree` +
      (args.includes("--verbose") ? ":" : " (--verbose lists them)"),
  );
  if (args.includes("--verbose")) for (const m of reads.matchedElsewhere) console.log(`    ${m}`);
}
process.exitCode = routes.lost.length || routes.collisions.length || reads.findings.length ? 1 : 0;
