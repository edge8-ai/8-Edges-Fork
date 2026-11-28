import { NextResponse } from "next/server";
import { requirePermission } from "@/kernel/identity/access-request";
import { exportSpreadsheet, isExportMonth } from "@/entities/reimbursements/lib/export";

// The month-end spreadsheet (RB.12): one row per receipt of every claim paid
// in the month, built on request behind reimbursements.pay and never stored.
export async function GET(req: Request) {
  await requirePermission("reimbursements.pay");
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isExportMonth(month)) return NextResponse.json({ error: "Pick a month, as YYYY-MM." }, { status: 400 });
  const csv = await exportSpreadsheet(month);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="reimbursements-${month}.csv"`,
      "Cache-Control": "no-store, private",
    },
  });
}
