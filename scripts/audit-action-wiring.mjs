// Did the buttons keep their wires?
//
// When an action moved to another entity, a client component that used to
// import it directly could no longer name it — a browser door may not export a
// server action — so the action became a prop, handed down by whichever server
// component renders it. That rewiring is invisible to every gate in this repo:
// the types all say `(id: string) => Promise<Result>`, so handing a button the
// *neighbouring* action typechecks, lints, and ships a Publish button that
// archives.
//
// This pairs each rewired component with its baseline self, reads what every
// parent actually passes, and compares the set of actions reaching the
// component with the set it used to import.
//
// Usage: node scripts/audit-action-wiring.mjs [--base <ref>] [--head <ref>]
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const args = process.argv.slice(2);
const flag = (n, d) => (args.indexOf(n) === -1 ? d : args[args.indexOf(n) + 1]);
const BASE = flag("--base", "b97bbeda");
const HEAD = flag("--head", "HEAD");

const git = (...a) => execFileSync("git", a, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

// `--head worktree` reads the files on disk rather than a commit, so the audit
// can be run against work in progress — and so a deliberate miswiring can be
// introduced to check that this script would actually catch one.
const cache = new Map();
const show = (ref, f) => {
  const key = `${ref}:${f}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  try {
    out = ref === "worktree" ? fs.readFileSync(f, "utf8") : git("show", key);
  } catch {
    out = null;
  }
  cache.set(key, out);
  return out;
};
const treeOf = (ref) =>
  git("ls-tree", "-r", "--name-only", ref === "worktree" ? "HEAD" : ref).split("\n");

const renames = new Map();
for (const line of git("diff", "-M40%", "-C40%", "--name-status", BASE, HEAD === "worktree" ? "HEAD" : HEAD).split("\n")) {
  const p = line.split("\t");
  if (/^[RC]/.test(p[0]) && p.length >= 3) renames.set(p[2], p[1]);
}

const headFiles = treeOf(HEAD).filter((f) => /^(entities|app)\/.*\.tsx$/.test(f) && !/\.test\.tsx$/.test(f));
// Every module a bundle or a parent could live in, read once.
const allHeadFiles = treeOf(HEAD).filter((f) => /^(entities|kernel|app)\/.*\.tsx?$/.test(f));

// An action import is one that comes from a module whose job is actions: a
// `*-actions` file, an `actions.ts`, or a `writes.ts`.
const ACTION_MODULE = /(?:^|\/)(?:[\w-]*-)?actions(?:\.ts)?$|\/writes$/;

function importedActions(src) {
  const out = new Set();
  if (!src) return out;
  const re = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) {
    if (!ACTION_MODULE.test(m[2])) continue;
    for (const raw of m[1].split(",")) {
      const cleaned = raw.trim();
      if (/^type\s/.test(cleaned)) continue; // a type is not an action
      const name = cleaned.split(/\s+as\s+/)[0].trim();
      // Types are PascalCase by convention here; actions are camelCase verbs.
      if (name && /^[a-z]/.test(name)) out.add(name);
    }
  }
  return out;
}

// A prop is an action slot when its type is a function and a Promise appears
// anywhere in that type: `save: (id: string) => Promise<Result>` directly, and
// `run: (fn: () => Promise<Result>) => void` — a runner handed the action — too,
// because that is how every coaching card is wired and the miswiring risk is
// the same. The name has to sit where a prop sits (after `{`, `;`, `,` or at a
// line start): a parameter such as the `fn` above has the same shape and is
// not a prop, no parent ever writes `fn={…}`, and counting it inflated the
// number of components this audit claimed to look at.
function actionProps(src) {
  const out = new Set();
  if (!src) return out;
  const re = /(?:^|[{;,\n])\s*(?:readonly\s+)?(\w+)\s*\??\s*:\s*\(/gm;
  let m;
  while ((m = re.exec(src))) {
    // Balance from the opening paren to the end of the type, which runs to the
    // next `;`, `,` or `}` at depth zero.
    let i = m.index + m[0].length - 1;
    let depth = 0;
    const startAt = i;
    while (i < src.length) {
      const c = src[i];
      // `=>` is one token: its `>` is not a closing angle bracket, and reading
      // it as one ends the scan before the return type is seen.
      if (c === "=" && src[i + 1] === ">") {
        i += 2;
        continue;
      }
      if (c === "(" || c === "<" || c === "{" || c === "[") depth += 1;
      else if (c === ")" || c === ">" || c === "}" || c === "]") {
        if (depth === 0) break;
        depth -= 1;
      } else if ((c === ";" || c === ",") && depth === 0) break;
      i += 1;
    }
    const type = src.slice(startAt, i);
    if (/=>/.test(type) && /Promise</.test(type)) out.add(m[1]);
  }
  // A prop typed by a named alias ending in `Actions` — `actions: RoadmapActions`
  // — is a bundle of action slots handed over as one object; the alias hides the
  // function types from the scan above, so the name is the signal.
  const named = /(?:^|[{;,\n])\s*(?:readonly\s+)?(\w+)\s*\??\s*:\s*(\w*Actions)\b/gm;
  while ((m = named.exec(src))) out.add(m[1]);
  return out;
}

// Rewired = the baseline imported actions, and HEAD takes them as props instead.
const rewired = [];
for (const file of headFiles) {
  const src = show(HEAD, file);
  if (!/^\s*["']use client["']/.test(src ?? "")) continue;
  const props = actionProps(src);
  if (!props.size) continue;
  const basePath = renames.get(file) ?? file;
  const baseSrc = show(BASE, basePath);
  const wasImporting = importedActions(baseSrc);
  if (!wasImporting.size) continue;
  const stillImporting = importedActions(src);
  const lost = [...wasImporting].filter((a) => !stillImporting.has(a));
  if (!lost.length) continue;
  rewired.push({ file, basePath, props: [...props], lost, component: file.split("/").pop().replace(/\.tsx$/, "") });
}


// The attributes of every `<Component …>` tag in a source, found by balancing
// brackets rather than by a regex ending at the first `>`. A non-greedy
// `[\s\S]*?/?>` stops at the `>` inside an arrow function — `onSave={(id) =>
// save(id)}` — and every attribute after it falls off the tag. Each attribute is
// either an identifier (`{name}`) or an inline expression, and the two are told
// apart because an inline expression cannot be traced to an import and has to be
// reported as such rather than dropped.
function tagsOf(src, component) {
  const out = [];
  const open = new RegExp(`<${component}\\b`, "g");
  let m;
  while ((m = open.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    while (i < src.length) {
      const c = src[i];
      if (quote) {
        if (c === "\\") i += 1;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'" || c === "`") quote = c;
      else if (c === "{" || c === "(" || c === "[") depth += 1;
      else if (c === "}" || c === ")" || c === "]") depth -= 1;
      else if (c === ">" && depth === 0) break;
      i += 1;
    }
    const body = src.slice(m.index + m[0].length, i);
    const attrs = [];
    const are = /(\w+)=\{/g;
    let a;
    while ((a = are.exec(body))) {
      // Read the balanced `{…}` so an arrow or a call is captured whole.
      let j = a.index + a[0].length;
      let d = 1;
      while (j < body.length && d > 0) {
        if (body[j] === "{") d += 1;
        else if (body[j] === "}") d -= 1;
        j += 1;
      }
      const value = body.slice(a.index + a[0].length, j - 1).trim();
      attrs.push({ prop: a[1], value, identifier: /^\w+$/.test(value) ? value : null });
    }
    out.push(attrs);
    open.lastIndex = i;
  }
  return out;
}

// What every parent passes into those slots.
function parentsOf(componentFile, component) {
  const out = [];
  for (const file of allHeadFiles) {
    if (file === componentFile) continue;
    const src = show(HEAD, file);
    if (!src || !src.includes(component)) continue;
    if (!new RegExp(`<${component}[\\s/>]`).test(src)) continue;
    // Resolve each identifier the parent imports, so a passed name can be
    // traced to the module it really comes from.
    const imports = new Map();
    const ire = /import\s*\{([^}]*)\}\s*from\s*["']([^"']+)["']/g;
    let im;
    while ((im = ire.exec(src)))
      for (const raw of im[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
        if (name) imports.set(name, im[2]);
      }
    // Every attribute on this component's JSX tags, arrows and calls included.
    for (const tagAttrs of tagsOf(src, component)) {
      const attrs = tagAttrs.map((a) => ({
        prop: a.prop,
        passed: a.identifier ?? `(inline) ${a.value.replace(/\s+/g, " ").slice(0, 60)}`,
        from: a.identifier ? imports.get(a.identifier) ?? "(local)" : "(inline)",
      }));
      if (attrs.length) out.push({ file, attrs });
    }
  }
  return out;
}

// A parent may hand the component one object holding every action rather than
// one prop per action. The object is the wiring, so it has to be opened: a key
// whose value is not the identically-named action is a crossed wire, which is
// the whole failure this audit exists to catch.
const bundleCache = new Map();
function bundleWires(name) {
  if (bundleCache.has(name)) return bundleCache.get(name);
  const found = findBundle(name);
  bundleCache.set(name, found);
  return found;
}
function findBundle(name) {
  for (const file of allHeadFiles) {
    const src = show(HEAD, file);
    if (!src) continue;
    const re = new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`);
    const m = re.exec(src);
    if (!m) continue;
    const wires = new Map();
    for (const entry of m[1].split(",")) {
      const line = entry.trim().replace(/\/\/[^\n]*/g, "").trim();
      if (!line) continue;
      const kv = /^(\w+)\s*:\s*(\w+)$/.exec(line);
      if (kv) wires.set(kv[1], kv[2]);
      else if (/^\w+$/.test(line)) wires.set(line, line); // shorthand
    }
    return { file, wires };
  }
  return null;
}

const findings = [];
for (const r of rewired) {
  const parents = parentsOf(r.file, r.component);
  const passedNames = new Set();
  const crossed = [];
  const bundles = [];
  for (const p of parents)
    for (const a of p.attrs) {
      const bundle = /^[A-Z][A-Z0-9_]*$/.test(a.passed) ? bundleWires(a.passed) : null;
      if (bundle) {
        bundles.push(`${a.passed} (${bundle.file})`);
        for (const [key, value] of bundle.wires) {
          passedNames.add(value);
          if (key !== value) crossed.push(`${a.passed}.${key} = ${value}`);
        }
      } else if (r.props.includes(a.prop)) {
        // A prop name is chosen for the component's vocabulary (`save`), not
        // the action's (`updateApplication`), so a difference here means
        // nothing. Only a bundle key, which mirrors its action's name by
        // construction, can be crossed.
        passedNames.add(a.passed);
      }
    }
  const missing = r.lost.filter((a) => !passedNames.has(a));
  const unexpected = [...passedNames].filter((a) => !r.lost.includes(a));
  findings.push({ ...r, parents, bundles, crossed, passed: [...passedNames], missing, unexpected, orphan: parents.length === 0 });
}

console.log(`action wiring: ${BASE} → ${HEAD}\n`);
console.log(`${rewired.length} components had an action import replaced by a prop\n`);
let bad = 0;
for (const f of findings) {
  const clean = !f.missing.length && !f.unexpected.length && !f.orphan && !f.crossed.length;
  if (clean) continue;
  bad += 1;
  console.log(`  ${f.component}  (${f.file})`);
  console.log(`    was ${f.basePath}`);
  console.log(`    action props: ${f.props.join(", ")}`);
  console.log(`    imported at baseline, now passed in: ${f.lost.join(", ")}`);
  if (f.orphan) console.log(`    NO PARENT RENDERS IT — the component is unreachable`);
  else {
    for (const p of f.parents) console.log(`    parent ${p.file}: ${p.attrs.map((a) => `${a.prop}={${a.passed}}`).join(" ")}`);
    if (f.missing.length) console.log(`    NEVER PASSED: ${f.missing.join(", ")}`);
    if (f.bundles.length) console.log(`    via bundle ${f.bundles.join(", ")}`);
    if (f.unexpected.length) console.log(`    PASSED BUT NOT IN THE BASELINE SET: ${f.unexpected.join(", ")}`);
    if (f.crossed.length) console.log(`    CROSSED WIRE: ${f.crossed.join(", ")}`);
  }
  console.log("");
}
console.log(bad === 0 ? "every rewired component receives the actions it used to import" : `${bad} need a look`);

// ── drift ───────────────────────────────────────────────────────────────────
// The section above only covers components the refactor rewired. Most of the
// components that take an action as a prop took one before the refactor too —
// so the question for them is not "did the wiring appear" but "did it change".
// A parent that now passes a different action into the same prop is the same
// crossed wire, arrived at from the other direction, and nothing above sees it.
const baseFiles = treeOf(BASE).filter((f) => /^(entities|app|components|lib)\/.*\.tsx?$/.test(f));
const baseNameOf = new Map([...renames].map(([head, base]) => [head, base]));

// Every `prop={action}` pairing any parent makes with this component, at one
// ref, counted. A multiset rather than a map from prop to action: two parents
// may render the same component and pass the same prop, and keying by prop
// alone would let one silently overwrite the other — which is exactly the
// parent whose wiring changed.
function wiringAt(ref, files, component, props) {
  const out = new Map();
  for (const file of files) {
    const src = show(ref, file);
    if (!src || !new RegExp(`<${component}[\\s/>]`).test(src)) continue;
    const imports = new Map();
    const ire = /import\s*\{([^}]*)\}\s*from\s*["\']([^"\']+)["\']/g;
    let im;
    while ((im = ire.exec(src)))
      for (const raw of im[1].split(",")) {
        const name = raw.trim().replace(/^type\s+/, "").split(/\s+as\s+/).pop().trim();
        if (name) imports.set(name, im[2]);
      }
    for (const tagAttrs of tagsOf(src, component))
      for (const a of tagAttrs)
        if (props.includes(a.prop)) {
          // An inline expression is compared by its text, so wrapping the same
          // action in an arrow reads as a change — which it is, until a person
          // has looked at what the arrow does.
          const pair = `${a.prop}={${a.identifier ?? a.value.replace(/\s+/g, " ")}}`;
          out.set(pair, (out.get(pair) ?? 0) + 1);
        }
  }
  return out;
}

const drift = [];
let comparable = 0;
const comparableNames = [];
for (const file of headFiles) {
  const src = show(HEAD, file);
  if (!/^\s*["\']use client["\']/.test(src ?? "")) continue;
  const props = [...actionProps(src)];
  if (!props.length) continue;
  const component = file.split("/").pop().replace(/\.tsx$/, "");
  const basePath = baseNameOf.get(file) ?? file;
  if (!show(BASE, basePath)) continue; // new component, nothing to drift from
  const before = wiringAt(BASE, baseFiles, component, props);
  const after = wiringAt(HEAD, allHeadFiles, component, props);
  if (!before.size) continue;
  comparable += 1;
  comparableNames.push(component);
  const gone = [...before].filter(([pair, n]) => (after.get(pair) ?? 0) < n).map(([pair]) => pair);
  const fresh = [...after].filter(([pair, n]) => (before.get(pair) ?? 0) < n).map(([pair]) => pair);
  if (gone.length || fresh.length) drift.push({ component, file, gone, fresh });
}

const checkedComponents = headFiles.filter((f) => {
  const src = show(HEAD, f);
  return /^\s*["\']use client["\']/.test(src ?? "") && actionProps(src).size > 0;
}).length;

console.log(
  `\n${checkedComponents} components take an action as a prop; ${comparable} of them had parent wiring at ${BASE} to compare against\n`,
);
if (args.includes("--verbose")) console.log(`  compared: ${comparableNames.sort().join(", ")}\n`);
for (const d of drift) {
  console.log(`  ${d.component}  (${d.file})`);
    for (const pair of d.gone) console.log(`    - was  ${pair}`);
    for (const pair of d.fresh) console.log(`    + now  ${pair}`);
}
if (!drift.length) console.log("  no parent passes a different action into a prop than it did before");
process.exitCode = bad === 0 && drift.length === 0 ? 0 : 1;
