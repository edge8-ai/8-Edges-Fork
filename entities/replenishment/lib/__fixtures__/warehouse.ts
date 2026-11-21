// An invented warehouse for the replenishment action tests: one pick zone, one
// reserve zone, a sized line in two bands (one a choice made at the shelf) and
// one exclusion. Nothing here names a real client, brand or BIN scheme.
export const WAREHOUSE_PROFILE = {
  columns: { item: "Item", description: "Description", location: "Bin", qty: "On hand" },
  truncatedAtOrBelow: 3,
  zones: [
    { id: "pick", label: "Pick face", role: "pick", rank: 0, pattern: "^P(?<aisle>\\d{2})-(?<bay>\\d{2})$", walk: ["aisle", "bay"] },
    { id: "upper", label: "Upper", role: "reserve", rank: 0, pattern: "^U(?<aisle>\\d{2})$", walk: ["aisle"] },
  ],
  exclude: [{ contains: "socks", label: "Socks" }],
  rules: [
    {
      id: "kestrel",
      label: "Kestrel",
      enabled: true,
      when: [{ contains: "kestrel", label: "Kestrel" }],
      size: "(?<size>\\d{2})\\s*(R|N|W)\\s*$",
      bands: [
        { label: "EU 36-42", min: 36, max: 42, reorderBelow: 24, move: { kind: "fixed", qty: 12 } },
        { label: "EU 43-44", min: 43, max: 44, reorderBelow: 16, move: { kind: "choice", options: [8, 12] } },
      ],
    },
  ],
  destinations: { count: 3, from: "furthest" },
  words: {
    pick: "Pick face",
    reserve: "Reserve",
    instructions: ["Work the jobs in order."],
    destinationRule: "Start with Destination 1.",
    noPickNote: "No pick BIN yet.",
    choiceHint: "The box decides.",
    footer: null,
  },
};
