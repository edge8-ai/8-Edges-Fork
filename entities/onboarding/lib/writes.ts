// The writes other entities may make to onboarding's tables (design §4). Only
// the owner writes its tables directly; everyone else calls one of these through
// the entity's index, so the table-ownership gate sees no raw cross-entity
// write. Each writer returns the PostgREST builder, so the caller keeps its own
// filters, select and error handling.
import { companyOs } from "@/kernel/data/supabase";
import type { TablesInsert, TablesUpdate } from "@/kernel/data/supabase/database.types";

// A team member claiming the git address their commits are authored with.
export const insertPersonGitEmails = (row: TablesInsert<{ schema: "company_os" }, "person_git_emails"> | TablesInsert<{ schema: "company_os" }, "person_git_emails">[]) => companyOs.from("person_git_emails").insert(row);
// A new starter ticking off a task on their own plan, from /team.
export const updateOnboardingTasks = (patch: TablesUpdate<{ schema: "company_os" }, "onboarding_tasks">) => companyOs.from("onboarding_tasks").update(patch);
