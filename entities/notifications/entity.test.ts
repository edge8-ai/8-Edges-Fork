import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// S.3's product rule, held by a test rather than a comment: the inbox is a page
// people choose to open, so nothing in this entity may push to Lark, Telegram
// or email. Every push in the tree goes through kernel/messaging, so an import
// of it from here is the thing to refuse.
const ROOT = new URL(".", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the notifications entity", () => {
  it("imports nothing that pushes a message anywhere", () => {
    const pushers = sources(ROOT).filter((f) => /from\s+["']@\/kernel\/messaging/.test(readFileSync(f, "utf8")));
    expect(pushers).toEqual([]);
  });

  it("imports no other entity, which is what lets any deployment install it", () => {
    const reaching = sources(ROOT).filter((f) => /from\s+["']@\/entities\/(?!notifications\/)/.test(readFileSync(f, "utf8")));
    expect(reaching).toEqual([]);
  });
});
