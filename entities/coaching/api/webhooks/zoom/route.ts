import { NextResponse } from "next/server";
import { runRoutineAfterResponse } from "@/kernel/audit/background";
import { optionalEnv } from "@/kernel/config/env";
import { ingestHandler } from "@/entities/coaching/crons/zoom-transcripts";
import { sessionHintFrom, validationReply, verifyZoomSignature, type ZoomEvent } from "@/entities/coaching/lib/zoom-webhook";

// Zoom event subscriptions -> the group-coaching ingest, the moment there is
// something to ingest. meeting.summary_completed arrives within a minute of
// the call ending (29 Oct 2026: 25 seconds), and runs the summary stage;
// recording.transcript_completed arrives when the recording is processed,
// up to an hour later, and runs the transcript stage. The crons stay as the
// fallback for a delivery Zoom never made.
//
// Register this on the Server-to-Server OAuth app in Zoom Marketplace, under
// Feature -> Event Subscriptions, as:
//   https://<your-domain>/api/webhooks/zoom/
// The TRAILING SLASH is required (next.config sets trailingSlash: true; the
// slashless URL answers 308, which Zoom does not follow). Subscribe to
// "Meeting summary completed", "Recording transcript files have completed"
// and "All recordings have completed", and put the app's Secret Token in
// ZOOM_WEBHOOK_SECRET_TOKEN on the deployment before saving: Zoom validates
// the URL on save with a challenge this route answers only when the token is
// set. docs/engineering/routines.md, "zoom webhook".
//
// The ingest runs after the response (runRoutineAfterResponse): Zoom retries a delivery it
// gets no 2xx for within seconds, and a run takes up to a minute. It is
// recorded as a run of its own id, so Settings -> Agents shows it beside the
// crons' runs with the same body.

const LOG = "[webhooks/zoom]";

/** The routine id the webhook's runs are recorded under. Not a cron: it has no schedule and claims a tick of its own. */
export const ZOOM_WEBHOOK_ROUTINE = "/api/webhooks/zoom/";

export async function POST(request: Request) {
  const secret = optionalEnv("ZOOM_WEBHOOK_SECRET_TOKEN");
  if (!secret) {
    // Fail loudly rather than accepting unverified payloads. A half-configured
    // deploy should look broken, not look like no session ever ends.
    console.error(`${LOG} ZOOM_WEBHOOK_SECRET_TOKEN not set; event rejected.`);
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  // The signature is over the raw bytes, so read text before any JSON parsing.
  const rawBody = await request.text();
  const verdict = verifyZoomSignature({
    rawBody,
    signature: request.headers.get("x-zm-signature"),
    timestamp: request.headers.get("x-zm-request-timestamp"),
    secret,
  });
  if (!verdict.ok) {
    console.error(`${LOG} signature verification failed: ${verdict.reason}`);
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let event: ZoomEvent;
  try {
    event = JSON.parse(rawBody) as ZoomEvent;
  } catch {
    return NextResponse.json({ error: "Malformed JSON." }, { status: 400 });
  }

  if (event.event === "endpoint.url_validation") {
    const plainToken = event.payload?.plainToken;
    if (!plainToken) return NextResponse.json({ error: "No plainToken." }, { status: 400 });
    return NextResponse.json(validationReply(plainToken, secret));
  }

  const hint = sessionHintFrom(event);
  if (!hint) {
    // Verified but not something that means a session is ready. Acknowledge so
    // Zoom stops retrying, and say so in the response for debugging.
    return NextResponse.json({ received: true, ignored: event.event ?? null });
  }

  // The host and topic filters live in the ingest's configuration, so another
  // host's meeting or an unrelated topic is a run that finds nothing to do.
  runRoutineAfterResponse(ZOOM_WEBHOOK_ROUTINE, () => ingestHandler(hint));
  return NextResponse.json({ received: true, event: event.event });
}
