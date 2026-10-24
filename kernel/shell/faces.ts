// The worn borders a page draws round its faces (LD.4; spec "Faces and
// borders"; ADR 0021). A page that draws faces collects every person it will
// draw and asks here once; the answer is each person's worn tier on each
// ladder, the tier word alone, or nothing.
//
// The kernel knows nothing of ladders. The pages that draw faces (quests,
// boards, ideas, team) may not import the ladders door: none of them requires
// it, and ladders requires several of them, so the edge would be a cycle. So
// the composition root registers the answer here: app/shell.ts, generated from
// SHELL_SLOTS (scripts/gen-deployment.mjs), registers ladders' provider only
// when the deployment installs ladders. Until then, and in a deployment
// without it, every face is plain and nothing about ladders is imported.
//
// The provider is asked on behalf of a viewer and applies the viewer's game
// style itself: with the viewer's switch off it answers nothing, so every face
// that viewer sees is plain whatever its wearer chose, and no page has to
// remember the rule (Khoa, 2026-10-21).
//
// Keyed on globalThis with Symbol.for, because Next gives each layer
// (instrumentation, routes, actions) its own copy of a module (W.170); the
// registration made where app/shell.ts loads must be the one every page reads.

/** What a person chose to wear, as the kernel carries it: the tier's key per ladder, or null. */
export type WornFace = { learnShare: string | null; builder: string | null };

/** Who is looking: the signed-in reader, whose game style decides whether any border shows. */
export type FaceViewer = { personId: string };

/** The installed provider: each asked person's worn tiers, as the viewer may see them. */
export type WornTiersProvider = (ids: readonly string[], viewer: FaceViewer) => Promise<Map<string, WornFace>>;

const KEY = Symbol.for("edge8.shell.worn-tiers");
type Registry = { provider: WornTiersProvider | null };

function registry(): Registry {
  const g = globalThis as unknown as Record<symbol, Registry | undefined>;
  return (g[KEY] ??= { provider: null });
}

/** Called by app/shell.ts when the deployment installs ladders. A later call replaces the provider. */
export function registerWornTiers(provider: WornTiersProvider): void {
  registry().provider = provider;
}

/**
 * Each person's worn tiers, for the viewer, in one read. Empty when no provider
 * is registered, when there is nobody to ask, and when the viewer's game style
 * is off. A person who wears nothing may be missing from the map or answer
 * nulls; both mean a plain face.
 *
 * A border is a cosmetic, so a failed read draws plain faces and says so in the
 * log rather than failing the page: plain is exactly what a face with no worn
 * tier shows, and it can never show a tier somebody hid.
 */
export async function wornTiersFor(ids: readonly string[], viewer: FaceViewer): Promise<Map<string, WornFace>> {
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

/** Just the Learn & Share borders, by person, for a page to hand its faces: only the people who wear one. */
export function bordersOf(worn: ReadonlyMap<string, WornFace>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, face] of worn) if (face.learnShare) out[id] = face.learnShare;
  return out;
}
