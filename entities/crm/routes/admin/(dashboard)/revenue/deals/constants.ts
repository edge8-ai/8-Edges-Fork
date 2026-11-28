// Plain (non-"use client") module so server components — the revenue cockpit,
// the board route — can import this constant WITHOUT pulling the "use client"
// DealsBoard module (and its @hello-pangea/dnd dependency) into their bundle.
export const HANDOFF_COLUMN_ID = "handoff";
