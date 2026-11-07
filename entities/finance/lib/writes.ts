// Finance's own raw writes to its tables (design §4, ME-13). Private to
// finance since card A.65 (ADR 0018): other entities perform the commands its
// door exports instead.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";

export const updateInvoices = (patch: TablesUpdate<{ schema: "company_os" }, "invoices">) => companyOs.from("invoices").update(patch);
