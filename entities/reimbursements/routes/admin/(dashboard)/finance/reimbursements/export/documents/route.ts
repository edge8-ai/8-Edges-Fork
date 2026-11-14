import { NextResponse } from "next/server";
import { requirePermission } from "@/kernel/identity/access-request";
import { bundleFits, exportDocuments, exportSpreadsheet, isExportMonth, zipEntriesOf } from "@/entities/reimbursements/lib/export";
import { zipStream } from "@/entities/reimbursements/lib/zip-stream";

// The month-end documents (RB.12): every receipt, red invoice and bank receipt
// behind the month's paid claims, as one zip with the spreadsheet at its top.
// Streamed, never buffered: each document's bytes go from storage to the
// response as the client reads them (lib/zip-stream.ts), so a month of
// hundreds of files needs no memory to speak of. The route's time limit is
// its mount's maxDuration (300 seconds, entities/reimbursements/mounts.ts):
// at the bucket's usual speed that is several gigabytes, more than a plain zip
// may hold, and a bundle over that limit is refused before the first byte.
export async function GET(req: Request) {
  await requirePermission("reimbursements.pay");
  const month = new URL(req.url).searchParams.get("month") ?? "";
  if (!isExportMonth(month)) return NextResponse.json({ error: "Pick a month, as YYYY-MM." }, { status: 400 });
  const [docs, csv] = await Promise.all([exportDocuments(month), exportSpreadsheet(month)]);
  if (!bundleFits(docs)) return NextResponse.json({ error: "This month's documents are more than one zip can hold (4 GiB). Ask for help splitting it." }, { status: 413 });
  const sheet = { name: `reimbursements-${month}.csv`, open: async () => new TextEncoder().encode(csv) };
  return new Response(zipStream([sheet, ...zipEntriesOf(docs)]), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="reimbursements-${month}-documents.zip"`,
      "Cache-Control": "no-store, private",
    },
  });
}
