"use client";

import { useRouter } from "next/navigation";

// Client picker + archived toggle for the admin backlog page. Navigating updates
// the ?company= (and ?archived=) search params the server page reads.
export function CompanyPicker({
  clients,
  selectedId,
  showArchived,
}: {
  clients: { id: string; name: string }[];
  selectedId: string;
  showArchived: boolean;
}) {
  const router = useRouter();

  function go(companyId: string, archived: boolean) {
    const params = new URLSearchParams();
    if (companyId) params.set("company", companyId);
    if (archived) params.set("archived", "1");
    const qs = params.toString();
    router.push(`/admin/edges/client-roadmaps${qs ? `?${qs}` : ""}`);
  }

  return (
    <div className="u-row">
      <select
        className="admin-input u-min-2"
        value={selectedId}
        onChange={(e) => go(e.target.value, showArchived)}
                aria-label="Client"
      >
        <option value="">Select client…</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      {selectedId && (
        <label className="u-row u-nowrap">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => go(selectedId, e.target.checked)}
          />
          Show archived
        </label>
      )}
    </div>
  );
}
