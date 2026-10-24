import { NextResponse } from "next/server";
import { companyOs } from "@/kernel/data/supabase";
import { verifyUnsubscribeToken } from "@/entities/campaigns";
import { updatePeople } from "@/kernel/identity/writes";
import { insertInteractions } from "@/kernel/messaging/writes";

// One-click unsubscribe (RFC 8058). Gmail and Outlook POST here directly from
// their native Unsubscribe button, with no human ever seeing a page. That is the
// whole point: if opting out is one tap, people use it instead of pressing
// "report spam", which is what actually damages a sending domain.
//
// The confirmation page at /unsubscribe/ posts here too.

export async function POST(request: Request) {
  // The token can arrive as a query param (the List-Unsubscribe URL) or in a
  // form/JSON body (the confirmation page).
  const url = new URL(request.url);
  let token = url.searchParams.get("token");

  if (!token) {
    const contentType = request.headers.get("content-type") ?? "";
    try {
      if (contentType.includes("application/json")) {
        const body = (await request.json()) as { token?: string };
        token = body.token ?? null;
      } else if (contentType.includes("form")) {
        const form = await request.formData();
        const value = form.get("token");
        token = typeof value === "string" ? value : null;
      }
    } catch {
      // Mail clients send an empty or non-standard body with the one-click POST;
      // the query-param token is authoritative, so a parse failure is not fatal.
    }
  }

  if (!token) {
    return NextResponse.json({ error: "Missing token." }, { status: 400 });
  }

  const personId = verifyUnsubscribeToken(token);
  if (!personId) {
    return NextResponse.json({ error: "Invalid or expired link." }, { status: 400 });
  }

  const { data: person, error: readError } = await companyOs
    .from("people")
    .select("id, email, marketing_consent")
    .eq("id", personId)
    .maybeSingle();

  if (readError) {
    return NextResponse.json({ error: readError.message }, { status: 500 });
  }
  if (!person) {
    return NextResponse.json({ error: "Unknown contact." }, { status: 404 });
  }

  // Already unsubscribed is a success, not an error. Mail clients retry.
  if ((person as { marketing_consent: string }).marketing_consent === "unsubscribed") {
    return NextResponse.json({ ok: true, already: true });
  }

  const { error } = await updatePeople({
      marketing_consent: "unsubscribed",
      marketing_consent_at: new Date().toISOString(),
      marketing_consent_source: "unsubscribe_link",
      updated_at: new Date().toISOString(),
    })
    .eq("id", personId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Log to the CRM timeline. kind must be one of the values allowed by
  // interactions_kind_check; 'system' is the right one for a state change.
  try {
    await insertInteractions({
      kind: "system",
      subject: "Unsubscribed from marketing email",
      person_id: personId,
      occurred_at: new Date().toISOString(),
      metadata: { source: "unsubscribe_link" },
    });
  } catch (err) {
    console.error("[unsubscribe] interaction log failed:", err);
  }

  return NextResponse.json({ ok: true });
}
