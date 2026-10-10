// Next runs this once per server process, before any request. It is where the
// composition root's event subscriptions are registered: a publisher must not
// import the registry (that would put every subscriber back in its import
// graph), so something has to run first, and this is the hook Next gives us.
//
// Two things keep it honest. Next calls `register()` only for a root
// instrumentation.ts: Next 14 also wanted `experimental.instrumentationHook`,
// and since Next 15 (B.18.2) the file alone is enough; scripts/check-deployment
// .test.mjs pins the version that makes it so. And Next compiles it once
// per *runtime*. Middleware ran on the edge until Next 16 made it proxy.ts on
// Node (B.18.3), so this build has no edge bundle today; the check stays so an
// edge route added later cannot pull the subscribers' graph into one: they
// reach Supabase (and node:crypto, and resvg) through code the edge bundler
// cannot load. The import therefore sits inside the runtime check as a
// block, not behind an early return: webpack drops a statically-false `if`
// body at parse time, so the edge bundle never sees `@/app/events`, whereas an
// early `return` leaves the import reachable and the edge build fails on the
// first Node-only module in team's graph.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerEventSubscribers } = await import("@/app/events");
    registerEventSubscribers();
    // The access facts only entities can read (ADR 0013). The resolver refuses
    // every request until this has run, rather than quietly granting no role.
    const { registerAccess } = await import("@/app/access");
    registerAccess();
    // The scheduled routines' handlers, which Run now on Settings -> Agents
    // runs in-process (Y.25). Each loads its cron only when it is run.
    const { registerRoutines } = await import("@/app/routines");
    registerRoutines();

    // One line naming everything this build needs and did not get. It reports
    // rather than throws: a half-configured deployment should still serve the
    // pages that do not need the missing variable, and the operator should not
    // have to hit the one route that fails to find out (ADR 0001 — a client
    // hosts this themselves).
    const { missingDeploymentEnv } = await import("@/app/env");
    const missing = missingDeploymentEnv();
    if (missing.length > 0) {
      console.error(`[boot] required environment not set: ${missing.join(", ")}`);
    }
    // The admin allowlist is bootstrap only (B.28, AC.20). Once an Admin grant
    // exists it grants nothing, and the boot log says so until it is emptied.
    // A failure here must not stop the server from coming up.
    try {
      const { allowlistBootstrapWarning } = await import("@/kernel/identity/admin-bootstrap");
      const warning = await allowlistBootstrapWarning();
      if (warning) console.warn(`[boot] ${warning}`);
    } catch (err) {
      console.warn(`[boot] could not check ADMIN_ALLOWLIST against the Admin grants: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
