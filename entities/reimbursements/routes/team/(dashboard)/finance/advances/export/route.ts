import { NextResponse } from "next/server";
import { requirePermission } from "@/kernel/identity/access-request";
import { isExportMonth } from "@/entities/reimbursements/lib/export";
import { account141Csv, readAdvancesForExport } from "@/entities/reimbursements/lib/advance-export";

// Account 141 for a month (AD.10), built on request behind reimbursements.pay and never stored.
export async function GET(req: Request) {
  await requirePermission("reimbursements.pay");
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isExportMonth(month)) return NextResponse.json({ error: "Pick a month, as YYYY-MM." }, { status: 400 });
  const csv = account141Csv(await readAdvancesForExport(), month);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="account-141-${month}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
