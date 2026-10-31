// The worn borders a page draws round its faces (LD.4; spec "Faces and
// borders"; ADR 0021). A page that draws faces collects every person it will
// draw and asks here once; the answer is the border each person wears, as the
// key the kernel Avatar draws it by (the class frame-<key>), or nothing.
//
// The kernel knows nothing of what a border stands for or who decides it. The
// pages that draw faces may not import the entity that does: none of them
// requires it, and it requires several of them, so the edge would be a cycle.
// So the composition root registers the answer here: app/shell.ts, generated
// from the providers' slots.ts (scripts/gen-deployment.mjs), registers the
// provider only when the deployment installs it (ADR 0026, a registration
// slot). Until then, and in a deployment without it, every face is plain and
// nothing of the provider is imported.
//
// The provider is asked on behalf of a viewer and applies the viewer's own
// choice itself: with it off it answers nothing, so every face that viewer sees
// is plain whatever its wearer chose, and no page has to remember the rule
// (Khoa, 2026-10-21).
//
// Keyed on globalThis with Symbol.for, because Next gives each layer
// (instrumentation, routes, actions) its own copy of a module (W.170); the
// registration made where app/shell.ts loads must be the one every page reads.

/** Who is looking: the signed-in reader, whose choice decides whether any border shows. */
export type FaceViewer = { personId: string };

/**
 * The installed provider: the border each asked person wears, as the viewer
 * may see it, keyed by person. A person who wears none is left out.
 */
export type WornTiersProvider = (ids: readonly string[], viewer: FaceViewer) => Promise<Map<string, string>>;

const KEY = Symbol.for("edge8.shell.worn-tiers");
type Registry = { provider: WornTiersProvider | null };

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[KEY] ??= { provider: null });
}

/** Called by app/shell.ts when the deployment installs the provider. A later call replaces it. */
export function registerWornTiers(provider: WornTiersProvider): void {
  registry().provider = provider;
}

/**
 * Each person's worn border, for the viewer, in one read. Empty when no
 * provider is registered, when there is nobody to ask, and when the viewer's
 * choice is off. A person missing from the map has a plain face.
 *
 * A border is a cosmetic, so a failed read draws plain faces and says so in the
 * log rather than failing the page: plain is exactly what a face with no worn
 * border shows, and it can never show a border somebody hid.
 */
export async function wornTiersFor(ids: readonly string[], viewer: FaceViewer): Promise<Map<string, string>> {
  const provider = registry().provider;
  const unique = [...new Set(ids)];
  if (!provider || unique.length === 0) return new Map();
  try {
    return await provider(unique, viewer);
  } catch (err) {
    console.error("[faces] worn tiers:", err instanceof Error ? err.message : String(err));
    return new Map();
  }
}

/** The borders, by person, for a page to hand its faces: only the people who wear one. */
export function bordersOf(worn: ReadonlyMap<string, string>): Record<string, string> {
  return Object.fromEntries(worn);
}
