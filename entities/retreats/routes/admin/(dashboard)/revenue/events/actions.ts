"use server";

import { randomUUID } from "crypto";
import { revalidateSurfaces } from "@/kernel/shell/surface";
import { companyOs, supabase, type CompanyOsUpdate } from "@/kernel/data/supabase";
import { selectProducts, insertProducts, updateProducts } from "@/entities/finance";
import { requirePermission } from "@/kernel/identity/access-request";
import { recordAudit } from "@/kernel/audit/audit";
import { selectSurveys } from "@/entities/org";
import { getSiteOrigin } from "@/kernel/config/site-origin";
import {
  qrPngDataUrl,
  eventPath,
  EVENT_TYPES,
  EVENT_STATUSES,
  EVENT_VISIBILITIES,
  type EventMedia,
  type EventType,
  type EventStatus,
  type EventVisibility,
} from "@/entities/retreats";
import { slugify } from "@/kernel/config/slug";
import type { Result } from "@/kernel/data/result";
import { externalHref, internalPath } from "@/kernel/ui/url";

function refresh() {
  revalidateSurfaces("/revenue/events");
}

// ─── Create ──────────────────────────────────────────────────────────────────
// Events are born as drafts: review (and add tiers) before flipping to Open.
// Slug = slugified title + start date, deduped with a numeric suffix — it
// drives the public URL and QR, so it never changes after creation.

export type CreateEventInput = {
  title: string;
  type: EventType;
  visibility?: EventVisibility;
  location?: string | null;
  starts_at?: string | null; // YYYY-MM-DD
  ends_at?: string | null;
  capacity?: number | null;
  blurb?: string | null;
};

export async function createEvent(input: CreateEventInput): Promise<Result & { id?: string }> {
  const { user: admin } = await requirePermission("retreats.events");

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Title is required." };
  if (!EVENT_TYPES.includes(input.type)) return { ok: false, error: "Invalid event type." };
  const visibility = input.visibility ?? "public";
  if (!EVENT_VISIBILITIES.includes(visibility)) return { ok: false, error: "Invalid visibility." };
  for (const [label, v] of [
    ["Start date", input.starts_at],
    ["End date", input.ends_at],
  ] as const) {
    if (v && !DATE_RE.test(v)) return { ok: false, error: `${label} must be YYYY-MM-DD.` };
  }
  if (input.starts_at && input.ends_at && input.ends_at < input.starts_at) {
    return { ok: false, error: "End date must be on or after the start date." };
  }
  if (input.capacity != null && (!Number.isFinite(input.capacity) || input.capacity < 0)) {
    return { ok: false, error: "Capacity must be a non-negative number, or blank for uncapped." };
  }

  const base = slugify(input.starts_at ? `${title}-${input.starts_at}` : title);
  if (!base) return { ok: false, error: "Title must contain at least one letter or number." };

  // Dedupe against existing slugs (base, base-2, base-3, ...).
  const { data: taken, error: slugErr } = await companyOs
    .from("events")
    .select("slug")
    .like("slug", `${base}%`);
  if (slugErr) return { ok: false, error: slugErr.message };
  const takenSet = new Set((taken ?? []).map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const { data, error } = await companyOs
    .from("events")
    .insert({
      slug,
      type: input.type,
      status: "draft",
      visibility,
      title,
      location: input.location?.trim() || null,
      starts_at: input.starts_at || null,
      ends_at: input.ends_at || null,
      capacity: input.capacity ?? null,
      blurb: input.blurb?.trim() || null,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "events",
    recordId: data.id,
    operation: "insert",
    actor: admin.email,
    newData: { slug, type: input.type, title },
    context: { via: "events_new" },
  });
  refresh();
  return { ok: true, id: data.id };
}

// ─── Tiers ───────────────────────────────────────────────────────────────────
// A tier is a company_os.products row (type='event') hanging off the event.
// Price is immutable once people can buy (change = deactivate + add a new
// tier), so the only edit here is the active toggle.

export type AddTierInput = {
  title: string;
  amountUsd: number; // whole dollars from the form; 0 = free
  capacity?: number | null;
  description?: string | null;
};

export async function addEventTier(eventId: string, input: AddTierInput): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const title = input.title?.trim();
  if (!title) return { ok: false, error: "Tier name is required." };
  if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) {
    return { ok: false, error: "Price must be 0 (free) or a positive amount." };
  }
  if (input.capacity != null && (!Number.isFinite(input.capacity) || input.capacity < 1)) {
    return { ok: false, error: "Tier capacity must be at least 1, or blank for uncapped." };
  }
  const amountCents = Math.round(input.amountUsd * 100);

  const { data: event, error: evErr } = await companyOs
    .from("events")
    .select("slug")
    .eq("id", eventId)
    .maybeSingle();
  if (evErr) return { ok: false, error: evErr.message };
  if (!event) return { ok: false, error: "Event not found." };

  const { count, error: countErr } = await selectProducts("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (countErr) return { ok: false, error: countErr.message };

  // products.slug is globally unique; namespace under the event's slug.
  const base = `${event.slug}-${slugify(title)}`;
  const { data: taken, error: slugErr } = await selectProducts("slug")
    .like("slug", `${base}%`);
  if (slugErr) return { ok: false, error: slugErr.message };
  const takenSet = new Set((taken ?? []).map((r) => r.slug));
  let slug = base;
  for (let n = 2; takenSet.has(slug); n++) slug = `${base}-${n}`;

  const { data, error } = await insertProducts({
      type: "event",
      event_id: eventId,
      slug,
      title,
      tier: slugify(title).replace(/-/g, "_"),
      description: input.description?.trim() || null,
      amount_cents: amountCents,
      currency: "usd",
      capacity: input.capacity ?? null,
      sort_order: count ?? 0,
      active: true,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    table: "products",
    recordId: data.id,
    operation: "insert",
    actor: admin.email,
    newData: { event_id: eventId, title, amount_cents: amountCents },
    context: { via: "events_shelf_add_tier" },
  });
  refresh();
  return { ok: true };
}

export async function setTierActive(eventId: string, tierId: string, active: boolean): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const { data, error } = await updateProducts({ active })
    .eq("id", tierId)
    .eq("event_id", eventId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Tier not found." };

  await recordAudit({
    table: "products",
    recordId: tierId,
    operation: "update",
    actor: admin.email,
    newData: { active },
    context: { event_id: eventId, via: "events_shelf_tier_toggle" },
  });
  refresh();
  return { ok: true };
}

// ─── Edit ────────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type EventPatch = {
  title?: string;
  type?: EventType;
  status?: EventStatus;
  visibility?: EventVisibility;
  location?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  capacity?: number | null;
  landing_path?: string | null;
  notes?: string | null;
  blurb?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  feedback_survey_id?: string | null;
  attendee_count_override?: number | null;
  registered_count_override?: number | null;
};

export async function updateEvent(eventId: string, patch: EventPatch): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const updates: CompanyOsUpdate<"events"> = {};

  if (patch.title !== undefined) {
    if (!patch.title.trim()) return { ok: false, error: "Title is required." };
    updates.title = patch.title.trim();
  }
  if (patch.type !== undefined) {
    if (!EVENT_TYPES.includes(patch.type)) return { ok: false, error: "Invalid event type." };
    updates.type = patch.type;
  }
  if (patch.status !== undefined) {
    if (!EVENT_STATUSES.includes(patch.status)) return { ok: false, error: "Invalid status." };
    updates.status = patch.status;
  }
  if (patch.visibility !== undefined) {
    if (!EVENT_VISIBILITIES.includes(patch.visibility)) return { ok: false, error: "Invalid visibility." };
    updates.visibility = patch.visibility;
  }
  if (patch.location !== undefined) updates.location = patch.location?.trim() || null;
  if (patch.starts_at !== undefined) {
    if (patch.starts_at !== null && !DATE_RE.test(patch.starts_at)) return { ok: false, error: "Start date must be YYYY-MM-DD." };
    updates.starts_at = patch.starts_at;
  }
  if (patch.ends_at !== undefined) {
    if (patch.ends_at !== null && !DATE_RE.test(patch.ends_at)) return { ok: false, error: "End date must be YYYY-MM-DD." };
    updates.ends_at = patch.ends_at;
  }
  if (
    typeof updates.starts_at === "string" &&
    typeof updates.ends_at === "string" &&
    updates.ends_at < updates.starts_at
  ) {
    return { ok: false, error: "End date must be on or after the start date." };
  }
  if (patch.capacity !== undefined) {
    if (patch.capacity !== null && (!Number.isFinite(patch.capacity) || patch.capacity < 0)) {
      return { ok: false, error: "Capacity must be a non-negative number, or blank for uncapped." };
    }
    updates.capacity = patch.capacity;
  }
  if (patch.landing_path !== undefined) {
    // The client portal navigates to it in place, so it must stay on this site.
    const path = patch.landing_path?.trim() || null;
    if (path && !internalPath(path)) return { ok: false, error: "The landing page must be a path on this site, starting with / (e.g. /saigon-private)." };
    updates.landing_path = path;
  }
  if (patch.blurb !== undefined) updates.blurb = patch.blurb?.trim() || null;
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.cover_image_url !== undefined) updates.cover_image_url = patch.cover_image_url?.trim() || null;
  if (patch.feedback_survey_id !== undefined) {
    if (patch.feedback_survey_id !== null) {
      const { data: survey, error: surveyErr } = await selectSurveys("id").eq("id", patch.feedback_survey_id).maybeSingle();
      if (surveyErr || !survey) return { ok: false, error: surveyErr?.message ?? "That survey no longer exists." };
    }
    updates.feedback_survey_id = patch.feedback_survey_id;
  }
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (patch.attendee_count_override !== undefined) {
    const v = patch.attendee_count_override;
    if (v !== null && (!Number.isInteger(v) || v < 0)) {
      return { ok: false, error: "Attendee count must be a non-negative whole number, or blank to count registrations." };
    }
    updates.attendee_count_override = v;
  }
  if (patch.registered_count_override !== undefined) {
    const v = patch.registered_count_override;
    if (v !== null && (!Number.isInteger(v) || v < 0)) {
      return { ok: false, error: "Registered count must be a non-negative whole number, or blank to count registrations." };
    }
    updates.registered_count_override = v;
  }

  if (Object.keys(updates).length === 0) return { ok: true };

  const { data, error } = await companyOs.from("events").update(updates).eq("id", eventId).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Event not found." };

  await recordAudit({
    table: "events",
    recordId: eventId,
    operation: "update",
    actor: admin.email,
    newData: updates,
    context: { via: "events_shelf" },
  });
  refresh();
  return { ok: true };
}

// ─── Talk tags ──────────────────────────────────────────────────────────────
// Replaces the event's talk set (company_os.event_talks) with the given talk
// ids. Talks are the keynote/workshop catalog (company_os.talks).

export async function setEventTalks(eventId: string, talkIds: string[]): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const unique = Array.from(new Set(talkIds));
  if (unique.length > 0) {
    const { data: valid, error: vErr } = await companyOs.from("talks").select("id").in("id", unique);
    if (vErr) return { ok: false, error: vErr.message };
    if ((valid ?? []).length !== unique.length) return { ok: false, error: "One of those talks no longer exists." };
  }

  const { error: delErr } = await companyOs.from("event_talks").delete().eq("event_id", eventId);
  if (delErr) return { ok: false, error: delErr.message };

  if (unique.length > 0) {
    const { error: insErr } = await companyOs
      .from("event_talks")
      .insert(unique.map((talk_id) => ({ event_id: eventId, talk_id })));
    if (insErr) return { ok: false, error: insErr.message };
  }

  await recordAudit({
    table: "event_talks",
    recordId: eventId,
    operation: "update",
    actor: admin.email,
    newData: { talk_ids: unique },
    context: { via: "event_settings" },
  });
  refresh();
  return { ok: true };
}

// ─── Archive / restore ──────────────────────────────────────────────────────
// Reversible (archived_at), not a hard delete: event_id on products/
// event_registrations is ON DELETE SET NULL, so a real delete would silently
// orphan tiers and the roster. Blocked while any registration references the
// event — cancel/close it instead, so the sales history stays discoverable.

export async function archiveEvent(eventId: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const { count, error: cErr } = await companyOs
    .from("event_registrations")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId);
  if (cErr) return { ok: false, error: cErr.message };
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `This event has ${count} registration${count === 1 ? "" : "s"} — set status to Cancelled or Closed instead of archiving, so the sales history stays intact.`,
    };
  }

  const { error } = await companyOs
    .from("events")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", eventId)
    .is("archived_at", null);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "events", recordId: eventId, operation: "archive", actor: admin.email });
  refresh();
  return { ok: true };
}

export async function restoreEvent(eventId: string): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");
  const { error } = await companyOs.from("events").update({ archived_at: null }).eq("id", eventId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({ table: "events", recordId: eventId, operation: "restore", actor: admin.email });
  refresh();
  return { ok: true };
}

// ─── QRs ─────────────────────────────────────────────────────────────────────
// The shelf's at-a-glance pair: the signup link and — once a feedback survey
// is linked — the feedback link with the event's cohort stamped so responses
// stay attributable per event while the survey is shared across events.

export type QrLink = { url: string; png: string };

export async function getEventQrs(
  eventId: string
): Promise<{ ok: true; signup: QrLink; feedback: QrLink | null } | { ok: false; error: string }> {
  await requirePermission("retreats.events");
  try {
    const { data: event, error } = await companyOs
      .from("events")
      .select("slug, feedback_survey_id")
      .eq("id", eventId)
      .maybeSingle();
    if (error || !event) return { ok: false, error: error?.message ?? "Event not found." };

    const origin = await getSiteOrigin();
    const signupUrl = `${origin}${eventPath(event.slug)}`;
    const signup: QrLink = { url: signupUrl, png: await qrPngDataUrl(signupUrl) };

    let feedback: QrLink | null = null;
    if (event.feedback_survey_id) {
      // A missing feedback QR is a degraded card, not a failed action: the
      // signup QR above is the one the operator came for.
      const { data: survey, error: surveyErr } = await selectSurveys("slug").eq("id", event.feedback_survey_id).maybeSingle();
      if (surveyErr) console.error(`[revenue/events] feedback survey ${eventId}: ${surveyErr.message}`);
      if (survey?.slug) {
        const url = `${origin}/surveys/${survey.slug}?cohort=${encodeURIComponent(event.slug)}`;
        feedback = { url, png: await qrPngDataUrl(url) };
      }
    }
    return { ok: true, signup, feedback };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to generate QRs." };
  }
}

// ─── Media ───────────────────────────────────────────────────────────────────
// events.media is an ordered jsonb array of {kind, url, caption}. Images are
// uploaded to the public event-media bucket (server-side via the service
// client — same pattern as the careers resume upload, but a public bucket);
// videos are external URLs the public page turns into embeds. Read-modify-
// write on the array is fine at admin concurrency.

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

async function loadEventMedia(eventId: string): Promise<{ media: EventMedia[]; slug: string } | { error: string }> {
  const { data, error } = await companyOs.from("events").select("slug, media").eq("id", eventId).maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: "Event not found." };
  return { media: Array.isArray(data.media) ? (data.media as EventMedia[]) : [], slug: data.slug };
}

async function saveEventMedia(eventId: string, media: EventMedia[]): Promise<Result> {
  const { error } = await companyOs.from("events").update({ media }).eq("id", eventId);
  if (error) return { ok: false, error: error.message };
  refresh();
  return { ok: true };
}

// Upload an image and either set it as the cover or append it to the gallery.
export async function uploadEventImage(
  eventId: string,
  formData: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { user: admin } = await requirePermission("retreats.events");

  const file = formData.get("file");
  const target = formData.get("target") === "cover" ? "cover" : "gallery";
  const caption = String(formData.get("caption") ?? "").trim() || null;
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick an image file first." };
  if (!IMAGE_TYPES.has(file.type)) return { ok: false, error: "Use a JPEG, PNG, WebP, AVIF, or GIF image." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "Image is too large (max 8 MB)." };

  const loaded = await loadEventMedia(eventId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "jpg";
  const path = `${loaded.slug}/${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage.from("event-media").upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  const { data: pub } = supabase.storage.from("event-media").getPublicUrl(path);
  const url = pub.publicUrl;

  let result: Result;
  if (target === "cover") {
    const { error } = await companyOs.from("events").update({ cover_image_url: url }).eq("id", eventId);
    result = error ? { ok: false, error: error.message } : { ok: true };
    if (result.ok) refresh();
  } else {
    result = await saveEventMedia(eventId, [...loaded.media, { kind: "image", url, caption }]);
  }
  if (!result.ok) return result;

  await recordAudit({
    table: "events",
    recordId: eventId,
    operation: "update",
    actor: admin.email,
    newData: { [target === "cover" ? "cover_image_url" : "media_added"]: url },
    context: { via: "events_shelf_media_upload" },
  });
  return { ok: true, url };
}

export async function addEventVideo(eventId: string, url: string, caption?: string | null): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const href = externalHref(url);
  if (!href) return { ok: false, error: "Enter a full video URL (YouTube, Vimeo, or a direct video file)." };

  const loaded = await loadEventMedia(eventId);
  if ("error" in loaded) return { ok: false, error: loaded.error };

  const result = await saveEventMedia(eventId, [
    ...loaded.media,
    { kind: "video", url: href, caption: caption?.trim() || null },
  ]);
  if (!result.ok) return result;

  await recordAudit({
    table: "events",
    recordId: eventId,
    operation: "update",
    actor: admin.email,
    newData: { media_added: href },
    context: { via: "events_shelf_add_video" },
  });
  return { ok: true };
}

export async function removeEventMedia(eventId: string, index: number): Promise<Result> {
  const { user: admin } = await requirePermission("retreats.events");

  const loaded = await loadEventMedia(eventId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  if (index < 0 || index >= loaded.media.length) return { ok: false, error: "That item no longer exists — refresh and retry." };

  const removed = loaded.media[index];
  const media = loaded.media.filter((_, i) => i !== index);
  const result = await saveEventMedia(eventId, media);
  if (!result.ok) return result;

  // The storage object is left in place on purpose: the URL may be reused
  // (cover, other events) and orphan cleanup is cheap to do later in bulk.
  await recordAudit({
    table: "events",
    recordId: eventId,
    operation: "update",
    actor: admin.email,
    newData: { media_removed: removed.url },
    context: { via: "events_shelf_remove_media" },
  });
  return { ok: true };
}

export async function moveEventMedia(eventId: string, index: number, dir: "up" | "down"): Promise<Result> {
  await requirePermission("retreats.events");

  const loaded = await loadEventMedia(eventId);
  if ("error" in loaded) return { ok: false, error: loaded.error };
  const target = dir === "up" ? index - 1 : index + 1;
  if (index < 0 || index >= loaded.media.length || target < 0 || target >= loaded.media.length) {
    return { ok: true }; // nothing to do at the edges
  }
  const media = [...loaded.media];
  [media[index], media[target]] = [media[target], media[index]];
  return saveEventMedia(eventId, media);
}
