import type { Middleware } from "@anthropic-ai/sdk";
import { log } from "@/kernel/config/log";

/**
 * Two Anthropic keys, spent in order (Y.92): ANTHROPIC_PRIMARY_API_KEY first
 * (a key carrying free credits), ANTHROPIC_API_KEY once the first cannot pay.
 *
 * It is SDK middleware rather than a wrapper around call sites because every
 * Claude request already goes through the one client in ./client, and the
 * middleware sees each HTTP attempt with its `x-api-key` set: a plain call, a
 * stream, a token count and the gateway's model fallback all switch keys the
 * same way, with no call site aware there are two.
 *
 * Only a key that is spent or dead hands over. A 429 or a 5xx is the SDK's to
 * retry on the same key, because it passes, and handing it over would spend
 * the paid key on a problem the free one does not have.
 */

/** How long the primary key is skipped after it was found spent or dead. */
export const PRIMARY_REST_MS = 30 * 60_000;

/**
 * Whether a response says the key itself cannot be used: out of credit (402,
 * `billing_error`, or the older 400 "credit balance is too low"), or revoked
 * or invalid (401). Anything else is about the request, not the key.
 */
export async function keyIsSpent(response: Response): Promise<boolean> {
  if (response.status === 401 || response.status === 402) return true;
  if (response.status !== 400 && response.status !== 403) return false;
  let body: { error?: { type?: string; message?: string } } | null = null;
  try {
    body = await response.clone().json();
  } catch {
    return false;
  }
  if (body?.error?.type === "billing_error") return true;
  return /credit balance/i.test(body?.error?.message ?? "");
}

/**
 * The middleware for a client whose own key is the primary one. After the
 * primary is found spent, requests go straight to the fallback for
 * PRIMARY_REST_MS, so the process does not pay one failed request per call;
 * after the rest the primary is tried again, in case it was topped up.
 */
export function keyFallbackMiddleware(fallbackKey: string): Middleware {
  let primaryRestsUntil = 0;
  return async (request, next) => {
    const headers = request.headers as Headers;
    if (Date.now() < primaryRestsUntil) {
      headers.set("x-api-key", fallbackKey);
      return next(request);
    }
    const response = await next(request);
    if (!(await keyIsSpent(response))) return response;
    primaryRestsUntil = Date.now() + PRIMARY_REST_MS;
    log("warn", "ai-key-fallback", { status: response.status, restMinutes: PRIMARY_REST_MS / 60_000 });
    await response.body?.cancel();
    headers.set("x-api-key", fallbackKey);
    return next(request);
  };
}
