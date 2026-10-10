// Per-render memoisation that survives being imported outside the server runtime.
//
// React only exports cache() under the react-server condition, which Next sets
// and a plain Node test run does not. A gate that calls cache() at module scope
// therefore throws "cache is not a function" the moment any test imports a
// module that transitively reaches it — which happens as soon as an entity door
// re-exports an admin action. Falling back to the bare function keeps behaviour
// identical where it matters: in the server runtime the real cache() is there,
// and off it there is no render for two callers to share a result across.
import { cache } from "react";

export const perRender = <T extends (...args: never[]) => unknown>(fn: T): T =>
  typeof cache === "function" ? cache(fn) : fn;
