import { NextResponse } from "next/server";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { signedIdUrl, type IdSide } from "@/entities/retreats";

// Serves the actor's OWN ID-card image by redirecting to a short-lived signed
// URL. Self-scoped: signedIdUrl reads the path off the actor's own
// people_sensitive row — never a client-supplied id. 404 when nothing is on
// file. `force-dynamic` so the signed URL is minted per request, never cached.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ side: string }> },
) {
  const actor = await requireTeamMember();
  const { side } = await params;
  if (side !== "front" && side !== "back") {
    return new NextResponse("Not found", { status: 404 });
  }
  const url = await signedIdUrl(actor.personId, side as IdSide);
  if (!url) return new NextResponse("Not found", { status: 404 });
  return NextResponse.redirect(url);
}
