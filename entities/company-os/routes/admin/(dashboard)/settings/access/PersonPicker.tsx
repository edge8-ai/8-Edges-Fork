"use client";

import { useMemo, useState } from "react";
import { foldDiacritics } from "@/kernel/config/people-name";
import type { AccessPersonOption } from "@/entities/company-os/lib/access-screen";

// Settings → Access lists everyone in the people register (about a thousand,
// clients and contacts included, as Khoa asked on 2026-10-07), so a person is
// found by typing, not by scrolling: the box narrows the list, the select picks
// one. As a plain form field (`name`) it posts the chosen person id; with
// `onChange` it reports it.
const SHOWN = 50;

export function PersonPicker({
  people,
  name,
  value,
  defaultValue = "",
  onChange,
  label,
  disabled = false,
}: {
  people: AccessPersonOption[];
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (personId: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [own, setOwn] = useState(defaultValue);
  const selected = value ?? own;
  const matches = useMemo(() => {
    const q = foldDiacritics(query.trim());
    const hits = q ? people.filter((p) => foldDiacritics(p.name).includes(q)) : people;
    const shown = hits.slice(0, SHOWN);
    // The chosen person stays in the list even when the search no longer matches them.
    const chosen = people.find((p) => p.personId === selected);
    return chosen && !shown.includes(chosen) ? [chosen, ...shown] : shown;
  }, [people, query, selected]);

  return (
    <span className="u-row u-gap-2">
      <input
        type="search"
        className="admin-input"
        placeholder={`Search ${people.length.toLocaleString()} people…`}
        aria-label={`${label}: search`}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
      />
      <select
        className="admin-select"
        name={name}
        aria-label={label}
        value={selected}
        onChange={(e) => {
          setOwn(e.target.value);
          onChange?.(e.target.value);
        }}
        disabled={disabled}
      >
        <option value="">Pick a person…</option>
        {matches.map((p) => (
          <option key={p.personId} value={p.personId}>
            {p.name}
          </option>
        ))}
      </select>
    </span>
  );
}
