// What a Trip is to a claim (design §1.1, RB.11). There is no trip table: a
// Trip is an events row, and three of retreats' event types count as one. The
// claim form may add a private trip or a company event; a retreat is set up by
// whoever runs it, on retreats' own pages, so the picker lists it but the form
// never makes one. People see "event" too since RB.18 (Mai): an event can be
// local, so "trip" is only the kind an event of type private_trip is.
//
// Client-safe: the picker renders its options and checks its input with these.
import { z } from "zod";
import { formatDate } from "@/kernel/ui/format";

/** The event types the trip picker lists. */
export const TRIP_EVENT_TYPES = ["retreat", "private_trip", "company_event"] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

/** The event types a trip added from the claim form may have. */
export const NEW_TRIP_TYPES = ["private_trip", "company_event"] as const;

export const TRIP_TYPE_LABEL: Record<TripEventType, string> = {
  retreat: "Retreat",
  private_trip: "Trip",
  company_event: "Company event",
};

export function isTripEventType(value: string): value is TripEventType {
  return (TRIP_EVENT_TYPES as readonly string[]).includes(value);
}

/** A trip as the picker and the claim pages show it. */
export type Trip = { id: string; title: string; type: TripEventType; startsOn: string | null; endsOn: string | null };

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the dates from the calendar.")
  .nullish()
  .or(z.literal(""))
  .transform((v) => v || null);

/** A trip added from the claim form. */
export const TripInput = z
  .object({
    title: z.string().trim().min(1, "Give the event a name.").max(200, "Keep the event's name under 200 characters."),
    type: z.enum(NEW_TRIP_TYPES, { message: "Pick a trip or a company event." }),
    startsOn: date,
    endsOn: date,
  })
  .superRefine((v, ctx) => {
    if (v.startsOn && v.endsOn && v.endsOn < v.startsOn) ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The event ends before it starts." });
  });
export type TripInputType = z.input<typeof TripInput>;

/** "Australia trip · Oct 2, 2026 – Oct 9, 2026", or the title alone when it has no dates. */
export function tripLabel(t: Pick<Trip, "title" | "startsOn" | "endsOn">): string {
  if (!t.startsOn) return t.title;
  const ends = t.endsOn && t.endsOn !== t.startsOn ? ` – ${formatDate(t.endsOn)}` : "";
  return `${t.title} · ${formatDate(t.startsOn)}${ends}`;
}
