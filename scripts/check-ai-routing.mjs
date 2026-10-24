// Fails when a model call can leave the gateway, when a gateway site has no
// data class constant, or when a site's configured model breaks its class.
//
// Z.6 (plan Part C1): sensitivity is declared per call site in code, and the
// gateway (kernel/ai/gateway.ts) refuses a route that breaks it at run time.
// This is the same rule at build time, against this machine's environment, so
// a class S site pointed at a non-Claude model by an env override fails the
// check before it fails a user's request. Three rules, over every non-test
// .ts/.tsx file under app/, entities/ and kernel/ (kernel/ai itself is the
// gateway and is exempt):
//
//  1. No `modelFor(` and no client of kernel/ai/client outside kernel/ai. A
//     call site resolves its model and gets its client through `aiSite`, or
//     the class check and the ai_calls row never happen.
//  2. Every `aiSite({ ... })` and `otherProviderCall({ ... })` names its
//     `dataClass` as an identifier bound in the same file by
//     `const NAME: AiDataClass = "S" | "C" | "B" | "A"`. A literal, a missing
//     key or an unresolved name is a failure: "no class" must not quietly
//     mean S here, because the point is that someone decided.
//  3. Every aiSite's model, resolved exactly as the gateway resolves it
//     (`siteModelFor(site, modelSite, tier, process.env)`: the site's own
//     AI_MODEL_<SITE> first, then its shared model's), must pass
//     `routeFor` for its class: a class S site on anything but a Claude
//     model fails. A site's fallback (SITE_MODELS, Y.67.3) must pass
//     `routeFor` for the same class. otherProviderCall sites must pass
//     `checkOtherProvider`.
//  4. Every site's route matches scripts/ai-routing-baseline.json, which
//     records by file and site: its class, its tier, the name its model
//     resolves under (`modelSite ?? site`), the model that gives with no
//     override, and the override names themselves (a site sharing a model
//     lists its own AI_MODEL_<SITE> first, Y.71.1), and the host and fallback
//     the code names for it, where it names one; for otherProviderCall, its provider. Rules 1-3 hold
//     whichever model a site is on, so without this a renamed site or a
//     changed tier moved a model while every test and this check stayed
//     green: renaming "admin-idea-plan" drops AI_MODEL_ADMIN_IDEA_PLAN and
//     IDEAS_CLAUDE_MODEL without a word. The comparison reads no
//     environment, so a machine's overrides never fail it. A deliberate
//     change is `--write-baseline`, and the baseline's diff is the review of
//     which site moved. The fork's copy is pruned to the files it receives.
//
// The routing rule and the model registry are imported, not copied, so this
// check and the gateway cannot disagree. Both files keep to erasable
// TypeScript with no path aliases so plain node (type stripping) loads them.
// Detection is textual, like the other gates: the declaration shape above is
// the house pattern, and a shape this scan cannot read fails loudly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(here, "..");

export const BASELINE_FILE = "scripts/ai-routing-baseline.json";

const SCAN_DIRS = ["app", "entities", "kernel"];
const GATEWAY_DIR = "kernel/ai/";
const CLIENT_CALL = /(?<![\w.])(anthropic|anthropicIfConfigured|openRouter|openRouterIfConfigured)\(\)|\bnew Anthropic\(/;
const CLIENT_IMPORT = /from\s+["']@\/kernel\/ai\/client["']/;

/** The non-test .ts/.tsx sources under app/, entities/ and kernel/. scripts/check-prompt-evals.mjs scans the same set. */
export function listSources(root) {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const childRel = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(childRel);
      else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
        out.push(childRel);
      }
    }
  };
  for (const dir of SCAN_DIRS) walk(dir);
  return out.sort();
}

/** Drop // and /* *\/ comments so a sentence about modelFor( is not a call. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
}

/** The text between the `{` after `callee(` and its matching `}`, or null. */
function objectArgument(source, openParen) {
  let i = openParen + 1;
  while (/\s/.test(source[i] ?? "")) i++;
  if (source[i] !== "{") return null;
  let depth = 0;
  for (let j = i; j < source.length; j++) {
    const c = source[j];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return source.slice(i + 1, j);
    }
  }
  return null;
}

function stringConst(source, name) {
  const m = new RegExp(`\\bconst\\s+${name}\\s*(?::\\s*string\\s*)?=\\s*["']([^"']+)["']`).exec(source);
  return m ? m[1] : null;
}

function classConst(source, name) {
  const m = new RegExp(`\\bconst\\s+${name}\\s*:\\s*AiDataClass\\s*=\\s*["']([SCBA])["']`).exec(source);
  return m ? m[1] : null;
}

/** A property value: a string literal, or an identifier resolved through a file-level string const. */
function propValue(body, source, key) {
  const m = new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*(?:["']([^"']+)["']|([A-Za-z_$][\\w$]*))`).exec(body);
  if (!m) return { found: false };
  if (m[1] !== undefined) return { found: true, literal: true, value: m[1] };
  return { found: true, literal: false, name: m[2], value: stringConst(source, m[2]) };
}

/** Every aiSite / otherProviderCall declaration in one file. */
export function declarationsIn(source) {
  const code = stripComments(source);
  const out = [];
  for (const callee of ["aiSite", "otherProviderCall"]) {
    // A type argument (`otherProviderCall<Reply>(`) must not hide a call from the scan.
    const re = new RegExp(`(?<![\\w.])${callee}(?:<[^>()]*>)?\\(`, "g");
    let m;
    while ((m = re.exec(code))) {
      // The gateway's own definition (`function aiSite(`) is not a call.
      if (/function\s+$/.test(code.slice(Math.max(0, m.index - 12), m.index))) continue;
      const line = code.slice(0, m.index).split("\n").length;
      const body = objectArgument(code, m.index + m[0].length - 1);
      if (body === null) {
        out.push({ callee, line, error: `${callee}(...) must take an object literal the check can read.` });
        continue;
      }
      const site = propValue(body, code, "site");
      const modelSite = propValue(body, code, "modelSite");
      const tier = propValue(body, code, "tier");
      const cls = propValue(body, code, "dataClass");
      const provider = propValue(body, code, "provider");
      let dataClass = null;
      let error = null;
      if (!site.found || !site.value) error = `${callee}(...) has no site name the check can read.`;
      else if (!cls.found) error = `${site.value} has no dataClass.`;
      else if (cls.literal) error = `${site.value} passes its class as a literal; declare it as \`const NAME: AiDataClass = "${cls.value}"\`.`;
      else {
        dataClass = classConst(code, cls.name);
        if (!dataClass) error = `${site.value}'s dataClass ${cls.name} is not a \`const ${cls.name}: AiDataClass = "S" | "C" | "B" | "A"\` in this file.`;
      }
      if (!error && callee === "aiSite" && (!tier.found || !tier.value)) error = `${site.value} has no tier the check can read.`;
      out.push({
        callee,
        line,
        site: site.value ?? null,
        modelSite: modelSite.found ? modelSite.value : null,
        tier: tier.value ?? null,
        provider: provider.value ?? null,
        dataClass,
        error,
      });
    }
  }
  return out;
}

async function loadRules(root) {
  const routing = await import(pathToFileURL(path.join(root, "kernel/ai/routing.ts")).href);
  const models = await import(pathToFileURL(path.join(root, "kernel/ai/models.ts")).href);
  return {
    ...routing,
    modelFor: models.modelFor,
    siteModelFor: models.siteModelFor,
    siteOverrideNames: models.siteOverrideNames,
    hostFor: models.hostFor,
    fallbackFor: models.fallbackFor,
    TIERS: models.TIERS,
  };
}

/** A site's fallback on `model`, looked up as the gateway's aiSite looks it up: the site, then its modelSite. */
function fallbackOf(rules, d, model) {
  return rules.fallbackFor(d.site, model) ?? (d.modelSite ? rules.fallbackFor(d.modelSite, model) : null);
}

// A route's fields in one fixed order, so two routes compare by content and
// not by the key order a hand edit of the baseline happened to leave.
const ROUTE_KEYS = ["dataClass", "tier", "modelKey", "model", "overrides", "host", "fallback", "provider"];

function describeValue(value) {
  if (Array.isArray(value)) return value.join(" / ") || "none";
  if (value && typeof value === "object") return Object.keys(value).sort().map((k) => `${k} ${value[k]}`).join(" ");
  return value;
}

function describeRoute(route) {
  return ROUTE_KEYS.filter((k) => k in route)
    .map((k) => `${k} ${describeValue(route[k])}`)
    .join(", ");
}

const FIX = `If the change is deliberate, run \`npm run check:ai-routing -- --write-baseline\` and commit ${BASELINE_FILE}.`;

/** `{ file: { site: route } }` as `file#site` -> { file, site, route }. */
function flatten(routes) {
  const out = new Map();
  for (const [file, bySite] of Object.entries(routes)) {
    for (const [site, route] of Object.entries(bySite)) out.set(`${file}#${site}`, { file, site, route });
  }
  return out;
}

/**
 * What the tree routes differently from the baseline, one message per site.
 * Both sides are `{ file: { site: route } }`. Keyed by file as well as site,
 * so a fork's copy can be pruned to the files it was sent
 * (.github/scripts/prune-baselines.mjs); a site that only changed file is
 * reported as such, because a stale path would prune a live site from a fork.
 */
function compareBaseline(routes, baseline) {
  const errors = [];
  const was = flatten(baseline);
  const now = flatten(routes);
  const nowSites = new Map([...now.values()].map((e) => [e.site, e]));
  const wasSites = new Set([...was.values()].map((e) => e.site));
  for (const [key, b] of was) {
    const t = now.get(key);
    if (t) {
      if (describeRoute(t.route) !== describeRoute(b.route)) {
        errors.push(`${b.file}: ${b.site} moved: ${BASELINE_FILE} routes it as { ${describeRoute(b.route)} }, the tree as { ${describeRoute(t.route)} }. ${FIX}`);
      }
    } else if (nowSites.has(b.site)) {
      errors.push(`${b.site} is declared in ${nowSites.get(b.site).file}, but ${BASELINE_FILE} records it in ${b.file}. ${FIX}`);
    } else {
      const overrides = b.route.overrides?.length ? `, and ${b.route.overrides.join(" / ")} stop applying to it` : "";
      errors.push(`${b.file}: ${b.site} is in ${BASELINE_FILE} but no site declares it any more: a renamed site loses its usage history${overrides}. ${FIX}`);
    }
  }
  for (const [key, t] of now) {
    if (!was.has(key) && !wasSites.has(t.site)) {
      errors.push(`${t.file}: ${t.site} is declared but not in ${BASELINE_FILE}, so nothing records which model it is on. ${FIX}`);
    }
  }
  return errors;
}

function readBaseline(root) {
  const file = path.join(root, BASELINE_FILE);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8")).files ?? {};
}

// Rules 1-3, and each site's route for rule 4: the scan both the check and
// the baseline writer read.
async function scan(root, env) {
  const rules = await loadRules(root);
  const errors = [];
  const sites = [];
  // Rule 4's view of each site, env-free: what the code alone decides.
  const routes = {};
  const bySite = new Map();
  const addRoute = (rel, d, route) => {
    const seen = bySite.get(d.site);
    if (seen && describeRoute(seen) !== describeRoute(route)) {
      errors.push(`${rel}:${d.line}: ${d.site} is declared again with a different route; one site name is one usage line and one set of env overrides.`);
      return;
    }
    bySite.set(d.site, route);
    (routes[rel] ??= {})[d.site] = route;
  };
  for (const rel of listSources(root)) {
    const source = fs.readFileSync(path.join(root, rel), "utf8");
    const code = stripComments(source);
    const inGateway = rel.startsWith(GATEWAY_DIR);
    if (!inGateway) {
      if (/(?<![\w.])(?:modelFor|siteModelFor)\(/.test(code)) errors.push(`${rel}: calls modelFor outside the gateway; declare the site with aiSite from @/kernel/ai/gateway.`);
      if (CLIENT_IMPORT.test(code) || CLIENT_CALL.test(code)) {
        errors.push(`${rel}: builds its own model client; take it from aiSite(...).client() or .clientIfConfigured().`);
      }
    }
    if (inGateway) continue;
    for (const d of declarationsIn(source)) {
      if (d.error) {
        errors.push(`${rel}:${d.line}: ${d.error}`);
        continue;
      }
      if (d.callee === "otherProviderCall") {
        try {
          rules.checkOtherProvider(d.site, d.dataClass, d.provider ?? "unknown");
        } catch (e) {
          errors.push(`${rel}:${d.line}: ${e.message}`);
        }
        sites.push({ file: rel, site: d.site, dataClass: d.dataClass, model: null });
        addRoute(rel, d, { dataClass: d.dataClass, provider: d.provider ?? null });
        continue;
      }
      if (!(d.tier in rules.TIERS)) {
        errors.push(`${rel}:${d.line}: ${d.site} names tier "${d.tier}", which kernel/ai/models.ts does not define.`);
        continue;
      }
      const model = rules.siteModelFor(d.site, d.modelSite, d.tier, env);
      try {
        rules.routeFor(d.site, d.dataClass, model);
      } catch (e) {
        errors.push(`${rel}:${d.line}: ${e.message}`);
      }
      // The fallback is judged for the same class as the site (Y.67.3), as the
      // gateway judges it before the first call.
      const fallback = fallbackOf(rules, d, model);
      if (fallback) {
        try {
          rules.routeFor(d.site, d.dataClass, fallback.model);
        } catch (e) {
          errors.push(`${rel}:${d.line}: the fallback is refused: ${e.message}`);
        }
      }
      sites.push({ file: rel, site: d.site, dataClass: d.dataClass, model });
      const modelKey = d.modelSite ?? d.site;
      const codeModel = rules.modelFor(modelKey, d.tier, {});
      const codeHost = rules.hostFor(d.site, {}, codeModel) ?? (d.modelSite ? rules.hostFor(d.modelSite, {}, codeModel) : null);
      const codeFallback = fallbackOf(rules, d, codeModel);
      addRoute(rel, d, {
        dataClass: d.dataClass,
        tier: d.tier,
        modelKey,
        model: codeModel,
        overrides: rules.siteOverrideNames(d.site, d.modelSite),
        // Recorded only where the code names one, so every other site's entry is unchanged.
        ...(codeHost ? { host: codeHost } : {}),
        ...(codeFallback ? { fallback: { model: codeFallback.model, afterMs: codeFallback.afterMs } } : {}),
      });
    }
  }
  return { errors, sites, routes };
}

/**
 * @returns {Promise<{
 *   errors: string[],
 *   sites: { file: string, site: string, dataClass: string, model: string | null }[],
 *   routes: Record<string, Record<string, object>>,
 * }>}
 */
export async function checkAiRouting(root = DEFAULT_ROOT, env = process.env) {
  const { errors, sites, routes } = await scan(root, env);
  const baseline = readBaseline(root);
  if (baseline === null) errors.push(`${BASELINE_FILE} is missing; run \`npm run check:ai-routing -- --write-baseline\` to record every site's route.`);
  else errors.push(...compareBaseline(routes, baseline));
  return { errors, sites, routes };
}

/**
 * Record the tree's routes as the baseline. Refuses while rules 1-3 fail, since
 * a site the scan could not read would be missing from the file.
 */
export async function writeAiRoutingBaseline(root = DEFAULT_ROOT) {
  const { errors, routes } = await scan(root, {});
  if (errors.length) return { written: false, errors };
  const files = {};
  for (const file of Object.keys(routes).sort()) {
    files[file] = Object.fromEntries(Object.keys(routes[file]).sort().map((site) => [site, routes[file][site]]));
  }
  const body = {
    _comment:
      "Each AI call site's route, by file, as the code alone decides it (no env overrides). Written by `npm run check:ai-routing -- --write-baseline`; check:ai-routing fails when the tree disagrees, so a site that changes model, tier, class, override key or file is a reviewed diff here.",
    files,
  };
  const target = path.join(root, BASELINE_FILE);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(body, null, 2)}\n`);
  return { written: true, errors: [], count: [...flatten(files).keys()].length };
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly && process.argv.includes("--write-baseline")) {
  const res = await writeAiRoutingBaseline();
  if (!res.written) {
    console.error(`check-ai-routing: fix these before writing the baseline:`);
    for (const e of res.errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`check-ai-routing: wrote ${BASELINE_FILE} with ${res.count} site(s).`);
} else if (invokedDirectly) {
  const { errors, sites } = await checkAiRouting();
  if (errors.length) {
    console.error(`check-ai-routing: ${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  const byClass = sites.reduce((acc, s) => ({ ...acc, [s.dataClass]: (acc[s.dataClass] ?? 0) + 1 }), {});
  const summary = ["S", "C", "B", "A"].map((c) => `${c} ${byClass[c] ?? 0}`).join(", ");
  console.log(`check-ai-routing: ${sites.length} gateway site(s) declared a class and route within it (${summary}).`);
}
