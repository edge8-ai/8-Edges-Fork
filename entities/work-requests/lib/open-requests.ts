import { companyOs } from "@/kernel/data/supabase";

// The two questions the Admin dashboards ask of the open contractor work
// requests: the Operations cockpit lists the newest twenty, and the company
// dashboard counts them. They are the exact queries those pages built while the
// tables were portal's (same columns, filter, order and limit), and moved here
// when work-requests took the tables (ADR 0025), so the pages ask the owner
// instead of reading its table. Each returns the builder: the caller keeps its
// own error handling.
const TERMINAL = "(completed,rejected,cancelled,draft)";

export function newestOpenWorkRequests() {
  return companyOs
    .from("contractor_work_requests")
    .select("id, title, created_at")
    .not("status", "in", TERMINAL)
    .order("created_at", { ascending: false })
    .limit(20);
}

export function countOpenWorkRequests() {
  return companyOs.from("contractor_work_requests").select("id", { count: "exact", head: true }).not("status", "in", TERMINAL);
}
