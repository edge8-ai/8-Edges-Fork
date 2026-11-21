import { NextResponse } from "next/server";
import { requirePermission } from "@/kernel/identity/access-request";
import { teamMemberIdsOf } from "@/entities/org/lib/client-reviews/access";
import { clientCycleExport } from "@/entities/org/lib/client-reviews/export";

// The cycle overview as a spreadsheet (CR.3.4): one row per member, built on
// request behind the reviews permission and never stored. The person
// downloading gets nothing of their own review in it.
export async function GET(_req: Request, props: { params: Promise<{ cycleId: string }> }) {
  const access = await requirePermission("org.reviews");
  const { cycleId } = await props.params;
  const file = await clientCycleExport(cycleId, await teamMemberIdsOf(access.personId));
  if (!file) return NextResponse.json({ error: "That cycle was not found." }, { status: 404 });
  // A byte-order mark first, so Excel reads the file as UTF-8 (the "·" in the
  // headers, Vietnamese names) rather than in the system's code page.
  return new NextResponse(`\uFEFF${file.csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store, private",
    },
  });
}
