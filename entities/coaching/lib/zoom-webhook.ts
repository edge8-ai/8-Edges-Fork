// The pure half of the Zoom webhook (./api/webhooks/zoom/route.ts): the
// signature check, the URL-validation reply, and which events mean "a
// coaching session just finished".
//
// Zoom signs every delivery, the validation challenge included, with
// x-zm-signature = "v0=" + HMAC-SHA256(secret, "v0:<timestamp>:<raw body>")
// in hex, where <timestamp> is the x-zm-request-timestamp header in seconds.
// The secret is the app's webhook secret token (ZOOM_WEBHOOK_SECRET_TOKEN).
// Implemented here rather than with Zoom's SDK for the reason billing/svix.ts
// gives: a verifier is the code you want to read in full at the point of use.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { ZoomSessionHint } from "./zoom-ingest";

const TOLERANCE_SECONDS = 5 * 60;

export type VerifyResult = { ok: true } | { ok: false; reason: string };

// Constant-time compare that does not leak length: timingSafeEqual throws on a
// length mismatch, and a differing length is already a mismatch.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function verifyZoomSignature(opts: {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string;
  now?: number;
}): VerifyResult {
  const { rawBody, signature, timestamp, secret } = opts;
  if (!signature || !timestamp) return { ok: false, reason: "Missing x-zm-signature or x-zm-request-timestamp header." };
  // Replay guard. Without it a captured delivery stays valid forever.
  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt)) return { ok: false, reason: "x-zm-request-timestamp is not a number." };
  const nowSeconds = Math.floor((opts.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - sentAt) > TOLERANCE_SECONDS) return { ok: false, reason: "Timestamp outside the tolerance window." };
  const expected = `v0=${createHmac("sha256", secret).update(`v0:${timestamp}:${rawBody}`).digest("hex")}`;
  return safeEqual(expected, signature) ? { ok: true } : { ok: false, reason: "Signature does not match." };
}

/** The answer to Zoom's endpoint.url_validation challenge: the token back, and it signed. */
export function validationReply(plainToken: string, secret: string): { plainToken: string; encryptedToken: string } {
  return { plainToken, encryptedToken: createHmac("sha256", secret).update(plainToken).digest("hex") };
}

export type ZoomEvent = {
  event?: string;
  event_ts?: number;
  payload?: {
    plainToken?: string;
    account_id?: string;
    object?: Record<string, unknown>;
  };
};

/** The events after which a session's summary or transcript exists, so the ingest should look now. */
export const SESSION_EVENTS = ["meeting.summary_completed", "recording.transcript_completed", "recording.completed"] as const;

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Zoom sends a meeting id as a number in one event and a string in another. */
function scalar(value: unknown): string | number | null {
  return typeof value === "number" ? value : text(value);
}

/**
 * The finished meeting a delivery is about, or null when the event is not one
 * of SESSION_EVENTS or names no meeting. meeting.summary_completed describes
 * the meeting (meeting_uuid, meeting_topic, meeting_host_email, the start and
 * end); the recording events describe the recording (uuid, topic, host_email,
 * start_time, duration in minutes).
 */
export function sessionHintFrom(event: ZoomEvent): ZoomSessionHint | null {
  if (!event.event || !(SESSION_EVENTS as readonly string[]).includes(event.event)) return null;
  const o = event.payload?.object ?? {};
  const uuid = text(o.meeting_uuid) ?? text(o.uuid);
  if (!uuid) return null;
  const id = scalar(o.meeting_id) ?? scalar(o.id) ?? "";
  const startTime = text(o.meeting_start_time) ?? text(o.start_time);
  let endTime = text(o.meeting_end_time);
  if (!endTime && startTime && typeof o.duration === "number" && o.duration > 0) {
    endTime = new Date(Date.parse(startTime) + o.duration * 60000).toISOString();
  }
  return {
    uuid,
    id,
    topic: text(o.meeting_topic) ?? text(o.topic) ?? "",
    hostEmail: text(o.meeting_host_email) ?? text(o.host_email),
    startTime,
    endTime,
  };
}
