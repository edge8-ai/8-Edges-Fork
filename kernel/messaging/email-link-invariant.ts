import type { Invariant } from "@/kernel/audit/invariants";
import { companyOs } from "@/kernel/data/supabase";

// Z.15.8 (plan Part G, failure 2): a link in a sent email that points nowhere.
// Between 5 and 7 Oct 2026 the survey reminder sent ten emails whose link was
// "[object Promise]/surveys/…", an origin read without its await (fixed in
// SA.2). A send like that reads ok everywhere: Resend accepted it, the run
// closed ok, and only the person clicking found out. A preview deployment's
// host (*.vercel.app) in a link is the same fault from the other side: the
// origin came from the wrong environment, and the link dies with the preview.
//
// The record read is company_os.interactions, where sendTransactionalEmail
// logs every accepted send to a CRM person or company, with sign-in links
// already removed. A recipient outside the CRM gets no row, so this sees most
// sends, not all of them.

// A link whose text is a stringified object, or whose host is a preview deployment.
const BROKEN_LINK = /href="(\[object [A-Za-z]+\][^"]*|https?:\/\/[a-z0-9.-]+\.vercel\.app[^"]*)"/i;

export function emailLinksAreWhole(): Invariant {
  return {
    id: "Z.15.8",
    name: "no email sent in the last day links to [object …] or a preview host",
    check: async (now) => {
      const since = new Date(now.getTime() - 86_400_000).toISOString();
      const read = (column: "like" | "ilike", pattern: string) =>
        companyOs
          .from("interactions")
          .select("id, body, metadata")
          .eq("kind", "email")
          .gte("occurred_at", since)
          [column]("body", pattern)
          .limit(500);
      const [objects, previews] = await Promise.all([read("like", "%[object %"), read("ilike", "%.vercel.app%")]);
      if (objects.error) throw new Error(`interactions: ${objects.error.message}`);
      if (previews.error) throw new Error(`interactions: ${previews.error.message}`);
      type Row = { id: string; body: string | null; metadata: { source?: unknown } | null };
      const rows = new Map<string, Row>();
      for (const r of [...(objects.data ?? []), ...(previews.data ?? [])] as Row[]) rows.set(r.id, r);
      const broken = [...rows.values()].filter((r) => r.body && BROKEN_LINK.test(r.body));
      if (broken.length === 0) return { ok: true, detail: "every logged email link in the last day is whole" };
      // By source and interaction id, never the recipient or the subject, which can name a person.
      const sources = [...new Set(broken.map((r) => String(r.metadata?.source ?? "unknown")))].join(", ");
      const first = BROKEN_LINK.exec(broken[0].body ?? "")?.[1]?.slice(0, 60) ?? "";
      return {
        ok: false,
        detail: `${broken.length} email(s) with a broken link (sources: ${sources}); first: interaction ${broken[0].id}, link "${first}"`,
      };
    },
  };
}
