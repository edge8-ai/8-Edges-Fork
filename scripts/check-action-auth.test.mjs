// Exercises scripts/check-action-auth.mjs against throwaway fixture trees.
//
// Each test builds a tiny app/ under a temp directory rather than pointing at
// the real repo, so the assertions stay true no matter how many actions the
// codebase grows; the "real repo passes" check is the `check:action-auth`
// script itself, run as a gate.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkActionAuth,
  extractFunctions,
  findMatchingBrace,
  isServerActionFile,
} from "./check-action-auth.mjs";

const tmpDirs = [];

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "action-auth-"));
  tmpDirs.push(root);
  for (const [rel, source] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, source);
  }
  return root;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

const GATED = `"use server";
import { requireAdmin } from "@/lib/admin-auth";
export async function gated(): Promise<{ ok: true } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  return { ok: true };
}
`;

const UNGATED = `"use server";
import { companyOs } from "@/lib/supabase";
export async function leaky(id: string) {
  await companyOs.from("people").delete().eq("id", id);
}
`;

describe("check-action-auth", () => {
  it("passes a gated action and counts it", () => {
    const root = fixture({ "app/x/actions.ts": GATED });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res).toEqual({ checked: 1, violations: [], stale: [] });
  });

  it("fails an ungated export with file:line and name", () => {
    const root = fixture({ "app/x/actions.ts": UNGATED });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res.checked).toBe(1);
    expect(res.violations).toEqual([{ file: "app/x/actions.ts", line: 3, export: "leaky" }]);
  });

  it("passes the same ungated export once it is allowlisted", () => {
    const root = fixture({ "app/x/actions.ts": UNGATED });
    const res = checkActionAuth({
      root,
      allowlist: [{ file: "app/x/actions.ts", export: "leaky", reason: "fixture" }],
    });
    expect(res.violations).toEqual([]);
    expect(res.stale).toEqual([]);
  });

  it("fails an allowlist entry that matches no export", () => {
    const root = fixture({ "app/x/actions.ts": GATED });
    const stale = { file: "app/x/actions.ts", export: "gone", reason: "fixture" };
    const res = checkActionAuth({ root, allowlist: [stale] });
    expect(res.violations).toEqual([]);
    expect(res.stale).toEqual([stale]);
  });

  it("passes transitively when a wrapper calls a gated export in the same file", () => {
    const root = fixture({
      "app/x/actions.ts": `"use server";
export async function a() { return b(); }
export async function b() { await requireAdmin(); }
`,
    });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res).toEqual({ checked: 2, violations: [], stale: [] });
  });

  it("passes transitively through a non-exported local guard wrapper", () => {
    const root = fixture({
      "app/x/actions.ts": `"use server";
async function requireCleared() {
  const admin = await requireAdmin();
  if (!admin.cleared) return null;
  return admin;
}
export async function pay() {
  const admin = await requireCleared();
  if (!admin) return { ok: false, error: "no" };
}
`,
    });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res.violations).toEqual([]);
  });

  it("passes a wrapper that delegates to a gated action imported from a sibling server-action file", () => {
    const root = fixture({
      "app/edges/goals/actions.ts": `"use server";
export async function createKr(input: { title: string }): Promise<void> {
  await requireAdmin();
}
`,
      "app/company/actions.ts": `"use server";
import { createKr as _createKr } from "../edges/goals/actions";
export async function createKr(input: { title: string }): Promise<void> {
  const res = await _createKr(input);
  return res;
}
`,
    });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res).toEqual({ checked: 2, violations: [], stale: [] });
  });

  it("does not treat an import from a non-action module as a gate", () => {
    const root = fixture({
      "app/lib-ish/helpers.ts": `export async function doIt() { await requireAdmin(); }\n`,
      "app/x/actions.ts": `"use server";
import { doIt } from "../lib-ish/helpers";
export async function wrapped() { return doIt(); }
`,
    });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res.violations.map((v) => v.export)).toEqual(["wrapped"]);
  });

  it("does not let a self-referential cycle count as gated", () => {
    const root = fixture({
      "app/x/actions.ts": `"use server";
export async function a() { return b(); }
export async function b() { return a(); }
`,
    });
    const res = checkActionAuth({ root, allowlist: [] });
    expect(res.violations.map((v) => v.export)).toEqual(["a", "b"]);
  });

  it("ignores files without a leading use-server directive", () => {
    const root = fixture({
      "app/x/page.ts": `export async function Page() { return null; }\n`,
      "app/x/notes.ts": `const s = "use server";\nexport async function nope() {}\n`,
    });
    expect(checkActionAuth({ root, allowlist: [] })).toEqual({
      checked: 0,
      violations: [],
      stale: [],
    });
  });

  it("recognises the directive behind leading comments and with single quotes", () => {
    expect(isServerActionFile(`// why\n/* more */\n'use server'\n`)).toBe(true);
    expect(isServerActionFile(`"use client";\n`)).toBe(false);
    expect(isServerActionFile(`import x from "y";\n"use server";\n`)).toBe(false);
  });
});

describe("brace scanner", () => {
  it("skips braces inside strings, template literals and comments", () => {
    const src = [
      "{",
      '  const a = "}";',
      "  const b = '{';",
      "  const c = `x ${ {k: 1}.k } } {`;",
      "  // }",
      "  /* { */",
      "}",
    ].join("\n");
    expect(findMatchingBrace(src, 0)).toBe(src.length - 1);
  });

  it("reports -1 for an unbalanced body so the export fails closed", () => {
    expect(findMatchingBrace("{ const a = `", 0)).toBe(-1);
    const fns = extractFunctions(`export async function x() { await requireAdmin(); `);
    expect(fns).toHaveLength(1);
    expect(fns[0].body).toBe("");
  });

  it("locates the body past object-typed parameters and union return types", () => {
    const src = `export async function createCard(input: {
  boardId: string;
  title?: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await boardActorFor(input.boardId);
}
function helper<T>(x: T): T { return x; }
`;
    const fns = extractFunctions(src);
    expect(fns.map((f) => [f.name, f.exported])).toEqual([
      ["createCard", true],
      ["helper", false],
    ]);
    expect(fns[0].body).toContain("await boardActorFor(");
    expect(fns[1].body.trim()).toBe("return x;");
  });
});

// A.13: an arrow-function action used not to be collected at all — the gate
// reported such a file clean rather than ungated. No action in the tree used
// the shape when this was found, so nothing was exposed; these keep it that way.
describe("arrow-function actions", () => {
  const ARROW_UNGATED = `"use server";
import { companyOs } from "@/lib/supabase";
export const leakyArrow = async (id: string) => {
  await companyOs.from("people").delete().eq("id", id);
};
`;
  const ARROW_GATED = `"use server";
import { requireAdmin } from "@/kernel/identity/admin-auth";
export const safeArrow = async (id: string) => {
  const admin = await requireAdmin();
  return { ok: true };
};
`;
  const ARROW_EXPR_GATED = `"use server";
import { requireTeamMember } from "@/kernel/identity/team-auth";
export const viaExpression = async () => requireTeamMember().then(() => ({ ok: true }));
`;

  it("collects an exported arrow function", () => {
    const fns = extractFunctions(ARROW_UNGATED);
    expect(fns.map((f) => f.name)).toContain("leakyArrow");
    expect(fns.find((f) => f.name === "leakyArrow").exported).toBe(true);
  });

  it("fails an ungated arrow action instead of reporting the file clean", () => {
    const root = fixture({ "app/admin/actions.ts": ARROW_UNGATED });
    const { violations } = checkActionAuth({ root, allowlist: [] });
    expect(violations.map((v) => v.export)).toContain("leakyArrow");
  });

  it("passes an arrow action that awaits a guard", () => {
    const root = fixture({ "app/admin/actions.ts": ARROW_GATED });
    const { violations } = checkActionAuth({ root, allowlist: [] });
    expect(violations).toHaveLength(0);
  });

  it("reads the body of an arrow with an expression body", () => {
    const fn = extractFunctions(ARROW_EXPR_GATED).find((f) => f.name === "viaExpression");
    expect(fn).toBeDefined();
    expect(fn.body).toContain("requireTeamMember");
  });

  it("does not mistake a non-function const for an action", () => {
    const fns = extractFunctions(`export const LIMIT = (3);\nexport const NAMES = ["a"];\n`);
    expect(fns.map((f) => f.name)).not.toContain("NAMES");
  });
});
