import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sessionHintFrom, validationReply, verifyZoomSignature } from "./zoom-webhook";

// The pure half of the Zoom webhook: a delivery is trusted only when Zoom
// signed it with the app's secret token and recently, the validation
// challenge is answered the way Zoom checks it, and only the events that mean
// a session is ready become a hint for the ingest.

const SECRET = "zoom-secret-token";
const NOW = Date.parse("2026-10-29T04:35:10Z");
const TS = String(Math.floor(NOW / 1000));
const BODY = JSON.stringify({ event: "meeting.summary_completed", payload: { object: { meeting_uuid: "abc==" } } });
const sign = (ts: string, body: string, secret = SECRET) => `v0=${createHmac("sha256", secret).update(`v0:${ts}:${body}`).digest("hex")}`;

describe("verifyZoomSignature", () => {
  it("accepts Zoom's signature over the timestamp and the raw body", () => {
    expect(verifyZoomSignature({ rawBody: BODY, signature: sign(TS, BODY), timestamp: TS, secret: SECRET, now: NOW })).toEqual({ ok: true });
  });

  it("refuses a missing header, a stale timestamp, another secret and a changed body", () => {
    expect(verifyZoomSignature({ rawBody: BODY, signature: null, timestamp: TS, secret: SECRET, now: NOW }).ok).toBe(false);
    const old = String(Math.floor(NOW / 1000) - 600);
    expect(verifyZoomSignature({ rawBody: BODY, signature: sign(old, BODY), timestamp: old, secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifyZoomSignature({ rawBody: BODY, signature: sign(TS, BODY, "other"), timestamp: TS, secret: SECRET, now: NOW }).ok).toBe(false);
    expect(verifyZoomSignature({ rawBody: `${BODY} `, signature: sign(TS, BODY), timestamp: TS, secret: SECRET, now: NOW }).ok).toBe(false);
  });
});

describe("validationReply", () => {
  it("returns the token and its HMAC in hex, as Zoom compares them", () => {
    expect(validationReply("plain", SECRET)).toEqual({ plainToken: "plain", encryptedToken: createHmac("sha256", SECRET).update("plain").digest("hex") });
  });
});

describe("sessionHintFrom", () => {
  it("reads the meeting from a summary event", () => {
    expect(
      sessionHintFrom({
        event: "meeting.summary_completed",
        payload: {
          object: {
            meeting_uuid: "ud+OYBtWRHWWvGQsL7D6Dw==",
            meeting_id: 81900000000,
            meeting_topic: "Cohort Coaching",
            meeting_host_email: "coach@example.test",
            meeting_start_time: "2026-10-29T03:55:12Z",
            meeting_end_time: "2026-10-29T04:34:44Z",
          },
        },
      }),
    ).toEqual({
      uuid: "ud+OYBtWRHWWvGQsL7D6Dw==",
      id: 81900000000,
      topic: "Cohort Coaching",
      hostEmail: "coach@example.test",
      startTime: "2026-10-29T03:55:12Z",
      endTime: "2026-10-29T04:34:44Z",
    });
  });

  it("reads the recording from a transcript event, with the end from its duration", () => {
    expect(
      sessionHintFrom({
        event: "recording.transcript_completed",
        payload: { object: { uuid: "abc==", id: 81900000000, topic: "Cohort Coaching", host_email: "coach@example.test", start_time: "2026-10-29T03:55:12Z", duration: 39 } },
      }),
    ).toEqual({
      uuid: "abc==",
      id: 81900000000,
      topic: "Cohort Coaching",
      hostEmail: "coach@example.test",
      startTime: "2026-10-29T03:55:12Z",
      endTime: "2026-10-29T04:34:12.000Z",
    });
  });

  it("is null for other events and for a session event with no meeting", () => {
    expect(sessionHintFrom({ event: "meeting.ended", payload: { object: { uuid: "abc==" } } })).toBeNull();
    expect(sessionHintFrom({ event: "recording.completed", payload: { object: {} } })).toBeNull();
    expect(sessionHintFrom({})).toBeNull();
  });
});
