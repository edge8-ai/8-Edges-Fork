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

// A.38: five approval-gated flows each wrote the version-checked decision
// themselves, decidePendingApproval bound to a row and version with `expect`,
// and the copies drifted (two had no resume for an approval that landed when
// the move after it did not). kernel/approvals/versioned.ts is the one place
// that binds a decision to a version now, so a call that binds one anywhere
// else is a new copy. A decision without `expect` (a Reject, a signature) is
// not refused, and the hiring chain decides through its own port.
const VERSION_BOUND_DECISION = {
  selector: "CallExpression[callee.name='decidePendingApproval'] > ObjectExpression > Property[key.name='expect']",
  message: "Decide a versioned approval through decideForVersion (kernel/approvals/versioned.ts, A.38), which also resumes one already approved.",
};

// A.44: a broadcast's status moves by hand through one module,
// entities/campaigns/lib/broadcast-lifecycle.ts, which owns each verb's
// allowed-from set and the order of its letter steps. Before it, each route
// action wrote its own status, and Cancel wrote before withdrawing the letter's
// send (BUG-2). These match an object literal naming `status` handed to an
// update of email_campaigns, directly or through the entity's writer, so a
// route that writes a broadcast's status calls the module instead. A.55 adds
// Approve and the routines (a person's verbs in broadcast-lifecycle.ts, a
// routine's through moveByRoutine), and the one write in broadcast-transitions.ts.
const BROADCAST_STATUS_MESSAGE =
  "Move a broadcast's status through entities/campaigns/lib/broadcast-lifecycle.ts (a person's verb) or moveByRoutine in broadcast-transitions.ts (a routine's), A.44/A.55: they check the allowed-from set, refuse a lost race and order the letter's steps.";
const BROADCAST_STATUS_WRITES = [
  {
    selector:
      "CallExpression[callee.property.name='update'][callee.object.callee.property.name='from'][callee.object.arguments.0.value='email_campaigns'] > ObjectExpression > Property[key.name='status']",
    message: BROADCAST_STATUS_MESSAGE,
  },
  {
    selector: "CallExpression[callee.name='updateEmailCampaigns'] > ObjectExpression > Property[key.name='status']",
    message: BROADCAST_STATUS_MESSAGE,
  },
];

// A.42: a card's stage (open, done, set aside) is asked in one vocabulary,
// entities/boards/lib/card-stage.ts. Before it, about sixty sites in the boards
// entity compared the stored string, so adding Not Doing was a 28-file sweep
// and the board index counted the stored status while the Workboard read the
// lane. These match a comparison of anything named `status` with a stage
// literal, and a server filter on `status` by one. Telling tasks apart from
// other tables by value is enough inside boards: its boards and sprints are
// "active" or "archived"/"closed", and no other table it reads uses these
// three words for its status.
const CARD_STAGE_MESSAGE =
  "Ask a card's stage through entities/boards/lib/card-stage.ts (isOpen, isDone, isSetAside, isClosed; OPEN_STATUS and its siblings in a filter), A.42.";
const STAGE_WORD = "/^(open|done|not_doing)$/";
const NAMED_STATUS = (side) =>
  `:matches([${side}.name='status'], [${side}.property.name='status'], [${side}.expression.property.name='status'])`;
const CARD_STAGE_LITERALS = [
  { selector: `BinaryExpression[operator=/^(===|!==|==|!=)$/][right.value=${STAGE_WORD}]${NAMED_STATUS("left")}`, message: CARD_STAGE_MESSAGE },
  { selector: `BinaryExpression[operator=/^(===|!==|==|!=)$/][left.value=${STAGE_WORD}]${NAMED_STATUS("right")}`, message: CARD_STAGE_MESSAGE },
  { selector: `CallExpression[callee.property.name=/^(eq|neq)$/][arguments.0.value='status'][arguments.1.value=${STAGE_WORD}]`, message: CARD_STAGE_MESSAGE },
  { selector: `CallExpression[callee.property.name='in'][arguments.0.value='status'] > ArrayExpression > Literal[value=${STAGE_WORD}]`, message: CARD_STAGE_MESSAGE },
  { selector: "CallExpression[callee.property.name='not'][arguments.0.value='status'][arguments.2.value=/(open|done|not_doing)/]", message: CARD_STAGE_MESSAGE },
];

// A.52: A.41's import rail sees only an import of insertTaskStageLog, so a
// stage-log row written straight through `.from("task_stage_log").insert(...)`
// walked past it; createCard and the meeting cards did exactly that. This
// matches an insert or upsert chained on that table, so every new row goes
// through the writer and the import rail decides who may call it. Reads of the
// table (the drawer's history, the Flow view, undo) and the sprint delete's
// update of its sprint columns are not rows of a card's history, so they stay.
const TASK_STAGE_LOG_DIRECT_WRITE = {
  selector:
    "CallExpression[callee.property.name=/^(insert|upsert)$/][callee.object.callee.property.name='from'][callee.object.arguments.0.value='task_stage_log']",
  message: "Write a stage-log row through insertTaskStageLog (entities/boards/lib/writes.ts), which A.41's import rail guards (A.52).",
};

// A.58: a team member's status is asked in kernel/identity/team-statuses.ts,
// which names the two sets every surface means: PORTAL_STATUSES (staff now or
// starting) and CURRENT_TEAM_STATUSES (on the team now). Before it, the four-
// and three-value sets were spelled out at six filters and named three more
// times as local aliases, and a spelled copy is how the CRM's people picker
// once filtered on values the column never held. These match an array literal
// that is exactly one of the two sets, in any order, wherever it sits: A.58
// first matched only the literal inside a `.in("status", …)` call, and four
// named copies (`const LIVE_STATUSES = [...]` and the like) walked past it
// because the filter read the name, not the array (A.61). Exact sets only,
// because other surfaces ask other questions and spell them on purpose: a
// coach's roster is ["active", "pre_start"], the probation list
// ["active", "pre_start", "on_leave"], and a selector matching any array that
// names pre_start or on_leave would refuse those decisions as if they were
// copies. The kernel file that names the sets sits outside entities/**, where
// this rail applies.
const TEAM_STATUS_MESSAGE =
  "Name a team member's status set instead of spelling it: PORTAL_STATUSES (staff now or starting) or CURRENT_TEAM_STATUSES (on the team now) from kernel/identity/team-statuses.ts, A.58.";
const TEAM_STATUS_SET = (values) =>
  `ArrayExpression[elements.length=${values.length}]` + values.map((v) => `:has(> Literal[value='${v}'])`).join("");
const TEAM_STATUS_LITERALS = [
  { selector: TEAM_STATUS_SET(["active", "on_leave", "notice", "pre_start"]), message: TEAM_STATUS_MESSAGE },
  { selector: TEAM_STATUS_SET(["active", "on_leave", "notice"]), message: TEAM_STATUS_MESSAGE },
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
        VERSION_BOUND_DECISION,
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
  // A.58: no entity spells a team member's status set (TEAM_STATUS_LITERALS
  // above). A later block's options replace an earlier one's, so this names
  // again every guard the first block sets, and the campaigns and boards blocks
  // below carry these selectors too. The fork block's files (the library
  // entity and a few others) are left without it, since that block also
  // covers scripts/. Tests may spell a set to build their rows.
  {
    files: ["entities/**"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ANTHROPIC_CONSTRUCTOR,
        PRIVATE_ROUTE_LITERAL,
        PRIVATE_ROUTE_TEMPLATE,
        ...SITE_ORIGIN_GUARDS,
        VERSION_BOUND_DECISION,
        ...TEAM_STATUS_LITERALS,
      ],
    },
  },
  // A.36: an application is decided by hand in one module,
  // entities/hiring/lib/hand-decision.ts, which owes every decision the chain's
  // refusal, the stage log, the chain run's end and the interviews' cancellation.
  // Before it, each surface assembled that sequence from these four pieces, and
  // the two Team verbs used none of them. Only the module and the hiring chain,
  // which records decisions by its own path, may import them, so the next
  // surface that decides an application calls the module instead of copying
  // the sequence again.
  //
  // A.41: the same block carries a second rail, because a later block's options
  // for a rule replace an earlier block's, so a block of its own would switch
  // A.36 off wherever the two overlap. A card's placement goes through one
  // module per axis: landCard (entities/boards/lib/land-card.ts) for a column,
  // landInSprint (land-in-sprint.ts) for a sprint, each owning the order of the
  // write, the stage-log row, the audit row and the events. Promotion and three
  // sprint actions had written the stage-log row themselves, and every copy
  // dropped part of what a landing owes: a promoted card's completion, and the
  // audit row of a sprint move whose history failed (BUG-5). So only the two
  // modules and the births that start a card's history may import the writer.
  // The ignores are one list for both rails: none of the boards files imports
  // a hiring primitive and none of the hiring files imports the writer.
  //
  // A.53: a third rail, in this block for the same reason. A card is born
  // through bearCard (entities/boards/lib/bear-card.ts), which owes it the
  // position, the status its column gives, the create row, the audit row and
  // the events. Nine births in seven files had each assembled a subset of that,
  // so only bearCard may import the `tasks` insert writer. Since the births
  // now go through it, createCard, the meeting cards and the repeating card's
  // successor no longer write a stage-log row and left A.41's list, and the
  // arrival follow-ups landCard and bearCard share (landing-effects.ts) joined it.
  {
    files: ["entities/**", "app/**", "kernel/**"],
    ignores: [
      "entities/hiring/lib/hand-decision.ts",
      "entities/hiring/lib/chain/**",
      // A.41's: what an arrival in a column owes, shared by a move and a
      // birth, and the sprint placement. A.53's: the birth.
      "entities/boards/lib/landing-effects.ts",
      "entities/boards/lib/land-in-sprint.ts",
      "entities/boards/lib/bear-card.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            // A.41. A regex rather than a glob: `**/writes` also matches every
            // entity index's `export * from "./lib/writes"`, which ESLint
            // reports for a restricted name whatever that module exports. This
            // names boards' writer by the paths that reach it: from boards/lib,
            // from a folder beside or below it, and through the door.
            {
              regex: "^(\\./writes|(\\.\\./)+(lib/)?writes|.*entities/boards(/index|/lib/writes)?)$",
              importNames: ["insertTaskStageLog"],
              message: "Place a card through landCard (entities/boards/lib/land-card.ts) or landInSprint (land-in-sprint.ts), which write its stage history (A.41).",
            },
            // A.53. The same paths: boards' writer from beside or below it,
            // and through the door, which other entities use.
            {
              regex: "^(\\./writes|(\\.\\./)+(lib/)?writes|.*entities/boards(/index|/lib/writes)?)$",
              importNames: ["insertTasks"],
              message: "Make a card through bearCard (entities/boards/lib/bear-card.ts), which owes it its position, status, create row, audit row and events (A.53). A child row goes through bearSubtasks.",
            },
            { group: ["**/chain/direct-decision"], importNames: ["directDecisionRefusal"], message: "Decide an application through changeApplicationByHand (entities/hiring/lib/hand-decision.ts, A.36)." },
            { group: ["**/chain/close"], importNames: ["closeChainForDecided"], message: "Decide an application through changeApplicationByHand (entities/hiring/lib/hand-decision.ts, A.36)." },
            { group: ["**/interviews-writes"], importNames: ["cancelScheduledInterviews"], message: "Decide an application through changeApplicationByHand (entities/hiring/lib/hand-decision.ts, A.36)." },
            { group: ["**/stage-log"], importNames: ["logStageMove"], message: "Move an application's stage through changeApplicationByHand (entities/hiring/lib/hand-decision.ts, A.36)." },
          ],
        },
      ],
    },
  },
  // A.43: a person's button on a tick-driven chain claims the step's tick
  // through the run recorder, and five chains each wrote that claim out; the
  // copies drifted (a shadow wait counted as a failed attempt, a holder that
  // was never read). kernel/audit/step-now.ts is the one button now, and
  // claiming a run by hand needs recordRoutineRun, so outside the kernel only
  // the daily check-in, which records its own server action as a run and claims
  // no step, may import it. stepTick stays importable: five chains name their
  // approval waits with it, and a tick string on its own claims nothing.
  // A later block's options for a rule replace an earlier block's, so this one
  // uses the TypeScript twin of no-restricted-imports to leave A.36's intact;
  // that rule's plugin is registered for TypeScript files only.
  {
    files: ["entities/**/*.{ts,tsx}", "app/**/*.{ts,tsx}"],
    // The personal email agent's Dry run and Run now buttons are the same case
    // as the check-in: each records its own server action as a run of the
    // hourly routine and claims no step, so the tokens it spends show on
    // Settings -> Agents.
    ignores: [
      "entities/company-os/lib/check-in/check-in-actions.ts",
      "entities/campaigns/routes/admin/(dashboard)/revenue/marketing/personal/actions.ts",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/audit/routine-runs"], importNames: ["recordRoutineRun"], message: "Run a chain's step from a button through runStepNow (kernel/audit/step-now.ts, A.43), or a run loop's runNow." },
          ],
        },
      ],
    },
  },
  // A.44: no route of the campaigns entity writes a broadcast's status (the
  // selectors above). A later block's options replace an earlier one's, so this
  // names again every guard the first block sets; tests are left to the fork
  // block below, which drops the private-route selectors for them.
  // A.55 widens it to lib/ and crons/: the letter's release and cancel and the
  // send routine's sending -> sent wrote the status by literal there, past a
  // rail that looked only at routes. broadcast-transitions.ts holds the one
  // write that every verb, a person's or a routine's, goes through.
  {
    files: ["entities/campaigns/routes/**", "entities/campaigns/lib/**", "entities/campaigns/crons/**"],
    ignores: ["entities/campaigns/lib/broadcast-transitions.ts", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ANTHROPIC_CONSTRUCTOR,
        PRIVATE_ROUTE_LITERAL,
        PRIVATE_ROUTE_TEMPLATE,
        ...SITE_ORIGIN_GUARDS,
        VERSION_BOUND_DECISION,
        ...BROADCAST_STATUS_WRITES,
        ...TEAM_STATUS_LITERALS,
      ],
    },
  },
  // A.42: no file of the boards entity but card-stage.ts asks a card's stage by
  // its stored word (CARD_STAGE_LITERALS above). A later block's options replace
  // an earlier one's, so this names again every guard the first block sets;
  // tests are left to the fork block below, which drops the private-route
  // selectors for them, and may spell the stored words to build their rows.
  // A.52 adds the stage-log writer's rail (TASK_STAGE_LOG_DIRECT_WRITE above);
  // writes.ts holds the one legitimate insert, and ignoring it here leaves it
  // under the first block's guards.
  {
    files: ["entities/boards/**"],
    ignores: ["entities/boards/lib/card-stage.ts", "entities/boards/lib/writes.ts", "**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        ANTHROPIC_CONSTRUCTOR,
        PRIVATE_ROUTE_LITERAL,
        PRIVATE_ROUTE_TEMPLATE,
        ...SITE_ORIGIN_GUARDS,
        VERSION_BOUND_DECISION,
        ...CARD_STAGE_LITERALS,
        TASK_STAGE_LOG_DIRECT_WRITE,
        ...TEAM_STATUS_LITERALS,
      ],
    },
  },
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
      "scripts/**",
      "**/*.test.ts",
      "**/*.test.tsx",
    ],
    rules: { "no-restricted-syntax": ["error", ANTHROPIC_CONSTRUCTOR, ...SITE_ORIGIN_GUARDS, VERSION_BOUND_DECISION] },
  },
  // The kernel's approvals are where a decision is bound to a version, its
  // tests included. Last, because a later block's options replace an earlier
  // one's: it names again every other guard.
  {
    files: ["kernel/approvals/**"],
    rules: { "no-restricted-syntax": ["error", ANTHROPIC_CONSTRUCTOR, PRIVATE_ROUTE_LITERAL, PRIVATE_ROUTE_TEMPLATE, ...SITE_ORIGIN_GUARDS] },
  },
];

export default config;
