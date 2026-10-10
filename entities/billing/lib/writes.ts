// The writes other entities may make to billing's tables (multi-entity
// design §4; ME-13). Only the owner writes its tables directly; everyone else
// calls one of these through the entity's index, so the table-ownership gate
// (scripts/check-table-ownership.mjs) sees no raw cross-entity write. Each
// writer is the verb of the statement its caller used to build inline — it
// returns the PostgREST builder so the caller keeps its own filters, select
// and error handling, and moving the call here changed no behaviour. A
// caller that needs more than a filter belongs in this entity as a function.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const deleteOrders = () => companyOs.from("orders").delete();
export const insertOrders = (row: TablesInsert<{ schema: "company_os" }, "orders"> | TablesInsert<{ schema: "company_os" }, "orders">[]) => companyOs.from("orders").insert(row);
export const insertTokenPurchases = (row: TablesInsert<{ schema: "company_os" }, "token_purchases"> | TablesInsert<{ schema: "company_os" }, "token_purchases">[]) => companyOs.from("token_purchases").insert(row);
export const updateAffiliateCommissions = (patch: TablesUpdate<{ schema: "company_os" }, "affiliate_commissions">) => companyOs.from("affiliate_commissions").update(patch);
export const updateOrders = (patch: TablesUpdate<{ schema: "company_os" }, "orders">) => companyOs.from("orders").update(patch);
export const updateTokenPurchases = (patch: TablesUpdate<{ schema: "company_os" }, "token_purchases">) => companyOs.from("token_purchases").update(patch);
