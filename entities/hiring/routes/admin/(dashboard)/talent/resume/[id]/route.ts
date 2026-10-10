import { NextResponse } from "next/server";
import { companyOs, supabase } from "@/kernel/data/supabase";
import { getAccess } from "@/kernel/identity/access-request";

// Mint a short-lived signed URL for a resume document and redirect to it. A
// résumé is recruiting data, so it asks for hiring.ats, the permission every
// recruiting page and action asks for (ADR 0013); the contacts page shows the
// link only to its holders. A route handler answers with a status rather than
// requirePermission's refusal page: nobody signed in goes to sign in, and
// anyone else is told there is no such document. The `resumes` bucket is
// private; site forms upload there via the service-role client.
export async function GET(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const access = await getAccess();
  if (!access) return NextResponse.redirect(new URL("/admin/login", req.url));
  if (!access.may("hiring.ats")) return new NextResponse("Document not found", { status: 404 });

  const { data: doc, error } = await companyOs
    .from("documents")
    .select("storage_path")
    .eq("id", params.id)
    .maybeSingle();
  if (error || !doc?.storage_path) {
    return new NextResponse("Document not found", { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from("resumes")
    .createSignedUrl(doc.storage_path, 300);
  if (sErr || !signed?.signedUrl) {
    return new NextResponse("Could not generate a resume link", { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
