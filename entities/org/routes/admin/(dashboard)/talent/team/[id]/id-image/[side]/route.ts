import { NextResponse } from "next/server";
import { requirePermission } from "@/kernel/identity/access-request";
import { companyOs } from "@/kernel/data/supabase";
import { signedIdUrl, type IdSide } from "@/entities/retreats";

// Serves a team member's ID-card scan (front/back) to a cleared admin by
// redirecting to a short-lived signed URL. Gated on people.identity (ADR 0014):
// ID scans are personal records, which Super Admin holds by declaration (a
// plain admin is not enough). The person is resolved from the team_directory id in
// the path (never a client-supplied person id). The scans live in the PRIVATE
// id-documents bucket, so they are never a public URL — only this authenticated
// redirect. The selfie is not served here: it lives in the public avatars
// bucket as the profile photo. `force-dynamic` so the signed URL is minted per
// request, never cached.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; side: string }> },
) {
  await requirePermission("people.identity");
  const { id, side } = await params;
  if (side !== "front" && side !== "back") {
    return new NextResponse("Not found", { status: 404 });
  }
  const { data, error } = await companyOs
    .from("team_directory")
    .select("person_id")
    .eq("id", id)
    .maybeSingle();
  if (error) console.error("[talent/team] id-image directory lookup failed:", error.message);
  const personId = (data as { person_id: string | null } | null)?.person_id ?? null;
  if (!personId) return new NextResponse("Not found", { status: 404 });

  const url = await signedIdUrl(personId, side as IdSide);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
