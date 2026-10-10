// The repo's one ESLint config (B.18.1). It replaced .eslintrc.json because
// Next 16 removes `next lint`, and with it the only thing that read that file
// for the lint gate. `npm run lint`, the lint-warning ratchet and the
// pre-commit hook all run the ESLint CLI against this file.
//
// scripts/eslint-config.test.mjs loads this file through ESLint's own API and
// proves each guard below still fails when broken. Change a rule here and that
// test says whether a guard went with it.

import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import entityZones from "./eslint.entities.mjs";

// eslint-plugin-react-hooks 7 arrives with Next 16 and brings the React
// Compiler's rules, mostly at error. They start at warn here (B.18.3, Q14):
// the upgrade stays about Next, and scripts/lint-warning-baseline.json holds
// today's count for each so it can only go down; a rule is promoted to error
// when its count reaches zero (AR-37). Derived from the preset rather than
// listed, so a compiler rule a later release adds also lands at warn, where
// the ratchet refuses it until someone gives it a baseline or fixes its hits.
// The two classic hooks rules are not compiler rules and stay at error below.
const CLASSIC_HOOKS_RULES = new Set(["react-hooks/rules-of-hooks", "react-hooks/exhaustive-deps"]);
const reactCompilerRulesAtWarn = Object.fromEntries(
  nextCoreWebVitals
    .flatMap((config) => Object.keys(config.rules ?? {}))
    .filter((rule) => rule.startsWith("react-hooks/") && !CLASSIC_HOOKS_RULES.has(rule))
    .map((rule) => [rule, "warn"]),
);

// kernel/ai/client.ts is the one place an Anthropic client is built (shared
// timeout and retry policy). Nineteen call sites used to construct their own;
// this keeps the count at one (AR-13). The factory override below exempts the
// factory itself.
const ANTHROPIC_CONSTRUCTOR = {
  selector: "NewExpression[callee.name='Anthropic']",
  message: "Construct the Anthropic client only in kernel/ai/client.ts; import anthropic() from there.",
};

// A private library route written into shipped code reaches the public fork,
// where the route does not exist; the fork sync scanner refuses the tree and
// every later sync is blocked (PR #1273). The value belongs in a module the
// fork overlay stubs (entities/org/lib/onboarding-deck.ts) or in a file on
// .github/fork-sync-exclude.txt, where the override below turns this off.
const PRIVATE_ROUTE_MESSAGE =
  "Do not hardcode a private route. Put the value in a module the fork overlay stubs to null (see entities/org/lib/onboarding-deck.ts) or move the file onto .github/fork-sync-exclude.txt.";
const PRIVATE_ROUTE_LITERAL = {
  selector: "Literal[value=/\\/(workflows\\/private|blueprints)(\\/|$)/]",
  message: PRIVATE_ROUTE_MESSAGE,
};
const PRIVATE_ROUTE_TEMPLATE = {
  selector: "TemplateElement[value.raw=/\\/(workflows\\/private|blueprints)(\\/|$)/]",
  message: PRIVATE_ROUTE_MESSAGE,
};

// getSiteOrigin() has been async since B.18.3, and a Promise inside a template
// string type-checks: the survey reminder cron built every link as
// "[object Promise]/team/..." from 2026-10-03 until SA.2. The general guard,
// @typescript-eslint/restrict-template-expressions, needs type-aware linting;
// measured on 2026-10-07 it adds a whole-program TypeScript build to every lint
// and pre-commit run (about 45 s, 3.3 GB peak) and its only hits were nine
// untyped JSON values, not one Promise. This syntactic check catches the one
// helper that turned async under its callers, for free.
//
// A call passes when its Promise is awaited or handed on whole: returned, the
// body of an arrow, or an element of Promise.all and its siblings, where the
// caller awaits it. Everywhere else, a template string first among them, it is
// refused. The guard knows the helper only by name, so a call through a
// namespace import counts, and importing it under another name is refused
// (SA.3). Holding it in a variable (`const f = getSiteOrigin`) still slips past.
const SITE_ORIGIN_CALL =
  "CallExpression:matches([callee.name='getSiteOrigin'], [callee.type='MemberExpression'][callee.property.name='getSiteOrigin'])";
const SITE_ORIGIN_HANDED_ON = [
  "AwaitExpression > CallExpression",
  "ReturnStatement > CallExpression",
  "ArrowFunctionExpression > CallExpression.body",
  "CallExpression[callee.object.name='Promise'][callee.property.name=/^(all|allSettled|race|any)$/] > ArrayExpression > CallExpression",
].join(", ");
const SITE_ORIGIN_GUARDS = [
  {
    selector: `${SITE_ORIGIN_CALL}:not(${SITE_ORIGIN_HANDED_ON})`,
    message: "getSiteOrigin() is async: write `await getSiteOrigin()`. Un-awaited, it renders as \"[object Promise]\" in a link.",
  },
  {
    selector: "ImportSpecifier[imported.name='getSiteOrigin'][local.name!='getSiteOrigin']",
    message: "Import getSiteOrigin under its own name: the lint rule that makes sure it is awaited finds it by that name.",
  },
];

const config = [
  { ignores: ["video/**", "supabase/functions/**", ".next/**", "node_modules/**"] },
  // Flat config lints only what a `files` pattern names, so the extensions are
  // listed once here.
  { files: ["**/*.{js,mjs,cjs,jsx,ts,mts,cts,tsx}"] },
  // Next's own flat preset (B.18.3; B.18.1 and B.18.2 loaded its eslintrc form
  // through FlatCompat). It registers the import plugin the entity zones and
  // import/no-cycle need.
  ...nextCoreWebVitals,
  // Layering zones (`import/no-restricted-paths`), GENERATED from
  // entities.manifest.json by scripts/gen-entity-zones.mjs. Edit the manifest,
  // run `npm run gen:entity-zones`, commit both.
  entityZones,
  { rules: reactCompilerRulesAtWarn },
  {
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "no-restricted-syntax": [
        "error",
        ANTHROPIC_CONSTRUCTOR,
        PRIVATE_ROUTE_LITERAL,
        PRIVATE_ROUTE_TEMPLATE,
        ...SITE_ORIGIN_GUARDS,
      ],
      // The four E8-13 debt rules, each promoted back to error once its count
      // reached zero. import/no-cycle closed in Q2 (2026-09-05): the entity
      // layer order in entities.manifest.json (check:entity-layers) makes a
      // cross-entity cycle impossible, and the one intra-entity cycle (htt goal
      // grammar) was split.
      "import/no-cycle": "error",
      // Promoted in Q1 (2026-09-05) once every hook listed its real
      // dependencies; the one remaining disable (CampaignHub's mount-only
      // auto-draft) carries its reason.
      "react-hooks/exhaustive-deps": "error",
      // Promoted in Q1 (2026-09-05): local and fixed-size images use
      // next/image; the remaining <img> are uploads of unknown size and each
      // disable states why.
      "@next/next/no-img-element": "error",
      // next/core-web-vitals ships this at error; the 37 hits in JSX copy text
      // were escaped in Q1 (2026-09-05), so the rule is back at its shipped
      // severity.
      "react/no-unescaped-entities": "error",
    },
  },
  { files: ["kernel/ai/client.ts"], rules: { "no-restricted-syntax": "off" } },
  // Files the fork never receives may name private routes: the library entity
  // and the private mounts (all on .github/fork-sync-exclude.txt), the org
  // module the overlay stubs, the checks that look for such links, and tests.
  // A later block's rule options replace an earlier block's rather than merge
  // with them, so this list drops only the private-route selectors and names
  // again the guards that have nothing to do with the fork: one Anthropic
  // client, and getSiteOrigin awaited. A guard left out of it is switched off
  // for the files this block lists.
  {
    files: [
      "entities/library/**",
      // A glob, not a link: it names the private mounts so the rule can exempt
      // them. check:fork-safe passes this file; the rule cannot tell the two apart.
      // eslint-disable-next-line no-restricted-syntax
      "app/workflows/private/**",
      "app/private/**",
      "app/proposals/**",
      "entities/portal/routes/proposals/**",
      "entities/org/lib/onboarding-deck.ts",
      "entities/team/lib/company-docs.ts",
      "entities/site/routes/robots.ts",
      "scripts/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: { "no-restricted-syntax": ["error", ANTHROPIC_CONSTRUCTOR, ...SITE_ORIGIN_GUARDS] },
  },
];

export default config;
