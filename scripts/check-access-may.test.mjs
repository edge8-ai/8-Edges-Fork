import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkMay, isClientFile, unguardedClientCalls, valueImports } from "./check-access-may.mjs";

// The hidden-control rule (ADR 0014, AE.1): a client component that calls a
// server action takes a MayProp, so it can hide the control from someone the
// action's guard would refuse.

const temps = [];
afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "access-may-"));
  temps.push(root);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  }
  return root;
}

const ACTION = '"use server";\nexport async function publish() {}\nexport async function preview() {}\n';
const DOOR = 'export { publish } from "./lib/publish-actions";\nexport { helper } from "./lib/helper";\n';
const client = (body) => `"use client";\n${body}\nexport function Editor() { return null; }\n`;

describe("isClientFile and valueImports", () => {
  it("reads the directive after leading comments", () => {
    expect(isClientFile('// a comment\n/* block */\n"use client";\n')).toBe(true);
    expect(isClientFile('import x from "y";\n"use client";\n')).toBe(false);
  });

  it("leaves type-only imports and type names out", () => {
    expect(valueImports('import type { A } from "./a";\nimport { type B, c as d } from "./b";\nimport E, { f } from "./e";\n')).toEqual([
      { names: ["c"], spec: "./b" },
      { names: ["f", "default"], spec: "./e" },
    ]);
  });
});

describe("unguardedClientCalls", () => {
  it("fails a client component that imports a server action without a MayProp", () => {
    const root = tree({
      "entities/campaigns/lib/publish-actions.ts": ACTION,
      "entities/campaigns/ui/Editor.tsx": client('import { publish } from "@/entities/campaigns/lib/publish-actions";'),
    });
    expect(unguardedClientCalls(root, { dirs: ["entities"] })).toEqual([
      { file: "entities/campaigns/ui/Editor.tsx", actions: ["entities/campaigns/lib/publish-actions.ts#publish"] },
    ]);
  });

  it("passes the same component once it takes a MayProp", () => {
    const root = tree({
      "entities/campaigns/lib/publish-actions.ts": ACTION,
      "entities/campaigns/ui/Editor.tsx": client(
        'import { publish } from "../lib/publish-actions";\nimport type { MayProp } from "@/kernel/identity/may-prop";',
      ),
    });
    expect(unguardedClientCalls(root, { dirs: ["entities"] })).toEqual([]);
  });

  it("follows the entity's client door to the action it re-exports, and only that one", () => {
    const root = tree({
      "entities/campaigns/lib/publish-actions.ts": ACTION,
      "entities/campaigns/lib/helper.ts": "export const helper = 1;\n",
      "entities/campaigns/client.ts": DOOR,
      "entities/boards/ui/Uses.tsx": client('import { publish } from "@/entities/campaigns/client";'),
      "entities/boards/ui/Helper.tsx": client('import { helper } from "@/entities/campaigns/client";'),
    });
    expect(unguardedClientCalls(root, { dirs: ["entities"] }).map((f) => f.file)).toEqual(["entities/boards/ui/Uses.tsx"]);
  });

  it("ignores a server component, a test, and an action the allowlist makes public", () => {
    const root = tree({
      "entities/campaigns/lib/publish-actions.ts": ACTION,
      "entities/campaigns/ui/Page.tsx": 'import { publish } from "../lib/publish-actions";\nexport default function Page() { return null; }\n',
      "entities/campaigns/ui/Editor.test.tsx": client('import { publish } from "../lib/publish-actions";'),
      "entities/campaigns/ui/Public.tsx": client('import { preview } from "../lib/publish-actions";'),
    });
    const isPublicAction = (file, name) => file === "entities/campaigns/lib/publish-actions.ts" && name === "preview";
    expect(unguardedClientCalls(root, { dirs: ["entities"], isPublicAction })).toEqual([]);
  });
});

describe("checkMay", () => {
  const found = [{ file: "a.tsx", actions: ["x.ts#y"] }];

  it("fails a violation the allowlist does not name", () => {
    expect(checkMay({ found, allowlist: [], onMain: null }).violations.map((v) => v.file)).toEqual(["a.tsx"]);
  });

  it("passes an allowlisted violation", () => {
    expect(checkMay({ found, allowlist: [{ file: "a.tsx", reason: "r" }], onMain: null })).toEqual({ violations: [], stale: [], added: [] });
  });

  it("fails an entry whose component now complies, so the list only shrinks", () => {
    expect(checkMay({ found: [], allowlist: [{ file: "a.tsx", reason: "r" }], onMain: null }).stale).toEqual(["a.tsx"]);
  });

  it("keeps an entry for a file the public fork does not have", () => {
    const r = checkMay({ found: [], allowlist: [{ file: "a.tsx", reason: "r" }], onMain: null, exists: () => false, upstream: false });
    expect(r.stale).toEqual([]);
  });

  it("fails an entry origin/main does not carry: the way off the list is the prop, never a new line", () => {
    const allowlist = [
      { file: "a.tsx", reason: "r" },
      { file: "b.tsx", reason: "r" },
    ];
    const r = checkMay({ found: [...found, { file: "b.tsx", actions: [] }], allowlist, onMain: ["a.tsx"] });
    expect(r.added).toEqual(["b.tsx"]);
  });
});
