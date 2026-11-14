"use client";

// Who goes to a training (TR.2): a checklist of the people the organiser may
// schedule, with a search box. The kernel's MultiSelect is a toolbar filter,
// where nothing chosen means "all"; here nothing chosen means nobody, so the
// picker says so plainly instead of borrowing the filter's wording.
import { useState } from "react";

export function PeoplePicker({ people, value, onChange }: { people: { id: string; name: string }[]; value: string[]; onChange: (next: string[]) => void }) {
  const [q, setQ] = useState("");
  const shown = q.trim() ? people.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase())) : people;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <fieldset className="tr-people">
      <legend className="admin-label">
        Who · {value.length === 0 ? "nobody yet" : value.length === 1 ? "1 person" : `${value.length} people`}
      </legend>
      <input className="admin-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" aria-label="Find a person" />
      <ul className="tr-people-list">
        {shown.map((p) => (
          <li key={p.id}>
            <label className="tr-person">
              <input type="checkbox" checked={value.includes(p.id)} onChange={() => toggle(p.id)} />
              <span>{p.name}</span>
            </label>
          </li>
        ))}
        {shown.length === 0 && <li className="admin-hint">Nobody matches.</li>}
      </ul>
    </fieldset>
  );
}
