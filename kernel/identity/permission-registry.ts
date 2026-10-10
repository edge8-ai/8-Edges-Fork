// The deployment's access registry, as the kernel and the entities read it
// (ADR 0013). app/permissions.ts is generated from the declarations, and the
// kernel may import nothing under app/, so the composition root hands it over
// at boot: app/access.ts registers it from instrumentation.ts, next to the
// entities' access facts. Settings → Access lists its atoms, the refusal page
// names a page's permission, and search, the assistant and notifications drop
// what a person may not open.
//
// Keyed on globalThis with Symbol.for, because Next gives instrumentation,
// routes and actions their own copy of each module (W.170). Nothing registered
// is an error rather than an empty registry: an empty one would let a typo pass
// for "no installed area declares it" and hide every row that reads it.
import type { PermissionRegistry } from "@/kernel/identity/permission-declaration";

const KEY = Symbol.for("edge8.access.permission-registry");
type Store = { registry: PermissionRegistry | null };

function store(): Store {
  const g = globalThis as unknown as Record<symbol, Store | undefined>;
  return (g[KEY] ??= { registry: null });
}

/** Called by app/access.ts at boot. Idempotent: a later call replaces the registry. */
export function registerPermissionRegistry(registry: PermissionRegistry): void {
  store().registry = registry;
}

/** The registered registry; throws when the composition root never registered one. */
export function permissionRegistry(): PermissionRegistry {
  const registry = store().registry;
  if (!registry) throw new Error("[access] the permission registry was never registered (app/access.ts, from instrumentation.ts)");
  return registry;
}
