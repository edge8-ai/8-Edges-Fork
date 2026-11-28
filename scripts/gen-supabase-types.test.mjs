// Exercises the image-registry fallback in scripts/gen-supabase-types.mjs with a
// stand-in for the Supabase CLI, so no Docker, network or database is needed. The
// real run is the `types-fresh` step in CI, which is the only place the CLI pulls.

import { describe, expect, it } from "vitest";
import {
  REGISTRY_FALLBACKS,
  isRegistryThrottle,
  runWithRegistryFallback,
} from "./gen-supabase-types.mjs";

// The two refusals ECR Public gave the runners on 2026-09-28 and 2026-09-29, verbatim.
const DATA_LIMIT = "docker: Error response from daemon: toomanyrequests: Data limit exceeded";
const RATE = "docker: Error response from daemon: toomanyrequests: Rate exceeded";
// The ECR Public quota as Docker reported it on 2026-11-18 (run 44268470438), verbatim:
// no toomanyrequests code, so the old matcher stopped after ECR and blamed the secret.
const DATA_LIMIT_NO_CODE = "docker: Error response from daemon: error from registry: Data limit exceeded";
const TYPES = "export type Json = string\n";

// A CLI whose answer depends on the registry it is pointed at; records each call's env.
function cli(byRegistry) {
  const calls = [];
  const run = (env) => {
    const registry = env.SUPABASE_INTERNAL_IMAGE_REGISTRY ?? "default";
    calls.push(registry);
    return byRegistry[registry] ?? { status: 0, stdout: TYPES, stderr: "" };
  };
  return { run, calls };
}

const throttled = (stderr) => ({ status: 1, stdout: "", stderr });
const noPause = () => {};

describe("isRegistryThrottle", () => {
  it("recognises both ECR Public refusals", () => {
    expect(isRegistryThrottle(DATA_LIMIT)).toBe(true);
    expect(isRegistryThrottle(RATE)).toBe(true);
  });

  it("recognises a quota refusal that carries no toomanyrequests code", () => {
    expect(isRegistryThrottle(DATA_LIMIT_NO_CODE)).toBe(true);
    expect(isRegistryThrottle("error from registry: Rate exceeded")).toBe(true);
    expect(
      isRegistryThrottle("failed to resolve reference: unexpected status from HEAD request: 429 Too Many Requests"),
    ).toBe(true);
    expect(
      isRegistryThrottle(
        "Error response from daemon: You have reached your unauthenticated pull rate limit. https://www.docker.com/increase-rate-limit",
      ),
    ).toBe(true);
  });

  it("does not read a credential, connection or missing-image failure as a throttle", () => {
    expect(isRegistryThrottle('password authentication failed for user "postgres"')).toBe(false);
    expect(
      isRegistryThrottle(
        'failed to connect to `user=postgres database=postgres`: FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01)',
      ),
    ).toBe(false);
    expect(isRegistryThrottle("connect ECONNREFUSED")).toBe(false);
    expect(isRegistryThrottle("dial tcp: lookup db.example.supabase.co: no such host")).toBe(false);
    expect(isRegistryThrottle("Error response from daemon: manifest unknown")).toBe(false);
    expect(isRegistryThrottle(undefined)).toBe(false);
  });
});

describe("runWithRegistryFallback", () => {
  it("tries the CLI's default registry first, then GHCR, then Docker Hub", () => {
    expect(REGISTRY_FALLBACKS).toEqual([null, "ghcr.io", "docker.io"]);
  });

  it("runs once, with the environment untouched, when the default registry answers", () => {
    const { run, calls } = cli({});
    const { result, tried } = runWithRegistryFallback(run, { env: {}, pause: noPause });
    expect(result.stdout).toBe(TYPES);
    expect(calls).toEqual(["default"]);
    expect(tried).toEqual(["public.ecr.aws"]);
  });

  it("moves to GHCR when ECR is throttled, and pauses between the two", () => {
    const pauses = [];
    const { run, calls } = cli({ default: throttled(DATA_LIMIT) });
    const { result, tried } = runWithRegistryFallback(run, {
      env: {},
      pause: (ms) => pauses.push(ms),
    });
    expect(result.status).toBe(0);
    expect(calls).toEqual(["default", "ghcr.io"]);
    expect(tried).toEqual(["public.ecr.aws", "ghcr.io"]);
    expect(pauses).toHaveLength(1);
  });

  it("stops after Docker Hub and returns the last throttle, so the gate fails rather than skips", () => {
    const { run, calls } = cli({
      default: throttled(DATA_LIMIT),
      "ghcr.io": throttled(RATE),
      "docker.io": throttled(RATE),
    });
    const { result, tried } = runWithRegistryFallback(run, { env: {}, pause: noPause });
    expect(result.status).toBe(1);
    expect(isRegistryThrottle(result.stderr)).toBe(true);
    expect(calls).toEqual(["default", "ghcr.io", "docker.io"]);
    expect(tried).toEqual(["public.ecr.aws", "ghcr.io", "docker.io"]);
  });

  it("moves on from the 2026-11-18 ECR refusal that had no toomanyrequests code", () => {
    const { run, calls } = cli({ default: throttled(DATA_LIMIT_NO_CODE) });
    const { result, tried } = runWithRegistryFallback(run, { env: {}, pause: noPause });
    expect(result.status).toBe(0);
    expect(calls).toEqual(["default", "ghcr.io"]);
    expect(tried).toEqual(["public.ecr.aws", "ghcr.io"]);
  });

  it("does not retry a failure that is not a throttle", () => {
    const refused = { status: 1, stdout: "", stderr: "password authentication failed" };
    const { run, calls } = cli({ default: refused });
    const { result } = runWithRegistryFallback(run, { env: {}, pause: noPause });
    expect(result).toBe(refused);
    expect(calls).toEqual(["default"]);
  });

  it("keeps a registry someone already chose, and tries only that one", () => {
    const { run, calls } = cli({ "mirror.example": throttled(RATE) });
    const { tried } = runWithRegistryFallback(run, {
      env: { SUPABASE_INTERNAL_IMAGE_REGISTRY: "mirror.example" },
      pause: noPause,
    });
    expect(calls).toEqual(["mirror.example"]);
    expect(tried).toEqual(["mirror.example"]);
  });

  it("passes the rest of the environment through to the CLI", () => {
    const seen = [];
    runWithRegistryFallback(
      (env) => {
        seen.push(env.SUPABASE_DB_URL);
        return env.SUPABASE_INTERNAL_IMAGE_REGISTRY ? { status: 0, stdout: TYPES } : throttled(RATE);
      },
      { env: { SUPABASE_DB_URL: "postgres://pooler" }, pause: noPause },
    );
    expect(seen).toEqual(["postgres://pooler", "postgres://pooler"]);
  });
});
