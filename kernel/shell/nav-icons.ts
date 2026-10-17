// The team hub sidebar's icons (TH.5): one picture per row, on the same 24-unit
// grid, stroke and round caps as kernel/ui/Icon.
//
// The rows used to carry text glyphs, and on 11 Oct 2026 eleven of them were
// each shared by two to four unrelated rows: ◎ meant My Coach, Coaching,
// Cockpit and Campaigns, ▤ meant Board, My Equipment and Handbook. A glyph also
// comes from whatever symbol font the platform has, so a column of them never
// sat on one baseline. Each path here is the whole drawing, so a row names an
// icon and the sidebar renders it; nothing else has to know the picture.
//
// These live apart from kernel/ui/Icon on purpose. That set is the Workboard
// card's few glyphs, kept small; this one grows with the sidebar.
export const NAV_ICONS = {
  home: "M3 10.5 12 3l9 7.5 M5 9.5V21h14V9.5 M10 21v-6h4v6",
  myWeek: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M9 15.5l2 2 4-4",
  board: "M4 4h4v16H4z M10 4h4v10h-4z M16 4h4v13h-4z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3.5 6h.01 M3.5 12h.01 M3.5 18h.01",
  calendar: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M8 14h2 M14 14h2 M8 17.5h2",
  flag: "M5 21V4 M5 4h11l-2 4 2 4H5",
  briefcase: "M3 7h18v13H3z M8 7V4h8v3 M3 12.5h18",
  umbrella: "M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9z M12 12v6.5a2.5 2.5 0 0 1-5 0",
  inbox: "M3 13l3-8h12l3 8 M3 13v6h18v-6 M3 13h5l1.5 2.5h5L16 13h5",
  approvals: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M8 12.5l2.5 2.5 5.5-5.5",
  compass: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M15.5 8.5l-2 5-5 2 2-5z",
  clipboard: "M8 3h8v3H8z M6 4.5H5V21h14V4.5h-1 M9 11h6 M9 15h6",
  clipboardCheck: "M8 3h8v3H8z M6 4.5H5V21h14V4.5h-1 M9 13.5l2 2 4-4",
  spark: "M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2z M9 8h6 M9 12h6 M9 16h3",
  wallet: "M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M3 7l12-4 2 4 M16 13.5h.01",
  banknote: "M2 6h20v12H2z M12 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M6 12h.01 M18 12h.01",
  transfer: "M4 8h14l-3-3 M20 16H6l3 3",
  profile: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M12 7.5a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M6.5 18.5a6 6 0 0 1 11 0",
  laptop: "M5 5h14v10H5z M2 19h20 M5 15l-3 4 M19 15l3 4",
  coaching: "M4 5h11v8H8l-4 3z M10 15v2h6l4 3v-9h-3",
  hiring: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 1 0 0 7z M3 20a6 6 0 0 1 12 0 M19 8v6 M16 11h6",
  rocket: "M5 15c-1.5 1.5-2 4-2 6 2 0 4.5-.5 6-2 M9 15l-2-2c1-4 4-8 10-10 0 6-4 9-8 10z M15 9h.01",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14",
  target: "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10z M12 11a1 1 0 1 0 0 2 1 1 0 1 0 0-2z",
  heart: "M12 20s-7-4.4-9-9a5 5 0 0 1 9-3 5 5 0 0 1 9 3c-2 4.6-9 9-9 9z",
  network: "M10 3h4v4h-4z M3 17h4v4H3z M17 17h4v4h-4z M12 7v5 M5 17v-5h14v5",
  directory: "M5 3h14v18H5z M12 8a2.5 2.5 0 1 0 0 5 2.5 2.5 0 1 0 0-5z M8.5 17a3.5 3.5 0 0 1 7 0 M3 7h2 M3 12h2 M3 17h2",
  image: "M3 5h18v14H3z M8.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 1 0 0-3z M21 15l-5-5L5 19",
  award: "M12 3a5.5 5.5 0 1 0 0 11 5.5 5.5 0 1 0 0-11z M8.5 13 7 21l5-3 5 3-1.5-8",
  // My Training (TR.1): a dumbbell, because training is practice.
  dumbbell: "M6.5 6.5v11 M17.5 6.5v11 M3.5 9v6 M20.5 9v6 M6.5 12h11",
  // My Team › Training (TR.2): a calendar with a plus, because the organiser schedules.
  schedule: "M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4 M12 13v5 M9.5 15.5h5",
  cap: "M2 9l10-5 10 5-10 5z M6 11v5c3 2.5 9 2.5 12 0v-5 M22 9v5",
  slides: "M3 4h18 M4 4v11h16V4 M12 15v4 M8 21l4-2 4 2",
  bookOpen: "M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z M12 6v14",
  shield: "M12 3l8 3v6c0 4.5-3.5 7.5-8 9-4.5-1.5-8-4.5-8-9V6z M12 9v6 M9 12h6",
  store: "M4 9l1.5-5h13L20 9z M5 9v11h14V9 M10 20v-5h4v5",
  gauge: "M5.6 18.4A9 9 0 1 1 18.4 18.4 M12 13l4-5 M12 12a1 1 0 1 0 0 2 1 1 0 1 0 0-2z",
  dollar:
    "M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18z M15 9c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2.2 0 3 6 1.6 6 4.5 0 1.4-1.3 2.3-3 2.3-1.4 0-2.6-.6-3-1.6 M12 6v1.5 M12 16.5V18",
  magnet: "M6 4v8a6 6 0 0 0 12 0V4h-4v8a2 2 0 0 1-4 0V4z M6 8h4 M14 8h4",
  question: "M4 5h16v11H9l-5 4z M10 9a2 2 0 1 1 3 1.7c-.6.4-1 .8-1 1.3 M12 14h.01",
  building: "M4 21V4h10v17 M14 9h6v12 M3 21h18 M8 8h2 M8 12h2 M8 16h2 M17 13h.01 M17 17h.01",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 1 0 0 7z M3 20a6 6 0 0 1 12 0 M16 4.5a3.5 3.5 0 0 1 0 6.5 M18 14.5c2 .7 3 2.7 3 5.5",
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  notes: "M4 3h12v18H4z M8 7h4 M8 11h4 M8 15h2 M18 7l3 3-6 6h-3v-3z",
  chart: "M3 3v18h18 M7 15l4-4 3 3 5-6",
  cart: "M3 4h2.5l2.2 11h10.6L20 8H7 M9 18.5a1 1 0 1 0 0 2 1 1 0 1 0 0-2z M17 18.5a1 1 0 1 0 0 2 1 1 0 1 0 0-2z",
  invoice: "M6 3h8l4 4v14H6z M14 3v4h4 M9 12h6 M9 16h6",
  tablet: "M6 3h12v18H6z M11 18h2",
  ticket: "M3 6h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M14 6v12",
  package: "M12 3l8 4.5v9L12 21l-8-4.5v-9z M4 7.5l8 4.5 8-4.5 M12 12v9",
  share:
    "M18 3a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M6 9a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M18 15a3 3 0 1 0 0 6 3 3 0 1 0 0-6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4",
  pie: "M21 12a9 9 0 1 1-9-9v9z M15 3.5a9 9 0 0 1 5.5 5.5H15z",
  megaphone: "M3 10v4h4l7 5V5L7 10z M17 9a4 4 0 0 1 0 6",
  send: "M21 3 3 10.5l7 3 3 7z M10 13.5 21 3",
  tag: "M3 12V4h8l10 10-8 8z M7.5 8h.01",
  book: "M5 4h12a2 2 0 0 1 2 2v15H7a2 2 0 0 1-2-2z M5 19a2 2 0 0 1 2-2h12",
  menu: "M4 7h16 M4 12h16 M4 17h16",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 1 0 0-14z M20 20l-3.5-3.5",
} as const;

export type NavIconName = keyof typeof NAV_ICONS;
