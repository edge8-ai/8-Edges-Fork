import { NextRequest, NextResponse } from "next/server";
import { acceptProposal, verifyProposalAcceptToken } from "../../../lib/proposal-accept";

// The "Create your contract" button on a static proposal page posts here. The
// page is public, so the token is the whole credential: it names one deal and
// is signed with PROPOSAL_ACCEPT_SECRET (../../../lib/proposal-accept.ts). The
// honeypot answers like a success and does nothing, as the contact form does.

export async function POST(req: NextRequest) {
  let body: { token?: unknown; website?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (body.website) return NextResponse.json({ ok: true });
  const dealId = typeof body.token === "string" ? verifyProposalAcceptToken(body.token) : null;
  if (!dealId) return NextResponse.json({ error: "This link is not valid. Please contact us directly." }, { status: 403 });

  const result = await acceptProposal(dealId);
  if (result.status === "refused") {
    console.error(`[crm/proposal-accept] ${dealId}: ${result.reason}`);
    return NextResponse.json({ error: "We could not record that just now. Please contact us directly." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, already: result.status === "already", firstName: result.firstName });
}
