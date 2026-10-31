"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { formatCents, formatDate, humanize } from "@/kernel/ui/format";
import { getEventQrs, type QrLink } from "./actions";
import { eventStatusBadge } from "./EventStatusBadge";
import type { EventType, EventStatus, EventVisibility } from "@/entities/retreats/client";

export type EventTierRow = {
  id: string;
  title: string;
  tier: string | null;
  description: string | null;
  amountCents: number;
  currency: string;
  capacity: number | null;
  active: boolean;
};

export type EventAttendee = {
  name: string | null;
  email: string | null;
  tier: string | null;
  status: string;
  personId: string | null;
  guestCount: number;
  checkedInAt: string | null;
};

export type EventRow = {
  id: string;
  slug: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  title: string;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  landingPath: string | null;
  notes: string | null;
  archivedAt: string | null;
  tiers: EventTierRow[];
  attendees: EventAttendee[];
  effectiveAttendees: number;
  registeredCount: number;
  totalCount: number;
  fromUsdCents: number;
  collectedUsdCents: number;
};

// The shelf is deliberately at-a-glance only: the key numbers plus the two
// links an operator shares constantly — signup and feedback survey, each as
// URL + QR. Everything editable (fields, tickets, media, archive) lives on
// the full event page, linked from the drawer header.
export function EventManage({ event }: { event: EventRow }) {
  const [qrs, setQrs] = useState<{ signup: QrLink; feedback: QrLink | null } | null>(null);
  const [qrLoading, setQrLoading] = useState(true);
  const [qrError, setQrError] = useState<string | null>(null);

  // Keyed on the event at the call site, so a different event remounts this
  // component and the three fields above start from their initial values.
  // Resetting them here instead showed the previous event's QR codes for one
  // render before the fetch replaced them.
  useEffect(() => {
    let cancelled = false;
    getEventQrs(event.id).then((r) => {
      if (cancelled) return;
      if (r.ok) setQrs({ signup: r.signup, feedback: r.feedback });
      else setQrError(r.error);
      setQrLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const dates =
    event.startsAt && event.endsAt && formatDate(event.startsAt) !== formatDate(event.endsAt)
      ? `${formatDate(event.startsAt)} → ${formatDate(event.endsAt)}`
      : formatDate(event.startsAt);

  return (
    <>
      <dl className="admin-kv u-mb-4">
        <dt>Status</dt>
        <dd>{eventStatusBadge(event.status, event.archivedAt)}</dd>
        <dt>Type</dt>
        <dd>{humanize(event.type)}</dd>
        <dt>Dates</dt>
        <dd>{dates}</dd>
        <dt>Location</dt>
        <dd>{event.location || "—"}</dd>
        <dt>Price</dt>
        <dd className="admin-cell-mono">{event.tiers.length === 0 ? "Free" : `From ${formatCents(event.fromUsdCents, "usd")}`}</dd>
        <dt>Registered</dt>
        <dd>
          {event.registeredCount} seats
          {event.capacity ? ` of ${event.capacity}` : ""}
          {event.totalCount > event.registeredCount ? ` · ${event.totalCount} total rows` : ""}
        </dd>
        <dt>Collected</dt>
        <dd className="admin-cell-mono">{formatCents(event.collectedUsdCents, "usd")}</dd>
        <dt>Slug</dt>
        <dd className="admin-cell-mono">{event.slug}</dd>
      </dl>

      {qrError && <div className="admin-alert admin-alert--err">{qrError}</div>}
      {qrLoading ? (
        <div className="admin-empty">Generating links…</div>
      ) : (
        qrs && (
          <>
            <QrBlock title="Signup" link={qrs.signup} downloadName={`${event.slug}-signup-qr.png`} />
            {qrs.feedback ? (
              <QrBlock title="Feedback survey" link={qrs.feedback} downloadName={`${event.slug}-feedback-qr.png`} />
            ) : (
              <div className="u-mt-4">
                <SectionLabel>Feedback survey</SectionLabel>
                <div className="admin-empty">No survey linked yet — pick one in Settings on the event page.</div>
              </div>
            )}
          </>
        )
      )}
    </>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="admin-cell-muted u-mb-2 u-label">
      {children}
    </div>
  );
}

function QrBlock({ title, link, downloadName }: { title: string; link: QrLink; downloadName: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="u-mt-4">
      <SectionLabel>{title}</SectionLabel>
      <div className="u-row-top u-gap-3">
        <Image
          src={link.png}
          alt={`QR code for ${link.url}`}
          width={96}
          height={96}
          className="admin-box"
        />
        <div className="u-stack u-min-0">
          <code className="admin-cell-mono u-break-all">
            {link.url}
          </code>
          <div className="u-row">
            <button
              type="button"
              className="admin-btn"
              onClick={async () => {
                await navigator.clipboard.writeText(link.url);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? "Copied!" : "Copy link"}
            </button>
            <a className="admin-btn" href={link.png} download={downloadName}>
              Download PNG
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
