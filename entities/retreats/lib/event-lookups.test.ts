import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { queries, recordingFrom, resetQueries, type Step } from "./testing/query-recorder";

// The event questions and the event and registration commands retreats' door
// answers (A.70). Each row is the query a caller in another entity built by
// hand before A.70 through selectEvents, insertEvents,
// insertEventRegistrations or updateEventRegistrations, step for step.

vi.mock("@/kernel/data/supabase", () => ({ companyOs: { from: recordingFrom } }));

import {
  assistantEvents,
  eventOfTypes,
  eventSlugsStartingWith,
  eventWithSlug,
  eventsOverlapping,
  liveEventsOfTypes,
  recentEventOptions,
} from "./event-lookups";
import { addEvent, confirmPaidRegistration, recordPaidRegistrations, releaseHeldRegistration, stampTicketEmailSent } from "./event-commands";

const NOW = "2026-10-26T03:00:00.000Z";
beforeEach(() => {
  resetQueries();
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW));
});
afterEach(() => vi.useRealTimers());

const TRIPS = ["retreat", "private_trip", "company_event"] as const;
const UNARCHIVED: Step = ["is", "archived_at", null];
const ASSISTANT: Step = ["select", "title, type, status, starts_at, ends_at, timezone, location, blurb"];
const TRIP_COLUMNS: Step = ["select", "id, title, type, starts_at, ends_at"];

const cases: [string, () => PromiseLike<unknown>, string, Step[]][] = [
  // portal survey form, the cohort stamp.
  ["eventWithSlug", () => eventWithSlug("hanoi-2026"), "events", [["select", "slug"], ["eq", "slug", "hanoi-2026"], ["maybeSingle"]]],
  // org survey page's event picker.
  [
    "recentEventOptions",
    () => recentEventOptions(50),
    "events",
    [["select", "slug, title, starts_at"], UNARCHIVED, ["order", "starts_at", { ascending: false }], ["limit", 50]],
  ],
  // team assistant listEvents: upcoming, past, all, and a search.
  [
    "assistantEvents, upcoming",
    () => assistantEvents("upcoming", "", NOW),
    "events",
    [ASSISTANT, UNARCHIVED, ["gte", "starts_at", NOW], ["order", "starts_at", { ascending: true }], ["limit", 30]],
  ],
  [
    "assistantEvents, past",
    () => assistantEvents("past", "", NOW),
    "events",
    [ASSISTANT, UNARCHIVED, ["lt", "starts_at", NOW], ["order", "starts_at", { ascending: false }], ["limit", 30]],
  ],
  ["assistantEvents, all", () => assistantEvents("all", "", NOW), "events", [ASSISTANT, UNARCHIVED, ["order", "starts_at", { ascending: false }], ["limit", 30]]],
  [
    "assistantEvents, a search with a wildcard in it",
    () => assistantEvents("upcoming", "50%_off", NOW),
    "events",
    [ASSISTANT, UNARCHIVED, ["ilike", "title", "%50\\%\\_off%"], ["gte", "starts_at", NOW], ["order", "starts_at", { ascending: true }], ["limit", 30]],
  ],
  // campaigns' weekly letter.
  [
    "eventsOverlapping",
    () => eventsOverlapping("2026-10-19", NOW),
    "events",
    [
      ["select", "title, blurb, description, location, starts_at, ends_at"],
      ["gte", "ends_at", "2026-10-19"],
      ["lte", "starts_at", NOW],
      ["order", "starts_at", { ascending: false }],
      ["limit", 10],
    ],
  ],
  // reimbursements listTrips.
  [
    "liveEventsOfTypes",
    () => liveEventsOfTypes(TRIPS, 200),
    "events",
    [
      TRIP_COLUMNS,
      ["in", "type", [...TRIPS]],
      UNARCHIVED,
      ["neq", "status", "cancelled"],
      ["order", "starts_at", { ascending: false, nullsFirst: true }],
      ["limit", 200],
    ],
  ],
  // reimbursements readTrip.
  ["eventOfTypes", () => eventOfTypes("e1", TRIPS), "events", [TRIP_COLUMNS, ["eq", "id", "e1"], ["in", "type", [...TRIPS]], ["limit", 1]]],
  // reimbursements createTrip, the free slug.
  ["eventSlugsStartingWith", () => eventSlugsStartingWith("hoi-an-2026-11-02"), "events", [["select", "slug"], ["ilike", "slug", "hoi-an-2026-11-02%"]]],
  // reimbursements createTrip, the insert.
  [
    "addEvent",
    () => addEvent({ slug: "hoi-an", type: "private_trip", status: "draft", visibility: "internal", title: "Hoi An" }),
    "events",
    [["insert", { slug: "hoi-an", type: "private_trip", status: "draft", visibility: "internal", title: "Hoi An" }], ["select", "id"], ["single"]],
  ],
  // billing handleInfiniteLeveragePaid.
  [
    "recordPaidRegistrations",
    () => recordPaidRegistrations([{ event_id: "e1", person_id: "p1", attendee_name: "A", status: "confirmed", guest_count: 0 }]),
    "event_registrations",
    [["insert", [{ event_id: "e1", person_id: "p1", attendee_name: "A", status: "confirmed", guest_count: 0 }]]],
  ],
  // billing handlePaid.
  [
    "confirmPaidRegistration",
    () => confirmPaidRegistration("r1"),
    "event_registrations",
    [
      ["update", { status: "registered" }],
      ["eq", "id", "r1"],
      ["eq", "status", "pending_payment"],
      [
        "select",
        "id, ticket_code, attendee_email, confirmation_sent_at, people(display_name, preferred_name, full_name, email, first_name), events(title, location, starts_at, ends_at, timezone)",
      ],
      ["maybeSingle"],
    ],
  ],
  ["stampTicketEmailSent", () => stampTicketEmailSent("r1"), "event_registrations", [["update", { confirmation_sent_at: NOW }], ["eq", "id", "r1"]]],
  // billing handleFailed.
  [
    "releaseHeldRegistration",
    () => releaseHeldRegistration("r1"),
    "event_registrations",
    [["update", { status: "cancelled", cancelled_at: NOW }], ["eq", "id", "r1"], ["eq", "status", "pending_payment"]],
  ],
];

describe("event questions and commands", () => {
  it.each(cases)("%s makes the query its caller made", async (_name, call, table, steps) => {
    await call();
    expect(queries).toEqual([{ table, steps }]);
  });
});
