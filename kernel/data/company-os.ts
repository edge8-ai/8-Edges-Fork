import { companyOs } from "./supabase";
import { updatePeople, upsertPeople } from "@/kernel/identity/writes";
import { externalHref } from "@/kernel/ui/url";

// The kernel's one write helper for the `company_os` schema: get-or-create a
// person. `people` is a kernel/identity table (multi-entity design §4), which is
// why this lives here, and it writes through kernel/identity/writes.ts like
// everyone else so that file stays the only place the table is written; every form that captures a person (site signups, careers,
// the portal survey runner, event checkout, admin intake) goes through it so
// the person-centric model stays consistent. The application and booking
// writers that used to sit beside it moved to their owners in ME-13 —
// entities/company-os/modules/hiring/applications.ts and
// entities/billing/lib/private-session-booking.ts — because the kernel may not
// own an entity's table logic (design §3 rule 3, §4).

type Ok<T> = { ok: true } & T;
type Err = { ok: false; error: string };

// Get-or-create a person by email (unique, citext). Uses ON CONFLICT DO NOTHING
// so we never clobber existing CRM data, then reads back the id. Race-safe.
// LinkedIn is a person attribute; it's filled in only where missing.
export async function getOrCreatePerson(input: {
  email: string;
  name?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  source?: string | null;
}): Promise<Ok<{ id: string }> | Err> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "A valid email is required." };
  }
  // The public careers form reaches this, so LinkedIn arrives as anyone typed
  // it. A value that is not a link is dropped rather than refused: it is an
  // enrichment filled only where missing, and a candidate is never turned away
  // over it. What is stored is always something ExternalLink will draw.
  const linkedin = externalHref(input.linkedin);

  const { error: upErr } = await upsertPeople(
    {
      email,
      full_name: input.name ?? null,
      phone: input.phone ?? null,
      linkedin_url: linkedin,
      source: input.source ?? null,
    },
    { onConflict: "email", ignoreDuplicates: true },
  );
  if (upErr) {
    console.error("[company-os] people upsert failed:", upErr.message);
    return { ok: false, error: "Could not save your details. Please try again." };
  }

  const { data, error } = await companyOs
    .from("people")
    .select("id, linkedin_url")
    .eq("email", email)
    .single();
  if (error || !data) {
    console.error("[company-os] people select failed:", error?.message);
    return { ok: false, error: "Could not save your details. Please try again." };
  }

  // Existing person without a LinkedIn: enrich, never overwrite.
  if (linkedin && !data.linkedin_url) {
    const { error: linkErr } = await updatePeople({ linkedin_url: linkedin }).eq("id", data.id);
    if (linkErr) console.error("[company-os] people linkedin enrich failed:", linkErr.message);
  }
  return { ok: true, id: data.id };
}
