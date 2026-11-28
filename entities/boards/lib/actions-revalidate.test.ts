import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// W.195. The board screens no longer call router.refresh() after a write
// (useBoardActionRunner): they rely on the action revalidating, because a
// server action that revalidates comes back with the current page already
// re-rendered. An action that writes and forgets to revalidate would therefore
// save and show nothing, until someone reloaded the page. This reads every
// exported server action under entities/boards/lib and fails one that writes
// without calling a revalidating helper.
//
// The helpers count by name: `refresh` (card-helpers) and Next's own two, plus
// `landCard` and `saveComment`, which revalidate on the action's behalf.

const LIB = "entities/boards/lib";
const WRITES = /\.(insert|update|upsert|delete)\(|\b(landCard|saveComment)\(/;
const REVALIDATES = /\b(refresh|revalidatePath|revalidateTag|landCard|saveComment)\(/;

// Writers that do not go through the board's action runner, so nothing waits
// on a page re-render from them. Each says what shows the write instead.
const EXEMPT: Record<string, string> = {
  "deliverable-files.ts:startCardUpload": "CardDeliverables re-reads its own list (listCardDeliverables); the board does not show deliverables",
  "deliverable-files.ts:confirmCardUpload": "CardDeliverables re-reads its own list (listCardDeliverables); the board does not show deliverables",
  "deliverables.ts:addCardLink": "CardDeliverables re-reads its own list (listCardDeliverables); the board does not show deliverables",
  "deliverables.ts:removeCardDeliverable": "CardDeliverables re-reads its own list (listCardDeliverables); the board does not show deliverables",
  "deliverables.ts:restoreCardDeliverable": "CardDeliverables re-reads its own list (listCardDeliverables); the board does not show deliverables",
};

type Action = { key: string; writes: boolean; revalidates: boolean };

function serverActions(): Action[] {
  const out: Action[] = [];
  for (const name of readdirSync(LIB)) {
    if (!name.endsWith(".ts") || name.includes(".test.")) continue;
    const text = readFileSync(join(LIB, name), "utf8");
    if (!/^"use server";/m.test(text)) continue;
    const sf = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true);
    for (const st of sf.statements) {
      if (!ts.isFunctionDeclaration(st) || !st.name || !st.body) continue;
      if (!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) continue;
      const body = st.body.getText(sf);
      out.push({ key: `${name}:${st.name.text}`, writes: WRITES.test(body), revalidates: REVALIDATES.test(body) });
    }
  }
  return out;
}

describe("board server actions revalidate what they write (W.195)", () => {
  const actions = serverActions();

  it("finds the actions it is meant to read", () => {
    // A reader that found nothing would pass every rule below.
    expect(actions.map((a) => a.key)).toEqual(expect.arrayContaining(["actions.ts:toggleSubtask", "actions.ts:updateCard", "epic-actions.ts:createEpic"]));
  });

  it("every action that writes also revalidates, or is exempt with a reason", () => {
    const silent = actions.filter((a) => a.writes && !a.revalidates && !(a.key in EXEMPT)).map((a) => a.key);
    expect(silent).toEqual([]);
  });

  it("names no exemption that has stopped being needed", () => {
    const byKey = new Map(actions.map((a) => [a.key, a]));
    const stale = Object.keys(EXEMPT).filter((k) => {
      const a = byKey.get(k);
      return !a || !a.writes || a.revalidates;
    });
    expect(stale).toEqual([]);
  });
});
