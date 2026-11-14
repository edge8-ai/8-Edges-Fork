import { NextResponse } from "next/server";
import { requirePermission } from "@/kernel/identity/access-request";
import { isUuid } from "@/kernel/config/slug";
import { jobsOfRun, listProfiles, offlineFileName, operatorWords, readRun, renderOfflineReport, runDate } from "@/entities/replenishment";

// Download offline copy (RP.7; spec "Offline download", `downloadRun`): one
// self-contained HTML file for scanners with no signal, built on request from
// the run's stored jobs and its profile snapshot's words, and never stored.
// Any status may be downloaded: a draft is the manager's own call to hand out,
// and a closed run's copy is a record of that week.
export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  await requirePermission("replenishment.runs");
  const { id } = await props.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const run = await readRun(id);
  if (!run) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const [jobs, profiles] = await Promise.all([jobsOfRun(run.id), listProfiles()]);
  const profileName = profiles.find((p) => p.id === run.profileId)?.name;
  const day = runDate(run.uploadedAt);
  const html = renderOfflineReport(
    { id: run.id, title: profileName ? `Run ${day} · ${profileName}` : `Run ${day}`, uploadedAt: run.uploadedAt, truncated: run.truncated, dataRows: run.dataRows },
    jobs,
    operatorWords(run.snapshot),
  );
  return new NextResponse(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${offlineFileName(run.uploadedAt)}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
