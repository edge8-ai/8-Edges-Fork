import { NextResponse } from "next/server";
import { companyOs } from "@/kernel/data/supabase";
import { requirePermission } from "@/kernel/identity/access-request";
import { normalizeRegistrationStatus } from "@/entities/retreats";
import { one } from "@/kernel/config/embedded";

type RegDbRow = {
  attendee_name: string | null;
  attendee_email: string | null;
  status: string | null;
  guest_count: number | null;
  ticket_code: string | null;
  checked_in_at: string | null;
  created_at: string;
  people: { full_name: string | null; email: string } | { full_name: string | null; email: string }[] | null;
  products: { title: string | null } | { title: string | null }[] | null;
};

// csv-inject a leading apostrophe on any cell that could be misread as a
// formula by Excel/Sheets (=, +, -, @) — the standard CSV-injection guard.
function csvCell(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? "" : String(value);
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${guarded.replace(/"/g, '""')}"`;
}

// Roster CSV export — the gap eo-vietnam never closed. One row per
// registration, in the same shape as the on-screen roster table.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  await requirePermission("retreats.events");

  const { data: event, error: evErr } = await companyOs.from("events").select("slug, title").eq("id", params.id).maybeSingle();
  if (evErr || !event) {
    return NextResponse.json({ error: evErr?.message ?? "Event not found." }, { status: 404 });
  }

  const { data, error } = await companyOs
    .from("event_registrations")
    .select(
      "attendee_name, attendee_email, status, guest_count, ticket_code, checked_in_at, created_at, people(full_name, email), products(title)"
    )
    .eq("event_id", params.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const header = ["Name", "Email", "Tier", "Status", "Guests", "Ticket code", "Registered at", "Checked in at"];
  const rows = ((data ?? []) as unknown as RegDbRow[]).map((r) => {
    const p = one(r.people);
    const prod = one(r.products);
    return [
      r.attendee_name || p?.full_name || "",
      r.attendee_email || p?.email || "",
      prod?.title || "",
      humanizeStatus(normalizeRegistrationStatus(r.status ?? "registered")),
      String(r.guest_count ?? 0),
      r.ticket_code || "",
      r.created_at,
      r.checked_in_at || "",
    ];
  });

  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `${event.slug}-roster.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

function humanizeStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
