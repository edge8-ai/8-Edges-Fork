// Invoices for the Operations morning list (the Lark notifications plan).
// Built here because finance owns invoices.

import { companyOs } from "@/kernel/data/supabase";
import { addDays } from "@/kernel/config/dates";
import { NO_OWNER, plural, rows, shortDate, type ListLine } from "@/kernel/messaging/office-list";

function money(cents: number, currency: string): string {
  const code = currency.toUpperCase();
  const sign = code === "USD" ? "US$" : code === "AUD" ? "A$" : `${code} `;
  return `${sign}${Math.round(cents / 100).toLocaleString("en-US")}`;
}

export async function invoiceMorningLines(today: string): Promise<ListLine[]> {
  const soon = addDays(today, 1);
  const open = await rows("invoices", companyOs.from("invoices").select("customer_name, due_date, balance_cents, currency").gt("balance_cents", 0).order("due_date"));
  const due = open.filter((i) => i.due_date === today || i.due_date === soon);
  const past = open.filter((i) => typeof i.due_date === "string" && (i.due_date as string) < today);
  const lines: ListLine[] = [];
  if (due.length) {
    lines.push({ who: null, text: `Due today and tomorrow: ${due.map((i) => `${i.customer_name} ${money(Number(i.balance_cents), String(i.currency))}`).join(", ")}.`, href: "/admin/revenue/invoices" });
  }
  if (past.length) {
    const oldest = past[0];
    lines.push({ who: NO_OWNER, text: `${plural(past.length, "invoice")} past due; the oldest is ${oldest.customer_name}, due ${shortDate(oldest.due_date as string)}. Chase them.`, href: "/admin/revenue/invoices" });
  }
  return lines;
}
