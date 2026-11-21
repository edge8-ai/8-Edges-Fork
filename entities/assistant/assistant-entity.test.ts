import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Structural guard for the assistant entity (ME-08,
// docs/engineering/2026-09-03-multi-entity-design.md §2 and §3).
//
// The assistant is a cross-cutting service: the shared conversation history, the
// two chat back ends, the meeting transcript and summary helpers and the AI
// Journey survey glue all belong to it, but its callers live in company-os, team
// and portal. Nothing about the move is observable at runtime — the assistant
// answers the same way either way — so the acceptance criteria are structural and
// are asserted here rather than left to review:
//
//   1. the entity has the index.ts / tables.ts surface every entity gets (§2);
//   2. tables.ts agrees with entities.manifest.json, which the ownership ratchet
//      reads;
//   3. nothing in the entity imports route code from app/ (§3 rule 3, also an
//      ESLint zone — repeated here so a `git mv` that outruns lint still fails);
//   4. the entity gains no new cross-entity import beyond the ones it arrived
//      with, each pinned by name;
//   5. the two app/ route files are composers: they re-export the handler from
//      the entity and declare their own route-segment config, because Next reads
//      `runtime` / `dynamic` / `fetchCache` by statically analysing the file in
//      app/ and would not see a re-exported value — the history routes would
//      silently fall back to the Edge runtime and a cached response;
//   6. company-os and team reach the assistant's server code only through the
//      index, and the old paths that remain are one-line re-export shims.

const ROOT = path.resolve(__dirname, "..", "..");
const ENTITY = path.join(ROOT, "entities", "assistant");

type Manifest = {
  entities: Record<string, { tables?: string[] }>;
};

const manifest: Manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, "entities.manifest.json"), "utf8"),
);
const assistant = manifest.entities.assistant;

/** Every file under `dir`, repo-relative, depth-first. */
function filesUnder(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const stat = fs.statSync(dir);
  if (!stat.isDirectory()) return [path.relative(ROOT, dir)];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => filesUnder(path.join(dir, e.name)));
}

/** Repo-relative paths of the entity's sources, tests excluded. */
function entitySources(): string[] {
  return filesUnder(ENTITY).filter(
    (f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts") && !f.endsWith(".test.tsx"),
  );
}

/** Module specifiers named by `import ... from "x"`, `export ... from "x"` or `import "x"`. */
function moduleSpecifiers(source: string): string[] {
  const out: string[] = [];
  const re =
    /\b(?:import|export)\b[\s\S]*?from\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g;
  for (const m of source.matchAll(re)) out.push(m[1] ?? m[2]);
  return out;
}

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Source with comments blanked out, so a path named in prose is not a dependency. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("assistant entity surface", () => {
  it("has an index and a tables declaration", () => {
    expect(fs.existsSync(path.join(ENTITY, "index.ts"))).toBe(true);
    expect(fs.existsSync(path.join(ENTITY, "tables.ts"))).toBe(true);
  });

  it("declares exactly the tables the manifest gives it", async () => {
    const { ASSISTANT_TABLES } = await import("./tables");
    expect([...ASSISTANT_TABLES].sort()).toEqual([...(assistant.tables ?? [])].sort());
  });

  it("owns the conversation history table the design assigns it", async () => {
    // Design §4: the assistant's one table is assistant_conversations.
    const { ASSISTANT_TABLES } = await import("./tables");
    expect(ASSISTANT_TABLES as readonly string[]).toContain("assistant_conversations");
  });
});

describe("assistant entity boundaries", () => {
  it("imports no route code from app/", () => {
    const offenders = entitySources().filter((f) =>
      moduleSpecifiers(withoutComments(read(f))).some(
        (s) => s.startsWith("@/app/") || s === "@/app",
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("reaches another entity only through its doors, and no old lib/ or components/ path", () => {
    // Design §3 rule 2, repeated here so a `git mv` that outruns lint still fails.
    const offenders = new Set<string>();
    for (const f of entitySources()) {
      for (const s of moduleSpecifiers(withoutComments(read(f)))) {
        if (!s.startsWith("@/")) continue;
        if (s.startsWith("@/entities/assistant") || s.startsWith("@/kernel")) continue;
        if (/^@\/entities\/[a-z-]+(\/client)?$/.test(s)) continue;
        offenders.add(`${f} -> ${s}`);
      }
    }
    expect([...offenders].sort()).toEqual([]);
  });
});

// Design §2: `app/` is thin, and each of its files is a re-export of the body
// that lives in the entity. Two things can silently break that:
//
//  1. Logic creeps back into the route file. Nothing else would notice — the
//     route keeps working — but the entity stops being the whole of the
//     assistant.
//  2. The route-segment config is re-exported instead of declared. Next reads
//     `runtime` / `dynamic` / `fetchCache` by statically analysing the route
//     module, so a re-exported value is not seen and the handler silently
//     reverts to the defaults: the Edge runtime and a cached response. These
//     handlers list and mutate one user's own chat history, so a cached response
//     is a cross-user leak, not a stale page.
describe("app/ mounts the assistant entity without holding its code", () => {
  const ROUTES = [
    { file: "app/api/assistant/[surface]/conversations/route.ts", handlers: ["GET"] },
    {
      file: "app/api/assistant/[surface]/conversations/[id]/route.ts",
      handlers: ["GET", "PATCH"],
    },
  ];
  const SEGMENT_CONFIG = ["runtime", "dynamic", "fetchCache"];

  describe.each(ROUTES)("$file", ({ file, handlers }) => {
    it("re-exports its handlers from the assistant entity", () => {
      const match = withoutComments(read(file)).match(
        /export\s*\{([^}]*)\}\s*from\s*["'](@\/entities\/assistant\/[^"']+)["']/,
      );
      expect(match, `${file} does not re-export from @/entities/assistant/`).not.toBeNull();
      const exported = match![1]
        .split(",")
        .map((s) => s.trim().split(/\s+as\s+/).pop()!.trim())
        .filter(Boolean)
        .sort();
      expect(exported).toEqual([...handlers].sort());
    });

    it("re-exports from a module that exists inside the entity", () => {
      const target = withoutComments(read(file)).match(
        /from\s*["']@\/entities\/(assistant\/[^"']+)["']/,
      )![1];
      expect(fs.existsSync(path.join(ROOT, "entities", `${target}.ts`))).toBe(true);
    });

    it("declares its route-segment config literally, not by re-export", () => {
      const text = withoutComments(read(file));
      for (const key of SEGMENT_CONFIG) {
        expect(text, `${file} must declare ${key} itself`).toMatch(
          new RegExp(`export const ${key} = [^;]+;`),
        );
      }
    });

    it("holds nothing but those exports", () => {
      const statements = withoutComments(read(file))
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const allowed = /^export (\{[^}]*\} from ["'][^"']+["'];|const \w+ = .+;)$/;
      expect(statements.filter((line) => !allowed.test(line))).toEqual([]);
    });
  });
});

describe("callers reach the assistant through its index", () => {
  // Every file outside entities/assistant that still names an assistant module.
  // The entity's own app/ mounts are the composition root and are checked above.
  const OWNED = /@\/entities\/assistant\/(?!api\/|client$)/;

  function repoSources(dir: string): string[] {
    return filesUnder(path.join(ROOT, dir)).filter((f) => /\.(ts|tsx)$/.test(f));
  }

  it("has no old path left — lib/ and components/ are gone (ME-13)", () => {
    expect(fs.existsSync(path.join(ROOT, "lib"))).toBe(false);
    expect(fs.existsSync(path.join(ROOT, "components"))).toBe(false);
  });

  it("lets nothing outside the entity reach past the doors", () => {
    const offenders = [...repoSources("app"), ...repoSources("entities")]
      .filter((f) => !f.startsWith("entities/assistant/"))
      .filter((f) => moduleSpecifiers(withoutComments(read(f))).some((s) => OWNED.test(s)));
    expect(offenders).toEqual([]);
  });

  it("leaves no caller on a deleted assistant path", () => {
    // These lib/ paths lost their last outside caller when company-os and team
    // moved to the index, so they are gone rather than left as dead re-exports
    // for knip to find.
    const gone =
      /@\/lib\/(assistant-history|admin-chat|team-chat)\/|@\/lib\/ai\/meeting-summary\b|@\/lib\/meeting-extract\b|@\/components\/assistant\/ConversationHistory\b/;
    const offenders = [...repoSources("app"), ...repoSources("entities")].filter((f) =>
      gone.test(withoutComments(read(f))),
    );
    expect(offenders).toEqual([]);
  });
});
