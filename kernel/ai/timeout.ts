/** The shared client's default per-request timeout: long enough for an 8k-token structured answer on Sonnet. */
export const DEFAULT_TIMEOUT_MS = 120_000;

/** Parsed ANTHROPIC_TIMEOUT_MS; anything that is not a positive integer falls back. */
export function anthropicTimeoutMs(): number {
  const raw = process.env.ANTHROPIC_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const ms = Number.parseInt(raw, 10);
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_TIMEOUT_MS;
}
