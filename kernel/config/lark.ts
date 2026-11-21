// The Lark / Feishu workspace that "open in Lark" deep links point at, e.g.
// "https://acme.sg.larksuite.com". Read from a literal NEXT_PUBLIC_ property so
// Next inlines it at build time — a dynamic lookup would not survive into the
// browser bundle (see the note in kernel/config/env.ts).
//
// Unset, every caller renders no link at all. That is deliberate: a hardcoded
// host sends a fork's users into the previous owner's workspace, where they
// land on a login wall for a tenant they do not belong to.
const WORKSPACE_URL = (process.env.NEXT_PUBLIC_LARK_WORKSPACE_URL ?? "").replace(/\/+$/, "");

/**
 * The workspace's host, lowercased ("acme.sg.larksuite.com"), or null when no
 * workspace is configured. A pasted Minutes link is ours only when it is on
 * this host. Read at call time rather than from WORKSPACE_URL, so a test can
 * set the variable after the module has loaded.
 */
export function larkWorkspaceHost(): string | null {
  const raw = (process.env.NEXT_PUBLIC_LARK_WORKSPACE_URL ?? "").trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Deep link to a Lark Minutes recording, or null when no workspace is configured. */
export function larkMinutesUrl(token: string): string | null {
  return WORKSPACE_URL ? `${WORKSPACE_URL}/minutes/${token}` : null;
}
