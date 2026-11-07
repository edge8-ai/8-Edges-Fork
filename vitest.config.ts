import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// The `@` alias mirrors `paths` in tsconfig.json (`@/*` → `./*`) so tests
// import modules exactly as application code does. `video/` is a separate
// package with its own `*.spec.ts` files and must never be collected here.
export default defineConfig({
  // tsconfig.json keeps `jsx: "preserve"` for the Next compiler, so the test
  // transformer has to be told to compile JSX itself. Without this the
  // `app/**/*.test.tsx` boundary tests fail to parse. (vitest 4 ships
  // rolldown-vite, whose transformer is oxc, not esbuild.)
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // A test's first `await` often pays for loading an entity barrel, which
    // takes two seconds alone and more while 379 files compete for the machine.
    // The default 5s failed the pre-push hook on tests that assert nothing
    // about speed; nothing here measures time, so the ceiling is generous.
    testTimeout: 30_000,
    // The identity config the app no longer hardcodes; see vitest.setup.ts.
    setupFiles: ["./vitest.setup.ts"],
    include: [
      // The shared kernel (ME-03) keeps its tests beside the modules.
      "kernel/**/*.test.{ts,tsx}",
      // Entities (ME-04 onwards) do too: a test that moves out of app/ with the
      // code it covers must keep running, or a move ticket silently drops it.
      "entities/**/*.test.{ts,tsx}",
      // `.tsx` matters: the route-boundary tests render real components, and an
      // `app/**/*.test.ts` pattern silently skips every one of them.
      "app/**/*.test.{ts,tsx}",
      "scripts/**/*.test.mjs",
      // The fork-sync guard lives beside the scripts it exercises, inside
      // .github/ — which is excluded from the sync wholesale, so the test does
      // not ship to the fork it is testing.
      ".github/scripts/**/*.test.mjs",
      // The database guard (2026-10-03) is a Claude Code hook, so it lives in
      // .claude/hooks/ with its test beside it; .claude/ is fork-excluded too.
      ".claude/hooks/**/*.test.mjs",
      // The db-review skill's gatherer (2026-10-03) keeps its test beside it.
      ".claude/skills/**/*.test.mjs",
    ],
    exclude: ["video/**", "node_modules/**"],
  },
});
