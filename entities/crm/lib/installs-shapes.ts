// What an Eight Edges install is, shared by the Installs page, its actions and
// the nightly count. Pure, and safe in the browser.
//
// An install is a company's own copy of the Eight Edges open source system.
// "downloaded" means they have the code; "installed" means it runs on their own
// database and hosting for their own business, and only that counts toward the
// company key result. Workshop practice sites are never recorded.
import { z } from "zod";

export const INSTALL_STATUSES = ["downloaded", "installed", "abandoned"] as const;
export type InstallStatus = (typeof INSTALL_STATUSES)[number];

export const INSTALL_STATUS_LABEL: Record<InstallStatus, string> = {
  downloaded: "Downloaded",
  installed: "Installed",
  abandoned: "Abandoned",
};

export const INSTALL_SOURCES = ["website", "github", "workshop", "event", "referral", "outreach", "call", "other"] as const;
export type InstallSource = (typeof INSTALL_SOURCES)[number];

export const INSTALL_SOURCE_LABEL: Record<InstallSource, string> = {
  website: "Website",
  github: "GitHub",
  workshop: "Workshop",
  event: "Event",
  referral: "Referral",
  outreach: "Outreach",
  call: "Sales call",
  other: "Other",
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date.");
const optionalDay = z
  .union([day, z.literal("")])
  .optional()
  .transform((v) => (v ? v : null));
const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null));
// The database refuses anything but http(s), so a pasted "javascript:" link
// never becomes a clickable row.
const optionalUrl = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^https?:\/\//i.test(v), "The link must start with http:// or https://.");

type Dated = { status: InstallStatus; downloadedOn?: string; installedOn: string | null };

// An installed row needs the day it first ran, and it cannot predate the
// download. The same two rules are check constraints on the table.
function datesHold(v: Dated, ctx: z.RefinementCtx) {
  if (v.status === "installed" && !v.installedOn) {
    ctx.addIssue({ code: "custom", path: ["installedOn"], message: "An install needs the day it first ran." });
  }
  if (v.installedOn && v.downloadedOn && v.installedOn < v.downloadedOn) {
    ctx.addIssue({ code: "custom", path: ["installedOn"], message: "It cannot be installed before it was downloaded." });
  }
}

export const RecordInstallInput = z
  .object({
    contactName: z.string().trim().min(1, "Who got it?").max(200),
    email: z.string().trim().toLowerCase().email("Enter a valid email."),
    companyName: z.string().trim().min(1, "Which company?").max(200),
    downloadedOn: day,
    source: z.enum(INSTALL_SOURCES),
    status: z.enum(INSTALL_STATUSES),
    installedOn: optionalDay,
    evidenceUrl: optionalUrl,
    notes: optionalText,
  })
  .superRefine(datesHold);
export type RecordInstallFields = z.input<typeof RecordInstallInput>;

export const UpdateInstallInput = z
  .object({
    id: z.string().uuid(),
    status: z.enum(INSTALL_STATUSES),
    downloadedOn: day,
    installedOn: optionalDay,
    evidenceUrl: optionalUrl,
  })
  .superRefine(datesHold);
export type UpdateInstallFields = z.input<typeof UpdateInstallInput>;

/** The first message a failed parse carries, for the form to show. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Check the form.";
}
