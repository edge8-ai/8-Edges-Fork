// What one entity's page may take from another entity it does not require
// (W.169.4, ADR 0002). A page names the SHAPE of what it can show here; the
// composition root decides who provides it: app/shell.ts holds the provider
// when the deployment installs it and null otherwise, and the generated mount
// passes it to the page (an entity's mounts.ts asks for it under `slots`). So
// My Week, which boards owns, can carry a line from the Inbox, which
// notifications owns, without boards requiring notifications — a deployment
// without an inbox simply passes nothing.
import type { ReactNode } from "react";

/** One line about the reader's unread inbox, or nothing when there is nothing new. */
export type InboxLineSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/**
 * Who is asking to open a card, as the page that hosts the card already knows
 * them: their person, their seat (for client-board access) and whether their
 * surface lets them open every board.
 */
export type CardViewer = { personId: string; teamMemberId: string | null; seesEveryBoard: boolean };

/**
 * One card opened in place, over the page that asked (TH.2.6): the Inbox opens
 * a card's own drawer without leaving the list. `closeHref` is where closing
 * the drawer goes, which is the host page without its `?card=`.
 */
export type CardPeekSlot = ((props: { taskId: string; viewer: CardViewer; section: "/team" | "/admin"; closeHref: string }) => Promise<ReactNode>) | null;

/** The reader's own reimbursement claims, on their profile (the plan's "Profile → Reimbursements"). */
export type ProfileClaimsSlot = ((props: { personId: string }) => Promise<ReactNode>) | null;

/** What a trip (an event) cost in paid reimbursement claims, on the event's P&L. */
export type TripCostSlot = ((props: { eventId: string }) => Promise<ReactNode>) | null;
/** What waits on the viewer in reimbursements, on Home: claims to check, to approve, or approved and waiting to be paid. Nothing for anyone else. */
export type HomeClaimsSlot = (() => Promise<ReactNode>) | null;
/** What Home shows of the training entity (TR.1): the certification card and the way into My Training. */
export type HomeTrainingSlot = ((props: { personId: string; greeting: string | null }) => Promise<ReactNode>) | null;
/** The reader's open coaching commitments on My Week (L.18.3), due inside the sprint window first. */
export type MyWeekCommitmentsSlot = ((props: { startsOn: string; endsOn: string }) => Promise<ReactNode>) | null;
/** The new hire's "Get certified" strip under Start here, when the deployment runs a programme. */
export type StartHereCertificationSlot = (() => ReactNode) | null;
