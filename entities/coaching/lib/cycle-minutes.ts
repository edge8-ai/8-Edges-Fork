// The linked pass: the transcripts of 1-1 recordings somebody linked by
// pasting a Minutes link, read at night (K.73). Until 2026-10-08 this was step
// 0 of the 07:45 coaching cycle. It is now the second step of the one nightly
// 1-1 job, crons/coaching-lark-pickup.ts at 22:00 Vietnam, after Dave's pickup
// has filed the connected coaches' own recordings (lark-pickup.ts).
//
// Khoa's rule, 2026-10-08: "only check if there is a meeting link not loaded.
// If there is no meeting link, or the meeting link is already loaded, no need
// to check at all." So:
//   - the link is the row's minutes_token. No live 1-1's meeting row has ever
//     carried a minutes_url or recording_url, so there is no other link to read;
//   - loaded means the transcript is in the linked meeting's call_transcripts,
//     which is where readCoachingTranscript looks. transcript_sha256 is NOT
//     that flag: the recap writer stamps it, so a loaded 1-1 summarised before
//     the stamp existed has none;
//   - a row with no link, or a loaded one, costs no Lark call. A row the pickup
//     loaded a moment ago is loaded.
//
// Who reads it. The 1-1's leader (led_by, else the profile's coach) reads it
// with their own Lark account when they connected one (lark-connection.ts):
// a coach can read their own recordings without sharing them with anybody.
// Otherwise, or when that read fails, the Edge8 app reads it, which Lark allows
// only once the recording's owner has shared it with the app. Nothing here
// changes who may read a recording.
//   readable           -> transcript saved; a recent 1-1 with no recap gets its
//                         recap drafted and its coach told, as before
//   denied             -> nothing written, counted; checked again next night
//   not ready / failed -> nothing written, counted; checked again next night
// This pass's own log lines name the 1-1 row, never a Minutes token or an
// access token.

import { companyOs } from "@/kernel/data/supabase";
import { mustRows } from "@/kernel/data/read";
import { readCoachingTranscript, saveCoachingTranscript } from "@/entities/coaching/lib/transcript";
import { diffDays } from "@/kernel/config/dates";
import { foldDiacritics } from "@/kernel/config/people-name";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import { summarizeMeeting } from "@/entities/coaching/lib/ai";
import { fetchMinutesTranscript, larkConfigured, type MinutesTranscript } from "@/kernel/messaging/lark-api";
import { getOwnMinuteTranscript } from "@/kernel/messaging/lark-user";
import { loadActiveProfiles, loadCoachContacts, notifyBoth } from "./cycle-shared";
import { freshAccessToken, listLarkConnections } from "./lark-connection";

export type TranscriptPassResult = {
  date: string;
  /** False when the deployment has no Lark app: a clean run that did nothing. */
  enabled: boolean;
  /** Live 1-1s of active profiles that carry a Minutes link. */
  linked: number;
  /** Of those, already loaded: no Lark call. */
  loaded: number;
  /** Read with the leader's own connected Lark account. */
  readAsCoach: number;
  /** Read by the Edge8 app, because the leader has no connection or their read failed. */
  readAsApp: number;
  /** Not loaded, and Lark refused both readers: the owner has not shared it with the app. */
  notShared: number;
  /** Not loaded, and Lark has no transcript yet or the call failed. */
  notReady: number;
  transcriptsPulled: number;
  /** Read from Lark but not saved: a write that failed. Checked again next night. */
  failedSaves: number;
  recapsDrafted: number;
  /** Saved, but the recap could not be drafted; summarizeMeeting stamps why on the row. */
  failedRecaps: number;
  /** Not loaded and not checked tonight: the run's time was spent. Checked next night. */
  deferred: number;
};

// A recap is a long model call, and the route has 300 seconds that the pickup
// shares. Past this point no new row is started; whatever is left is still
// linked and not loaded, so the next night checks it.
const BUDGET_MS = 180_000;

const WHAT = "[coaching/transcripts]";

type Pull = { pull: MinutesTranscript; as: "coach" | "app" };

/**
 * `startedAt` is when the run began, so the budget counts the pickup's time as
 * well as this pass's.
 */
export async function pullLinkedTranscripts(todayISO: string, startedAt: number = Date.now()): Promise<TranscriptPassResult> {
  const result: TranscriptPassResult = {
    date: todayISO,
    enabled: larkConfigured(),
    linked: 0,
    loaded: 0,
    readAsCoach: 0,
    readAsApp: 0,
    notShared: 0,
    notReady: 0,
    transcriptsPulled: 0,
    failedSaves: 0,
    recapsDrafted: 0,
    failedRecaps: 0,
    deferred: 0,
  };
  if (!result.enabled) return result;

  const profiles = await loadActiveProfiles();
  if (profiles.length === 0) return result;
  const byId = new Map(profiles.map((p) => [p.id, p]));

  // A failed read must not read as "nothing linked": it raises, and the
  // routine run records an error rather than a quiet night.
  const rows = mustRows(
    await companyOs
      .from("coaching_one_on_ones")
      .select("id, coaching_profile_id, held_on, minutes_token, meeting_id, summary_markdown, led_by")
      .in("coaching_profile_id", [...byId.keys()])
      .is("archived_at", null)
      .not("minutes_token", "is", null)
      .order("held_on", { ascending: false }),
    `${WHAT} coaching_one_on_ones`,
  ) as Array<{
    id: string;
    coaching_profile_id: string;
    held_on: string;
    minutes_token: string;
    meeting_id: string | null;
    summary_markdown: string | null;
    led_by: string | null;
  }>;
  result.linked = rows.length;
  if (rows.length === 0) return result;

  const coaches = await loadCoachContacts(profiles.map((p) => p.coach_id));
  const origin = await getSiteOrigin();
  const tokenOf = coachTokens();

  for (const m of rows) {
    // Loaded is decided where the text lives, the linked meeting's
    // call_transcripts, because the coaching row does not hold it.
    const existing = await readCoachingTranscript(m.meeting_id);
    if (existing && existing.trim()) {
      result.loaded += 1;
      continue;
    }
    if (Date.now() - startedAt > BUDGET_MS) {
      result.deferred += 1;
      continue;
    }

    const p = byId.get(m.coaching_profile_id)!;
    const { pull, as } = await readTranscript(m.minutes_token, await tokenOf(m.led_by ?? p.coach_id));
    if (!pull.ok) {
      if (pull.reason === "denied") {
        // A standing fact about who may read the recording, said in terms
        // somebody can act on. Retrying cannot help until it is shared.
        console.error(`${WHAT} ${m.id}: Lark will not let Edge8 read this 1-1's recording; its owner has not shared it`);
        result.notShared += 1;
      } else {
        result.notReady += 1;
      }
      continue;
    }
    if (as === "coach") result.readAsCoach += 1;
    else result.readAsApp += 1;

    const saved = await saveCoachingTranscript(m.id, pull.transcript);
    if (!saved.ok) {
      console.error(`${WHAT} ${m.id}: ${saved.error}`);
      result.failedSaves += 1;
      continue;
    }
    result.transcriptsPulled += 1;

    // A recent 1-1 with no recap gets one, and its coach is told. Historical
    // 1-1s (over 14 days) keep their transcript and are never auto-recapped.
    if (diffDays(m.held_on, todayISO) > 14 || m.summary_markdown) continue;
    const res = await summarizeMeeting(m.id);
    if (!res.ok) {
      console.error(`${WHAT} ${m.id}: recap not drafted: ${res.error}`);
      result.failedRecaps += 1;
      continue;
    }
    result.recapsDrafted += 1;
    const coach = coaches.get(p.coach_id);
    const profileLink = `${origin}/team/coaching/${p.id}`;
    await notifyBoth({
      email: coach?.email ?? null,
      subject: `1-1 recap drafted: ${p.memberName} (${m.held_on})`,
      html:
        `<p>The transcript of your 1-1 with <strong>${p.memberName}</strong> on <strong>${m.held_on}</strong> came in from Lark Minutes, and the recap is drafted. Review both tiers and publish the shared one when it reads right.</p>` +
        `<p><a href="${profileLink}">Review the recap</a></p>`,
      larkText: `1-1 recap drafted for ${p.memberName} (${m.held_on}). Review and publish: ${profileLink}`,
      logKind: "recap_drafted",
      links: [profileLink],
    });
  }
  return result;
}

// Each connected leader's access token, fetched at most once a run (a fetch may
// refresh it, and Lark rotates the refresh token every time). Null when the
// leader has no connection or it cannot give a token; the pickup has already
// noted that on the connection, so it is not noted twice.
function coachTokens(): (teamMemberId: string) => Promise<string | null> {
  let connections: Promise<Map<string, Awaited<ReturnType<typeof listLarkConnections>>[number]>> | null = null;
  const tokens = new Map<string, Promise<string | null>>();
  return (teamMemberId) => {
    connections ??= listLarkConnections().then((all) => new Map(all.map((c) => [c.teamMemberId, c])));
    let token = tokens.get(teamMemberId);
    if (!token) {
      token = connections.then(async (byMember) => {
        const conn = byMember.get(teamMemberId);
        if (!conn) return null;
        const fresh = await freshAccessToken(conn);
        return fresh.ok ? fresh.token : null;
      });
      tokens.set(teamMemberId, token);
    }
    return token;
  };
}

// The leader's own read first, the app's second. A leader read that answers
// but has no text yet is not ready, and the app would see no more; a leader
// read that fails for any reason falls back to the app, whose answer decides.
async function readTranscript(minutesToken: string, coachToken: string | null): Promise<Pull> {
  if (coachToken) {
    const own = await getOwnMinuteTranscript(coachToken, minutesToken);
    if (own.ok) {
      return { pull: own.transcript ? { ok: true, transcript: own.transcript } : { ok: false, reason: "not-ready" }, as: "coach" };
    }
  }
  return { pull: await fetchMinutesTranscript(minutesToken), as: "app" };
}

/**
 * The folded title names this given name as a whole word. Kept for the
 * coach-connected pickup (lark-pickup.ts), which reads a coach's own Minutes
 * titles; the tenant-app matcher that first used it is gone.
 */
export function titleNames(foldedTitle: string, givenName: string | null): boolean {
  const given = givenName ? foldDiacritics(givenName.trim()) : "";
  if (!given) return false;
  const escaped = given.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(foldedTitle);
}
