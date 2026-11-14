import { createHash } from "node:crypto";

/**
 * Versioned prompts (plan Part C2, card Z.6.1).
 *
 * Every model call names the prompt it sends, and that prompt has a stable
 * version derived from its text. Each ai_calls row records `name@version`, so
 * a change in output can be told apart from a change in model. Because the
 * version is a hash and not a number, editing the text changes it without
 * anyone remembering to bump anything. That is also what lets
 * scripts/check-prompt-evals.mjs refuse a prompt edit nobody evaluated.
 *
 * A prompt is the authored text: the system prompt, the user-message template
 * where the site has one, and any further named parts (a retry note, a second
 * instruction block) that the site composes in code. Data reaches a template
 * through `{{slot}}` placeholders that `fillPrompt` fills. Text a site builds
 * from rows (a list of cards, a transcript) is data, so it is passed in through
 * a slot and is not part of the version.
 *
 * The version hashes the texts exactly as written, whitespace included. A
 * whitespace-only edit therefore changes it. That is deliberate: the model
 * reads every character, so a reflowed prompt is a different request. The
 * alternative, normalising before hashing, would let an edit the model can
 * see slip past the eval gate. The cost of that choice is one cheap re-record
 * after a cosmetic edit.
 *
 * Known gaps: some text the model reads is built in code rather than declared
 * here, so an edit to it does not change any version and the eval gate does
 * not see it:
 *  - a structured-output site's JSON schema (its Zod `.describe()` strings);
 *  - the shared untrusted-input wording in kernel/ai/screen.ts
 *    (`untrustedPreamble`), which every screened site fills into a slot;
 *  - the writer's `brandPreamble` (entities/campaigns/lib/writer/model.ts),
 *    including its house rules, filled into each writer step's {{preamble}};
 *  - the headings a site's code lays its data out under, such as
 *    sprint-draft's `describe()` ("Board:", "Open cards, highest priority
 *    first:") and other per-row labels;
 *  - numbers that reach a template through a slot, such as coaching's
 *    MAX_PREP_BULLETS.
 * Fixed prose a site picks between (a fallback line, a pinned-language line)
 * belongs in `parts`, where it is versioned.
 *
 * Prompts are declared in `*.prompt.ts` files, which import nothing but this
 * module. The eval gate loads those files under plain node to read each
 * version, so this file keeps to erasable TypeScript with no path aliases and
 * no imports beyond node's own.
 */

const BRAND = Symbol.for("edge8.ai.prompt");

/** `{{slot}}`: a letter, then letters, digits or underscores. */
const SLOT = /\{\{([A-Za-z][A-Za-z0-9_]*)\}\}/g;

/**
 * A prompt's name: its site, or `<site>/<variant>` when one site sends more
 * than one prompt. The site part is what ties a prompt to the aiSite that may
 * send it; the gateway refuses a prompt from another site.
 */
export const PROMPT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

export type PromptTexts = {
  /** The system prompt. A site that sends its instructions in the user message has none. */
  system?: string;
  /** The user-message template, when the site has one. */
  user?: string;
  /** Further authored text the site composes in code, by name. */
  parts?: Record<string, string>;
};

/**
 * A declared prompt. The type follows the texts it was declared with, so a
 * site reads `PROMPT.user` as a string when the prompt has a user template and
 * `PROMPT.parts.retry` only when that part exists.
 */
export type Prompt<T extends PromptTexts = PromptTexts> = {
  readonly name: string;
  /** The first 12 hex characters of the sha256 of the texts. */
  readonly version: string;
  /** `name@version`: what ai_calls.prompt_version records. */
  readonly ref: string;
  readonly system: T extends { system: string } ? string : string | null;
  readonly user: T extends { user: string } ? string : string | null;
  readonly parts: T extends { parts: infer P } ? Readonly<P> : Readonly<Record<string, string>>;
};

/**
 * The version of a prompt's texts. The parts are hashed in name order, so the
 * order a file happens to list them in is not part of the version.
 */
export function promptVersionOf(texts: PromptTexts): string {
  const parts = Object.keys(texts.parts ?? {})
    .sort()
    .map((k) => [k, (texts.parts as Record<string, string>)[k]]);
  const canonical = JSON.stringify({ system: texts.system ?? null, user: texts.user ?? null, parts });
  return createHash("sha256").update(canonical).digest("hex").slice(0, 12);
}

export function definePrompt<const T extends PromptTexts>(name: string, texts: T): Prompt<T> {
  if (!PROMPT_NAME.test(name)) {
    throw new Error(`definePrompt: "${name}" is not a prompt name; use the site's name, or <site>/<variant> in lowercase kebab case.`);
  }
  if (!texts.system?.trim() && !texts.user?.trim()) {
    throw new Error(`definePrompt: ${name} has neither system text nor a user template.`);
  }
  const version = promptVersionOf(texts);
  const prompt = {
    name,
    version,
    ref: `${name}@${version}`,
    system: texts.system ?? null,
    user: texts.user ?? null,
    parts: Object.freeze({ ...(texts.parts ?? {}) }),
  };
  Object.defineProperty(prompt, BRAND, { value: true });
  return Object.freeze(prompt) as unknown as Prompt<T>;
}

/** True for a value definePrompt returned; the gate finds prompts by this. */
export function isPrompt(value: unknown): value is Prompt {
  return value !== null && typeof value === "object" && (value as Record<symbol, unknown>)[BRAND] === true;
}

/** The site a prompt belongs to: its name up to any `/variant`. */
export function promptSite(prompt: Prompt | string): string {
  const name = typeof prompt === "string" ? prompt : prompt.name;
  return name.split("/")[0];
}

/**
 * A template with its `{{slot}}`s filled, in one pass, so a value that itself
 * contains `{{…}}` (a user's text) is never filled again. A slot without a
 * value, or a value without a slot, throws: either is a template and its call
 * site disagreeing, and a prompt sent with a hole in it is worse than none.
 */
export function fillPrompt(template: string, vars: Record<string, string | number> = {}): string {
  const used = new Set<string>();
  const out = template.replace(SLOT, (_m, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) throw new Error(`fillPrompt: the slot {{${key}}} has no value.`);
    used.add(key);
    return String(vars[key]);
  });
  const unused = Object.keys(vars).filter((k) => !used.has(k));
  if (unused.length) throw new Error(`fillPrompt: no slot for ${unused.map((k) => `{{${k}}}`).join(", ")}.`);
  return out;
}
