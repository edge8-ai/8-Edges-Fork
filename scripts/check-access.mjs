// Fails a signed-in page, or a server-action file, that does not say which
// permission it needs (ADR 0013).
//
// Every page on the Admin, Team and Portal surfaces is declared in its entity's
// `permissions.ts`: an atom, a kernel atom (`surface.team` for "every team
// member"), or `public` for a sign-in page. Closed by default is only true if
// nothing undeclared can ship, so a new page with no declaration fails here.
// The public site and the access-code library are not on a signed-in surface
// and are not role-gated; their gates are their own (check:private-pages).
//
// The pages that predate the declarations are listed in
// scripts/access-baseline.json, which only shrinks. An entry whose page is now
// declared is stale and must be removed (`--prune` does it), so declaring a page
// and forgetting the baseline fails too, and an entry the committed baseline on
// origin/main does not carry fails as added: the way off the list is a
// declaration, never a new line. `--write-baseline` writes it only when it does
// not exist yet. An entry naming a page this tree does not have is stale
// upstream, where the page was deleted, but not in the public fork, which is
// staged without internal entities and pockets and receives the same file.
//
// Server actions are held to the same rule, because a layout never runs on a
// POST: the declaration is the only page-level rule an action has. Every file
// with "use server" in an installed entity is declared in its entity's
// `actions` section, file by file, unless every export it has is public (on the
// action-auth allowlist with its reason). The files that predate this are the
// baseline's `actions` list, which shrinks the same way.
//
// Invalid declarations are reported too, the same problems gen-deployment
// refuses to generate from.
//
// And a client component that calls a server action must hide the control from
// someone the action's guard would refuse (ADR 0014): see check-access-may.mjs,
// whose allowlist shrinks the same way the baseline does.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifest } from "./entity-manifest.mjs";
import { closureOf, loadDeployments } from "./check-deployment.mjs";
import { OVERLAY_DIR } from "./check-portability.mjs";
import { declarationsOf, serverActionFiles, signedInRoutes, validateDeclarations } from "./access-declarations.mjs";
import { loadAllowlist } from "./check-action-auth.mjs";
import { MAY_ALLOWLIST, checkMay, mayAllowlistOnMain, readMayAllowlist, unguardedClientCalls } from "./check-access-may.mjs";

export const BASELINE = "scripts/access-baseline.json";

/**
 * Entries on the working baseline that the committed one on `origin/main` does
 * not carry. The baseline only shrinks, so any such entry is a page someone put
 * back on it by hand instead of declaring. Empty when there is no committed
 * baseline to compare against (the first PR, or a tree without git history).
 */
export function addedEntries(current, onMain) {
  if (!onMain) return [];
  const before = new Set(onMain);
  return current.filter((p) => !before.has(p));
}

function baselineOnMain(root) {
  try {
    const body = execFileSync("git", ["show", `origin/main:${BASELINE}`], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const parsed = JSON.parse(body);
    return { routes: parsed.routes ?? null, actions: parsed.actions ?? null };
  } catch {
    return { routes: null, actions: null };
  }
}

/** The `<file> <export>` of every action the allowlists make public. */
export function publicExports(root) {
  const here = path.join(root, "scripts");
  return new Set(
    [
      ...loadAllowlist(path.join(here, "action-auth-allowlist.json"), { optional: true }),
      ...loadAllowlist(path.join(here, "action-auth-allowlist.private.json"), { optional: true }),
    ].map((e) => `${e.file} ${e.export}`),
  );
}

/**
 * { routes, declared, undeclared, stale, actions, undeclaredActions, staleActions, problems } for
 * one deployment, against a baseline of app paths and one of action files.
 */
export function checkAccess({ root, manifest, deployment, baseline, actionBaseline = [], publicActions = publicExports(root) }) {
  const found = loadDeployments(root).find((d) => d.name === deployment);
  if (!found) throw new Error(`check-access: no deployments/${deployment}.json`);
  const included = closureOf(manifest, found.entities);
  const declarations = declarationsOf(root, manifest, included);
  const problems = validateDeclarations(root, declarations, Object.keys(manifest.entities));
  const declaredKeys = new Set(
    declarations.filter((d) => d.owner !== "kernel").flatMap((d) => Object.keys(d.routes).map((k) => `${d.owner} ${k}`)),
  );
  const routes = signedInRoutes(root, manifest, included);
  const isDeclared = (r) => declaredKeys.has(`${r.entity} ${r.key}`);
  const allowed = new Set(baseline);
  const undeclared = routes.filter((r) => !isDeclared(r) && !allowed.has(r.appPath)).map((r) => r.appPath);
  const byPath = new Map(routes.map((r) => [r.appPath, r]));
  const upstream = fs.existsSync(path.join(root, OVERLAY_DIR));
  const stale = baseline.filter((p) => {
    const r = byPath.get(p);
    return r ? isDeclared(r) : upstream;
  });

  // An action file is declared by a file-level entry; a `file#export` entry
  // only overrides one export, so it does not declare the rest.
  const declaredActions = new Set(
    declarations.filter((d) => d.owner !== "kernel").flatMap((d) => Object.keys(d.actions).map((k) => `${d.owner} ${k}`)),
  );
  const actions = serverActionFiles(root, manifest, included, publicActions);
  const isActionDeclared = (a) => declaredActions.has(`${a.entity} ${a.key}`);
  const allowedActions = new Set(actionBaseline);
  const undeclaredActions = actions.filter((a) => !isActionDeclared(a) && !allowedActions.has(a.file)).map((a) => a.file);
  const actionByFile = new Map(actions.map((a) => [a.file, a]));
  const staleActions = actionBaseline.filter((f) => {
    const a = actionByFile.get(f);
    return a ? isActionDeclared(a) : upstream;
  });

  return {
    routes: routes.length,
    declared: routes.filter(isDeclared).length,
    undeclared,
    stale,
    actions: actions.length,
    undeclaredActions,
    staleActions,
    problems,
  };
}

function readBaseline(file) {
  if (!fs.existsSync(file)) return null;
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(body.routes)) throw new Error(`check-access: ${BASELINE} has no "routes" array`);
  if (body.actions !== undefined && !Array.isArray(body.actions)) throw new Error(`check-access: ${BASELINE}'s "actions" is not an array`);
  return body;
}

function writeBaseline(file, { why, routes, actions }) {
  const body = { why, routes: [...routes].sort() };
  if (actions !== undefined) body.actions = [...actions].sort();
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`);
}

const MAY_WHY =
  "Client components that call a server action without the hidden-control convention (ADR 0014, AE.1). " +
  "The list only shrinks: a component leaves it when it takes a MayProp, which each entity adopts when a role needing the view/manage split arrives.";
const MAY_PREDATES = "Predates the hidden-control rule (AE.1); the action's own guard still refuses, and no existing page is retrofitted until its entity needs the view/manage split.";

const WHY =
  "Signed-in pages and server-action files that predate the access declarations (ADR 0013, AC.3). " +
  "Both lists only shrink: each migrate batch (AC.6 to AC.14) declares its pages and actions and removes them here.";

function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "..");
  const manifest = loadManifest(root);
  const deployment = process.env.EDGE8_DEPLOYMENT ?? "edge8";
  const file = path.join(root, BASELINE);
  const existing = readBaseline(file);

  // Each list is written once, the first time it exists; after that it only shrinks.
  if (process.argv.includes("--write-baseline")) {
    if (existing && existing.actions !== undefined) {
      console.error(`check-access: ${BASELINE} exists and only shrinks; use --prune to drop declared entries from it.`);
      process.exit(1);
    }
    const r = checkAccess({ root, manifest, deployment, baseline: existing?.routes ?? [], actionBaseline: [] });
    writeBaseline(file, { why: WHY, routes: existing?.routes ?? r.undeclared, actions: r.undeclaredActions });
    console.log(`check-access: wrote ${r.undeclaredActions.length} undeclared action file(s) to ${BASELINE}.`);
    return;
  }

  const baseline = existing?.routes ?? [];
  const actionBaseline = existing?.actions ?? [];
  const result = checkAccess({ root, manifest, deployment, baseline, actionBaseline });
  if (process.argv.includes("--prune") && result.stale.length + result.staleActions.length > 0) {
    const drop = new Set([...result.stale, ...result.staleActions]);
    writeBaseline(file, {
      why: existing?.why ?? WHY,
      routes: baseline.filter((p) => !drop.has(p)),
      actions: existing?.actions === undefined ? undefined : actionBaseline.filter((p) => !drop.has(p)),
    });
    console.log(`check-access: removed ${drop.size} stale entr(y/ies) from ${BASELINE}.`);
    return;
  }

  // The hidden-control rule (ADR 0014): written once, then it only shrinks.
  const publicSet = publicExports(root);
  const found = unguardedClientCalls(root, { isPublicAction: (f, name) => publicSet.has(`${f} ${name}`) });
  const mayList = readMayAllowlist(root);
  if (process.argv.includes("--write-may-allowlist")) {
    if (fs.existsSync(path.join(root, MAY_ALLOWLIST))) {
      console.error(`check-access: ${MAY_ALLOWLIST} exists and only shrinks; remove an entry by giving its component a MayProp.`);
      process.exit(1);
    }
    const entries = found.map((f) => ({ file: f.file, reason: MAY_PREDATES }));
    fs.writeFileSync(path.join(root, MAY_ALLOWLIST), `${JSON.stringify({ why: MAY_WHY, entries }, null, 2)}\n`);
    console.log(`check-access: wrote ${entries.length} client file(s) to ${MAY_ALLOWLIST}.`);
    return;
  }
  const may = checkMay({
    found,
    allowlist: mayList.entries,
    onMain: mayAllowlistOnMain(root),
    exists: (f) => fs.existsSync(path.join(root, f)),
    upstream: fs.existsSync(path.join(root, OVERLAY_DIR)),
  });

  const onMain = baselineOnMain(root);
  const added = [...addedEntries(baseline, onMain.routes), ...addedEntries(actionBaseline, onMain.actions)];
  for (const p of added) {
    console.error(`  ${p}: added to ${BASELINE}, which only shrinks. Declare it in its entity's permissions.ts instead.`);
  }
  for (const p of result.problems) console.error(`  ${p}`);
  for (const p of result.undeclared) {
    console.error(`  ${p}: a signed-in page with no permission declared. Name one in its entity's permissions.ts.`);
  }
  for (const p of result.undeclaredActions) {
    console.error(`  ${p}: a server-action file with no permission declared. Name one in its entity's permissions.ts, under actions.`);
  }
  for (const p of [...result.stale, ...result.staleActions]) {
    console.error(`  ${p}: on ${BASELINE} but declared, or no longer there. Remove it (npm run check:access -- --prune).`);
  }
  for (const v of may.violations) {
    console.error(
      `  ${v.file}: a client component calling ${v.actions.join(", ")} without the hidden-control convention. ` +
        "Take a `may: MayProp` prop (kernel/identity/may-prop.ts) and hide the control unless it holds the action's atom, " +
        "or render it under <Can> from a server parent (ADR 0014).",
    );
  }
  for (const f of may.stale) console.error(`  ${f}: on ${MAY_ALLOWLIST} but no longer calls an action without a MayProp. Remove the entry.`);
  for (const f of may.added) console.error(`  ${f}: added to ${MAY_ALLOWLIST}, which only shrinks. Give the component a MayProp instead.`);
  const mayFailures = may.violations.length + may.stale.length + may.added.length;
  const stale = result.stale.length + result.staleActions.length;
  if (added.length + result.problems.length + result.undeclared.length + result.undeclaredActions.length + stale + mayFailures > 0) {
    console.error(
      `check-access: ${result.problems.length} invalid declaration(s), ${result.undeclared.length} undeclared page(s), ` +
        `${result.undeclaredActions.length} undeclared action file(s), ${stale} stale and ${added.length} added baseline entr(y/ies), ` +
        `${may.violations.length} client component(s) calling an action unhidden, ${may.stale.length + may.added.length} stale or added hidden-control allowlist entr(y/ies).`,
    );
    process.exit(1);
  }
  console.log(
    `check-access: ${result.routes} signed-in page(s), ${result.declared} declared, ${baseline.length} on the baseline; ` +
      `${result.actions} server-action file(s), ${result.actions - actionBaseline.length} declared, ${actionBaseline.length} on the baseline; ` +
      `${found.length} client component(s) call an action without a MayProp, all ${mayList.entries.length} allowlisted.`,
  );
}

const invokedDirectly =
  process.argv[1] && fs.realpathSync(path.resolve(process.argv[1])) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();
