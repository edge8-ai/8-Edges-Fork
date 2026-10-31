// The contract of a slot (ADR 0026): how one entity's work appears on a page
// another entity owns, when the page's entity does not require the provider.
// So My Week, which boards owns, can carry a line from the Inbox, which
// notifications owns, without boards requiring notifications: a deployment
// without an inbox passes the slot's empty fallback.
//
// The provider declares each slot once, in its own `slots.ts` beside
// `mounts.ts`, typed against `SlotDeclarations` below: what kind of thing it
// is, its type, the stylesheets it needs and the surfaces it may appear on.
// scripts/gen-deployment.mjs reads those files and writes app/shell.ts, which
// holds the provider when the deployment installs it and the fallback
// otherwise, and it refuses a slot taken on a surface its provider did not
// declare. The consumer names the slots it takes in its own `mounts.ts`
// (`slots`), because the consumer decides to show them.
//
// The slot's own type lives with its provider, in that `slots.ts`, and reaches
// a consumer as a type-only import of the provider's door, which installs
// nothing and adds no `requires` edge. A provider that is internal is absent
// from the public fork, where a portable consumer must still compile, so its
// slots name a type from the kernel instead (`typeFrom`), and the generator
// refuses one that does not. Nothing here names a provider.

/**
 * Where a slot may appear, read off the path of the page or shell that takes
 * it: `app/admin/` and an entity's `routes/admin/` are admin, and likewise team
 * and portal; every other page, and the root layout, is public.
 */
export type SlotSurface = "admin" | "team" | "portal" | "public";

type Declared = {
  /**
   * The slot's type: a bare name, imported from the provider's door unless
   * `typeFrom` names the module, or a type written out in full (`string | null`).
   */
  type: string;
  /** The module the bare type name is imported from; the kernel's, for an internal provider. */
  typeFrom?: string;
  /**
   * The stylesheets the slot's component draws with, as `@/` specifiers. The
   * generator imports them wherever the slot is mounted, and only when its
   * provider is installed; no consumer lists them.
   */
  styles: readonly string[];
  /** The surfaces the slot may appear on; the generator refuses it anywhere else. */
  surfaces: readonly SlotSurface[];
  /** One line on what the slot shows, and what shows without its provider. */
  why: string;
};

/**
 * One slot. A `component` renders, and its fallback is always null: the page
 * shows nothing in its place. A `value` is data or a function a shell or page
 * reads, with the fallback written out as code. A `registration` exports
 * nothing: app/shell.ts hands the provider to a kernel seam's `register`
 * function when the module loads, and a deployment without the provider leaves
 * the seam empty.
 */
export type SlotDeclaration =
  | (Declared & { kind: "component" })
  | (Declared & { kind: "value"; fallback: string })
  | (Declared & { kind: "registration"; register: string; registerFrom: string });

/** A provider's slots, keyed by the name app/shell.ts exports and its door exports. */
export type SlotDeclarations = Readonly<Record<string, SlotDeclaration>>;
