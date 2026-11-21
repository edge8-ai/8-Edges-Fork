"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmButton } from "@/kernel/ui/ConfirmButton";
import { useAutosave } from "@/kernel/ui/useAutosave";
import { AutosaveIndicator } from "@/kernel/ui/AutosaveStatus";
import { humanize } from "@/kernel/ui/format";
import {
  EVENT_TYPES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  type EventMedia,
  type EventType,
  type EventStatus,
  type EventVisibility,
} from "@/entities/retreats/client";
import { archiveEvent, restoreEvent, setEventTalks, updateEvent } from "../actions";
// The tier list and the media gallery are self-contained panels with their own
// state and their own writes; they live in siblings so this file stays the form.
import { TiersSection } from "./TiersSection";
import { MediaSection } from "./MediaSection";

export type SettingsTier = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number;
  currency: string;
  capacity: number | null;
  active: boolean;
};

export type EventSettingsData = {
  id: string;
  slug: string;
  title: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  location: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  landingPath: string | null;
  notes: string | null;
  blurb: string | null;
  description: string | null;
  coverImageUrl: string | null;
  media: EventMedia[];
  feedbackSurveyId: string | null;
  archivedAt: string | null;
  totalRegistrations: number;
  attendeeCountOverride: number | null;
  registeredCountOverride: number | null;
};

export type SurveyOption = { id: string; name: string };
export type TalkOption = { id: string; title: string };

const toDateInput = (v: string | null) => (v ? v.slice(0, 10) : "");

type EventFieldForm = {
  title: string;
  type: EventType;
  status: EventStatus;
  visibility: EventVisibility;
  location: string;
  startsAt: string;
  endsAt: string;
  capacity: string;
  landingPath: string;
  notes: string;
  blurb: string;
  description: string;
  surveyId: string;
  attendeeOverride: string;
  registeredOverride: string;
};

// Settings tab of the event page: everything editable in one place — event
// fields (single-row write), the feedback-survey link, tickets, media, and
// the reversible archive. The list-page shelf is a read-only summary.
// Both attendee-count overrides accept a blank (fall back to counting
// registrations) or a non-negative whole number; the caller supplies the
// wording of the rejection, which differs between the two fields.
const INVALID = Symbol("invalid");
function parseNonNegativeInt(value: string): number | null | typeof INVALID {
  const n = value.trim() === "" ? null : Number(value);
  if (n !== null && (!Number.isInteger(n) || n < 0)) return INVALID;
  return n;
}

export function EventSettings({
  event,
  tiers,
  surveys,
  talks,
  selectedTalkIds,
}: {
  event: EventSettingsData;
  tiers: SettingsTier[];
  surveys: SurveyOption[];
  talks: TalkOption[];
  selectedTalkIds: string[];
}) {
  const router = useRouter();

  const [talkIds, setTalkIds] = useState<string[]>(selectedTalkIds);
  const [talksErr, setTalksErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const { form, field, commit, status: saveStatus } = useAutosave<EventFieldForm>(
    {
      title: event.title,
      type: event.type,
      status: event.status,
      visibility: event.visibility,
      location: event.location ?? "",
      startsAt: toDateInput(event.startsAt),
      endsAt: toDateInput(event.endsAt),
      capacity: event.capacity?.toString() ?? "",
      landingPath: event.landingPath ?? "",
      notes: event.notes ?? "",
      blurb: event.blurb ?? "",
      description: event.description ?? "",
      surveyId: event.feedbackSurveyId ?? "",
      attendeeOverride: event.attendeeCountOverride?.toString() ?? "",
      registeredOverride: event.registeredCountOverride?.toString() ?? "",
    },
    saveEventField,
  );
  const {
    title,
    type,
    status,
    visibility,
    location,
    startsAt,
    endsAt,
    capacity,
    landingPath,
    notes,
    blurb,
    description,
    surveyId,
    attendeeOverride,
    registeredOverride,
  } = form;

  const isArchived = !!event.archivedAt;
  const hasHistory = event.totalRegistrations > 0;

  async function saveEventField(patch: Partial<EventFieldForm>) {
    const [key, value] = Object.entries(patch)[0] as [keyof EventFieldForm, string];
    switch (key) {
      case "title":
        if (!value.trim()) return { ok: false as const, error: "Title is required." };
        return updateEvent(event.id, { title: value.trim() });
      case "type":
        return updateEvent(event.id, { type: value as EventType });
      case "status":
        return updateEvent(event.id, { status: value as EventStatus });
      case "visibility":
        return updateEvent(event.id, { visibility: value as EventVisibility });
      case "location":
        return updateEvent(event.id, { location: value || null });
      case "startsAt":
        return updateEvent(event.id, { starts_at: value || null });
      case "endsAt":
        return updateEvent(event.id, { ends_at: value || null });
      case "capacity": {
        const cap = value.trim() === "" ? null : Number(value);
        if (cap !== null && (!Number.isFinite(cap) || cap < 0)) {
          return { ok: false as const, error: "Capacity must be a non-negative number, or blank for uncapped." };
        }
        return updateEvent(event.id, { capacity: cap });
      }
      case "landingPath":
        return updateEvent(event.id, { landing_path: value || null });
      case "notes":
        return updateEvent(event.id, { notes: value || null });
      case "blurb":
        return updateEvent(event.id, { blurb: value || null });
      case "description":
        return updateEvent(event.id, { description: value || null });
      case "surveyId":
        return updateEvent(event.id, { feedback_survey_id: value || null });
      case "attendeeOverride": {
        const override = parseNonNegativeInt(value);
        if (override === INVALID) {
          return {
            ok: false as const,
            error: "Attendee count must be a non-negative whole number, or blank to count registrations.",
          };
        }
        return updateEvent(event.id, { attendee_count_override: override });
      }
      case "registeredOverride": {
        const override = parseNonNegativeInt(value);
        if (override === INVALID) {
          return {
            ok: false as const,
            error: "Registered count must be a non-negative whole number, or blank to count registrations.",
          };
        }
        return updateEvent(event.id, { registered_count_override: override });
      }
      default:
        return { ok: true as const };
    }
  }

  // Talks live in a separate junction table, so they save independently of
  // the event fields above — no combined transaction needed.
  async function toggleTalk(talkId: string, checked: boolean) {
    const next = checked ? [...talkIds, talkId] : talkIds.filter((id) => id !== talkId);
    setTalkIds(next);
    setTalksErr(null);
    const r = await setEventTalks(event.id, next);
    if (!r.ok) setTalksErr(r.error);
  }

  return (
    <div className="u-max-form">
      <div className="admin-form">
        <div className="u-row u-end u-sm">
          <AutosaveIndicator status={saveStatus} />
        </div>

        <div className="admin-field">
          <label className="admin-label">Title</label>
          <input
            className="admin-input"
            value={title}
            onChange={(e) => field("title", e.target.value)}
            onBlur={(e) => commit("title", e.target.value)}
            required
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">One-line blurb</label>
          <input
            className="admin-input"
            value={blurb}
            onChange={(e) => field("blurb", e.target.value)}
            onBlur={(e) => commit("blurb", e.target.value)}
            placeholder="Shown on cards and link previews"
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Full description</label>
          <textarea
            className="admin-input"
            rows={7}
            value={description}
            onChange={(e) => field("description", e.target.value)}
            onBlur={(e) => commit("description", e.target.value)}
            placeholder="The long-form pitch shown on the signup page. Blank lines start a new paragraph."
          />
        </div>
        <div className="u-grid-2 u-gap-3">
          <div className="admin-field">
            <label className="admin-label">Type</label>
            <select
              className="admin-select"
              value={type}
              onChange={(e) => {
                field("type", e.target.value as EventType);
                commit("type", e.target.value as EventType);
              }}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </div>
          <div className="admin-field">
            <label className="admin-label">Visibility</label>
            <select
              className="admin-select"
              value={visibility}
              onChange={(e) => {
                field("visibility", e.target.value as EventVisibility);
                commit("visibility", e.target.value as EventVisibility);
              }}
            >
              {EVENT_VISIBILITIES.map((v) => (
                <option key={v} value={v}>
                  {humanize(v)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Status</label>
          <select
            className="admin-select"
            value={status}
            onChange={(e) => {
              field("status", e.target.value as EventStatus);
              commit("status", e.target.value as EventStatus);
            }}
          >
            {EVENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
          <div className="admin-hint">Only &quot;Open&quot; accepts new registrations.</div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Location</label>
          <input
            className="admin-input"
            value={location}
            onChange={(e) => field("location", e.target.value)}
            onBlur={(e) => commit("location", e.target.value)}
            placeholder="City, Country"
          />
        </div>
        <div className="u-grid-2 u-gap-3">
          <div className="admin-field">
            <label className="admin-label">Start date</label>
            <input
              className="admin-input"
              type="date"
              value={startsAt}
              onChange={(e) => {
                field("startsAt", e.target.value);
                commit("startsAt", e.target.value);
              }}
            />
          </div>
          <div className="admin-field">
            <label className="admin-label">End date</label>
            <input
              className="admin-input"
              type="date"
              value={endsAt}
              onChange={(e) => {
                field("endsAt", e.target.value);
                commit("endsAt", e.target.value);
              }}
            />
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Capacity</label>
          <input
            className="admin-input"
            type="number"
            min={0}
            value={capacity}
            onChange={(e) => field("capacity", e.target.value)}
            onBlur={(e) => commit("capacity", e.target.value)}
            placeholder="Uncapped"
          />
        </div>
        <div className="u-grid-2 u-gap-3">
          <div className="admin-field">
            <label className="admin-label">Registered (override)</label>
            <input
              className="admin-input"
              type="number"
              min={0}
              value={registeredOverride}
              onChange={(e) => field("registeredOverride", e.target.value)}
              onBlur={(e) => commit("registeredOverride", e.target.value)}
              placeholder="Count registrations"
            />
            <div className="admin-hint">
              Manual registered count for events with no signups (client keynotes and workshops). Blank = count real
              registrations. Shows on the Overview.
            </div>
          </div>
          <div className="admin-field">
            <label className="admin-label">Attendees (override)</label>
            <input
              className="admin-input"
              type="number"
              min={0}
              value={attendeeOverride}
              onChange={(e) => field("attendeeOverride", e.target.value)}
              onBlur={(e) => commit("attendeeOverride", e.target.value)}
              placeholder="Count registrations"
            />
            <div className="admin-hint">
              Headcount who actually attended. Blank = derive from registrations. Feeds the public workshop attendees
              counter.
            </div>
          </div>
        </div>
        {talks.length > 0 && (
          <div className="admin-field">
            <label className="admin-label">Talks covered</label>
            <div className="u-stack">
              {talks.map((t) => (
                <label key={t.id} className="u-row u-pointer">
                  <input
                    type="checkbox"
                    checked={talkIds.includes(t.id)}
                    onChange={(e) => toggleTalk(t.id, e.target.checked)}
                  />
                  {t.title}
                </label>
              ))}
            </div>
            {talksErr && <div className="admin-alert admin-alert--err u-mt-2">{talksErr}</div>}
            <div className="admin-hint">Which keynote/workshop products this event covered. Pick all that apply.</div>
          </div>
        )}
        <div className="admin-field">
          <label className="admin-label">Feedback survey</label>
          <select
            className="admin-select"
            value={surveyId}
            onChange={(e) => {
              field("surveyId", e.target.value);
              commit("surveyId", e.target.value);
            }}
          >
            <option value="">None</option>
            {surveys.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div className="admin-hint">
            One survey serves many events. Responses are stamped with this event&apos;s slug, so reuse the same survey per
            event type to keep trends comparable.
          </div>
        </div>
        <div className="admin-field">
          <label className="admin-label">Bespoke landing page (optional)</label>
          <input
            className="admin-input"
            value={landingPath}
            onChange={(e) => field("landingPath", e.target.value)}
            onBlur={(e) => commit("landingPath", e.target.value)}
            placeholder="/saigon-private"
          />
        </div>
        <div className="admin-field">
          <label className="admin-label">Notes</label>
          <textarea
            className="admin-input"
            rows={3}
            value={notes}
            onChange={(e) => field("notes", e.target.value)}
            onBlur={(e) => commit("notes", e.target.value)}
          />
        </div>
        {saveStatus.state === "error" && <div className="admin-alert admin-alert--err">{saveStatus.error}</div>}
      </div>

      {msg && (
        <div className={`admin-alert ${msg.ok ? "admin-alert--ok" : "admin-alert--err"} u-mt-4`}>
          {msg.text}
        </div>
      )}

      <TiersSection eventId={event.id} tiers={tiers} onChanged={() => router.refresh()} setMsg={setMsg} />
      <MediaSection eventId={event.id} coverImageUrl={event.coverImageUrl} media={event.media} onChanged={() => router.refresh()} />

      <div className="admin-danger-zone u-mt-4">
        <div className="admin-danger-zone-title">Danger zone</div>
        {isArchived ? (
          <div className="admin-danger-row">
            <span className="admin-danger-row-text">This event is archived and hidden from the default list.</span>
            <button
              type="button"
              className="admin-btn"
              onClick={async () => {
                const r = await restoreEvent(event.id);
                if (r.ok) router.refresh();
                else setMsg({ ok: false, text: r.error });
              }}
            >
              Restore
            </button>
          </div>
        ) : (
          <div className="admin-danger-row">
            <span className="admin-danger-row-text">
              {hasHistory
                ? `Archiving is blocked while ${event.totalRegistrations} registration${event.totalRegistrations === 1 ? "" : "s"} reference this event — set status to Cancelled or Closed instead.`
                : "Archive this event. Reversible: it's hidden from the default list but nothing is deleted."}
            </span>
            <ConfirmButton
              label="Archive"
              title="Archive this event?"
              body={
                <>
                  This hides <strong>{event.title}</strong> from the default Events list. You can restore it later.
                </>
              }
              confirmLabel="Archive"
              disabled={hasHistory}
              onConfirm={() => archiveEvent(event.id)}
              onDone={() => router.refresh()}
            />
          </div>
        )}
      </div>
    </div>
  );
}

