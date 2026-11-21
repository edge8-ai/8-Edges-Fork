// onboarding's own raw writer, private to the entity since A.70 (ADR 0018):
// the door no longer re-exports this file, and another entity calls a named
// command instead (plan-progress.ts, git-emails.ts). It returns the PostgREST
// builder, so the onboarding file calling it keeps its own filters and error
// handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesUpdate } from "@/kernel/data/supabase/database.types";

// The admin's edits to a starter's plan tasks.
export const updateOnboardingTasks = (patch: TablesUpdate<{ schema: "company_os" }, "onboarding_tasks">) => companyOs.from("onboarding_tasks").update(patch);
