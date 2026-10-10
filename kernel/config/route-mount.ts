// What a route needs from the file that mounts it, and cannot say itself.
//
// `app/` is generated from the entity route trees (scripts/gen-app-mounts.mjs).
// Almost everything about a mount is derivable — its path, and the names Next
// binds it by — but two things are not, because Next reads them by static
// analysis of the file in `app/` and will not see them through a re-export: the
// route-segment config, and the stylesheets whose cascade order against
// app/styles/* is part of the page.
//
// Each entity states them for its own routes in `entities/<name>/mounts.ts`,
// keyed by the route's path within the entity. They live in one file per entity
// rather than beside each route because 286 routes carry one and the repo's
// file-size ratchet is measured per file: a five-line declaration in each would
// have pushed four pages over their cap for no reader's benefit.

/** Next's route-segment config. Values are emitted into the mount verbatim. */
export type RouteSegment = {
  runtime?: "nodejs" | "edge";
  dynamic?: "auto" | "force-dynamic" | "error" | "force-static";
  dynamicParams?: boolean;
  revalidate?: number | false;
  fetchCache?: "auto" | "default-cache" | "only-cache" | "force-cache" | "force-no-store" | "default-no-store" | "only-no-store";
  preferredRegion?: string | string[];
  maxDuration?: number;
};

export type RouteMount = {
  segment?: RouteSegment;
  /** Import specifiers, resolved from the mount under `app/`, not from here. */
  styles?: readonly string[];
  /** A second HTTP method bound to the same handler, as `{ POST: "GET" }`. */
  alias?: Readonly<Record<string, string>>;
  /** The mount carries the directive, because the body is a client component. */
  useClient?: true;
  /**
   * Page props filled from app/shell.ts, as `{ prop: "SlotName" }` (W.169.4).
   * The mount then wraps the page and passes each slot in, so a page can show
   * what another entity provides without requiring that entity; a deployment
   * without the provider passes the slot's fallback.
   */
  slots?: Readonly<Record<string, string>>;
};

/** An entity's route config, keyed by the route's path within the entity. */
export type RouteMounts = Readonly<Record<string, RouteMount>>;
