// The weekly recap as the client and Edge8's leaders read it (English Program
// PR 9): plain HTML on a plain shell, the four sections, the organiser's own
// note, and a line saying who sent it. No name in the subject; no rating,
// load, skip reason or review anywhere in it, by construction of the draft.
import type { WeeklyDraftType } from "@/entities/training/lib/weekly-recap-rules";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const para = (s: string) => esc(s).split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`).join("");
const section = (label: string, body: string) => (body.trim() ? `<h2 style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:24px 0 8px">${esc(label)}</h2>${body}` : "");

export function renderWeeklyRecapEmail(input: { planTitle: string; weekLabel: string; organiserName: string; draft: WeeklyDraftType; names: Map<string, string>; instructorNote: string | null; untouched: boolean }): string {
  const { draft } = input;
  const progress = draft.progress.map((p) => `<p style="margin:0 0 12px;line-height:1.55"><strong>${esc(input.names.get(p.person_id) ?? "A learner")}:</strong> ${esc(p.md)}</p>`).join("");
  return `<!doctype html><html><body style="margin:0;padding:24px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px">
<div style="max-width:620px;margin:0 auto">
<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px">${esc(input.planTitle)}</p>
<h1 style="font-size:22px;margin:0 0 4px">${esc(input.weekLabel)}</h1>
<p style="margin:0 0 20px">${esc(input.organiserName)}, Edge8</p>
${input.untouched ? `<p style="margin:0 0 16px;padding:10px 12px;border-radius:8px;font-size:13px">Drafted by the programme's agent and not yet reviewed by the instructor.</p>` : ""}
${section("This week", para(draft.this_week))}
${section("Attendance and homework", para(draft.attendance))}
${section("Progress", progress)}
${section("Next week", para(draft.next_week))}
${input.instructorNote ? section(`From ${input.organiserName}`, para(input.instructorNote)) : ""}
<p style="margin:32px 0 0;font-size:12px">Sent by the Edge8 Company OS on ${esc(input.organiserName)}'s behalf. Reply reaches ${esc(input.organiserName)}.</p>
</div></body></html>`;
}
