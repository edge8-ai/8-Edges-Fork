import { companyOs } from "@/kernel/data/supabase";
import { resolveAudience, type BroadcastRow } from "./broadcasts";
import { getAudience, resolveAudienceIds } from "./audiences";

// Materialises a draft broadcast's audience into email_campaign_recipients. Used
// by the Build button, by approval (so a saved audience picks up anyone who
// joined since the list was built) and by the series cron when it opens an
// issue. Re-runnable: it only ever adds people, so building twice after the
// audience grows adds the newcomers without duplicating anyone.
export async function materializeRecipients(campaign: BroadcastRow): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  let onlyIds: string[] | undefined;
  if (campaign.audienceId) {
    const audience = await getAudience(campaign.audienceId);
    if (!audience) return { ok: false, error: "The broadcast's saved audience no longer exists." };
    const resolved = await resolveAudienceIds(audience.rules);
    if (resolved.error) return { ok: false, error: resolved.error };
    onlyIds = resolved.ids;
  }

  // A saved audience replaces both the persona tick-boxes and guest-brand
  // scoping: the audience names exactly who it is for, so a program's students
  // are reachable under that program's brand without also joining its brand list.
  const { members, error } = campaign.audienceId
    ? await resolveAudience({}, null, onlyIds)
    : await resolveAudience(campaign.segment, campaign.brandId);
  if (error) return { ok: false, error };
  if (members.length === 0) {
    return {
      ok: false,
      error: campaign.audienceId || !campaign.brandId
        ? "That audience matches nobody who can be emailed."
        : "That segment matches nobody. A branded broadcast only reaches that brand's audience — add contacts to the brand first.",
    };
  }

  // Paged: an unbounded select is capped by PostgREST and truncates silently.
  // A partial "already" set would let an existing person through, and Postgres
  // rejects the whole insert on the unique constraint, so a build would fail
  // with a duplicate-key error and could never be re-run on that campaign.
  const PAGE = 500;
  const already = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const { data: existing, error: existingError } = await companyOs.from("email_campaign_recipients").select("person_id")
      .eq("campaign_id", campaign.id)
      .order("person_id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (existingError) return { ok: false, error: existingError.message };
    const page = (existing ?? []) as { person_id: string }[];
    for (const row of page) already.add(row.person_id);
    if (page.length < PAGE) break;
  }

  const fresh = members.filter((m) => !already.has(m.personId));
  // Chunked so one oversized statement cannot fail the whole build.
  for (let i = 0; i < fresh.length; i += PAGE) {
    const { error: insertError } = await companyOs.from("email_campaign_recipients").insert(
      fresh.slice(i, i + PAGE).map((m) => ({
        campaign_id: campaign.id,
        person_id: m.personId,
        email: m.email.toLowerCase(),
        status: "pending",
      })),
    );
    if (insertError) return { ok: false, error: insertError.message };
  }
  return { ok: true, added: fresh.length };
}
