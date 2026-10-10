import { describe, expect, it } from "vitest";
import { permissionRegistry, registerPermissionRegistry } from "./permission-registry";

// The kernel reads the deployment's registry only through what app/access.ts
// registered at boot; an unregistered build must fail loudly, never read empty.
describe("the permission registry", () => {
  it("refuses to answer before the composition root registers it, then answers with what it registered", () => {
    const key = Symbol.for("edge8.access.permission-registry");
    (globalThis as unknown as Record<symbol, unknown>)[key] = undefined;
    expect(() => permissionRegistry()).toThrow(/never registered/);
    const registry = { atoms: {}, routes: { "/team": "surface.team" }, actions: {}, implies: {}, roles: {} };
    registerPermissionRegistry(registry);
    expect(permissionRegistry()).toBe(registry);
  });
});
