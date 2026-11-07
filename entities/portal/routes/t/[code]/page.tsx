import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { companyOs } from "@/kernel/data/supabase";
import { formatEventDates, normalizeRegistrationStatus, normalizeTicketCode, ticketPath } from "@/entities/retreats";
import { qrSvg } from "@/entities/retreats";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import styles from "./ticket.module.css";
import { one } from "@/kernel/config/embedded";

// Public ticket page: the registration's ticket_code rendered as a QR. This
// is what the confirmation email links to and what gets scanned at the door
// (scanner itself is out of scope for v1 — the roster check-in covers it).
// Bearer link: anyone with the code sees the ticket, so it shows only what a
// ticket needs — event, attendee name, status.

export const metadata: Metadata = {
  title: "Your ticket",
  robots: { index: false },
};

type TicketRow = {
  id: string;
  attendee_name: string | null;
  status: string;
  guest_count: number;
  ticket_code: string;
  events:
    | { title: string; location: string | null; starts_at: string | null; ends_at: string | null; timezone: string }
    | { title: string; location: string | null; starts_at: string | null; ends_at: string | null; timezone: string }[]
    | null;
};

const DEAD_STATUSES = new Set(["cancelled", "refunded", "no_show"]);

export default async function TicketPage(props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  const code = normalizeTicketCode(params.code);
  if (!code) notFound();

  const { data, error } = await companyOs
    .from("event_registrations")
    .select("id, attendee_name, status, guest_count, ticket_code, events(title, location, starts_at, ends_at, timezone)")
    .eq("ticket_code", code)
    .maybeSingle();
  if (error || !data) notFound();

  const reg = data as unknown as TicketRow;
  const event = one(reg.events);
  if (!event) notFound();

  const status = normalizeRegistrationStatus(reg.status);
  const dead = DEAD_STATUSES.has(status);
  const svg = dead ? null : await qrSvg(`${await getSiteOrigin()}${ticketPath(reg.ticket_code)}`);

  return (
    <main className={styles.page}>
      <div className={styles.ticketCard}>
        <div className={styles.eyebrow}>Your ticket</div>
        <h1 className={`${styles.title} site-h-fluid`}>
          {event.title}
        </h1>
        <p className={styles.meta}>
          {formatEventDates(event.starts_at, event.ends_at, event.timezone)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
        {reg.attendee_name && (
          <p className={styles.meta}>
            {reg.attendee_name}
            {reg.guest_count > 0 ? ` +${reg.guest_count} guest${reg.guest_count === 1 ? "" : "s"}` : ""}
          </p>
        )}

        {dead ? (
          <div className={styles.notice}>
            This ticket is no longer valid ({status.replace(/_/g, " ")}). If that seems wrong, reply to your
            confirmation email.
          </div>
        ) : (
          <>
            {status === "waitlisted" && (
              <div className={styles.notice}>You&apos;re on the waitlist — this ticket activates if a seat opens up.</div>
            )}
            {status === "pending_payment" && (
              <div className={styles.notice}>Payment is still pending — this ticket activates once it completes.</div>
            )}
            {svg && (
              <div className={styles.qr} dangerouslySetInnerHTML={{ __html: svg }} />
            )}
            <div className={styles.ticketCode}>{reg.ticket_code}</div>
            <div className={styles.ticketStatus}>{status === "attended" ? "Checked in" : status.replace(/_/g, " ")}</div>
          </>
        )}
      </div>
    </main>
  );
}
