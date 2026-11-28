import { one } from "@/kernel/config/embedded";
import { GREETING_COLUMNS, type GreetedPerson } from "@/kernel/config/people-name";

export const PAYMENT_SELECT =
  `id, person_id, period_month, status, total_regular_hours, total_overtime_hours, amount_cents, currency, summary, decided_by, decided_at, paid_at, note, created_at, people!person_id(${GREETING_COLUMNS})`;

export type PaymentRow = {
  id: string;
  person_id: string;
  period_month: string;
  status: string;
  total_regular_hours: number | string;
  total_overtime_hours: number | string;
  amount_cents: number | string;
  currency: string;
  summary: string | null;
  decided_by: string | null;
  decided_at: string | null;
  paid_at: string | null;
  note: string | null;
  created_at: string;
  people:
    | (GreetedPerson & { email: string })
    | (GreetedPerson & { email: string })[]
    | null;
};

export type PaymentItemRow = {
  id: string;
  title: string;
  actual_hours: number | string | null;
  actual_overtime_hours: number | string | null;
  work_link: string | null;
  accepted_at: string | null;
};

export const onePerson = (e: PaymentRow["people"]) => one(e);

export function monthLabel(period: string): string {
  const d = new Date(`${period}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", timeZone: "UTC" });
}
