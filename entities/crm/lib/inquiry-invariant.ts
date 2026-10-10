import type { Invariant } from "@/kernel/audit/invariants";
import { mustRows } from "@/kernel/data/read";
import { companyOs } from "@/kernel/data/supabase";
import { selectDeals, selectInquiries, selectLead } from "./reads";

// Z.15.9 (Z.11): no contact-form inquiry falls between the route and the
// chain. Each one sent between two days and one hour ago has reached a place a
// person looks: its run finished, or its sender is in the lead table, or a
// person or the qualifier moved it off New (spam included), or its sender is a
// current client, whom the chain names to the deal owner instead of queueing.
// What is left was written by the route and then lost: a run that never
// opened, or one stuck at a step.

const CONTACT_FORM = { type: "consultation", subject: "AI Audit Request" } as const;
const SETTLE_MS = 60 * 60_000;
const WINDOW_MS = 48 * 60 * 60_000;

export function inquiriesReachedTheChain(): Invariant {
  return {
    id: "Z.15.9",
    name: "every contact-form inquiry reached the queue, the board or the chain",
    check: async (now) => {
      const what = "[crm/inquiry-invariant]";
      const inquiries = mustRows(
        await selectInquiries("id, person_id, status")
          .eq("type", CONTACT_FORM.type)
          .eq("subject", CONTACT_FORM.subject)
          .eq("status", "new_lead")
          .gte("created_at", new Date(now.getTime() - WINDOW_MS).toISOString())
          .lte("created_at", new Date(now.getTime() - SETTLE_MS).toISOString())
          .limit(500),
        `${what} inquiries`,
      ) as unknown as { id: string; person_id: string; status: string }[];
      if (inquiries.length === 0) return { ok: true, detail: "no contact-form inquiry left in New from the last two days" };
      const ids = inquiries.map((i) => i.id);
      const people = [...new Set(inquiries.map((i) => i.person_id))];
      const [runs, leads, deals] = await Promise.all([
        companyOs.from("inquiry_triage").select("inquiry_id, step").in("inquiry_id", ids),
        selectLead("person_id").in("person_id", people),
        selectDeals("person_id").in("person_id", people).in("status", ["open", "won"]).is("archived_at", null),
      ]);
      const done = new Set((mustRows(runs, `${what} runs`) as { inquiry_id: string; step: string }[]).filter((r) => r.step === "done").map((r) => r.inquiry_id));
      const queued = new Set((mustRows(leads, `${what} leads`) as unknown as { person_id: string }[]).map((l) => l.person_id));
      const clients = new Set((mustRows(deals, `${what} deals`) as unknown as { person_id: string }[]).map((d) => d.person_id));
      const lost = inquiries.filter((i) => !done.has(i.id) && !queued.has(i.person_id) && !clients.has(i.person_id));
      if (lost.length === 0) return { ok: true, detail: `${inquiries.length} contact-form inquiries in New, each queued, filed or a client's` };
      return {
        ok: false,
        detail: `${lost.length} contact-form inquir${lost.length === 1 ? "y" : "ies"} from the last two days reached neither the Leads queue nor a finished run: ${lost
          .slice(0, 5)
          .map((i) => i.id.slice(0, 8))
          .join(", ")}. Open the Inquiries board and press Read again, or Promote.`,
      };
    },
  };
}
