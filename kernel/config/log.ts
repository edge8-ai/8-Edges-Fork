import { headers } from "next/headers";

// Structured logging: one JSON line per call so Vercel's log drain (and a
// human reading the function logs) can filter by level, request id or any
// structured field instead of grepping prose. Writes go to console.log /
// console.error only — Vercel captures both streams, and the console is the
// one sink every runtime (node, edge, tests) shares.

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown> & {
  // The caller's identity when it is known (an admin user id, a portal member
  // id). Optional because webhooks and crons have no actor.
  actorId?: string;
};

type LogLine = {
  level: LogLevel;
  msg: string;
  ts: string;
  requestId?: string;
  actorId?: string;
  [key: string]: unknown;
};

// Vercel stamps every invocation with `x-vercel-id`; a proxy or a test may
// set `x-request-id` explicitly, and that wins when present.
//
// Since Next 15 `headers()` is a promise (B.18.2), but `log` stays synchronous:
// it has callers everywhere, kernel/ai and the crons among them, and none of
// them should have to await a log line. So the line is handed to `emit` with
// the request id once it is known:
// - Outside a request scope (crons, scripts, tests) `headers()` throws at once,
//   and the line is written synchronously without the field, as before.
// - Inside one, the promise is already settled, so the line is written one
//   microtask later, before any timer or I/O callback and before the function
//   returns its response. Lines from one request keep their order.
function withRequestId(emit: (requestId: string | undefined) => void): void {
  let pending: ReturnType<typeof headers>;
  try {
    pending = headers();
  } catch {
    emit(undefined);
    return;
  }
  pending.then(
    (bag) => emit(bag.get("x-request-id") ?? bag.get("x-vercel-id") ?? undefined),
    () => emit(undefined),
  );
}

// `JSON.stringify` drops undefined values, turns a bigint into a throw and an
// Error into `{}`; the replacer keeps the line emitting rather than crashing
// the caller over a field it merely wanted to log.
function replacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}

export function log(level: LogLevel, msg: string, fields: LogFields = {}): void {
  // Stamped at the call, not when the request id arrives.
  const ts = new Date().toISOString();
  withRequestId((requestId) => {
    const line: LogLine = {
      ...fields,
      level,
      msg,
      ts,
      ...(requestId ? { requestId } : {}),
    };
    const serialised = JSON.stringify(line, replacer);
    // warn and error go to stderr so Vercel flags them as errors in the
    // function log view; everything else stays on stdout.
    if (level === "error" || level === "warn") console.error(serialised);
    else console.log(serialised);
  });
}

// The single place an error-tracking vendor (Sentry, Axiom, ...) would be
// wired later: every caught-but-unhandled error in the app should pass through
// here, so adding a vendor is one edit rather than a sweep. Deliberately no
// vendor today — Vercel's own log capture is the sink.
export function reportError(err: unknown, context: Record<string, unknown> = {}): void {
  const error =
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: "NonError", message: safeString(err), stack: undefined };
  log("error", error.message, { ...context, error });
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, replacer) ?? String(value);
  } catch {
    return String(value);
  }
}
