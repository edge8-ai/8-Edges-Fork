// retreats' own raw writers, private to the entity since A.70 (ADR 0018): the
// door no longer re-exports this file, and another entity calls a named
// command instead (event-commands.ts). Each writer returns the PostgREST
// builder so the retreats file calling it keeps its own filters, select and
// error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

export const insertEventRegistrations = (row: TablesInsert<{ schema: "company_os" }, "event_registrations"> | TablesInsert<{ schema: "company_os" }, "event_registrations">[]) => companyOs.from("event_registrations").insert(row);
export const updateEventRegistrations = (patch: TablesUpdate<{ schema: "company_os" }, "event_registrations">) => companyOs.from("event_registrations").update(patch);
