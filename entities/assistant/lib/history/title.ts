// Derive a conversation title from its display items: the first user message,
// trimmed to a short single line. Reads display items (never trimmed) rather than
// the Anthropic transcript (trimmed for model context), so the first user turn is
// always present even deep into a long conversation. Model-generated titles are
// deferred for v1 — this avoids an extra model call.

const MAX_LEN = 48;

export function deriveTitle(displayItems: unknown[]): string {
  for (const item of displayItems) {
    if (
      item &&
      typeof item === "object" &&
      (item as { kind?: unknown }).kind === "user"
    ) {
      const raw = (item as { text?: unknown }).text;
      const text = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim() : "";
      if (text) {
        return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1).trimEnd()}…` : text;
      }
    }
  }
  return "New chat";
}
