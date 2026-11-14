import { companyOsUntyped } from "@/kernel/data/supabase";
import { countRows, pageList, type ListParams, type ListResult } from "@/kernel/data/paged-list";

// The admin shelves' paged lists and badge counts over work-requests's tables (ADR 0025,
// ADR 0029). The kernel's pager names no table: each question here hands it
// this owner's `.from()`, so check:table-ownership resolves every read and the
// owner answers for it. They replace company-os's listEntity/countEntity, which
// took the table as a bare string. The caller still picks its columns and its
// filters, as it did; each list is what the page asked listEntity for.

export function workRequestsPage<T>(select: string, params: ListParams = {}): Promise<ListResult<T>> {
  return pageList<T>(() => companyOsUntyped.from("contractor_work_requests"), select, params);
}
