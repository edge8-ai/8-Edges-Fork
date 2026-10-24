import { teamManifest } from "@/entities/team/lib/installable-app";

// Served at /team-app.webmanifest, the installed app's manifest (MO.10). It is
// public on purpose: a browser fetches it without cookies, before anyone signs
// in, and it says nothing a sign-in page does not. Why it sits beside /team
// rather than under it is in entities/team/lib/installable-app.ts.
export function GET(): Response {
  return Response.json(teamManifest(), {
    headers: { "content-type": "application/manifest+json" },
  });
}
