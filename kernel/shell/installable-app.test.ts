import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { MetadataRoute } from "next";
import { isForkTree } from "@/scripts/fork-tree.mjs";

const ROOT = process.cwd();

// The installed app (MO.10). Nothing in a browser says why an app stopped
// offering Install: a renamed icon, a manifest moved under the /team/ gate or a
// fallback name all fail silently, so each is held here.

type Module = typeof import("./installable-app");

// The organisation's name is read once, when kernel/config/organisation.ts
// loads, so each case loads the modules afresh under its own environment.
async function load(name: string | undefined): Promise<Module> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ORG_NAME", name ?? "");
  return import("./installable-app");
}

let named: Module;
let unnamed: Module;

beforeAll(async () => {
  named = await load("Acme");
  unnamed = await load(undefined);
});

afterAll(() => {
  vi.unstubAllEnvs();
});

/** Width and height from a PNG's IHDR chunk, which always starts at byte 16. */
function pngSize(path: string): string {
  const bytes = readFileSync(path);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("the team app manifest", () => {
  it("carries the name and display Chrome needs before it offers Install", () => {
    const m = named.teamManifest();
    expect(m.name).toBe("Acme Team");
    expect(m.short_name).toBe("Acme");
    expect(m.display).toBe("standalone");
    expect(m.start_url?.startsWith(m.scope ?? "")).toBe(true);
  });

  // The icons are the upstream's trademark: the fork's overlay of app-icons.ts
  // lists none, so each tree is held to its own side of that promise.
  it.skipIf(isForkTree(ROOT))("names the icon sizes Chrome needs, and a maskable one", () => {
    const icons = named.teamManifest().icons ?? [];
    const any = icons.filter((i) => i.purpose === "any").map((i) => i.sizes);
    expect(any).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it.runIf(isForkTree(ROOT))("names no icon in the fork, which does not ship the upstream's mark", () => {
    expect(named.teamManifest().icons).toEqual([]);
  });

  it("names nobody when the deployment has not named itself", () => {
    const m = unnamed.teamManifest();
    expect(m).not.toHaveProperty("name");
    expect(m).not.toHaveProperty("short_name");
    expect(unnamed.TEAM_APP_METADATA.appleWebApp).not.toHaveProperty("title");
  });

  it("lists only icons that exist in public/ at the size it claims", () => {
    const icons: MetadataRoute.Manifest["icons"] = named.teamManifest().icons ?? [];
    for (const icon of icons) {
      const file = join(ROOT, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      expect(pngSize(file), icon.src).toBe(icon.sizes);
    }
  });

  it("is served outside the /team/ gate, from a mount that exists", () => {
    // proxy.ts redirects every unsigned request under /team/ to the login
    // page, and a browser fetches a manifest without cookies.
    const path = String(named.TEAM_APP_METADATA.manifest);
    expect(path.startsWith("/team/")).toBe(false);
    expect(existsSync(join(ROOT, "app", path, "route.ts"))).toBe(true);
  });

  it("tells Safari the page can run from the home screen", () => {
    expect(named.TEAM_APP_METADATA.appleWebApp).toMatchObject({ capable: true, title: "Acme" });
  });
});
