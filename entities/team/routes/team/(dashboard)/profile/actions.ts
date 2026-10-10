"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/kernel/identity/access-request";
import { requireTeamMember } from "@/kernel/identity/team-auth";
import { updateOwnBasics, getOwnEmail } from "@/entities/team/lib/data";
import { setPersonAvatar, type AvatarResult } from "@/entities/retreats";
import { setPersonIdImage, type IdSide, type IdUploadResult } from "@/entities/retreats";
import { sendBankChangeAlert } from "@/kernel/messaging/email";
import { upsertPeopleSensitive } from "@/entities/crm";
import type { Result } from "@/kernel/data/result";

// Self-service avatar: writes ONLY the actor's own person row (personId comes
// from the JWT-derived actor, never the client).
export async function saveOwnAvatar(formData: FormData): Promise<AvatarResult> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file received." };
  const res = await setPersonAvatar(actor.personId, file);
  if (res.ok) {
    revalidatePath("/team/profile");
    revalidatePath("/team");
  }
  return res;
}

// Self-service ID-card image (front/back) into the PRIVATE bucket, on the
// actor's own record only.
export async function saveOwnIdImage(side: IdSide, formData: FormData): Promise<IdUploadResult> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "No file received." };
  const res = await setPersonIdImage(actor.personId, side, file);
  if (res.ok) revalidatePath("/team/profile");
  return res;
}

// The full editable profile. Every write is self-scoped by requireTeamMember();
// the client sends only values, never ids. Fields route to three stores:
//   - people columns (name, phone, gender, emergency contact)
//   - people.metadata (personal email, hometown, education, hobbies, birthday)
//   - people_sensitive (DOB, addresses, bank, tax, national ID)
// A bank-detail change fires an alert to the employee and HR (never the values).

export type ProfileInput = {
  // Contact
  preferredName: string;
  phone: string;
  personalEmail: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  // Personal
  gender: string;
  dateOfBirth: string; // YYYY-MM-DD or ""
  maritalStatus: string;
  hometown: string;
  education: string;
  hobbies: string[];
  // Private
  currentAddress: string;
  permanentAddress: string;
  bankName: string;
  bankAccountNumber: string;
  bankBranch: string;
  taxCode: string;
  socialInsuranceNumber: string;
  nationalIdNumber: string;
  nationalIdIssueDate: string; // YYYY-MM-DD or ""
  nationalIdIssuePlace: string;
};

const MAX_LEN = 400;
const clean = (v: string): string | null => (v.trim() ? v.trim() : null);

export async function saveOwnProfile(input: ProfileInput): Promise<Result> {
  await requirePermission("surface.team");
  const actor = await requireTeamMember();

  // Guard obviously bad input before any write.
  for (const v of Object.values(input)) {
    if (typeof v === "string" && v.length > MAX_LEN) {
      return { ok: false, error: "One of your entries is too long." };
    }
  }
  const dob = clean(input.dateOfBirth);
  let birthMonth: number | null = null;
  let birthDay: number | null = null;
  if (dob) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
    if (!m) return { ok: false, error: "Date of birth must be a real date." };
    birthMonth = Number(m[2]);
    birthDay = Number(m[3]);
  }

  // 1) people columns + metadata
  const basics = await updateOwnBasics(
    actor,
    {
      preferred_name: clean(input.preferredName),
      phone: clean(input.phone),
      gender: clean(input.gender),
      emergency_contact_name: clean(input.emergencyContactName),
      emergency_contact_phone: clean(input.emergencyContactPhone),
    },
    {
      personal_email: clean(input.personalEmail),
      hometown: clean(input.hometown),
      education: clean(input.education),
      hobbies: input.hobbies.map((h) => h.trim()).filter(Boolean),
      birth_month: birthMonth,
      birth_day: birthDay,
    },
  );
  if (!basics.ok) return { ok: false, error: "Could not save your details." };

  // 2) restricted PII (audited by field name inside upsertPeopleSensitive)
  const actorEmail = (await getOwnEmail(actor)) ?? actor.authUserId;
  const sres = await upsertPeopleSensitive(
    actor.personId,
    {
      date_of_birth: dob,
      marital_status: clean(input.maritalStatus),
      current_address: clean(input.currentAddress),
      permanent_address: clean(input.permanentAddress),
      bank_name: clean(input.bankName),
      bank_account_number: clean(input.bankAccountNumber),
      bank_branch: clean(input.bankBranch),
      tax_code: clean(input.taxCode),
      social_insurance_number: clean(input.socialInsuranceNumber),
      national_id_number: clean(input.nationalIdNumber),
      national_id_issue_date: clean(input.nationalIdIssueDate),
      national_id_issue_place: clean(input.nationalIdIssuePlace),
    },
    actorEmail,
  );
  if (!sres.ok) return { ok: false, error: sres.error };

  // 3) bank-change tripwire
  const bankChanged = sres.changed.some(
    (f) => f === "bank_name" || f === "bank_account_number" || f === "bank_branch",
  );
  if (bankChanged && actorEmail.includes("@")) {
    await sendBankChangeAlert({ employeeName: actor.displayName, employeeEmail: actorEmail });
  }

  revalidatePath("/team/profile");
  revalidatePath("/team");
  return { ok: true };
}
