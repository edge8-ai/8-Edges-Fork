// The writes other entities may make to finance's tables (design §4, ME-13).
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const updateInvoices = (patch: TablesUpdate<{ schema: "company_os" }, "invoices">) => companyOs.from("invoices").update(patch);
export const insertProducts = (row: TablesInsert<{ schema: "company_os" }, "products"> | TablesInsert<{ schema: "company_os" }, "products">[]) => companyOs.from("products").insert(row);
export const updateProducts = (patch: TablesUpdate<{ schema: "company_os" }, "products">) => companyOs.from("products").update(patch);
export const insertContractorPayments = (row: TablesInsert<{ schema: "company_os" }, "contractor_payments"> | TablesInsert<{ schema: "company_os" }, "contractor_payments">[]) => companyOs.from("contractor_payments").insert(row);
export const updateContractorPayments = (patch: TablesUpdate<{ schema: "company_os" }, "contractor_payments">) => companyOs.from("contractor_payments").update(patch);
export const insertVendors = (row: TablesInsert<{ schema: "company_os" }, "vendors"> | TablesInsert<{ schema: "company_os" }, "vendors">[]) => companyOs.from("vendors").insert(row);
export const updateVendors = (patch: TablesUpdate<{ schema: "company_os" }, "vendors">) => companyOs.from("vendors").update(patch);
export const upsertQboConnection = (
  row: TablesInsert<{ schema: "company_os" }, "qbo_connection"> | TablesInsert<{ schema: "company_os" }, "qbo_connection">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("qbo_connection").upsert(row, options);
export const updateQboConnection = (patch: TablesUpdate<{ schema: "company_os" }, "qbo_connection">) => companyOs.from("qbo_connection").update(patch);
export const updateCompensationSensitive = (patch: TablesUpdate<{ schema: "company_os" }, "compensation_sensitive">) => companyOs.from("compensation_sensitive").update(patch);
export const insertCompensationSensitive = (row: TablesInsert<{ schema: "company_os" }, "compensation_sensitive"> | TablesInsert<{ schema: "company_os" }, "compensation_sensitive">[]) => companyOs.from("compensation_sensitive").insert(row);
export const upsertFxRates = (
  row: TablesInsert<{ schema: "company_os" }, "fx_rates"> | TablesInsert<{ schema: "company_os" }, "fx_rates">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("fx_rates").upsert(row, options);
export const deleteVendors = () => companyOs.from("vendors").delete();
export const upsertInvoices = (
  row: TablesInsert<{ schema: "company_os" }, "invoices"> | TablesInsert<{ schema: "company_os" }, "invoices">[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) => companyOs.from("invoices").upsert(row, options);

