// What a pasted Lark Minutes link must look like before the CRM will file a
// meeting from it (Z.5, paste-a-link intake). Pure, so the rules are tested
// without Lark or the database.
//
// A link is accepted only when it is:
//   - an https URL on our own Lark workspace's host. Another tenant's recording
//     cannot be read by our app anyway, and a link to some other site is not a
//     recording at all;
//   - exactly /minutes/<token>, the address Lark's "Copy link" gives. The
//     Minutes home page (/minutes/home) and personal list (/minutes/me) are
//     refused by the token rule, because a real token is a long run of letters
//     and digits.
// The query string and fragment are dropped: Lark adds tracking parameters to
// a shared link, and the token alone names the recording.

export type MinutesLink = { ok: true; token: string; url: string } | { ok: false; error: string };

// Lark's minute tokens are 24 lowercase letters and digits today. The range
// leaves room for a change in length without accepting a word like "home".
const TOKEN = /^[a-z0-9]{16,64}$/i;

export const NOT_A_MINUTES_LINK = "That is not a Lark Minutes link. Open the recording in Lark Minutes, copy its link and paste it here.";

export function parseLarkMinutesLink(raw: string, workspaceHost: string | null): MinutesLink {
  const text = raw.trim();
  if (!text) return { ok: false, error: "Paste the Lark Minutes link of the meeting." };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return { ok: false, error: NOT_A_MINUTES_LINK };
  }
  const segments = url.pathname.split("/").filter(Boolean);
  if (url.protocol !== "https:" || segments.length !== 2 || segments[0] !== "minutes" || !TOKEN.test(segments[1])) {
    return { ok: false, error: NOT_A_MINUTES_LINK };
  }

  // Without a configured workspace there is nothing to check the host against,
  // and accepting any host would accept any tenant.
  if (!workspaceHost) {
    return { ok: false, error: "No Lark workspace is configured for this site (NEXT_PUBLIC_LARK_WORKSPACE_URL), so a Minutes link cannot be checked." };
  }
  if (url.hostname.toLowerCase() !== workspaceHost) {
    return { ok: false, error: `That recording is not on our Lark workspace (${workspaceHost}). Only our own workspace's Minutes can be read.` };
  }

  const token = segments[1];
  return { ok: true, token, url: `https://${workspaceHost}/minutes/${token}` };
}
