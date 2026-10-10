import { describe, expect, it } from "vitest";
import { EVENTS, type EventName } from "@/kernel/events/catalogue";
import { subscribersOf } from "@/kernel/events/bus";
import { registerEventSubscribers } from "./events";

// The wiring, exercised for real (S.10, carried forward from S.2).
//
// Everything around the bus was already tested and the connection between the
// two halves was not. kernel/events/bus.test.ts registers its own throwaway
// subscribers to prove the bus's contract; each entity's handler is tested by
// calling the handler function directly. Neither ever calls an entity's
// exported `subscriptions()`, and nothing at all called the composition root's
// `registerEventSubscribers()` — so a publisher and a subscriber could both be
// perfect while nothing joined them, and every test would still pass.
//
// That mattered little when the bus carried one event. It carries five now,
// and each drives a real effect: a 1-1 moved off approved leave, an onboarding
// journey opened on hire, a delivery board created on a win, a company raised
// to customer on payment. A missing registration makes any of them a silent
// no-op — no error, no log, just an effect that never happens.
//
// TypeScript already rejects a misspelled event name, so what this guards is
// what types cannot see:
//   * scripts/gen-deployment.mjs failing to notice an entity's `subscriptions`
//     export, so app/events.ts never calls it. `check:generated` compares that
//     file against the deployment, which means the generator and the check
//     agree with each other and neither notices the gap.
//   * a handler written, exported, and never `subscribe()`d.
//   * an event added to the catalogue that nobody ever subscribes to.
//
// What it does NOT prove: that a handler does the right thing when it runs.
// That is each handler's own test, and those exist.

// The wiring this deployment promises, as a reader should be able to state it.
// An event mapped to [] is one deliberately published to nobody, which ADR 0003
// allows — but it has to be written down here, which is the point: the next
// person to add an event cannot leave its subscriber to chance.
// The inbox (notifications, S.3) listens to every event: each fact may matter
// to one person, and it writes their row.
const EXPECTED: Record<EventName, string[]> = {
  // Ideas listens too (W.192): a card picked up from a spark that lands in Done
  // is the spark shipping, which ideas states for the author's inbox.
  "board.card.completed": ["coaching", "ideas", "notifications"],
  "board.card.landed": ["campaigns", "notifications"],
  // A card linked to a PR asks HTT for it (F8); HTT answers on the bus, and
  // the inbox stays out, because a link set is nobody's news.
  "board.card.pr_linked": ["htt"],
  "board.subtask.toggled": ["campaigns", "notifications"],
  "leave.approved": ["coaching", "notifications"],
  // Coaching deliberately does not listen: a 1-1 moved off the leave stays put.
  "leave.withdrawn": ["notifications"],
  "candidate.hired": ["notifications", "onboarding"],
  "deal.won": ["boards", "notifications"],
  "invoice.paid": ["crm", "notifications"],
  // A build on a spark is news to the spark's author (ID.2.7).
  "idea.built": ["notifications"],
  // So is a pick-up: someone took the author's spark on as a card (ID.2.8).
  "idea.picked_up": ["notifications"],
  // And a shipping: the card picked up from the spark is done (W.192).
  "idea.shipped": ["notifications"],
  // A kudos is news to the person thanked, and to nobody else (TH.1.8).
  "kudos.given": ["notifications"],
  // A sync is nobody's news: Boards stamps the cards, and the inbox stays out.
  "pull_requests.synced": ["boards"],
  // Reimbursements (RB.8): the owner's inbox hears of a decision and a
  // payment. A submission, a claim entering a run and a run built or paid are
  // told to their channels by the entity itself, so nobody else listens.
  "claim.submitted": [],
  "claim.decided": ["notifications"],
  "claim.in_run": [],
  "claim.paid": ["notifications"],
  "payment-run.built": [],
  "payment-run.paid": [],
};

// Registration is idempotent by a module-scoped latch, so this runs once for
// the whole file and the assertions read the state it left behind — which is
// also how the app uses it.
registerEventSubscribers();

describe("the composition root registers what the catalogue declares", () => {
  // If this fails, someone added an event and never decided who listens. The
  // map above is the decision; leaving it stale is the bug.
  it("covers exactly the events in the catalogue, no more and no fewer", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual(Object.keys(EVENTS).sort());
  });

  it.each(Object.keys(EXPECTED) as EventName[])(
    "wires %s to the entity that claims it",
    (event) => {
      expect(subscribersOf(event).sort()).toEqual([...EXPECTED[event]].sort());
    },
  );

  // The cheap, blunt version of the above: whatever the map says, an event
  // nobody listens to is worth seeing at a glance rather than deducing.
  it("leaves no event subscribed by nobody, unless the map says so", () => {
    const orphans = (Object.keys(EVENTS) as EventName[]).filter(
      (name) => subscribersOf(name).length === 0 && EXPECTED[name].length > 0,
    );
    expect(orphans).toEqual([]);
  });

  it("registers every entity the generated registry imports", () => {
    const registered = new Set(
      (Object.keys(EVENTS) as EventName[]).flatMap((name) => subscribersOf(name)),
    );
    expect([...registered].sort()).toEqual(["boards", "campaigns", "coaching", "crm", "htt", "ideas", "notifications", "onboarding"]);
  });
});

describe("the idempotence latch", () => {
  // Next may evaluate a module more than once per process, so the registry
  // guards against double registration. A second call must not double the
  // handlers — two copies of the onboarding subscriber would open the new
  // starter's journey twice.
  it("does not register a second copy when called again", () => {
    const before = subscribersOf("candidate.hired");
    registerEventSubscribers();
    expect(subscribersOf("candidate.hired")).toEqual(before);
    // One onboarding handler and one inbox handler, not two of either.
    expect(before).toHaveLength(2);
  });
});
