import { execFile, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// The lock that queues `npm run check` runs on one machine (S.20). Each test
// gives it a lock directory of its own, a one-second poll and a short limit,
// so nothing here waits on the real lock or on a clock longer than the test.

const SCRIPT = fileURLToPath(new URL("./with-check-lock.sh", import.meta.url));

let dir;
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

const envFor = (lock, extra = {}) => ({
  ...process.env,
  EDGE8_CHECK_LOCK_DIR: lock,
  EDGE8_CHECK_LOCK_POLL: "1",
  EDGE8_CHECK_LOCK_LIMIT: "4",
  ...extra,
});

/** Runs the script with `args`, resolving to its exit status and combined output. */
function run(lock, args, extra) {
  return new Promise((resolve) => {
    execFile("sh", [SCRIPT, ...args], { env: envFor(lock, extra), encoding: "utf8" }, (err, stdout, stderr) => {
      resolve({ status: err ? err.code : 0, output: `${stdout}${stderr}` });
    });
  });
}

describe("with-check-lock.sh", () => {
  it("passes the command's exit status through and releases the lock", async () => {
    dir = mkdtempSync(join(tmpdir(), "check-lock-"));
    const lock = join(dir, "lock");
    expect((await run(lock, ["sh", "-c", "exit 0"])).status).toBe(0);
    expect((await run(lock, ["sh", "-c", "exit 7"])).status).toBe(7);
    expect(existsSync(lock)).toBe(false);
  });

  it("makes a second gate wait for the first instead of running beside it", async () => {
    dir = mkdtempSync(join(tmpdir(), "check-lock-"));
    const lock = join(dir, "lock");
    const log = join(dir, "log");
    // Each gate appends start and end; serialised, the first's end precedes
    // the second's start. The first holds the lock for two seconds, which is
    // more than the poll and less than the limit.
    const gate = (name, hold) => `echo ${name}-start >> "${log}"; sleep ${hold}; echo ${name}-end >> "${log}"`;
    const first = spawn("sh", [SCRIPT, "sh", "-c", gate("a", 2)], { env: envFor(lock), stdio: ["ignore", "pipe", "pipe"] });
    // Listen before anything else awaits: the first gate may well have exited
    // by the time the second returns, and an exit already fired never fires again.
    const firstDone = new Promise((r) => first.on("exit", r));
    // Give the first gate time to take the lock before the second asks.
    await new Promise((r) => setTimeout(r, 300));
    const second = await run(lock, ["sh", "-c", gate("b", 0)]);
    await firstDone;
    expect(second.status).toBe(0);
    expect(second.output).toMatch(/another npm run check \(pid \d+\) is running on this machine; waiting/);
    const { readFileSync } = await import("node:fs");
    expect(readFileSync(log, "utf8").trim().split("\n")).toEqual(["a-start", "a-end", "b-start", "b-end"]);
  });

  it("takes over a lock whose holder is gone", async () => {
    dir = mkdtempSync(join(tmpdir(), "check-lock-"));
    const lock = join(dir, "lock");
    mkdirSync(lock);
    // A pid no process has: the largest pid macOS and Linux hand out is far
    // below this, so kill -0 fails and the lock reads as stale.
    writeFileSync(join(lock, "pid"), "4194304\n");
    const r = await run(lock, ["sh", "-c", "exit 0"]);
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/held the lock and is gone; taking it over/);
    expect(existsSync(lock)).toBe(false);
  });

  it("runs anyway once the bounded wait is spent, and says so", async () => {
    dir = mkdtempSync(join(tmpdir(), "check-lock-"));
    const lock = join(dir, "lock");
    // A live holder that never finishes: this process.
    mkdirSync(lock);
    writeFileSync(join(lock, "pid"), `${process.pid}\n`);
    const r = await run(lock, ["sh", "-c", "exit 0"], { EDGE8_CHECK_LOCK_LIMIT: "2" });
    expect(r.status).toBe(0);
    expect(r.output).toMatch(/waited 2s for process \d+; running alongside it/);
    // It did not hold the lock, so it must not have removed the holder's.
    expect(existsSync(lock)).toBe(true);
  });
});
