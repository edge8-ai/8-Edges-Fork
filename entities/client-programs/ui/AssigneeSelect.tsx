"use client";

// The "Assigned to" picker: Unassigned, then the client's Edge8 staff. A name
// that is set but no longer assigned stays selectable so it shows and can be changed.
export function AssigneeSelect({ value, assignees, onChange }: { value: string; assignees: string[]; onChange: (who: string) => void }) {
  const options = value && !assignees.includes(value) ? [...assignees, value] : assignees;
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Unassigned</option>
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}
